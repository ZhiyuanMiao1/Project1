"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const router = (0, express_1.Router)();
const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com';
const PAYPAL_CLIENT_ID = process.env.PAYPAL_SANDBOX_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;
let cachedServerAccessToken = null;
const cachedBrowserSafeTokens = new Map();
function requirePayPalEnv(res) {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        res.status(500).json({ error: 'Missing PayPal sandbox credentials in environment.' });
        return null;
    }
    return { clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET };
}
function getBasicAuthHeader(clientId, clientSecret) {
    return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}
async function fetchJson(url, init) {
    const response = await fetch(url, init);
    const data = await response
        .json()
        .catch(() => ({ error: 'Non-JSON response from PayPal', status: response.status }));
    return { ok: response.ok, status: response.status, data };
}
async function requestOAuthAccessToken(params) {
    const creds = { clientId: PAYPAL_CLIENT_ID ?? '', clientSecret: PAYPAL_CLIENT_SECRET ?? '' };
    const authHeader = getBasicAuthHeader(creds.clientId, creds.clientSecret);
    const { ok, status, data } = await fetchJson(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params,
    });
    if (!ok) {
        const message = data?.error_description || data?.error || 'PayPal OAuth failed';
        const error = new Error(message);
        error.paypal = { status, data };
        throw error;
    }
    const accessToken = String(data?.access_token || '');
    const expiresIn = Number(data?.expires_in || 0);
    if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new Error('PayPal OAuth returned invalid token response');
    }
    const token = {
        accessToken,
        expiresAtMs: Date.now() + Math.max(0, expiresIn - 60) * 1000,
    };
    return token;
}
async function getBrowserSafeClientToken(domains) {
    const domainsKey = domains.join(',');
    const cached = cachedBrowserSafeTokens.get(domainsKey);
    const now = Date.now();
    if (cached && cached.expiresAtMs > now)
        return cached;
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    params.set('response_type', 'client_token');
    params.append('domains[]', domainsKey);
    const token = await requestOAuthAccessToken(params);
    cachedBrowserSafeTokens.set(domainsKey, token);
    return token;
}
async function getServerAccessToken() {
    const now = Date.now();
    if (cachedServerAccessToken && cachedServerAccessToken.expiresAtMs > now)
        return cachedServerAccessToken;
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    const token = await requestOAuthAccessToken(params);
    cachedServerAccessToken = token;
    return token;
}
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
router.get('/auth/browser-safe-client-token', async (req, res) => {
    if (!requirePayPalEnv(res))
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
                error: 'PayPal client token 的 domains[] 参数无效',
                hint: 'domains[] 需要域名格式（不带协议），例如：127.0.0.1:3000 或 example.com',
            });
        }
        if (domains.some((domain) => /^localhost(?::\d+)?$/i.test(domain))) {
            return res.status(400).json({
                error: 'PayPal sandbox client token 不支持 localhost 作为 domains[]',
                hint: '请用 http://127.0.0.1:3000 打开前端页面，或用 hosts/ngrok 绑定一个可用域名。',
                domains,
            });
        }
        const token = await getBrowserSafeClientToken(domains);
        return res.json({ accessToken: token.accessToken });
    }
    catch (err) {
        console.error('PayPal browser-safe token error:', err);
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to fetch PayPal browser-safe token', paypal });
    }
});
router.post('/checkout/orders/create', async (req, res) => {
    if (!requirePayPalEnv(res))
        return;
    try {
        const token = await getServerAccessToken();
        const payloadRaw = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0
            ? req.body
            : {
                intent: 'CAPTURE',
                purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }],
            };
        // PayPal Orders v2 (sandbox) may reject some currencies (e.g. CNY) depending on account capabilities.
        // Keep the frontend display unchanged for now, but force USD to avoid CURRENCY_NOT_SUPPORTED (422).
        const payload = (() => {
            try {
                const cloned = JSON.parse(JSON.stringify(payloadRaw));
                const purchaseUnits = cloned?.purchase_units;
                if (Array.isArray(purchaseUnits)) {
                    for (const unit of purchaseUnits) {
                        const code = unit?.amount?.currency_code;
                        if (typeof code === 'string' && code.toUpperCase() === 'CNY') {
                            unit.amount.currency_code = 'USD';
                        }
                    }
                }
                return cloned;
            }
            catch {
                return payloadRaw;
            }
        })();
        const { ok, status, data } = await fetchJson(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token.accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!ok) {
            return res.status(502).json({ error: 'PayPal create order failed', paypal: { status, data } });
        }
        return res.json(data);
    }
    catch (err) {
        console.error('PayPal create order error:', err);
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to create PayPal order', paypal });
    }
});
router.post('/checkout/orders/:orderId/capture', async (req, res) => {
    if (!requirePayPalEnv(res))
        return;
    const orderId = String(req.params.orderId || '').trim();
    if (!orderId)
        return res.status(400).json({ error: 'Missing orderId' });
    try {
        const token = await getServerAccessToken();
        const { ok, status, data } = await fetchJson(`${PAYPAL_API_BASE}/v2/checkout/orders/${orderId}/capture`, {
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
        // TODO: 落库逻辑预留（最小可跑通版先打印日志）
        console.log('PayPal capture response:', { orderId, capture: data });
        return res.json(data);
    }
    catch (err) {
        console.error('PayPal capture error:', { orderId, err });
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to capture PayPal order', paypal, orderId });
    }
});
exports.default = router;
