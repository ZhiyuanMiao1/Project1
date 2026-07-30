export const DEFAULT_DASHSCOPE_EMBEDDING_MODEL = 'qwen3.7-text-embedding';
export const DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION = 256;
export const DEFAULT_DASHSCOPE_EMBEDDINGS_URL =
  'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';

const KNOWN_DIMENSIONS: Record<string, ReadonlySet<number>> = {
  'qwen3.7-text-embedding': new Set([256, 512, 768, 1024, 1536, 2048, 2560]),
  'text-embedding-v4': new Set([64, 128, 256, 512, 768, 1024, 1536, 2048]),
  'text-embedding-v3': new Set([64, 128, 256, 512, 768, 1024]),
};

export const parseEmbeddingDimension = (
  raw: unknown,
  fallback = DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION
) => {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
};

const envTextOrDefault = (raw: unknown, fallback: string) => {
  const value = String(raw ?? '').trim();
  return value || fallback;
};

export const getDashScopeEmbeddingModel = () =>
  envTextOrDefault(process.env.DASHSCOPE_EMBEDDING_MODEL, DEFAULT_DASHSCOPE_EMBEDDING_MODEL);

export const getDashScopeEmbeddingDimension = () =>
  parseEmbeddingDimension(process.env.DASHSCOPE_EMBEDDING_DIM, DEFAULT_DASHSCOPE_EMBEDDING_DIMENSION);

export const getDashScopeEmbeddingsUrl = () =>
  envTextOrDefault(process.env.DASHSCOPE_EMBEDDINGS_URL, DEFAULT_DASHSCOPE_EMBEDDINGS_URL);

export const getDashScopeEmbeddingMaxBatchSize = (model: string) => {
  const normalized = String(model || '').trim().toLowerCase();
  if (normalized === 'qwen3.7-text-embedding') return 20;
  if (normalized === 'text-embedding-v1' || normalized === 'text-embedding-v2') return 25;
  return 10;
};

export const getMentorDirectionRelevanceThreshold = (model = getDashScopeEmbeddingModel()) => {
  const configured = Number.parseFloat(String(process.env.MENTOR_DIRECTION_RELEVANCE_ABS_MIN ?? '').trim());
  if (Number.isFinite(configured) && configured >= 0 && configured <= 1) return configured;
  return String(model).trim().toLowerCase() === 'qwen3.7-text-embedding' ? 0.665 : 0.6;
};

export const assertSupportedEmbeddingDimension = (model: string, dimension: number) => {
  const normalizedModel = String(model || '').trim().toLowerCase();
  const allowed = KNOWN_DIMENSIONS[normalizedModel];
  if (allowed && !allowed.has(dimension)) {
    throw new Error(
      `[dashscope] Unsupported dimension ${dimension} for ${model}; allowed=${Array.from(allowed).join(',')}`
    );
  }
};
