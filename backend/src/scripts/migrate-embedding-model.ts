import dotenv from 'dotenv';
import { pool, query } from '../db';
import { getDashScopeEmbeddingDimension, getDashScopeEmbeddingModel } from '../services/embeddingConfig';

dotenv.config();

type CountRow = { c: number | string };

const columnExists = async (columnName: string) => {
  const rows = await query<CountRow[]>(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mentor_direction_scores'
       AND COLUMN_NAME = ?`,
    [columnName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
};

const safeModelForDdl = (model: string) => {
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(model)) {
    throw new Error(`Invalid DASHSCOPE_EMBEDDING_MODEL for schema migration: ${model}`);
  }
  return model;
};

async function main() {
  try {
    const model = safeModelForDdl(getDashScopeEmbeddingModel());
    const dimension = getDashScopeEmbeddingDimension();

    if (!(await columnExists('embedding_model'))) {
      await query(
        `ALTER TABLE mentor_direction_scores
         ADD COLUMN embedding_model VARCHAR(64) NOT NULL DEFAULT '${model}' AFTER score`
      );
      console.log(`[migrate-embedding-model] added embedding_model default=${model}`);
    } else {
      console.log('[migrate-embedding-model] embedding_model already exists');
    }

    if (!(await columnExists('embedding_dim'))) {
      await query(
        `ALTER TABLE mentor_direction_scores
         ADD COLUMN embedding_dim INT NOT NULL DEFAULT ${dimension} AFTER embedding_model`
      );
      console.log(`[migrate-embedding-model] added embedding_dim default=${dimension}`);
    } else {
      console.log('[migrate-embedding-model] embedding_dim already exists');
    }
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
