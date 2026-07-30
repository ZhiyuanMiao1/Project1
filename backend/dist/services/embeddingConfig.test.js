"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const dashscopeEmbeddings_1 = require("./dashscopeEmbeddings");
const embeddingConfig_1 = require("./embeddingConfig");
const mentorDirectionScores_1 = require("./mentorDirectionScores");
async function main() {
    strict_1.default.equal(embeddingConfig_1.DEFAULT_DASHSCOPE_EMBEDDING_MODEL, 'qwen3.7-text-embedding');
    strict_1.default.equal(embeddingConfig_1.DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION, 256);
    strict_1.default.equal((0, embeddingConfig_1.getDashScopeEmbeddingMaxBatchSize)('qwen3.7-text-embedding'), 20);
    strict_1.default.equal((0, embeddingConfig_1.getDashScopeEmbeddingMaxBatchSize)('text-embedding-v4'), 10);
    const originalFetch = global.fetch;
    const batches = [];
    global.fetch = async (_input, init) => {
        const body = JSON.parse(String(init?.body || '{}'));
        const texts = body?.input?.texts;
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
        const qwenEmbeddings = await (0, dashscopeEmbeddings_1.dashscopeEmbedTexts)(qwenTexts, {
            apiKey: 'test-key',
            model: 'qwen3.7-text-embedding',
            dimension: 256,
        });
        strict_1.default.deepEqual(batches.map((batch) => batch.texts.length), [20, 5]);
        strict_1.default.deepEqual(qwenEmbeddings.map((embedding) => embedding[0]), Array.from({ length: 25 }, (_, index) => index + 1));
        batches.length = 0;
        const v4Texts = Array.from({ length: 11 }, (_, index) => `v4-${index + 1}`);
        await (0, dashscopeEmbeddings_1.dashscopeEmbedTexts)(v4Texts, {
            apiKey: 'test-key',
            model: 'text-embedding-v4',
            dimension: 256,
            batchSize: 64,
        });
        strict_1.default.deepEqual(batches.map((batch) => batch.texts.length), [10, 1]);
        await strict_1.default.rejects(() => (0, dashscopeEmbeddings_1.dashscopeEmbedTexts)(['invalid-dimension'], {
            apiKey: 'test-key',
            model: 'qwen3.7-text-embedding',
            dimension: 128,
        }), /Unsupported dimension 128/);
        const originalModel = process.env.DASHSCOPE_EMBEDDING_MODEL;
        const originalDimension = process.env.DASHSCOPE_EMBEDDING_DIM;
        process.env.DASHSCOPE_EMBEDDING_MODEL = 'qwen3.7-text-embedding';
        process.env.DASHSCOPE_EMBEDDING_DIM = '256';
        const writes = [];
        try {
            const scoreResult = await (0, mentorDirectionScores_1.refreshMentorDirectionScores)({
                userId: 42,
                preferVector: false,
                queryFn: async (sql, args = []) => {
                    const normalized = sql.replace(/\s+/g, ' ').trim();
                    if (normalized.includes('information_schema.TABLES'))
                        return [{ c: 1 }];
                    if (normalized.includes('information_schema.COLUMNS'))
                        return [{ c: 1 }];
                    if (normalized.startsWith('SELECT COUNT(*) AS c FROM mentor_course_embeddings')) {
                        strict_1.default.deepEqual(args, [42, 'qwen3.7-text-embedding', 256]);
                        return [{ c: 1 }];
                    }
                    if (normalized.startsWith('SELECT source_id, embedding, embedding_dim FROM course_embeddings')) {
                        strict_1.default.deepEqual(args, ['direction', 'others', 'qwen3.7-text-embedding', 256]);
                        return [
                            { source_id: 'business', embedding: [1, 0], embedding_dim: 2 },
                            { source_id: 'design', embedding: [0, 1], embedding_dim: 2 },
                        ];
                    }
                    if (normalized.startsWith('SELECT course_text, embedding FROM mentor_course_embeddings')) {
                        strict_1.default.deepEqual(args, [42, 'qwen3.7-text-embedding', 256]);
                        return [{ course_text: '商业分析', embedding: [1, 0] }];
                    }
                    throw new Error(`Unexpected score query: ${normalized}`);
                },
                execFn: async (sql, args = []) => {
                    writes.push({ sql, args });
                    return {};
                },
            });
            strict_1.default.equal(scoreResult.stored, 3);
            strict_1.default.equal(scoreResult.mode, 'fallback');
            strict_1.default.equal(writes.length, 2);
            strict_1.default.match(writes[1].sql, /embedding_model, embedding_dim/);
            strict_1.default.deepEqual(writes[1].args, [
                42, 'business', 1, 'qwen3.7-text-embedding', 256,
                42, 'design', 0, 'qwen3.7-text-embedding', 256,
                42, 'others', 0, 'qwen3.7-text-embedding', 256,
            ]);
        }
        finally {
            if (originalModel === undefined)
                delete process.env.DASHSCOPE_EMBEDDING_MODEL;
            else
                process.env.DASHSCOPE_EMBEDDING_MODEL = originalModel;
            if (originalDimension === undefined)
                delete process.env.DASHSCOPE_EMBEDDING_DIM;
            else
                process.env.DASHSCOPE_EMBEDDING_DIM = originalDimension;
        }
    }
    finally {
        global.fetch = originalFetch;
    }
    console.log('[embeddingConfig.test] passed');
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
