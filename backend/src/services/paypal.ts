import type { Response } from 'express';

type PayPalEnv = 'sandbox' | 'live';

export type PayPalRuntimeConfig = {
  env: PayPalEnv;
  apiBase: string;
  clientId: string;
  clientSecret: string;
};

export type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

export type FxQuote = {
  quoteId: string;
  rate: string;
  expiresAt: string;
  usdAmount: string;
  usdAmountNumber: number;
  raw: any;
};

const serverTokenCache = new Map<string, CachedToken>();

const parsePayPalEnv = (): PayPalEnv => {
  const env = String(process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
  return env === 'live' ? 'live' : 'sandbox';
};

const getPayPalApiBase = (env: PayPalEnv): string => {
  const custom = String(process.env.PAYPAL_API_BASE || '').trim();
  if (custom) return custom;
  return env === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
};

export function getPayPalRuntimeConfig(): PayPalRuntimeConfig | null {
  const env = parsePayPalEnv();
  const clientId =
    env === 'live'
      ? String(process.env.PAYPAL_LIVE_CLIENT_ID || '').trim()
      : String(process.env.PAYPAL_SANDBOX_CLIENT_ID || '').trim();
  const clientSecret =
    env === 'live'
      ? String(process.env.PAYPAL_LIVE_CLIENT_SECRET || '').trim()
      : String(process.env.PAYPAL_SANDBOX_CLIENT_SECRET || '').trim();

  if (!clientId || !clientSecret) return null;

  return {
    env,
    apiBase: getPayPalApiBase(env),
    clientId,
    clientSecret,
  };
}

export function requirePayPalRuntime(res: Response): PayPalRuntimeConfig | null {
  const runtime = getPayPalRuntimeConfig();
  if (!runtime) {
    res.status(500).json({ error: 'Missing PayPal credentials in environment.' });
    return null;
  }
  return runtime;
}

export function getBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export async function fetchJson(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(url, init);
  const data = await response
    .json()
    .catch(() => ({ error: 'Non-JSON response from PayPal', status: response.status }));
  return { ok: response.ok, status: response.status, data };
}

export async function requestOAuthAccessToken(
  runtime: PayPalRuntimeConfig,
  params: URLSearchParams
): Promise<CachedToken> {
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
    (error as any).paypal = { status, data };
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

export async function getServerAccessToken(runtime: PayPalRuntimeConfig): Promise<CachedToken> {
  const cacheKey = `${runtime.env}:${runtime.clientId}`;
  const now = Date.now();
  const cached = serverTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > now) return cached;

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');

  const token = await requestOAuthAccessToken(runtime, params);
  serverTokenCache.set(cacheKey, token);
  return token;
}

export const parseTopUpHours = (value: any): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 200) return null;
  return Number(n.toFixed(2));
};

export const parseUsdAmount = (value: any): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Number(n.toFixed(2));
};

export const computeTopUpPrice = (hours: number) => {
  const unitPriceCny = hours >= 10 ? 500 : 600;
  const amountCny = Number((hours * unitPriceCny).toFixed(2));
  return { unitPriceCny, amountCny };
};

const parseFxQuotePayload = (data: any): FxQuote | null => {
  const list =
    (Array.isArray(data?.exchange_rate_quotes) && data.exchange_rate_quotes) ||
    (Array.isArray(data?.quote_items) && data.quote_items) ||
    (Array.isArray(data?.quotes) && data.quotes) ||
    [];
  const first = list[0] || data?.exchange_rate_quote || data?.quote || null;
  if (!first) return null;

  const quoteId = String(first?.fx_id || first?.quote_id || first?.id || '').trim();
  const rawRate = first?.exchange_rate ?? first?.rate;
  const rate = String(rawRate ?? '').trim();
  const expiresAt = String(
    first?.expiry_time || first?.expires_at || first?.valid_until || data?.expiry_time || data?.valid_until || ''
  ).trim();
  const rawUsd =
    first?.quote_amount?.value ??
    first?.quote_amount?.amount ??
    first?.quote_amount ??
    first?.quote_amount_value ??
    first?.quote_value;
  const usdAmountNumber =
    typeof rawUsd === 'number' ? rawUsd : Number.parseFloat(String(rawUsd ?? '').trim());
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

export async function quoteCnyToUsd(
  runtime: PayPalRuntimeConfig,
  accessToken: string,
  amountCny: number,
  fxId?: string
): Promise<FxQuote> {
  const quoteItem: Record<string, any> = {
    base_currency: 'CNY',
    quote_currency: 'USD',
    base_amount: amountCny.toFixed(2),
  };
  if (fxId) quoteItem.fx_id = fxId;

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
    (error as any).paypal = { status, data };
    throw error;
  }

  const quote = parseFxQuotePayload(data);
  if (!quote) {
    const error = new Error('PayPal quote exchange rate returned invalid response');
    (error as any).paypal = { status, data };
    throw error;
  }

  return quote;
}

export const toPublicFxQuote = (quote: FxQuote) => ({
  quote_id: quote.quoteId,
  rate: quote.rate,
  expires_at: quote.expiresAt,
  usd_amount: quote.usdAmount,
});

export const isFxQuoteExpired = (expiresAt: string, nowMs = Date.now()): boolean => {
  const expiresAtMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresAtMs)) return true;
  return expiresAtMs <= nowMs;
};
