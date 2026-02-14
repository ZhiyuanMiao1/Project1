"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFxQuoteExpired = exports.toPublicFxQuote = exports.computeTopUpPrice = exports.parseUsdAmount = exports.parseTopUpHours = void 0;
exports.getPayPalRuntimeConfig = getPayPalRuntimeConfig;
exports.requirePayPalRuntime = requirePayPalRuntime;
exports.getBasicAuthHeader = getBasicAuthHeader;
exports.fetchJson = fetchJson;
exports.requestOAuthAccessToken = requestOAuthAccessToken;
exports.getServerAccessToken = getServerAccessToken;
exports.quoteCnyToUsd = quoteCnyToUsd;
const serverTokenCache = new Map();
const parsePayPalEnv = () => {
    const env = String(process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
    return env === 'live' ? 'live' : 'sandbox';
};
const getPayPalApiBase = (env) => {
    const custom = String(process.env.PAYPAL_API_BASE || '').trim();
    if (custom)
        return custom;
    return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
};
function getPayPalRuntimeConfig() {
    const env = parsePayPalEnv();
    const clientId = env === 'live'
        ? String(process.env.PAYPAL_LIVE_CLIENT_ID || '').trim()
        : String(process.env.PAYPAL_SANDBOX_CLIENT_ID || '').trim();
    const clientSecret = env === 'live'
        ? String(process.env.PAYPAL_LIVE_CLIENT_SECRET || '').trim()
        : String(process.env.PAYPAL_SANDBOX_CLIENT_SECRET || '').trim();
    if (!clientId || !clientSecret)
        return null;
    return {
        env,
        apiBase: getPayPalApiBase(env),
        clientId,
        clientSecret,
    };
}
function requirePayPalRuntime(res) {
    const runtime = getPayPalRuntimeConfig();
    if (!runtime) {
        res.status(500).json({ error: 'Missing PayPal credentials in environment.' });
        return null;
    }
    return runtime;
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
async function requestOAuthAccessToken(runtime, params) {
    const authHeader = getBasicAuthHeader(runtime.clientId, runtime.clientSecret);
    const { ok, status, data } = await fetchJson(`${runtime.apiBase}/v1/oauth2/token`, {
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
    return {
        accessToken,
        expiresAtMs: Date.now() + Math.max(0, expiresIn - 60) * 1000,
    };
}
async function getServerAccessToken(runtime) {
    const cacheKey = `${runtime.env}:${runtime.clientId}`;
    const now = Date.now();
    const cached = serverTokenCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now)
        return cached;
    const params = new URLSearchParams();
    params.set('grant_type', 'client_credentials');
    const token = await requestOAuthAccessToken(runtime, params);
    serverTokenCache.set(cacheKey, token);
    return token;
}
const parseTopUpHours = (value) => {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
    if (!Number.isFinite(n))
        return null;
    if (n <= 0)
        return null;
    if (n > 200)
        return null;
    return Number(n.toFixed(2));
};
exports.parseTopUpHours = parseTopUpHours;
const parseUsdAmount = (value) => {
    const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
    if (!Number.isFinite(n))
        return null;
    if (n <= 0)
        return null;
    return Number(n.toFixed(2));
};
exports.parseUsdAmount = parseUsdAmount;
const computeTopUpPrice = (hours) => {
    const unitPriceCny = hours >= 10 ? 500 : 600;
    const amountCny = Number((hours * unitPriceCny).toFixed(2));
    return { unitPriceCny, amountCny };
};
exports.computeTopUpPrice = computeTopUpPrice;
const parseFxQuotePayload = (data) => {
    const list = (Array.isArray(data?.exchange_rate_quotes) && data.exchange_rate_quotes) ||
        (Array.isArray(data?.quote_items) && data.quote_items) ||
        (Array.isArray(data?.quotes) && data.quotes) ||
        [];
    const first = list[0] || data?.exchange_rate_quote || data?.quote || null;
    if (!first)
        return null;
    const quoteId = String(first?.fx_id || first?.quote_id || first?.id || '').trim();
    const rawRate = first?.exchange_rate ?? first?.rate;
    const rate = String(rawRate ?? '').trim();
    const expiresAt = String(first?.expiry_time || first?.expires_at || first?.valid_until || data?.expiry_time || data?.valid_until || '').trim();
    const rawUsd = first?.quote_amount?.value ??
        first?.quote_amount?.amount ??
        first?.quote_amount ??
        first?.quote_amount_value ??
        first?.quote_value;
    const usdAmountNumber = typeof rawUsd === 'number' ? rawUsd : Number.parseFloat(String(rawUsd ?? '').trim());
    if (!quoteId || !rate || !expiresAt || !Number.isFinite(usdAmountNumber) || usdAmountNumber <= 0) {
        return null;
    }
    return {
        quoteId,
        rate,
        expiresAt,
        usdAmount: Number(usdAmountNumber).toFixed(2),
        usdAmountNumber: Number(Number(usdAmountNumber).toFixed(2)),
        raw: first,
    };
};
async function quoteCnyToUsd(runtime, accessToken, amountCny, fxId) {
    const quoteItem = {
        base_currency: 'CNY',
        quote_currency: 'USD',
        base_amount: amountCny.toFixed(2),
    };
    if (fxId)
        quoteItem.fx_id = fxId;
    const payload = {
        quote_items: [quoteItem],
    };
    const { ok, status, data } = await fetchJson(`${runtime.apiBase}/v2/pricing/quote-exchange-rates`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });
    if (!ok) {
        const message = data?.message || data?.name || 'PayPal quote exchange rate failed';
        const error = new Error(message);
        error.paypal = { status, data };
        throw error;
    }
    const quote = parseFxQuotePayload(data);
    if (!quote) {
        const error = new Error('PayPal quote exchange rate returned invalid response');
        error.paypal = { status, data };
        throw error;
    }
    return quote;
}
const toPublicFxQuote = (quote) => ({
    quote_id: quote.quoteId,
    rate: quote.rate,
    expires_at: quote.expiresAt,
    usd_amount: quote.usdAmount,
});
exports.toPublicFxQuote = toPublicFxQuote;
const isFxQuoteExpired = (expiresAt, nowMs = Date.now()) => {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs))
        return true;
    return expiresAtMs <= nowMs;
};
exports.isFxQuoteExpired = isFxQuoteExpired;
