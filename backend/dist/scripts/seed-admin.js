"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = require("../db");
const adminSchema_1 = require("../services/adminSchema");
const getArg = (name) => {
    const prefix = `--${name}=`;
    const found = process.argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length).trim() : '';
};
const main = async () => {
    await (0, adminSchema_1.ensureAdminSchema)();
    const username = (getArg('username') || process.env.ADMIN_USERNAME || '').trim().toLowerCase();
    const password = getArg('password') || process.env.ADMIN_PASSWORD || '';
    const displayName = (getArg('display-name') || process.env.ADMIN_DISPLAY_NAME || username).trim();
    if (!username || !password) {
        throw new Error('Missing admin credentials. Set ADMIN_USERNAME and ADMIN_PASSWORD, or pass --username=... --password=...');
    }
    if (password.length < 8) {
        throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    }
    const passwordHash = await bcryptjs_1.default.hash(password, 10);
    await (0, db_1.query)(`INSERT INTO admin_users (username, password_hash, display_name, is_active)
     VALUES (?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE
       password_hash = VALUES(password_hash),
       display_name = VALUES(display_name),
       is_active = 1,
       updated_at = CURRENT_TIMESTAMP`, [username, passwordHash, displayName || username]);
    console.log(`[seed-admin] Admin user ready: ${username}`);
};
main()
    .catch((error) => {
    console.error('[seed-admin] Failed:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    try {
        await db_1.pool.end();
    }
    catch { }
});
