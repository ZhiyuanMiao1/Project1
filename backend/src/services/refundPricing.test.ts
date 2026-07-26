import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRefundPricing, parseRefundHours } from './refundPricing';

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

test('reprices a discounted 10-hour order when 9 hours are refunded', () => {
  const quote = computeRefundPricing(base);
  assert.equal(quote.retainedHoursAfter, 1);
  assert.equal(quote.repricedRetainedAmountCny, 600);
  assert.equal(quote.refundAmountCny, 4400);
  assert.equal(quote.refundAmountOriginal, 616);
});

test('uses cumulative rounding for repeated partial refunds', () => {
  const first = computeRefundPricing({ ...base, requestedHours: 2 });
  const second = computeRefundPricing({
    ...base,
    requestedHours: 7,
    priorActiveRefundHours: 2,
    priorActiveRefundCny: first.refundAmountCny,
    priorActiveRefundOriginal: first.refundAmountOriginal,
  });
  assert.equal(first.refundAmountCny + second.refundAmountCny, 4400);
  assert.equal(first.refundAmountOriginal + second.refundAmountOriginal, 616);
});

test('returns no cash value when repricing absorbs a small refund', () => {
  const quote = computeRefundPricing({ ...base, requestedHours: 0.5 });
  assert.equal(quote.refundAmountCny, 0);
  assert.equal(quote.refundAmountOriginal, 0);
});

test('accepts only quarter-hour refund increments', () => {
  assert.equal(parseRefundHours('1.25'), 1.25);
  assert.equal(parseRefundHours('1.1'), null);
  assert.equal(parseRefundHours(0), null);
});
