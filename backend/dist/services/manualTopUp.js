"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.manualTopUpErrorStatus = exports.reportManualTopUpPaid = exports.createManualTopUpOrder = void 0;
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../db");
const paypal_1 = require("./paypal");
const billingOrderExpiry_1 = require("./billingOrderExpiry");
const providerPrefix = (provider) => provider === 'alipay' ? 'ALI' : 'WX';
const createManualTopUpOrder = async (userId, provider, rawHours) => {
    const hours = (0, paypal_1.parseTopUpHours)(rawHours);
    if (!hours)
        throw Object.assign(new Error('请输入正确的充值课时'), { statusCode: 400 });
    const pricing = (0, paypal_1.computeTopUpPrice)(hours);
    const temporaryProviderOrderId = `${providerPrefix(provider)}-INIT-${crypto_1.default.randomUUID()}`;
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        const [roleRows] = await conn.query(`SELECT public_id FROM user_roles
       WHERE user_id = ? AND role = 'student'
       LIMIT 1`, [userId]);
        const studentId = typeof roleRows?.[0]?.public_id === 'string'
            ? roleRows[0].public_id.trim()
            : '';
        if (!studentId) {
            throw Object.assign(new Error('未找到 StudentID，请刷新页面后重试'), { statusCode: 409 });
        }
        const [insertResult] = await conn.query(`INSERT INTO billing_orders (
         user_id, provider, provider_order_id, status,
         topup_hours, unit_price_cny, amount_cny,
         pricing_version, standard_unit_price_cny,
         discount_threshold_hours, discount_unit_price_cny,
         currency_code, amount_usd, provider_create_json
       ) VALUES (?, ?, ?, 'CREATED', ?, ?, ?,
         'tier-v2', 799.00, 10.00, 699.00, 'CNY', 0.00, ?)`, [
            userId,
            provider,
            temporaryProviderOrderId,
            hours,
            pricing.unitPriceCny,
            pricing.amountCny,
            JSON.stringify({ source: 'wallet_payment_create', createdAt: new Date().toISOString() }),
        ]);
        const orderId = Number(insertResult.insertId);
        const paymentReference = `${orderId}${studentId}`;
        await conn.query(`UPDATE billing_orders
       SET provider_order_id = ?, provider_create_json = ?
       WHERE id = ?`, [
            paymentReference,
            JSON.stringify({
                source: 'wallet_payment_create',
                paymentReference,
                studentId,
                createdAt: new Date().toISOString(),
            }),
            orderId,
        ]);
        await conn.commit();
        return {
            id: orderId,
            provider,
            provider_order_id: paymentReference,
            paymentReference,
            status: 'CREATED',
            topup_hours: hours,
            amount_cny: pricing.amountCny,
        };
    }
    catch (error) {
        await conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
};
exports.createManualTopUpOrder = createManualTopUpOrder;
const reportManualTopUpPaid = async (userId, provider, rawOrderId) => {
    await (0, billingOrderExpiry_1.expireStaleBillingOrders)();
    const orderId = Number(rawOrderId);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
        throw Object.assign(new Error('无效的充值订单，请重新打开付款窗口'), { statusCode: 400 });
    }
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        const [rows] = await conn.query(`SELECT id, provider, provider_order_id, status, topup_hours, amount_cny, created_at
       FROM billing_orders
       WHERE id = ? AND user_id = ? AND provider = ?
       LIMIT 1 FOR UPDATE`, [orderId, userId, provider]);
        const order = rows?.[0];
        if (!order)
            throw Object.assign(new Error('未找到充值订单'), { statusCode: 404 });
        const status = String(order.status || '').toUpperCase();
        if (status === 'CREATED' || status === 'APPROVED') {
            await conn.query(`UPDATE billing_orders
         SET status = 'PENDING_RECEIPT', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [orderId]);
            order.status = 'PENDING_RECEIPT';
        }
        else if (status !== 'PENDING_RECEIPT') {
            throw Object.assign(new Error(status === 'VOIDED' ? `订单已超过${billingOrderExpiry_1.BILLING_ORDER_EXPIRY_DAYS}天付款期限` : '该订单当前无法申报付款'), { statusCode: 409 });
        }
        await conn.commit();
        return order;
    }
    catch (error) {
        await conn.rollback();
        throw error;
    }
    finally {
        conn.release();
    }
};
exports.reportManualTopUpPaid = reportManualTopUpPaid;
const manualTopUpErrorStatus = (error) => {
    const status = Number(error?.statusCode);
    return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};
exports.manualTopUpErrorStatus = manualTopUpErrorStatus;
