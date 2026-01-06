import { query } from '../db';

type ColumnExistsRow = { c: number };

const DEFAULT_VECTOR_DIMENSION = 256;

const parseVectorDimension = (value: any, fallback = DEFAULT_VECTOR_DIMENSION) => {
  const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const getVectorDimension = () => parseVectorDimension(process.env.DASHSCOPE_EMBEDDING_DIM, DEFAULT_VECTOR_DIMENSION);

const vectorBytes = (dimension: number) => dimension * 4;

export async function isRdsVectorIndexSupported() {
  try {
    const rows = await query<any[]>("SHOW VARIABLES LIKE 'vidx_disabled'");
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return false;
  }
}

let courseEmbeddingsVectorEnsured = false;
let mentorCourseEmbeddingsVectorEnsured = false;

async function columnExists(tableName: string, columnName: string) {
  const rows = await query<ColumnExistsRow[]>(
    'SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [tableName, columnName]
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

export async function ensureCourseEmbeddingsVectorColumn() {
  if (courseEmbeddingsVectorEnsured) return true;

  const supported = await isRdsVectorIndexSupported();
  if (!supported) return false;

  const tableName = 'course_embeddings';
  const dim = getVectorDimension();
  const bytes = vectorBytes(dim);

  if (!(await columnExists(tableName, 'embedding_vec'))) {
    await query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`embedding_vec\` /*!99999 vector(${dim}) */ varbinary(${bytes}) NULL`
    );
  }

  await query(
    `UPDATE \`${tableName}\` SET \`embedding_vec\` = TO_VECTOR(CAST(\`embedding\` AS CHAR)) WHERE \`embedding_vec\` IS NULL`
  );

  await query(
    `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`embedding_vec\` /*!99999 vector(${dim}) */ varbinary(${bytes}) NOT NULL`
  );

  courseEmbeddingsVectorEnsured = true;
  return true;
}

export async function ensureMentorCourseEmbeddingsVectorIndex() {
  if (mentorCourseEmbeddingsVectorEnsured) return true;

  const supported = await isRdsVectorIndexSupported();
  if (!supported) return false;

  const tableName = 'mentor_course_embeddings';
  const dim = getVectorDimension();
  const bytes = vectorBytes(dim);

  if (!(await columnExists(tableName, 'embedding_vec'))) {
    await query(
      `ALTER TABLE \`${tableName}\` ADD COLUMN \`embedding_vec\` /*!99999 vector(${dim}) */ varbinary(${bytes}) NULL`
    );
  }

  await query(
    `UPDATE \`${tableName}\` SET \`embedding_vec\` = TO_VECTOR(CAST(\`embedding\` AS CHAR)) WHERE \`embedding_vec\` IS NULL`
  );

  await query(
    `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`embedding_vec\` /*!99999 vector(${dim}) */ varbinary(${bytes}) NOT NULL`
  );

  try {
    await query(`CREATE VECTOR INDEX \`vidx_${tableName}_embedding_vec\` ON \`${tableName}\`(\`embedding_vec\`) DISTANCE=COSINE`);
  } catch (e: any) {
    const code = String(e?.code || '');
    const message = String(e?.message || '');
    if (!(code === 'ER_DUP_KEYNAME' || message.includes('Duplicate key name'))) throw e;
  }

  mentorCourseEmbeddingsVectorEnsured = true;
  return true;
}
