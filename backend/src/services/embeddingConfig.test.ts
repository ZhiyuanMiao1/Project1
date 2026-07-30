import assert from 'node:assert/strict';
import { dashscopeEmbedTexts } from './dashscopeEmbeddings';
import {
  DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION,
  DEFAULT_DASHSCOPE_EMBEDDING_MODEL,
  getDashScopeEmbeddingMaxBatchSize,
  getMentorDirectionRelevanceThreshold,
} from './embeddingConfig';
import { refreshMentorDirectionScores } from './mentorDirectionScores';

async function main() {
  assert.equal(DEFAULT_DASHSCOPE_EMBEDDING_MODEL, 'qwen3.7-text-embedding');
  assert.equal(DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION, 256);
  assert.equal(getDashScopeEmbeddingMaxBatchSize('qwen3.7-text-embedding'), 20);
  assert.equal(getDashScopeEmbeddingMaxBatchSize('text-embedding-v4'), 10);
  assert.equal(getMentorDirectionRelevanceThreshold('qwen3.7-text-embedding'), 0.665);
  assert.equal(getMentorDirectionRelevanceThreshold('text-embedding-v4'), 0.6);

  const originalFetch = global.fetch;
  const batches: Array<{ model: string; texts: string[] }> = [];

  global.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const texts = body?.input?.texts as string[];
    batches.push({ model: body.model, texts });

    const embeddings = texts
      .map((text, textIndex) => ({
        text_index: textIndex,
        embedding: [Number(text.replace(/\D/g, '')) || 0],
      }))
      .reverse();

    return new Response(JSON.stringify({ output: { embeddings } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const qwenTexts = Array.from({ length: 25 }, (_, index) => `qwen-${index + 1}`);
    const qwenEmbeddings = await dashscopeEmbedTexts(qwenTexts, {
      apiKey: 'test-key',
      model: 'qwen3.7-text-embedding',
      dimension: 256,
    });
    assert.deepEqual(
      batches.map((batch) => batch.texts.length),
      [20, 5]
    );
    assert.deepEqual(qwenEmbeddings.map((embedding) => embedding[0]), Array.from({ length: 25 }, (_, index) => index + 1));

    batches.length = 0;
    const v4Texts = Array.from({ length: 11 }, (_, index) => `v4-${index + 1}`);
    await dashscopeEmbedTexts(v4Texts, {
      apiKey: 'test-key',
      model: 'text-embedding-v4',
      dimension: 256,
      batchSize: 64,
    });
    assert.deepEqual(
      batches.map((batch) => batch.texts.length),
      [10, 1]
    );

    await assert.rejects(
      () =>
        dashscopeEmbedTexts(['invalid-dimension'], {
          apiKey: 'test-key',
          model: 'qwen3.7-text-embedding',
          dimension: 128,
        }),
      /Unsupported dimension 128/
    );

    const originalModel = process.env.DASHSCOPE_EMBEDDING_MODEL;
    const originalDimension = process.env.DASHSCOPE_EMBEDDING_DIM;
    process.env.DASHSCOPE_EMBEDDING_MODEL = 'qwen3.7-text-embedding';
    process.env.DASHSCOPE_EMBEDDING_DIM = '256';

    const writes: Array<{ sql: string; args: any[] }> = [];
    try {
      const scoreResult = await refreshMentorDirectionScores({
        userId: 42,
        preferVector: false,
        queryFn: async (sql, args = []) => {
          const normalized = sql.replace(/\s+/g, ' ').trim();
          if (normalized.includes('information_schema.TABLES')) return [{ c: 1 }];
          if (normalized.includes('information_schema.COLUMNS')) return [{ c: 1 }];
          if (normalized.startsWith('SELECT COUNT(*) AS c FROM mentor_course_embeddings')) {
            assert.deepEqual(args, [42, 'qwen3.7-text-embedding', 256]);
            return [{ c: 1 }];
          }
          if (normalized.startsWith('SELECT source_id, embedding, embedding_dim FROM course_embeddings')) {
            assert.deepEqual(args, ['direction', 'others', 'qwen3.7-text-embedding', 256]);
            return [
              { source_id: 'business', embedding: [1, 0], embedding_dim: 2 },
              { source_id: 'design', embedding: [0, 1], embedding_dim: 2 },
            ];
          }
          if (normalized.startsWith('SELECT course_text, embedding FROM mentor_course_embeddings')) {
            assert.deepEqual(args, [42, 'qwen3.7-text-embedding', 256]);
            return [{ course_text: '商业分析', embedding: [1, 0] }];
          }
          throw new Error(`Unexpected score query: ${normalized}`);
        },
        execFn: async (sql, args = []) => {
          writes.push({ sql, args });
          return {};
        },
      });

      assert.equal(scoreResult.stored, 3);
      assert.equal(scoreResult.mode, 'fallback');
      assert.equal(writes.length, 2);
      assert.match(writes[1].sql, /embedding_model, embedding_dim/);
      assert.deepEqual(writes[1].args, [
        42, 'business', 1, 'qwen3.7-text-embedding', 256,
        42, 'design', 0, 'qwen3.7-text-embedding', 256,
        42, 'others', 0, 'qwen3.7-text-embedding', 256,
      ]);
    } finally {
      if (originalModel === undefined) delete process.env.DASHSCOPE_EMBEDDING_MODEL;
      else process.env.DASHSCOPE_EMBEDDING_MODEL = originalModel;
      if (originalDimension === undefined) delete process.env.DASHSCOPE_EMBEDDING_DIM;
      else process.env.DASHSCOPE_EMBEDDING_DIM = originalDimension;
    }
  } finally {
    global.fetch = originalFetch;
  }

  console.log('[embeddingConfig.test] passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
