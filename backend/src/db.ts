import mysql from 'mysql2/promise';
import type { ResultSetHeader } from 'mysql2';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'project1',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows] = await pool.execute(sql, params);
  return rows as T;
}

export type InsertResult = ResultSetHeader;
