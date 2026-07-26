"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const refundPricing_1 = require("./refundPricing");
const base = {
    purchasedHours: 10,
    requestedHours: 9,
    priorActiveRefundHours: 0,
    originalAmountCny: 5000,
    originalAmount: 700,
    priorActiveRefundCny: 0,
    priorActiveRefundOriginal: 0,
    standardUnitPriceCny: 600,
    discountThresholdHours: 10,
    discountUnitPriceCny: 500,
};
(0, node_test_1.default)('reprices a discounted 10-hour order when 9 hours are refunded', () => {
    const quote = (0, refundPricing_1.computeRefundPricing)(base);
    strict_1.default.equal(quote.retainedHoursAfter, 1);
    strict_1.default.equal(quote.repricedRetainedAmountCny, 600);
    strict_1.default.equal(quote.refundAmountCny, 4400);
    strict_1.default.equal(quote.refundAmountOriginal, 616);
});
(0, node_test_1.default)('uses cumulative rounding for repeated partial refunds', () => {
    const first = (0, refundPricing_1.computeRefundPricing)({ ...base, requestedHours: 2 });
    const second = (0, refundPricing_1.computeRefundPricing)({
        ...base,
        requestedHours: 7,
        priorActiveRefundHours: 2,
        priorActiveRefundCny: first.refundAmountCny,
        priorActiveRefundOriginal: first.refundAmountOriginal,
    });
    strict_1.default.equal(first.refundAmountCny + second.refundAmountCny, 4400);
    strict_1.default.equal(first.refundAmountOriginal + second.refundAmountOriginal, 616);
});
(0, node_test_1.default)('returns no cash value when repricing absorbs a small refund', () => {
    const quote = (0, refundPricing_1.computeRefundPricing)({ ...base, requestedHours: 0.5 });
    strict_1.default.equal(quote.refundAmountCny, 0);
    strict_1.default.equal(quote.refundAmountOriginal, 0);
});
(0, node_test_1.default)('accepts only quarter-hour refund increments', () => {
    strict_1.default.equal((0, refundPricing_1.parseRefundHours)('1.25'), 1.25);
    strict_1.default.equal((0, refundPricing_1.parseRefundHours)('1.1'), null);
    strict_1.default.equal((0, refundPricing_1.parseRefundHours)(0), null);
});
