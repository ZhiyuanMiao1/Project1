import { Router, Request, Response } from 'express';

const router = Router();

const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_SANDBOX_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedBrowserSafeToken: CachedToken | null = null;
let cachedServerAccessToken: CachedToken | null = null;

function requirePayPalEnv(res: Response): { clientId: string; clientSecret: string } | null {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    res.status(500).json({ error: 'Missing PayPal sandbox credentials in environment.' });
    return null;
  }
  return { clientId: PAYPAL_CLIENT_ID, clientSecret: PAYPAL_CLIENT_SECRET };
}

function getBasicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function fetchJson(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; data: any }> {
  const response = await fetch(url, init);
  const data = await response
    .json()
    .catch(() => ({ error: 'Non-JSON response from PayPal', status: response.status }));
  return { ok: response.ok, status: response.status, data };
}

async function getOAuthAccessToken(params: URLSearchParams, cacheKey: 'browser' | 'server'): Promise<CachedToken> {
  const cache = cacheKey === 'browser' ? cachedBrowserSafeToken : cachedServerAccessToken;
  const now = Date.now();
  if (cache && cache.expiresAtMs > now) return cache;

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
    (error as any).paypal = { status, data };
    throw error;
  }

  const accessToken = String(data?.access_token || '');
  const expiresIn = Number(data?.expires_in || 0);
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new Error('PayPal OAuth returned invalid token response');
  }

  const token: CachedToken = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(0, expiresIn - 60) * 1000,
  };

  if (cacheKey === 'browser') cachedBrowserSafeToken = token;
  else cachedServerAccessToken = token;

  return token;
}

async function getBrowserSafeClientToken(domains: string[]): Promise<CachedToken> {
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('response_type', 'client_token');
  domains.forEach((domain) => params.append('domains[]', domain));
  return getOAuthAccessToken(params, 'browser');
}

async function getServerAccessToken(): Promise<CachedToken> {
  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  return getOAuthAccessToken(params, 'server');
}

router.get('/auth/browser-safe-client-token', async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;

  try {
    const origin = String(req.get('origin') || '').trim();
    const domainFromQuery = typeof req.query?.domain === 'string' ? String(req.query.domain).trim() : '';
    const domains = [domainFromQuery || origin || 'http://localhost:3000'].filter(Boolean);

    const token = await getBrowserSafeClientToken(domains);
    return res.json({ accessToken: token.accessToken });
  } catch (err) {
    console.error('PayPal browser-safe token error:', err);
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to fetch PayPal browser-safe token', paypal });
  }
});

router.post('/checkout/orders/create', async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;

  try {
    const token = await getServerAccessToken();

    const payload =
      req.body && typeof req.body === 'object' && Object.keys(req.body as Record<string, unknown>).length > 0
        ? req.body
        : {
            intent: 'CAPTURE',
            purchase_units: [{ amount: { currency_code: 'USD', value: '10.00' } }],
          };

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
  } catch (err) {
    console.error('PayPal create order error:', err);
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to create PayPal order', paypal });
  }
});

router.post('/checkout/orders/:orderId/capture', async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;

  const orderId = String(req.params.orderId || '').trim();
  if (!orderId) return res.status(400).json({ error: 'Missing orderId' });

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
  } catch (err) {
    console.error('PayPal capture error:', { orderId, err });
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to capture PayPal order', paypal, orderId });
  }
});

export default router;
