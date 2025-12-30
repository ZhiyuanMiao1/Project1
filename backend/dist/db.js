"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.query = query;
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const parseDbPort = (value, fallback = 3306) => {
    const raw = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
exports.pool = promise_1.default.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseDbPort(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'project1',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true, // 保持心跳
    keepAliveInitialDelay: 10000
});
async function query(sql, params = []) {
    try {
        const [rows] = await exports.pool.execute(sql, params);
        return rows;
    }
    catch (err) {
        const code = err?.code;
        if (code === 'ECONNRESET' || code === 'PROTOCOL_CONNECTION_LOST') {
            console.error('DB connection lost/reset, retrying once...', { code });
            const [rows] = await exports.pool.execute(sql, params);
            return rows;
        }
        throw err;
    }
}
