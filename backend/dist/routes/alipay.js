"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const paypal_1 = require("../services/paypal");
const router = (0, express_1.Router)();
const normalizeClientReference = (value) => {
    const reference = typeof value === 'string' ? value.trim() : '';
    return /^[A-Za-z0-9_-]{8,80}$/.test(reference) ? reference : null;
};
router.post('/transfers/report', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    const hours = (0, paypal_1.parseTopUpHours)(req.body?.hours);
    const clientReference = normalizeClientReference(req.body?.clientReference);
    if (!hours)
        return res.status(400).json({ error: '请输入正确的充值课时' });
    if (!clientReference)
        return res.status(400).json({ error: '无效的付款申报编号，请重新打开付款窗口' });
    const pricing = (0, paypal_1.computeTopUpPrice)(hours);
    const providerOrderId = `ALI-${clientReference}`;
    try {
        await (0, db_1.query)(`INSERT INTO billing_orders (
         user_id, provider, provider_order_id, status,
         topup_hours, unit_price_cny, amount_cny,
         pricing_version, standard_unit_price_cny,
         discount_threshold_hours, discount_unit_price_cny,
         currency_code, amount_usd, provider_create_json
       ) VALUES (?, 'alipay', ?, 'PENDING_RECEIPT', ?, ?, ?,
         'tier-v1', 600.00, 10.00, 500.00, 'CNY', 0.00, ?)
       ON DUPLICATE KEY UPDATE provider_order_id = provider_order_id`, [
            req.user.id,
            providerOrderId,
            hours,
            pricing.unitPriceCny,
            pricing.amountCny,
            JSON.stringify({
                source: 'wallet_payment_report',
                clientReference,
                reportedAt: new Date().toISOString(),
            }),
        ]);
        const rows = await (0, db_1.query)(`SELECT id, provider, provider_order_id, status, topup_hours, amount_cny, created_at
       FROM billing_orders
       WHERE provider = 'alipay' AND provider_order_id = ? AND user_id = ?
       LIMIT 1`, [providerOrderId, req.user.id]);
        const order = rows?.[0];
        if (!order)
            return res.status(500).json({ error: '付款申报保存失败，请稍后重试' });
        return res.status(201).json({ order });
    }
    catch (error) {
        console.error('Alipay payment report error:', error);
        return res.status(500).json({ error: '付款申报保存失败，请稍后重试' });
    }
});
exports.default = router;
