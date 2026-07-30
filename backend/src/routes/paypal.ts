import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  computeTopUpPrice,
  parseTopUpHours,
} from '../services/paypal';
import { quoteCnyToUsd, toPublicFxQuote } from '../services/fx';

const router = Router();

router.post('/fx-quote', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  const hours = parseTopUpHours((req.body as any)?.hours);
  if (!hours) {
    return res.status(400).json({ error: 'Invalid top-up hours' });
  }

  const pricing = computeTopUpPrice(hours);
  if (!Number.isFinite(pricing.amountCny) || pricing.amountCny <= 0) {
    return res.status(400).json({ error: 'Invalid top-up amount' });
  }

  try {
    // Legacy PayPal FX quote (kept in services/paypal.ts for a future rollback):
    // const token = await getServerAccessToken(runtime);
    // const quote = await quoteCnyToUsdWithPayPal(runtime, token.accessToken, pricing.amountCny);
    const quote = await quoteCnyToUsd(pricing.amountCny);
    return res.json(toPublicFxQuote(quote));
  } catch (err) {
    console.error('Frankfurter FX quote error:', err);
    return res.status(502).json({ error: 'Failed to fetch FX quote' });
  }
});

export default router;
