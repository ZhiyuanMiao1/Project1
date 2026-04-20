"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isUserSuspended = exports.getUserAccountStatus = void 0;
const db_1 = require("../db");
const isMissingAccountStatusColumn = (error) => {
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    return code === 'ER_BAD_FIELD_ERROR' || message.includes('account_status');
};
const getUserAccountStatus = async (userId) => {
    try {
        const rows = await (0, db_1.query)('SELECT account_status FROM users WHERE id = ? LIMIT 1', [userId]);
        return rows?.[0]?.account_status === 'suspended' ? 'suspended' : 'active';
    }
    catch (error) {
        if (isMissingAccountStatusColumn(error))
            return 'active';
        throw error;
    }
};
exports.getUserAccountStatus = getUserAccountStatus;
const isUserSuspended = async (userId) => {
    return (await (0, exports.getUserAccountStatus)(userId)) === 'suspended';
};
exports.isUserSuspended = isUserSuspended;
