import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { query } from '../db';
import { computeTopUpPrice, parseTopUpHours } from '../services/paypal';
import {
  createManualTopUpOrder,
  manualTopUpErrorStatus,
  reportManualTopUpPaid,
} from '../services/manualTopUp';

const router = Router();

const normalizeClientReference = (value: unknown) => {
  const reference = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{8,80}$/.test(reference) ? reference : null;
};

router.post('/transfers/create', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const order = await createManualTopUpOrder(req.user.id, 'alipay', (req.body as any)?.hours);
    return res.status(201).json({ order });
  } catch (error: any) {
    console.error('Alipay order creation error:', error);
    return res.status(manualTopUpErrorStatus(error)).json({
      error: error?.message || '充值订单创建失败，请稍后重试',
    });
  }
});

router.post('/transfers/report', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  if ((req.body as any)?.orderId !== undefined) {
    try {
      const order = await reportManualTopUpPaid(req.user.id, 'alipay', (req.body as any).orderId);
      return res.status(200).json({ order });
    } catch (error: any) {
      console.error('Alipay payment report error:', error);
      return res.status(manualTopUpErrorStatus(error)).json({
        error: error?.message || '付款申报保存失败，请稍后重试',
      });
    }
  }

  // Compatibility for clients deployed before orders were created on opening the payment dialog.
  const hours = parseTopUpHours((req.body as any)?.hours);
  const clientReference = normalizeClientReference((req.body as any)?.clientReference);
  if (!hours) return res.status(400).json({ error: '请输入正确的充值课时' });
  if (!clientReference) return res.status(400).json({ error: '无效的付款申报编号，请重新打开付款窗口' });

  const pricing = computeTopUpPrice(hours);
  const providerOrderId = `ALI-${clientReference}`;

  try {
    await query(
      `INSERT INTO billing_orders (
         user_id, provider, provider_order_id, status,
         topup_hours, unit_price_cny, amount_cny,
         pricing_version, standard_unit_price_cny,
         discount_threshold_hours, discount_unit_price_cny,
         currency_code, amount_usd, provider_create_json
       ) VALUES (?, 'alipay', ?, 'PENDING_RECEIPT', ?, ?, ?,
         'tier-v2', 799.00, 10.00, 699.00, 'CNY', 0.00, ?)
       ON DUPLICATE KEY UPDATE provider_order_id = provider_order_id`,
      [
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
      ]
    );

    const rows = await query<any[]>(
      `SELECT id, provider, provider_order_id, status, topup_hours, amount_cny, created_at
       FROM billing_orders
       WHERE provider = 'alipay' AND provider_order_id = ? AND user_id = ?
       LIMIT 1`,
      [providerOrderId, req.user.id]
    );
    const order = rows?.[0];
    if (!order) return res.status(500).json({ error: '付款申报保存失败，请稍后重试' });

    return res.status(201).json({ order });
  } catch (error) {
    console.error('Alipay payment report error:', error);
    return res.status(500).json({ error: '付款申报保存失败，请稍后重试' });
  }
});

export default router;
