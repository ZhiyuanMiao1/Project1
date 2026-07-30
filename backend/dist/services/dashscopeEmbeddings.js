"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashscopeEmbedTexts = dashscopeEmbedTexts;
const embeddingConfig_1 = require("./embeddingConfig");
async function dashscopeEmbedTexts(texts, opts) {
    const clean = texts.map((t) => String(t ?? '').trim());
    const url = (opts.url || (0, embeddingConfig_1.getDashScopeEmbeddingsUrl)()).trim();
    const maxBatchSize = (0, embeddingConfig_1.getDashScopeEmbeddingMaxBatchSize)(opts.model);
    const requestedBatchSize = Number(opts.batchSize || maxBatchSize);
    const batchSize = Math.max(1, Math.min(maxBatchSize, Number.isFinite(requestedBatchSize) ? requestedBatchSize : maxBatchSize));
    const dimensionRaw = typeof opts.dimension === 'number' ? opts.dimension : Number(opts.dimension);
    const dimension = Number.isFinite(dimensionRaw) && dimensionRaw > 0 ? Math.floor(dimensionRaw) : null;
    if (dimension)
        (0, embeddingConfig_1.assertSupportedEmbeddingDimension)(opts.model, dimension);
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
        const orderedBatch = new Array(batch.length);
        for (let responseIndex = 0; responseIndex < embeddings.length; responseIndex += 1) {
            const item = embeddings[responseIndex];
            const emb = item?.embedding;
            if (!Array.isArray(emb) || emb.length === 0) {
                throw new Error('[dashscope] Missing embedding in response');
            }
            const textIndexRaw = Number(item?.text_index);
            const textIndex = Number.isInteger(textIndexRaw) ? textIndexRaw : responseIndex;
            if (textIndex < 0 || textIndex >= batch.length || orderedBatch[textIndex]) {
                throw new Error(`[dashscope] Invalid embedding text_index: ${item?.text_index}`);
            }
            orderedBatch[textIndex] = emb;
        }
        if (orderedBatch.some((embedding) => !embedding)) {
            throw new Error('[dashscope] Missing ordered embedding in response');
        }
        out.push(...orderedBatch);
    }
    return out;
}
