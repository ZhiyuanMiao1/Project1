"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBillingOrderExpiryWorker = exports.expireStaleBillingOrders = exports.BILLING_ORDER_EXPIRY_DAYS = void 0;
const db_1 = require("../db");
exports.BILLING_ORDER_EXPIRY_DAYS = 7;
const BILLING_ORDER_EXPIRY_SCAN_INTERVAL_MS = 60 * 60 * 1000;
const expireStaleBillingOrders = async () => {
    const result = await (0, db_1.query)(`UPDATE billing_orders
     SET status = 'VOIDED', updated_at = CURRENT_TIMESTAMP
     WHERE credited_at IS NULL
       AND status IN ('CREATED', 'APPROVED', 'PENDING_RECEIPT')
       AND created_at <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`, [exports.BILLING_ORDER_EXPIRY_DAYS]);
    return Number(result?.affectedRows || 0);
};
exports.expireStaleBillingOrders = expireStaleBillingOrders;
const startBillingOrderExpiryWorker = () => {
    let running = false;
    const run = async () => {
        if (running)
            return;
        running = true;
        try {
            const expired = await (0, exports.expireStaleBillingOrders)();
            if (expired > 0)
                console.log('Billing order expiry scan completed', { expired });
        }
        catch (error) {
            console.error('Billing order expiry scan failed:', error);
        }
        finally {
            running = false;
        }
    };
    void run();
    const interval = setInterval(() => { void run(); }, BILLING_ORDER_EXPIRY_SCAN_INTERVAL_MS);
    interval.unref();
    return interval;
};
exports.startBillingOrderExpiryWorker = startBillingOrderExpiryWorker;
