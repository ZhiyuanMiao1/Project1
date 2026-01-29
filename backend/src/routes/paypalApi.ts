import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { pool, query as dbQuery } from '../db';

const router = Router();

const PAYPAL_API_BASE = 'https://api-m.sandbox.paypal.com';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_SANDBOX_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_SANDBOX_CLIENT_SECRET;

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedServerAccessToken: CachedToken | null = null;
const cachedBrowserSafeTokens = new Map<string, CachedToken>();

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

async function requestOAuthAccessToken(params: URLSearchParams): Promise<CachedToken> {
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

  return token;
}

async function getBrowserSafeClientToken(domains: string[]): Promise<CachedToken> {
  const domainsKey = domains.join(',');
  const cached = cachedBrowserSafeTokens.get(domainsKey);
  const now = Date.now();
  if (cached && cached.expiresAtMs > now) return cached;

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');
  params.set('response_type', 'client_token');
  params.append('domains[]', domainsKey);

  const token = await requestOAuthAccessToken(params);
  cachedBrowserSafeTokens.set(domainsKey, token);
  return token;
}

async function getServerAccessToken(): Promise<CachedToken> {
  const now = Date.now();
  if (cachedServerAccessToken && cachedServerAccessToken.expiresAtMs > now) return cachedServerAccessToken;

  const params = new URLSearchParams();
  params.set('grant_type', 'client_credentials');

  const token = await requestOAuthAccessToken(params);
  cachedServerAccessToken = token;
  return token;
}

function normalizeClientTokenDomain(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;

  let host = value;
  try {
    if (/^https?:\/\//i.test(host)) {
      host = new URL(host).host;
    } else {
      host = host.split('/')[0].split('?')[0].split('#')[0];
    }
  } catch {
    host = value.split('/')[0].split('?')[0].split('#')[0];
  }

  host = host.trim();
  if (!host) return null;
  if (host.includes('://') || host.includes('/')) return null;

  return host;
}

const FX_CNY_PER_USD = 7;

const parseTopUpHours = (value: any): number | null => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 200) return null;
  return Number(n.toFixed(2));
};

const computeTopUpPrice = (hours: number) => {
  const unitPriceCny = hours >= 10 ? 500 : 600;
  const amountCny = Number((hours * unitPriceCny).toFixed(2));
  const amountUsd = Number((amountCny / FX_CNY_PER_USD).toFixed(2));
  return { unitPriceCny, amountCny, amountUsd };
};

const pickFirstCapture = (paypal: any): { captureId: string | null; currency: string | null; value: number | null } => {
  try {
    const unit = Array.isArray(paypal?.purchase_units) ? paypal.purchase_units[0] : null;
    const captures = unit?.payments?.captures;
    const first = Array.isArray(captures) ? captures[0] : null;
    const captureId = typeof first?.id === 'string' ? first.id : null;
    const currency = typeof first?.amount?.currency_code === 'string' ? first.amount.currency_code : null;
    const raw = first?.amount?.value;
    const value = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? ''));
    return { captureId, currency, value: Number.isFinite(value) ? value : null };
  } catch {
    return { captureId: null, currency: null, value: null };
  }
};

const toNumber = (value: any, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : fallback;
};

const fetchWalletSummary = async (userId: number) => {
  const balanceRows = await dbQuery<any[]>(
    'SELECT lesson_balance_hours FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const remainingHours = toNumber(balanceRows?.[0]?.lesson_balance_hours, 0);

  const sumRows = await dbQuery<any[]>(
    `SELECT
       COALESCE(SUM(amount_cny), 0) AS totalTopUpCny,
       COALESCE(SUM(CASE WHEN credited_at >= DATE_FORMAT(CURRENT_DATE, '%Y-%m-01') THEN amount_cny ELSE 0 END), 0) AS monthTopUpCny
     FROM billing_orders
     WHERE user_id = ?
       AND credited_at IS NOT NULL`,
    [userId]
  );

  const totalTopUpCny = toNumber(sumRows?.[0]?.totalTopUpCny, 0);
  const monthTopUpCny = toNumber(sumRows?.[0]?.monthTopUpCny, 0);

  return { remainingHours, totalTopUpCny, monthTopUpCny };
};

router.get('/auth/browser-safe-client-token', async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;

  try {
    const origin = String(req.get('origin') || '').trim();
    const referer = String(req.get('referer') || '').trim();
    const rawDomains = typeof req.query?.domains === 'string' ? String(req.query.domains).trim() : '';
    const domainFromQuery = typeof req.query?.domain === 'string' ? String(req.query.domain).trim() : '';
    const seed = rawDomains || domainFromQuery || origin || referer || '127.0.0.1:3000';
    const domains = Array.from(
      new Set(
        seed
          .split(',')
          .map((item) => normalizeClientTokenDomain(item))
          .filter((item): item is string => Boolean(item))
      )
    );

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
  } catch (err) {
    console.error('PayPal browser-safe token error:', err);
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to fetch PayPal browser-safe token', paypal });
  }
});

router.post('/checkout/orders/create', requireAuth, async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;
  if (!req.user) return res.status(401).json({ error: '未授权' });

  try {
    const token = await getServerAccessToken();

    const hours = parseTopUpHours((req.body as any)?.hours);
    if (!hours) {
      return res.status(400).json({ error: '充值小时数无效' });
    }

    const pricing = computeTopUpPrice(hours);
    if (!Number.isFinite(pricing.amountUsd) || pricing.amountUsd <= 0) {
      return res.status(400).json({ error: '充值金额无效' });
    }

    const payload = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: pricing.amountUsd.toFixed(2) },
          custom_id: `u${req.user.id}`,
          description: `Mentory top-up ${hours} hours`,
        },
      ],
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

    try {
      const orderId = String(data?.id || '').trim();
      if (orderId) {
        await dbQuery(
          `INSERT INTO billing_orders (
             user_id, provider, provider_order_id, status,
             topup_hours, unit_price_cny, amount_cny,
             currency_code, amount_usd, provider_create_json
           ) VALUES (?, 'paypal', ?, ?, ?, ?, ?, 'USD', ?, ?)
           ON DUPLICATE KEY UPDATE
             status = VALUES(status),
             topup_hours = VALUES(topup_hours),
             unit_price_cny = VALUES(unit_price_cny),
             amount_cny = VALUES(amount_cny),
             currency_code = VALUES(currency_code),
             amount_usd = VALUES(amount_usd),
             provider_create_json = VALUES(provider_create_json),
             updated_at = CURRENT_TIMESTAMP`,
          [
            req.user.id,
            orderId,
            String(data?.status || 'CREATED'),
            hours,
            pricing.unitPriceCny,
            pricing.amountCny,
            pricing.amountUsd,
            JSON.stringify(data),
          ]
        );
      }
    } catch (err) {
      console.error('PayPal create order DB write error:', err);
      // Don't block the client order flow; capture step will re-attempt DB updates.
    }

    return res.json(data);
  } catch (err) {
    console.error('PayPal create order error:', err);
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to create PayPal order', paypal });
  }
});

router.post('/checkout/orders/:orderId/capture', requireAuth, async (req: Request, res: Response) => {
  if (!requirePayPalEnv(res)) return;
  if (!req.user) return res.status(401).json({ error: '未授权' });

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
    const paypalStatus = String(data?.status || '').toUpperCase();
    const captureMeta = pickFirstCapture(data);

    try {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [orderRows] = await conn.query<any[]>(
          `SELECT id, topup_hours, amount_usd, currency_code, credited_at
           FROM billing_orders
           WHERE provider = 'paypal'
             AND provider_order_id = ?
             AND user_id = ?
           LIMIT 1
           FOR UPDATE`,
          [orderId, req.user.id]
        );
        const order = orderRows?.[0];
        if (!order) {
          await conn.rollback();
          return res.status(404).json({ error: '订单不存在，请先创建订单' });
        }

        const expectedAmountUsd = toNumber(order?.amount_usd, 0);
        const paidAmountUsd = captureMeta.value ?? null;
        const paidCurrency = captureMeta.currency ? String(captureMeta.currency).toUpperCase() : null;
        const expectedCurrency = String(order?.currency_code || 'USD').toUpperCase();
        const amountMatches =
          paidAmountUsd !== null &&
          paidCurrency !== null &&
          paidCurrency === expectedCurrency &&
          Math.abs(paidAmountUsd - expectedAmountUsd) < 0.01;

        await conn.query(
          `UPDATE billing_orders
           SET status = ?,
               paypal_capture_id = ?,
               paypal_payer_id = ?,
               captured_at = IFNULL(captured_at, CURRENT_TIMESTAMP),
               provider_capture_json = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [
            paypalStatus || String(data?.status || 'UNKNOWN'),
            captureMeta.captureId,
            typeof data?.payer?.payer_id === 'string' ? data.payer.payer_id : null,
            JSON.stringify(data),
            order.id,
          ]
        );

        const alreadyCredited = Boolean(order?.credited_at);
        const shouldCredit = paypalStatus === 'COMPLETED' && !alreadyCredited && amountMatches;

        if (shouldCredit) {
          await conn.query(
            'UPDATE users SET lesson_balance_hours = lesson_balance_hours + ? WHERE id = ?',
            [toNumber(order?.topup_hours, 0), req.user.id]
          );
          await conn.query('UPDATE billing_orders SET credited_at = CURRENT_TIMESTAMP WHERE id = ?', [order.id]);
        }

        await conn.commit();
      } catch (e) {
        try {
          await conn.rollback();
        } catch {}
        throw e;
      } finally {
        conn.release();
      }
    } catch (err) {
      console.error('PayPal capture DB update error:', err);
      return res.status(500).json({ error: '订单入库失败，请先执行 schema.sql 升级数据库后重试' });
    }

    const wallet = await fetchWalletSummary(req.user.id).catch(() => null);
    return res.json({ ...(data || {}), wallet });
  } catch (err) {
    console.error('PayPal capture error:', { orderId, err });
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to capture PayPal order', paypal, orderId });
  }
});

export default router;
