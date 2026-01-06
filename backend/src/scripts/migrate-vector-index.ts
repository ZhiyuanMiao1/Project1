import dotenv from 'dotenv';
import { ensureCourseEmbeddingsVectorColumn, ensureMentorCourseEmbeddingsVectorIndex, isRdsVectorIndexSupported } from '../services/rdsVectorIndex';

dotenv.config();

async function main() {
  const supported = await isRdsVectorIndexSupported();
  console.log(`[migrate-vector-index] rds_vector_supported=${supported ? 'YES' : 'NO'}`);
  if (!supported) return;

  try {
    const courseOk = await ensureCourseEmbeddingsVectorColumn();
    console.log(`[migrate-vector-index] course_embeddings.embedding_vec=${courseOk ? 'OK' : 'SKIP'}`);
  } catch (e) {
    console.warn('[migrate-vector-index] course_embeddings failed:', e);
  }

  try {
    const mentorOk = await ensureMentorCourseEmbeddingsVectorIndex();
    console.log(`[migrate-vector-index] mentor_course_embeddings.embedding_vec+vidx=${mentorOk ? 'OK' : 'SKIP'}`);
  } catch (e) {
    console.warn('[migrate-vector-index] mentor_course_embeddings failed:', e);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
