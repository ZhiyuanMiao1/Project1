"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const paypal_1 = require("../services/paypal");
const router = (0, express_1.Router)();
router.post('/fx-quote', auth_1.requireAuth, async (req, res) => {
    if (!req.user)
        return res.status(401).json({ error: 'Unauthorized' });
    const runtime = (0, paypal_1.requirePayPalRuntime)(res);
    if (!runtime)
        return;
    const hours = (0, paypal_1.parseTopUpHours)(req.body?.hours);
    if (!hours) {
        return res.status(400).json({ error: 'Invalid top-up hours' });
    }
    const pricing = (0, paypal_1.computeTopUpPrice)(hours);
    if (!Number.isFinite(pricing.amountCny) || pricing.amountCny <= 0) {
        return res.status(400).json({ error: 'Invalid top-up amount' });
    }
    try {
        const token = await (0, paypal_1.getServerAccessToken)(runtime);
        const quote = await (0, paypal_1.quoteCnyToUsd)(runtime, token.accessToken, pricing.amountCny);
        return res.json((0, paypal_1.toPublicFxQuote)(quote));
    }
    catch (err) {
        console.error('PayPal FX quote error:', err);
        const paypal = err?.paypal;
        return res.status(502).json({ error: 'Failed to fetch PayPal FX quote', paypal });
    }
});
exports.default = router;
