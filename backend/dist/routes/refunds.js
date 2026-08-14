"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRefundById = processRefundById;
const express_1 = require("express");
const db_1 = require("../db");
const auth_1 = require("../middleware/auth");
const refundPricing_1 = require("../services/refundPricing");
const paypal_1 = require("../services/paypal");
const router = (0, express_1.Router)();
const ACTIVE_REFUND_STATUSES = new Set(['PROCESSING', 'PENDING', 'COMPLETED']);
const FINAL_REFUND_STATUSES = new Set(['COMPLETED', 'FAILED']);
const REFUNDABLE_PROVIDERS = new Set(['paypal', 'alipay', 'wechat']);
const EPSILON = 0.000001;
const toNumber = (value, fallback = 0) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};
const toIso = (value) => {
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === 'string' && value)
        return value;
    return null;
};
const normalizeRefundStatus = (value) => {
    const status = String(value || '').trim().toUpperCase();
    return ['PROCESSING', 'PENDING', 'COMPLETED', 'FAILED'].includes(status)
        ? status
        : 'PROCESSING';
};
const normalizeProvider = (value) => String(value || '').trim().toLowerCase();
const getOriginalPaidAmount = (order) => {
    const currency = String(order.currency_code || '').trim().toUpperCase();
    if (currency === 'CNY')
        return toNumber(order.amount_cny);
    const providerAmount = toNumber(order.amount_usd);
    return providerAmount > 0 ? providerAmount : toNumber(order.amount_cny);
};
const canRefundOrder = (order) => {
    if (!order)
        return false;
    const provider = normalizeProvider(order.provider);
    if (!REFUNDABLE_PROVIDERS.has(provider))
        return false;
    return provider !== 'paypal' || Boolean(order.paypal_capture_id);
};
const aggregateActiveRefunds = (rows = []) => {
    return rows.reduce((acc, row) => {
        const status = normalizeRefundStatus(row?.status);
        if (!ACTIVE_REFUND_STATUSES.has(status))
            return acc;
        acc.hours += toNumber(row?.requested_hours);
        acc.cny += toNumber(row?.amount_cny);
        acc.original += toNumber(row?.amount_original);
        return acc;
    }, { hours: 0, cny: 0, original: 0 });
};
const calculateOrderQuote = (order, active, requestedHours) => {
    return (0, refundPricing_1.computeRefundPricing)({
        purchasedHours: toNumber(order.topup_hours),
        requestedHours,
        priorActiveRefundHours: active.hours,
        originalAmountCny: toNumber(order.amount_cny),
        originalAmount: getOriginalPaidAmount(order),
        priorActiveRefundCny: active.cny,
        priorActiveRefundOriginal: active.original,
        standardUnitPriceCny: toNumber(order.standard_unit_price_cny, 600),
        discountThresholdHours: toNumber(order.discount_threshold_hours, 10),
        discountUnitPriceCny: toNumber(order.discount_unit_price_cny, 500),
    });
};
async function loadOrderAndRefunds(conn, userId, orderId, lock = false) {
    if (lock) {
        await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
    }
    const [rawOrderRows] = await conn.query(`SELECT id, user_id, provider, topup_hours, remaining_hours, unit_price_cny,
            pricing_version, standard_unit_price_cny, discount_threshold_hours,
            discount_unit_price_cny, amount_cny, currency_code, amount_usd,
            paypal_capture_id, credited_at
     FROM billing_orders
     WHERE id = ? AND user_id = ? AND credited_at IS NOT NULL
     LIMIT 1${lock ? ' FOR UPDATE' : ''}`, [orderId, userId]);
    const orderRows = rawOrderRows;
    const order = orderRows?.[0] || null;
    if (!order)
        return { order: null, refunds: [], active: aggregateActiveRefunds() };
    const [refundRows] = await conn.query(`SELECT id, requested_hours, amount_cny, amount_original, status
     FROM billing_refunds
     WHERE billing_order_id = ?${lock ? ' FOR UPDATE' : ''}`, [orderId]);
    return { order, refunds: refundRows || [], active: aggregateActiveRefunds(refundRows || []) };
}
async function getUpcomingScheduledHours(userId) {
    const rows = await (0, db_1.query)(`SELECT COALESCE(SUM(duration_hours), 0) AS hours
     FROM course_sessions
     WHERE student_user_id = ?
       AND status = 'scheduled'
       AND starts_at >= CURRENT_TIMESTAMP`, [userId]);
    return Number(toNumber(rows?.[0]?.hours).toFixed(2));
}
async function getWalletSummary(userId) {
    const [balanceRows, grossRows, refundRows] = await Promise.all([
        (0, db_1.query)('SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1', [userId]),
        (0, db_1.query)(`SELECT
         COALESCE(SUM(amount_cny), 0) AS totalTopUpCny,
         COALESCE(SUM(CASE
           WHEN credited_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') THEN amount_cny
           ELSE 0
         END), 0) AS monthTopUpCny
       FROM billing_orders
       WHERE user_id = ? AND credited_at IS NOT NULL`, [userId]),
        (0, db_1.query)(`SELECT COALESCE(SUM(amount_cny), 0) AS monthRefundCny
       FROM billing_refunds
       WHERE user_id = ?
         AND status = 'COMPLETED'
         AND completed_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01')`, [userId]),
    ]);
    const monthTopUpCny = toNumber(grossRows?.[0]?.monthTopUpCny);
    const monthRefundCny = toNumber(refundRows?.[0]?.monthRefundCny);
    return {
        remainingHours: Number(toNumber(balanceRows?.[0]?.lesson_balance_hours).toFixed(2)),
        totalTopUpCny: Number(toNumber(grossRows?.[0]?.totalTopUpCny).toFixed(2)),
        monthTopUpCny: Number(monthTopUpCny.toFixed(2)),
        monthNetSpendingCny: Number((monthTopUpCny - monthRefundCny).toFixed(2)),
    };
}
const toPublicRefund = (row) => ({
    id: String(row?.public_id || ''),
    orderId: String(row?.billing_order_id || ''),
    requestedHours: Number(toNumber(row?.requested_hours).toFixed(2)),
    amountCny: Number(toNumber(row?.amount_cny).toFixed(2)),
    amount: {
        currency: String(row?.currency_code || '').toUpperCase(),
        value: Number(toNumber(row?.amount_original).toFixed(2)),
    },
    provider: String(row?.provider || ''),
    providerRefundId: row?.paypal_refund_id ? String(row.paypal_refund_id) : null,
    status: normalizeRefundStatus(row?.status),
    failureMessage: row?.failure_message ? String(row.failure_message) : null,
    createdAt: toIso(row?.created_at),
    completedAt: toIso(row?.completed_at),
});
async function fetchRefundRow(refundId) {
    const rows = await (0, db_1.query)(`SELECT br.*, bo.paypal_capture_id
     FROM billing_refunds br
     INNER JOIN billing_orders bo ON bo.id = br.billing_order_id
     WHERE br.id = ?
     LIMIT 1`, [refundId]);
    return rows?.[0] || null;
}
async function releaseFailedRefund(refundId, failureCode, failureMessage, payload) {
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        const [seedRows] = await conn.query('SELECT user_id FROM billing_refunds WHERE id = ? LIMIT 1', [refundId]);
        const userId = Number(seedRows?.[0]?.user_id || 0);
        if (!userId) {
            await conn.rollback();
            return null;
        }
        await conn.query('SELECT id FROM users WHERE id = ? LIMIT 1 FOR UPDATE', [userId]);
        const [refundRows] = await conn.query(`SELECT id, billing_order_id, requested_hours, status, balance_reserved
       FROM billing_refunds
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`, [refundId]);
        const refund = refundRows?.[0];
        if (!refund) {
            await conn.rollback();
            return null;
        }
        if (normalizeRefundStatus(refund.status) === 'COMPLETED') {
            await conn.commit();
            return fetchRefundRow(refundId);
        }
        await conn.query('SELECT id FROM billing_orders WHERE id = ? LIMIT 1 FOR UPDATE', [
            Number(refund.billing_order_id),
        ]);
        if (Number(refund.balance_reserved) === 1) {
            const hours = toNumber(refund.requested_hours);
            await conn.query('UPDATE billing_orders SET remaining_hours = remaining_hours + ? WHERE id = ?', [hours, Number(refund.billing_order_id)]);
            await conn.query('UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?', [hours, userId]);
        }
        await conn.query(`UPDATE billing_refunds
       SET status = 'FAILED',
           balance_reserved = 0,
           failure_code = ?,
           failure_message = ?,
           provider_response_json = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [failureCode.slice(0, 80), failureMessage.slice(0, 500), JSON.stringify(payload || {}), refundId]);
        await conn.commit();
        return fetchRefundRow(refundId);
    }
    catch (error) {
        try {
            await conn.rollback();
        }
        catch { }
        throw error;
    }
    finally {
        conn.release();
    }
}
async function saveProviderState(refundId, data) {
    const providerStatus = String(data?.status || '').trim().toUpperCase();
    const mappedStatus = providerStatus === 'COMPLETED'
        ? 'COMPLETED'
        : providerStatus === 'PENDING'
            ? 'PENDING'
            : providerStatus === 'FAILED' || providerStatus === 'CANCELLED'
                ? 'FAILED'
                : 'PROCESSING';
    const refundProviderId = typeof data?.id === 'string' && data.id.trim() ? data.id.trim() : null;
    if (mappedStatus === 'FAILED') {
        const reason = String(data?.status_details?.reason || data?.name || 'PAYPAL_REFUND_FAILED');
        const message = String(data?.message || 'PayPal 退款失败');
        return releaseFailedRefund(refundId, reason, message, data);
    }
    await (0, db_1.query)(`UPDATE billing_refunds
     SET status = ?,
         paypal_refund_id = COALESCE(?, paypal_refund_id),
         provider_response_json = ?,
         failure_code = NULL,
         failure_message = NULL,
         completed_at = CASE WHEN ? = 'COMPLETED' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE completed_at END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`, [mappedStatus, refundProviderId, JSON.stringify(data || {}), mappedStatus, refundId]);
    return fetchRefundRow(refundId);
}
async function processPayPalRefund(refundId) {
    const refund = await fetchRefundRow(refundId);
    if (!refund)
        return null;
    const currentStatus = normalizeRefundStatus(refund.status);
    if (FINAL_REFUND_STATUSES.has(currentStatus))
        return refund;
    const runtime = (0, paypal_1.getPayPalRuntimeConfig)();
    if (!runtime) {
        return releaseFailedRefund(refundId, 'PAYPAL_NOT_CONFIGURED', 'PayPal 退款服务暂不可用，请稍后重试', {});
    }
    try {
        const token = await (0, paypal_1.getServerAccessToken)(runtime);
        const providerRefundId = String(refund.paypal_refund_id || '').trim();
        const captureId = String(refund.paypal_capture_id || '').trim();
        if (!captureId) {
            return releaseFailedRefund(refundId, 'CAPTURE_ID_MISSING', '原支付缺少 PayPal Capture ID，无法自动退款', {});
        }
        const result = providerRefundId
            ? await (0, paypal_1.fetchJson)(`${runtime.apiBase}/v2/payments/refunds/${encodeURIComponent(providerRefundId)}`, {
                method: 'GET',
                headers: { Authorization: `Bearer ${token.accessToken}` },
            })
            : await (0, paypal_1.fetchJson)(`${runtime.apiBase}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token.accessToken}`,
                    'Content-Type': 'application/json',
                    'PayPal-Request-Id': String(refund.paypal_request_id),
                    Prefer: 'return=representation',
                },
                body: JSON.stringify({
                    amount: {
                        currency_code: String(refund.currency_code || 'USD').toUpperCase(),
                        value: toNumber(refund.amount_original).toFixed(2),
                    },
                    custom_id: String(refund.public_id),
                    note_to_payer: `Mentory refund ${toNumber(refund.requested_hours)} lesson hours`,
                }),
            });
        if (!result.ok) {
            const issue = String(result.data?.details?.[0]?.issue
                || result.data?.name
                || result.data?.error
                || `PAYPAL_HTTP_${result.status}`);
            const message = String(result.data?.message || 'PayPal 退款请求失败');
            if (result.status < 500 && result.status !== 409) {
                return releaseFailedRefund(refundId, issue, message, result.data);
            }
            await (0, db_1.query)(`UPDATE billing_refunds
         SET status = 'PROCESSING',
             failure_code = ?,
             failure_message = ?,
             provider_response_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`, [issue.slice(0, 80), message.slice(0, 500), JSON.stringify(result.data || {}), refundId]);
            return fetchRefundRow(refundId);
        }
        return saveProviderState(refundId, result.data);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'PayPal 退款状态暂未确认';
        await (0, db_1.query)(`UPDATE billing_refunds
       SET status = 'PROCESSING',
           failure_code = 'PAYPAL_RESULT_UNKNOWN',
           failure_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`, [message.slice(0, 500), refundId]);
        return fetchRefundRow(refundId);
    }
}
async function processRefundById(refundId) {
    const refund = await fetchRefundRow(refundId);
    if (!refund)
        return null;
    return normalizeProvider(refund.provider) === 'paypal'
        ? processPayPalRefund(refundId)
        : refund;
}
router.get('/eligible-orders', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    try {
        const [orderRows, refundRows, upcomingScheduledHours, wallet] = await Promise.all([
            (0, db_1.query)(`SELECT bo.id, bo.user_id, bo.provider, bo.topup_hours, bo.remaining_hours,
                bo.unit_price_cny, bo.pricing_version, bo.standard_unit_price_cny,
                bo.discount_threshold_hours, bo.discount_unit_price_cny,
                bo.amount_cny, bo.currency_code, bo.amount_usd,
                bo.paypal_capture_id, bo.credited_at,
                COALESCE(allocations.consumed_hours, 0) AS consumed_hours
         FROM billing_orders bo
         LEFT JOIN (
           SELECT billing_order_id, SUM(hours) AS consumed_hours
           FROM billing_hour_allocations
           GROUP BY billing_order_id
         ) allocations ON allocations.billing_order_id = bo.id
         WHERE bo.user_id = ?
           AND LOWER(bo.provider) IN ('paypal', 'alipay', 'wechat')
           AND bo.credited_at IS NOT NULL
           AND (LOWER(bo.provider) <> 'paypal' OR bo.paypal_capture_id IS NOT NULL)
           AND bo.remaining_hours > 0
         ORDER BY bo.credited_at DESC, bo.id DESC`, [req.user.id]),
            (0, db_1.query)(`SELECT *
         FROM billing_refunds
         WHERE user_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 100`, [req.user.id]),
            getUpcomingScheduledHours(req.user.id),
            getWalletSummary(req.user.id),
        ]);
        const refundRowsByOrder = new Map();
        for (const refund of refundRows || []) {
            const key = String(refund.billing_order_id);
            const list = refundRowsByOrder.get(key) || [];
            list.push(refund);
            refundRowsByOrder.set(key, list);
        }
        const orders = (orderRows || []).map((order) => {
            const active = aggregateActiveRefunds(refundRowsByOrder.get(String(order.id)) || []);
            const availableHours = Number(toNumber(order.remaining_hours).toFixed(2));
            const maximumQuote = calculateOrderQuote(order, active, availableHours);
            return {
                id: String(order.id),
                provider: String(order.provider),
                paidAt: toIso(order.credited_at),
                purchasedHours: Number(toNumber(order.topup_hours).toFixed(2)),
                consumedHours: Number(toNumber(order.consumed_hours).toFixed(2)),
                availableHours,
                unitPriceCny: Number(toNumber(order.unit_price_cny).toFixed(2)),
                paidAmountCny: Number(toNumber(order.amount_cny).toFixed(2)),
                paidAmount: {
                    currency: String(order.currency_code || 'USD').toUpperCase(),
                    value: Number(getOriginalPaidAmount(order).toFixed(2)),
                },
                maximumRefund: {
                    hours: availableHours,
                    amountCny: maximumQuote.refundAmountCny,
                    amount: {
                        currency: String(order.currency_code || 'USD').toUpperCase(),
                        value: maximumQuote.refundAmountOriginal,
                    },
                },
                refundable: maximumQuote.refundAmountOriginal >= 0.01,
            };
        });
        return res.json({
            orders,
            refunds: (refundRows || []).map(toPublicRefund),
            upcomingScheduledHours,
            wallet,
        });
    }
    catch (error) {
        console.error('Refund eligible orders error:', error);
        return res.status(500).json({ error: '退款数据加载失败，请确认数据库已执行退款迁移' });
    }
});
router.post('/quote', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const orderId = Number.parseInt(String(req.body?.orderId || ''), 10);
    const hours = (0, refundPricing_1.parseRefundHours)(req.body?.hours);
    if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({ error: '无效充值订单' });
    }
    if (!hours)
        return res.status(400).json({ error: '退款课时需为 0.25 小时的倍数' });
    const conn = await db_1.pool.getConnection();
    try {
        const { order, active } = await loadOrderAndRefunds(conn, req.user.id, orderId, false);
        if (!canRefundOrder(order)) {
            return res.status(404).json({ error: '未找到可退款订单' });
        }
        const availableHours = toNumber(order.remaining_hours);
        if (hours > availableHours + EPSILON) {
            return res.status(409).json({ error: '可退款课时已发生变化，请刷新后重试' });
        }
        const quote = calculateOrderQuote(order, active, hours);
        if (quote.refundAmountOriginal < 0.01) {
            return res.status(422).json({
                code: 'NO_REFUND_VALUE_AFTER_REPRICING',
                error: '优惠重新计算后暂无可退金额，请调整退款课时',
                quote,
            });
        }
        const [wallet, upcomingScheduledHours] = await Promise.all([
            getWalletSummary(req.user.id),
            getUpcomingScheduledHours(req.user.id),
        ]);
        return res.json({
            orderId: String(order.id),
            requestedHours: hours,
            amountCny: quote.refundAmountCny,
            amount: {
                currency: String(order.currency_code || 'USD').toUpperCase(),
                value: quote.refundAmountOriginal,
            },
            retainedHoursAfter: quote.retainedHoursAfter,
            repricedRetainedAmountCny: quote.repricedRetainedAmountCny,
            postRefundBalance: Number((wallet.remainingHours - hours).toFixed(2)),
            upcomingScheduledHours,
        });
    }
    catch (error) {
        console.error('Refund quote error:', error);
        return res.status(500).json({ error: '退款报价失败，请稍后重试' });
    }
    finally {
        conn.release();
    }
});
router.post('/', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const orderId = Number.parseInt(String(req.body?.orderId || ''), 10);
    const hours = (0, refundPricing_1.parseRefundHours)(req.body?.hours);
    const clientRequestId = String(req.body?.clientRequestId || '').trim();
    const expectedAmount = toNumber(req.body?.expectedAmount, -1);
    if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({ error: '无效充值订单' });
    }
    if (!hours)
        return res.status(400).json({ error: '退款课时需为 0.25 小时的倍数' });
    if (!/^[A-Za-z0-9-]{8,78}$/.test(clientRequestId)) {
        return res.status(400).json({ error: '无效退款请求标识' });
    }
    const conn = await db_1.pool.getConnection();
    let refundId = 0;
    try {
        await conn.beginTransaction();
        const [existingRows] = await conn.query('SELECT id, user_id FROM billing_refunds WHERE public_id = ? LIMIT 1 FOR UPDATE', [clientRequestId]);
        const existing = existingRows?.[0];
        if (existing) {
            if (Number(existing.user_id) !== req.user.id) {
                await conn.rollback();
                return res.status(409).json({ error: '退款请求标识冲突' });
            }
            refundId = Number(existing.id);
            await conn.commit();
        }
        else {
            const { order, active } = await loadOrderAndRefunds(conn, req.user.id, orderId, true);
            if (!canRefundOrder(order)) {
                await conn.rollback();
                return res.status(404).json({ error: '未找到可退款订单' });
            }
            const availableHours = toNumber(order.remaining_hours);
            if (hours > availableHours + EPSILON) {
                await conn.rollback();
                return res.status(409).json({ error: '可退款课时已发生变化，请重新获取报价' });
            }
            const quote = calculateOrderQuote(order, active, hours);
            if (quote.refundAmountOriginal < 0.01) {
                await conn.rollback();
                return res.status(422).json({
                    code: 'NO_REFUND_VALUE_AFTER_REPRICING',
                    error: '优惠重新计算后暂无可退金额，请调整退款课时',
                });
            }
            if (expectedAmount >= 0 && Math.abs(expectedAmount - quote.refundAmountOriginal) >= 0.01) {
                await conn.rollback();
                return res.status(409).json({
                    code: 'REFUND_QUOTE_CHANGED',
                    error: '退款金额已发生变化，请重新确认',
                });
            }
            const [balanceUpdate] = await conn.query(`UPDATE users
         SET lesson_balance_hours = lesson_balance_hours - ?
         WHERE id = ? AND lesson_balance_hours >= ?`, [hours, req.user.id, hours]);
            if (Number(balanceUpdate?.affectedRows || 0) !== 1) {
                await conn.rollback();
                return res.status(409).json({ error: '钱包余额不足，无法提交退款' });
            }
            const [orderUpdate] = await conn.query(`UPDATE billing_orders
         SET remaining_hours = remaining_hours - ?
         WHERE id = ? AND remaining_hours >= ?`, [hours, orderId, hours]);
            if (Number(orderUpdate?.affectedRows || 0) !== 1) {
                await conn.rollback();
                return res.status(409).json({ error: '可退款课时已发生变化，请重新获取报价' });
            }
            const provider = normalizeProvider(order.provider);
            const initialStatus = provider === 'paypal' ? 'PROCESSING' : 'PENDING';
            const [insertResult] = await conn.query(`INSERT INTO billing_refunds
          (public_id, user_id, billing_order_id, provider, requested_hours,
           amount_cny, currency_code, amount_original, paypal_request_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
                clientRequestId,
                req.user.id,
                orderId,
                provider,
                hours,
                quote.refundAmountCny,
                String(order.currency_code || (provider === 'paypal' ? 'USD' : 'CNY')).toUpperCase(),
                quote.refundAmountOriginal,
                clientRequestId,
                initialStatus,
            ]);
            refundId = Number(insertResult.insertId);
            await conn.commit();
        }
        const processed = await processRefundById(refundId);
        if (!processed)
            return res.status(404).json({ error: '退款记录不存在' });
        const wallet = await getWalletSummary(req.user.id);
        return res.status(201).json({ refund: toPublicRefund(processed), wallet });
    }
    catch (error) {
        try {
            await conn.rollback();
        }
        catch { }
        console.error('Create refund error:', error);
        return res.status(500).json({ error: '退款提交失败，请稍后重试' });
    }
    finally {
        conn.release();
    }
});
router.get('/:refundId/status', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: '未授权' });
    const publicId = String(req.params.refundId || '').trim();
    if (!publicId)
        return res.status(400).json({ error: '无效退款记录' });
    try {
        const rows = await (0, db_1.query)('SELECT id FROM billing_refunds WHERE public_id = ? AND user_id = ? LIMIT 1', [publicId, req.user.id]);
        const id = Number(rows?.[0]?.id || 0);
        if (!id)
            return res.status(404).json({ error: '退款记录不存在' });
        const processed = await processRefundById(id);
        const wallet = await getWalletSummary(req.user.id);
        return res.json({ refund: processed ? toPublicRefund(processed) : null, wallet });
    }
    catch (error) {
        console.error('Refund status error:', error);
        return res.status(500).json({ error: '退款状态查询失败，请稍后重试' });
    }
});
exports.default = router;
