"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertSupportedEmbeddingDimension = exports.getDashScopeEmbeddingMaxBatchSize = exports.getDashScopeEmbeddingsUrl = exports.getDashScopeEmbeddingDimension = exports.getDashScopeEmbeddingModel = exports.parseEmbeddingDimension = exports.DEFAULT_DASHSCOPE_EMBEDDINGS_URL = exports.DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION = exports.DEFAULT_DASHSCOPE_EMBEDDING_MODEL = void 0;
exports.DEFAULT_DASHSCOPE_EMBEDDING_MODEL = 'qwen3.7-text-embedding';
exports.DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION = 256;
exports.DEFAULT_DASHSCOPE_EMBEDDINGS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
const KNOWN_DIMENSIONS = {
    'qwen3.7-text-embedding': new Set([256, 512, 768, 1024, 1536, 2048, 2560]),
    'text-embedding-v4': new Set([64, 128, 256, 512, 768, 1024, 1536, 2048]),
    'text-embedding-v3': new Set([64, 128, 256, 512, 768, 1024]),
};
const parseEmbeddingDimension = (raw, fallback = exports.DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION) => {
    const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '').trim(), 10);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};
exports.parseEmbeddingDimension = parseEmbeddingDimension;
const envTextOrDefault = (raw, fallback) => {
    const value = String(raw ?? '').trim();
    return value || fallback;
};
const getDashScopeEmbeddingModel = () => envTextOrDefault(process.env.DASHSCOPE_EMBEDDING_MODEL, exports.DEFAULT_DASHSCOPE_EMBEDDING_MODEL);
exports.getDashScopeEmbeddingModel = getDashScopeEmbeddingModel;
const getDashScopeEmbeddingDimension = () => (0, exports.parseEmbeddingDimension)(process.env.DASHSCOPE_EMBEDDING_DIM, exports.DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION);
exports.getDashScopeEmbeddingDimension = getDashScopeEmbeddingDimension;
const getDashScopeEmbeddingsUrl = () => envTextOrDefault(process.env.DASHSCOPE_EMBEDDINGS_URL, exports.DEFAULT_DASHSCOPE_EMBEDDINGS_URL);
exports.getDashScopeEmbeddingsUrl = getDashScopeEmbeddingsUrl;
const getDashScopeEmbeddingMaxBatchSize = (model) => {
    const normalized = String(model || '').trim().toLowerCase();
    if (normalized === 'qwen3.7-text-embedding')
        return 20;
    if (normalized === 'text-embedding-v1' || normalized === 'text-embedding-v2')
        return 25;
    return 10;
};
exports.getDashScopeEmbeddingMaxBatchSize = getDashScopeEmbeddingMaxBatchSize;
const assertSupportedEmbeddingDimension = (model, dimension) => {
    const normalizedModel = String(model || '').trim().toLowerCase();
    const allowed = KNOWN_DIMENSIONS[normalizedModel];
    if (allowed && !allowed.has(dimension)) {
        throw new Error(`[dashscope] Unsupported dimension ${dimension} for ${model}; allowed=${Array.from(allowed).join(',')}`);
    }
};
exports.assertSupportedEmbeddingDimension = assertSupportedEmbeddingDimension;
