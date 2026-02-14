"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const db_1 = require("../db");
const paypal_1 = require("../services/paypal");
const router = (0, express_1.Router)();
const cachedBrowserSafeTokens = new Map();
function normalizeClientTokenDomain(raw) {
    const value = String(raw || '').trim();
    if (!value)
        return null;
    let host = value;
    try {
        if (/^https?:\/\//i.test(host)) {
            host = new URL(host).host;
        }
        else {
            host = host.split('/')[0].split('?')[0].split('#')[0];
        }
    }
    catch {
        host = value.split('/')[0].split('?')[0].split('#')[0];
    }
    host = host.trim();
    if (!host)
        return null;
    if (host.includes('://') || host.includes('/'))
        return null;
    return host;
}
async function getBrowserSafeClientToken(runtime, domains) {
    const domainsKey = domains.join(',');
    const cacheKey = `${runtime.env}:${runtime.clientId}:${domainsKey}`;
    const now = Date.now();
    const cached = cachedBrowserSafeTokens.get(cacheKey);
    if (cached && cached.expiresAtMs > now)
        return cached;
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('response_type', 'client_token');
    for (const domain of domains)
        params.append('domains[]', domain);
    const token = await (0, paypal_1.requestOAuthAccessToken)(runtime, params);
    cachedBrowserSafeTokens.set(cacheKey, token);
    return token;
}
const pickFirstCapture = (paypal) => {
    try {
        const unit = Array.isArray(paypal?.purchase_units) ? paypal.purchase_units[0] : null;
        const captures = unit?.payments?.captures;
        const first = Array.isArray(captures) ? captures[0] : null;
        const captureId = typeof first?.id === 'string' ? first.id : null;
        const currency = typeof first?.amount?.currency_code === 'string' ? first.amount.currency_code : null;
        const raw = first?.amount?.value;
        const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
        return { captureId, currency, value: Number.isFinite(value) ? value : null };
    }
    catch {
        return { captureId: null, currency: null, value: null };
    }
};
const toNumber = (value, fallback = 0) => {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(n) ? n : fallback;
};
const fetchWalletSummary = async (userId) => {
    const balanceRows = await (0, db_1.query)('SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1', [userId]);
    const remainingHours = toNumber(balanceRows?.[0]?.lesson_balance_hours, 0);
    const sumRows = await (0, db_1.query)(`SELECT
       COALESCE(SUM(amount_cny), 0) AS totalTopUpCny,
       COALESCE(SUM(CASE WHEN credited_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') THEN amount_cny ELSE 0 END), 0) AS monthTopUpCny
     FROM billing_orders
     WHERE user_id = ?
       AND credited_at IS NOT NULL`, [userId]);
    const totalTopUpCny = toNumber(sumRows?.[0]?.totalTopUpCny, 0);
    const monthTopUpCny = toNumber(sumRows?.[0]?.monthTopUpCny, 0);
    return { remainingHours, totalTopUpCny, monthTopUpCny };
};
const getPayPalIssueCodes = (paypalData) => {
    const details = Array.isArray(paypalData?.details) ? paypalData.details : [];
    const issues = [];
    for (const item of details) {
        const issue = String(item?.issue || '').trim().toUpperCase();
        if (issue)
            issues.push(issue);
    }
    return issues;
};
const mapFxIssue = (issues) => {
    if (issues.includes('PAYEE_FX_RATE_ID_EXPIRED')) {
        return { code: 'FX_QUOTE_EXPIRED', message: 'FX quote expired. Please refresh the quote.' };
    }
    const changedIssues = new Set([
        'PAYEE_FX_RATE_ID_CURRENCY_MISMATCH',
        'INVALID_FX_RATE_ID',
        'FX_RATE_CHANGE_DUE_TO_MARKET_EVENT',
    ]);
    if (issues.some((issue) => changedIssues.has(issue))) {
        return { code: 'FX_QUOTE_CHANGED', message: 'FX quote changed. Please refresh the quote.' };
    }
    return null;
};
router.get('/auth/browser-safe-client-token', async (req, res) => {
    const runtime = (0, paypal_1.requirePayPalRuntime)(res);
    if (!runtime)
        return;
    try {
        const origin = String(req.get('origin') || '').trim();
        const referer = String(req.get('referer') || '').trim();
        const rawDomains = typeof req.query?.domains === 'string' ? String(req.query.domains).trim() : '';
        const domainFromQuery = typeof req.query?.domain === 'string' ? String(req.query.domain).trim() : '';
        const seed = rawDomains || domainFromQuery || origin || referer || '127.0.0.1:3000';
        const domains = Array.from(new Set(seed
            .split(',')
            .map((item) => normalizeClientTokenDomain(item))
            .filter((item) => Boolean(item))));
        if (!domains.length) {
            return res.status(400).json({
                error: 'Invalid PayPal client token domains[]',
                hint: 'domains[] should look like 127.0.0.1:3000 or example.com',
            });
        }
        if (domains.some((domain) => /^localhost(?::\d+)?$/i.test(domain))) {
            return res.status(400).json({
                error: 'PayPal sandbox client token does not support localhost in domains[]',
                hint: 'Use http://127.0.0.1:3000 or a mapped domain.',
                domains,
            });
        }
        const token = await getBrowserSafeClientToken(runtime, domains);
        return res.json({ accessToken: token.accessToken });
    }
    catch (err) {
        console.error('PayPal browser-safe token error:', err);
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to fetch PayPal browser-safe token', paypal });
    }
});
router.post('/checkout/orders/create', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    const runtime = (0, paypal_1.requirePayPalRuntime)(res);
    if (!runtime)
        return;
    try {
        const hours = (0, paypal_1.parseTopUpHours)(req.body?.hours);
        const quoteId = String(req.body?.quote_id || '').trim();
        const requestedUsdAmount = (0, paypal_1.parseUsdAmount)(req.body?.usd_amount);
        if (!hours) {
            return res.status(400).json({ error: 'Invalid top-up hours' });
        }
        if (!quoteId || !requestedUsdAmount) {
            return res.status(400).json({ error: 'Missing FX quote data. Please refresh quote.' });
        }
        const pricing = (0, paypal_1.computeTopUpPrice)(hours);
        if (!Number.isFinite(pricing.amountCny) || pricing.amountCny <= 0) {
            return res.status(400).json({ error: 'Invalid top-up amount' });
        }
        const token = await (0, paypal_1.getServerAccessToken)(runtime);
        let latestQuote;
        try {
            latestQuote = await (0, paypal_1.quoteCnyToUsd)(runtime, token.accessToken, pricing.amountCny, quoteId);
        }
        catch (err) {
            const paypal = err?.paypal;
            const status = Number(paypal?.status || 0);
            if (quoteId && status >= 400 && status < 500) {
                return res.status(409).json({
                    code: 'FX_QUOTE_CHANGED',
                    error: 'FX quote changed. Please refresh the quote.',
                });
            }
            throw err;
        }
        if (latestQuote.quoteId !== quoteId) {
            return res.status(409).json({
                code: 'FX_QUOTE_CHANGED',
                error: 'FX quote changed. Please refresh the quote.',
                pricing: (0, paypal_1.toPublicFxQuote)(latestQuote),
            });
        }
        if (Math.abs(latestQuote.usdAmountNumber - requestedUsdAmount) >= 0.01) {
            return res.status(409).json({
                code: 'FX_QUOTE_CHANGED',
                error: 'FX quote changed. Please refresh the quote.',
                pricing: (0, paypal_1.toPublicFxQuote)(latestQuote),
            });
        }
        if ((0, paypal_1.isFxQuoteExpired)(latestQuote.expiresAt)) {
            return res.status(409).json({
                code: 'FX_QUOTE_EXPIRED',
                error: 'FX quote expired. Please refresh the quote.',
                pricing: (0, paypal_1.toPublicFxQuote)(latestQuote),
            });
        }
        const payload = {
            intent: 'CAPTURE',
            purchase_units: [
                {
                    amount: { currency_code: 'USD', value: latestQuote.usdAmount },
                    payment_instruction: {
                        payee_receivable_fx_rate_id: latestQuote.quoteId,
                    },
                    custom_id: `u${req.user.id}`,
                    description: `Mentory top-up ${hours} hours`,
                },
            ],
        };
        const { ok, status, data } = await (0, paypal_1.fetchJson)(`${runtime.apiBase}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!ok) {
            const fxIssue = mapFxIssue(getPayPalIssueCodes(data));
            if (status === 422 && fxIssue) {
                return res.status(409).json({
                    code: fxIssue.code,
                    error: fxIssue.message,
                    pricing: (0, paypal_1.toPublicFxQuote)(latestQuote),
                    paypal: { status, data },
                });
            }
            return res.status(502).json({ error: 'PayPal create order failed', paypal: { status, data } });
        }
        try {
            const orderId = String(data?.id || '').trim();
            if (orderId) {
                await (0, db_1.query)(`INSERT INTO billing_orders (
             user_id, provider, provider_order_id, status,
             topup_hours, unit_price_cny, amount_cny,
             currency_code, amount_usd,
             paypal_fx_quote_id, paypal_fx_rate, paypal_fx_expires_at,
             provider_create_json
           ) VALUES (?, 'paypal', ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             topup_hours = VALUES(topup_hours),
             unit_price_cny = VALUES(unit_price_cny),
             amount_cny = VALUES(amount_cny),
             currency_code = VALUES(currency_code),
             amount_usd = VALUES(amount_usd),
             paypal_fx_quote_id = VALUES(paypal_fx_quote_id),
             paypal_fx_rate = VALUES(paypal_fx_rate),
             paypal_fx_expires_at = VALUES(paypal_fx_expires_at),
             provider_create_json = VALUES(provider_create_json),
             updated_at = CURRENT_TIMESTAMP`, [
                    req.user.id,
                    orderId,
                    String(data?.status || 'CREATED'),
                    hours,
                    pricing.unitPriceCny,
                    pricing.amountCny,
                    latestQuote.usdAmountNumber,
                    latestQuote.quoteId,
                    Number.parseFloat(latestQuote.rate),
                    new Date(latestQuote.expiresAt),
                    JSON.stringify({ ...(data || {}), pricing: (0, paypal_1.toPublicFxQuote)(latestQuote) }),
                ]);
            }
        }
        catch (err) {
            console.error('PayPal create order DB write error:', err);
            // Do not block checkout: capture flow will re-check and persist.
        }
        return res.json({ ...(data || {}), pricing: (0, paypal_1.toPublicFxQuote)(latestQuote) });
    }
    catch (err) {
        console.error('PayPal create order error:', err);
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to create PayPal order', paypal });
    }
});
router.post('/checkout/orders/:orderId/capture', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    const runtime = (0, paypal_1.requirePayPalRuntime)(res);
    if (!runtime)
        return;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId)
        return res.status(400).json({ error: 'Missing orderId' });
    try {
        const token = await (0, paypal_1.getServerAccessToken)(runtime);
        const { ok, status, data } = await (0, paypal_1.fetchJson)(`${runtime.apiBase}/v2/checkout/orders/${orderId}/capture`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });
        console.log('PayPal capture:', { orderId, status: data?.status || data?.id || null });
        if (!ok) {
            return res.status(502).json({ error: 'PayPal capture failed', paypal: { status, data } });
        }
        const paypalStatus = String(data?.status || '').toUpperCase();
        const captureMeta = pickFirstCapture(data);
        try {
            const conn = await db_1.pool.getConnection();
            try {
                await conn.beginTransaction();
                const [orderRows] = await conn.query(`SELECT id, topup_hours, amount_usd, currency_code, credited_at
           FROM billing_orders
           WHERE provider = 'paypal'
             AND provider_order_id = ?
             AND user_id = ?
           LIMIT 1
           FOR UPDATE`, [orderId, req.user.id]);
                const order = orderRows?.[0];
                if (!order) {
                    await conn.rollback();
                    return res.status(404).json({ error: 'Order not found. Please create order first.' });
                }
                const expectedAmountUsd = toNumber(order?.amount_usd, 0);
                const paidAmountUsd = captureMeta.value ?? null;
                const paidCurrency = captureMeta.currency ? String(captureMeta.currency).toUpperCase() : null;
                const expectedCurrency = String(order?.currency_code || 'USD').toUpperCase();
                const amountMatches = paidAmountUsd !== null &&
                    paidCurrency !== null &&
                    paidCurrency === expectedCurrency &&
                    Math.abs(paidAmountUsd - expectedAmountUsd) < 0.01;
                await conn.query(`UPDATE billing_orders
           SET status = ?,
               paypal_capture_id = ?,
               paypal_payer_id = ?,
               captured_at = IFNULL(captured_at, CURRENT_TIMESTAMP),
               provider_capture_json = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`, [
                    paypalStatus || String(data?.status || 'UNKNOWN'),
                    captureMeta.captureId,
                    typeof data?.payer?.payer_id === 'string' ? data.payer.payer_id : null,
                    JSON.stringify(data),
                    order.id,
                ]);
                const alreadyCredited = Boolean(order?.credited_at);
                const shouldCredit = paypalStatus === 'COMPLETED' && !alreadyCredited && amountMatches;
                if (shouldCredit) {
                    await conn.query('UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?', [toNumber(order?.topup_hours, 0), req.user.id]);
                    await conn.query('UPDATE billing_orders SET credited_at = CURRENT_TIMESTAMP WHERE id = ?', [order.id]);
                }
                await conn.commit();
            }
            catch (e) {
                try {
                    await conn.rollback();
                }
                catch { }
                throw e;
            }
            finally {
                conn.release();
            }
        }
        catch (err) {
            console.error('PayPal capture DB update error:', err);
            return res.status(500).json({ error: 'Order persistence failed. Please upgrade schema.sql and retry.' });
        }
        const wallet = await fetchWalletSummary(req.user.id).catch(() => null);
        return res.json({ ...(data || {}), wallet });
    }
    catch (err) {
        console.error('PayPal capture error:', { orderId, err });
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to capture PayPal order', paypal, orderId });
    }
});
exports.default = router;
