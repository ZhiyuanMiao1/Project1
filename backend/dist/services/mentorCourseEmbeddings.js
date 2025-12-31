"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeMentorCourses = sanitizeMentorCourses;
exports.ensureMentorCourseEmbeddingsTable = ensureMentorCourseEmbeddingsTable;
exports.prepareMentorCourseEmbeddings = prepareMentorCourseEmbeddings;
exports.applyMentorCourseEmbeddings = applyMentorCourseEmbeddings;
const crypto_1 = __importDefault(require("crypto"));
const dashscopeEmbeddings_1 = require("./dashscopeEmbeddings");
const db_1 = require("../db");
const DEFAULT_MODEL = 'text-embedding-v4';
const sha256Hex = (input) => crypto_1.default.createHash('sha256').update(input).digest('hex');
const normalizeCourseText = (input) => {
    const s = String(input ?? '').trim();
    const collapsed = s.replace(/\s+/g, ' ');
    return collapsed.toLowerCase();
};
function sanitizeMentorCourses(raw, maxCount = 50) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    const seen = new Set();
    for (const item of raw) {
        if (typeof item !== 'string')
            continue;
        const s = item.trim();
        if (!s)
            continue;
        if (s.length > 100)
            continue;
        const key = normalizeCourseText(s);
        if (!key)
            continue;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(s);
        if (out.length >= maxCount)
            break;
    }
    return out;
}
async function ensureMentorCourseEmbeddingsTable() {
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS \`mentor_course_embeddings\` (
      \`id\` INT NOT NULL AUTO_INCREMENT,
      \`user_id\` INT NOT NULL,
      \`course_text\` VARCHAR(255) NOT NULL,
      \`course_text_norm\` VARCHAR(255) NOT NULL,
      \`course_key\` CHAR(64) NOT NULL,
      \`model\` VARCHAR(64) NOT NULL,
      \`embedding_dim\` INT NOT NULL,
      \`embedding\` JSON NOT NULL,
      \`text_hash\` CHAR(64) NOT NULL,
      \`created_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`uniq_mentor_course_user_key\` (\`user_id\`, \`course_key\`),
      KEY \`idx_mentor_course_user\` (\`user_id\`),
      CONSTRAINT \`fk_mentor_course_embeddings_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}
async function loadGlobalEmbeddingsByLabel(labels, model) {
    const unique = Array.from(new Set(labels.map((s) => s.trim()).filter(Boolean)));
    if (unique.length === 0)
        return new Map();
    const placeholders = unique.map(() => '?').join(',');
    const rows = await (0, db_1.query)(`SELECT label, embedding, embedding_dim, model FROM course_embeddings WHERE model = ? AND label IN (${placeholders})`, [model, ...unique]);
    const map = new Map();
    for (const r of rows || []) {
        const label = String(r.label || '').trim();
        if (!label)
            continue;
        try {
            const emb = typeof r.embedding === 'string' ? JSON.parse(r.embedding) : r.embedding;
            if (Array.isArray(emb) && emb.length > 0) {
                map.set(label, { embedding: emb, embeddingDim: Number(r.embedding_dim) || emb.length });
            }
        }
        catch {
            // ignore malformed rows
        }
    }
    return map;
}
async function loadExistingHashes(userId, keys) {
    if (keys.length === 0)
        return new Map();
    const placeholders = keys.map(() => '?').join(',');
    const rows = await (0, db_1.query)(`SELECT course_key, text_hash FROM mentor_course_embeddings WHERE user_id = ? AND course_key IN (${placeholders})`, [userId, ...keys]);
    const map = new Map();
    for (const r of rows || []) {
        if (!r?.course_key)
            continue;
        map.set(String(r.course_key), String(r.text_hash || ''));
    }
    return map;
}
async function prepareMentorCourseEmbeddings(params) {
    const model = (params.model || DEFAULT_MODEL).trim();
    const items = params.courses
        .map((courseText) => {
        const courseTextTrim = String(courseText ?? '').trim();
        const courseTextNorm = normalizeCourseText(courseTextTrim);
        const courseKey = sha256Hex(courseTextNorm);
        const textHash = sha256Hex(`${model}\n${courseTextTrim}`);
        return { courseText: courseTextTrim, courseTextNorm, courseKey, textHash };
    })
        .filter((x) => x.courseText && x.courseTextNorm);
    const keys = items.map((i) => i.courseKey);
    await ensureMentorCourseEmbeddingsTable();
    const existingByKey = await loadExistingHashes(params.userId, keys);
    const globalByLabel = await loadGlobalEmbeddingsByLabel(items.map((i) => i.courseText), model);
    const toEmbed = [];
    const toEmbedIdx = [];
    const prepared = [];
    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const existingHash = existingByKey.get(it.courseKey);
        if (existingHash && existingHash === it.textHash)
            continue;
        const global = globalByLabel.get(it.courseText);
        if (global) {
            prepared.push({
                courseText: it.courseText,
                courseTextNorm: it.courseTextNorm,
                courseKey: it.courseKey,
                model,
                embeddingDim: global.embeddingDim,
                embedding: global.embedding,
                textHash: it.textHash,
            });
            continue;
        }
        toEmbed.push(it.courseText);
        toEmbedIdx.push(i);
    }
    if (toEmbed.length > 0) {
        const embeddings = await (0, dashscopeEmbeddings_1.dashscopeEmbedTexts)(toEmbed, { apiKey: params.apiKey, model, url: params.url, batchSize: 16 });
        for (let j = 0; j < embeddings.length; j++) {
            const idx = toEmbedIdx[j];
            const it = items[idx];
            const emb = embeddings[j];
            prepared.push({
                courseText: it.courseText,
                courseTextNorm: it.courseTextNorm,
                courseKey: it.courseKey,
                model,
                embeddingDim: emb.length,
                embedding: emb,
                textHash: it.textHash,
            });
        }
    }
    return {
        model,
        keepKeys: keys,
        upserts: prepared,
    };
}
async function applyMentorCourseEmbeddings(params) {
    await ensureMentorCourseEmbeddingsTable();
    const exec = params.exec;
    if (params.keepKeys.length === 0) {
        await exec('DELETE FROM mentor_course_embeddings WHERE user_id = ?', [params.userId]);
    }
    else {
        const placeholders = params.keepKeys.map(() => '?').join(',');
        await exec(`DELETE FROM mentor_course_embeddings WHERE user_id = ? AND course_key NOT IN (${placeholders})`, [
            params.userId,
            ...params.keepKeys,
        ]);
    }
    for (const r of params.upserts) {
        const embeddingJson = JSON.stringify(r.embedding);
        await exec(`
      INSERT INTO mentor_course_embeddings
        (user_id, course_text, course_text_norm, course_key, model, embedding_dim, embedding, text_hash)
      VALUES
        (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?)
      ON DUPLICATE KEY UPDATE
        course_text = VALUES(course_text),
        course_text_norm = VALUES(course_text_norm),
        model = VALUES(model),
        embedding_dim = VALUES(embedding_dim),
        embedding = VALUES(embedding),
        text_hash = VALUES(text_hash)
    `, [params.userId, r.courseText, r.courseTextNorm, r.courseKey, r.model, r.embeddingDim, embeddingJson, r.textHash]);
    }
}
