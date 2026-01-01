"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashscopeEmbedTexts = dashscopeEmbedTexts;
const DEFAULT_EMBEDDINGS_URL = 'https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding';
async function dashscopeEmbedTexts(texts, opts) {
    const clean = texts.map((t) => String(t ?? '').trim());
    const url = (opts.url || DEFAULT_EMBEDDINGS_URL).trim();
    const batchSize = Math.max(1, Math.min(64, Number(opts.batchSize || 16)));
    const dimensionRaw = typeof opts.dimension === 'number' ? opts.dimension : Number(opts.dimension);
    const dimension = Number.isFinite(dimensionRaw) && dimensionRaw > 0 ? Math.floor(dimensionRaw) : null;
    const out = [];
    for (let i = 0; i < clean.length; i += batchSize) {
        const batch = clean.slice(i, i + batchSize);
        if (batch.length === 0)
            continue;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${opts.apiKey}`,
            },
            body: JSON.stringify({
                model: opts.model,
                input: { texts: batch },
                ...(dimension ? { parameters: { dimension } } : {}),
            }),
        });
        const bodyText = await res.text();
        if (!res.ok) {
            throw new Error(`[dashscope] HTTP ${res.status}: ${bodyText.slice(0, 500)}`);
        }
        let data;
        try {
            data = JSON.parse(bodyText);
        }
        catch {
            throw new Error(`[dashscope] Invalid JSON response: ${bodyText.slice(0, 500)}`);
        }
        const embeddings = data?.output?.embeddings;
        if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
            throw new Error(`[dashscope] Unexpected embeddings length: got=${embeddings?.length} want=${batch.length}`);
        }
        for (const item of embeddings) {
            const emb = item?.embedding;
            if (!Array.isArray(emb) || emb.length === 0) {
                throw new Error('[dashscope] Missing embedding in response');
            }
            out.push(emb);
        }
    }
    return out;
}
