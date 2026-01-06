"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const rdsVectorIndex_1 = require("../services/rdsVectorIndex");
dotenv_1.default.config();
async function main() {
    const supported = await (0, rdsVectorIndex_1.isRdsVectorIndexSupported)();
    console.log(`[migrate-vector-index] rds_vector_supported=${supported ? 'YES' : 'NO'}`);
    if (!supported)
        return;
    try {
        const courseOk = await (0, rdsVectorIndex_1.ensureCourseEmbeddingsVectorColumn)();
        console.log(`[migrate-vector-index] course_embeddings.embedding_vec=${courseOk ? 'OK' : 'SKIP'}`);
    }
    catch (e) {
        console.warn('[migrate-vector-index] course_embeddings failed:', e);
    }
    try {
        const mentorOk = await (0, rdsVectorIndex_1.ensureMentorCourseEmbeddingsVectorIndex)();
        console.log(`[migrate-vector-index] mentor_course_embeddings.embedding_vec+vidx=${mentorOk ? 'OK' : 'SKIP'}`);
    }
    catch (e) {
        console.warn('[migrate-vector-index] mentor_course_embeddings failed:', e);
    }
}
main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
