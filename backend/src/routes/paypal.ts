import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  computeTopUpPrice,
  getServerAccessToken,
  parseTopUpHours,
  quoteCnyToUsd,
  requirePayPalRuntime,
  toPublicFxQuote,
} from '../services/paypal';

const router = Router();

router.post('/fx-quote', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const runtime = requirePayPalRuntime(res);
  if (!runtime) return;

  const hours = parseTopUpHours((req.body as any)?.hours);
  if (!hours) {
    return res.status(400).json({ error: 'Invalid top-up hours' });
  }

  const pricing = computeTopUpPrice(hours);
  if (!Number.isFinite(pricing.amountCny) || pricing.amountCny <= 0) {
    return res.status(400).json({ error: 'Invalid top-up amount' });
  }

  try {
    const token = await getServerAccessToken(runtime);
    const quote = await quoteCnyToUsd(runtime, token.accessToken, pricing.amountCny);
    return res.json(toPublicFxQuote(quote));
  } catch (err) {
    console.error('PayPal FX quote error:', err);
    const paypal = (err as any)?.paypal;
    return res.status(502).json({ error: 'Failed to fetch PayPal FX quote', paypal });
  }
});

export default router;

