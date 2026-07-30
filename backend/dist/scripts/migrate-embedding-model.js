"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const db_1 = require("../db");
const embeddingConfig_1 = require("../services/embeddingConfig");
dotenv_1.default.config();
const columnExists = async (columnName) => {
    const rows = await (0, db_1.query)(`SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'mentor_direction_scores'
       AND COLUMN_NAME = ?`, [columnName]);
    return Number(rows?.[0]?.c || 0) > 0;
};
const safeModelForDdl = (model) => {
    if (!/^[a-zA-Z0-9._-]{1,64}$/.test(model)) {
        throw new Error(`Invalid DASHSCOPE_EMBEDDING_MODEL for schema migration: ${model}`);
    }
    return model;
};
async function main() {
    try {
        const model = safeModelForDdl((0, embeddingConfig_1.getDashScopeEmbeddingModel)());
        const dimension = (0, embeddingConfig_1.getDashScopeEmbeddingDimension)();
        if (!(await columnExists('embedding_model'))) {
            await (0, db_1.query)(`ALTER TABLE mentor_direction_scores
         ADD COLUMN embedding_model VARCHAR(64) NOT NULL DEFAULT '${model}' AFTER score`);
            console.log(`[migrate-embedding-model] added embedding_model default=${model}`);
        }
        else {
            console.log('[migrate-embedding-model] embedding_model already exists');
        }
        if (!(await columnExists('embedding_dim'))) {
            await (0, db_1.query)(`ALTER TABLE mentor_direction_scores
         ADD COLUMN embedding_dim INT NOT NULL DEFAULT ${dimension} AFTER embedding_model`);
            console.log(`[migrate-embedding-model] added embedding_dim default=${dimension}`);
        }
        else {
            console.log('[migrate-embedding-model] embedding_dim already exists');
        }
    }
    finally {
        await db_1.pool.end().catch(() => { });
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
