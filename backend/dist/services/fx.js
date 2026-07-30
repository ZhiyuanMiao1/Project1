"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isFxQuoteExpired = exports.toPublicFxQuote = void 0;
exports.quoteCnyToUsd = quoteCnyToUsd;
const crypto_1 = require("crypto");
const DEFAULT_API_BASE = 'https://api.frankfurter.dev';
const DEFAULT_CACHE_MINUTES = 60;
const DEFAULT_MAX_STALE_HOURS = 48;
const DEFAULT_QUOTE_MINUTES = 30;
const DEFAULT_TIMEOUT_MS = 5000;
let cachedCnyToUsdRate = null;
let rateRefreshPromise = null;
const parseBoundedNumber = (raw, fallback, min, max) => {
    const parsed = Number.parseFloat(String(raw ?? '').trim());
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, parsed));
};
const getFrankfurterApiBase = () => {
    const configured = String(process.env.FRANKFURTER_API_BASE || '').trim();
    return (configured || DEFAULT_API_BASE).replace(/\/+$/, '');
};
const getCacheDurationMs = () => parseBoundedNumber(process.env.FX_CACHE_MINUTES, DEFAULT_CACHE_MINUTES, 1, 24 * 60) * 60 * 1000;
const getMaxStaleMs = () => parseBoundedNumber(process.env.FX_MAX_STALE_HOURS, DEFAULT_MAX_STALE_HOURS, 1, 7 * 24) * 60 * 60 * 1000;
const getQuoteDurationMs = () => parseBoundedNumber(process.env.FX_QUOTE_MINUTES, DEFAULT_QUOTE_MINUTES, 2, 24 * 60) * 60 * 1000;
const getMarkupBps = () => parseBoundedNumber(process.env.FX_MARKUP_BPS, 0, 0, 5000);
const getRequestTimeoutMs = () => parseBoundedNumber(process.env.FX_REQUEST_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1000, 30000);
const fetchLatestCnyToUsdRate = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), getRequestTimeoutMs());
    try {
        const response = await fetch(`${getFrankfurterApiBase()}/v2/rate/CNY/USD`, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'User-Agent': 'Mentory/1.0',
            },
            signal: controller.signal,
        });
        const data = await response.json().catch(() => null);
        if (!response.ok) {
            throw new Error(`Frankfurter rate request failed (${response.status}): ${String(data?.message || response.statusText)}`);
        }
        const base = String(data?.base || '').trim().toUpperCase();
        const quote = String(data?.quote || '').trim().toUpperCase();
        const rate = Number(data?.rate);
        const rateDate = String(data?.date || '').trim();
        if (base !== 'CNY' || quote !== 'USD' || !Number.isFinite(rate) || rate <= 0 || !rateDate) {
            throw new Error('Frankfurter returned invalid CNY/USD rate data');
        }
        return {
            rate,
            rateDate,
            fetchedAtMs: Date.now(),
            raw: data,
        };
    }
    finally {
        clearTimeout(timeoutId);
    }
};
const getCnyToUsdRate = async () => {
    const now = Date.now();
    if (cachedCnyToUsdRate && now - cachedCnyToUsdRate.fetchedAtMs < getCacheDurationMs()) {
        return { ...cachedCnyToUsdRate, stale: false };
    }
    if (!rateRefreshPromise) {
        rateRefreshPromise = fetchLatestCnyToUsdRate()
            .then((rate) => {
            cachedCnyToUsdRate = rate;
            return rate;
        })
            .finally(() => {
            rateRefreshPromise = null;
        });
    }
    try {
        const refreshed = await rateRefreshPromise;
        return { ...refreshed, stale: false };
    }
    catch (error) {
        if (cachedCnyToUsdRate && now - cachedCnyToUsdRate.fetchedAtMs <= getMaxStaleMs()) {
            console.warn('Frankfurter refresh failed; using last successful FX rate:', error);
            return { ...cachedCnyToUsdRate, stale: true };
        }
        throw error;
    }
};
const roundUpUsdCents = (value) => Number((Math.ceil(value * 100 - 1e-9) / 100).toFixed(2));
async function quoteCnyToUsd(amountCny) {
    if (!Number.isFinite(amountCny) || amountCny <= 0) {
        throw new Error('Invalid CNY amount for FX quote');
    }
    const rateSnapshot = await getCnyToUsdRate();
    const markupBps = getMarkupBps();
    const markupMultiplier = 1 + markupBps / 10000;
    const usdAmountNumber = roundUpUsdCents(amountCny * rateSnapshot.rate * markupMultiplier);
    const now = Date.now();
    return {
        quoteId: `frankfurter:${rateSnapshot.rateDate}:${(0, crypto_1.randomUUID)()}`,
        rate: rateSnapshot.rate.toString(),
        expiresAt: new Date(now + getQuoteDurationMs()).toISOString(),
        usdAmount: usdAmountNumber.toFixed(2),
        usdAmountNumber,
        provider: 'frankfurter',
        rateDate: rateSnapshot.rateDate,
        markupBps,
        stale: rateSnapshot.stale,
        raw: rateSnapshot.raw,
    };
}
const toPublicFxQuote = (quote) => ({
    quote_id: quote.quoteId,
    rate: quote.rate,
    expires_at: quote.expiresAt,
    usd_amount: quote.usdAmount,
    provider: quote.provider,
    rate_date: quote.rateDate,
    markup_bps: quote.markupBps,
    stale: quote.stale,
});
exports.toPublicFxQuote = toPublicFxQuote;
const isFxQuoteExpired = (expiresAt, nowMs = Date.now()) => {
    const expiresAtMs = Date.parse(expiresAt);
    if (!Number.isFinite(expiresAtMs))
        return true;
    return expiresAtMs <= nowMs;
};
exports.isFxQuoteExpired = isFxQuoteExpired;
