export type RefundPricingInput = {
  purchasedHours: number;
  requestedHours: number;
  priorActiveRefundHours: number;
  originalAmountCny: number;
  originalAmount: number;
  priorActiveRefundCny: number;
  priorActiveRefundOriginal: number;
  standardUnitPriceCny: number;
  discountThresholdHours: number;
  discountUnitPriceCny: number;
};

export type RefundPricingQuote = {
  retainedHoursAfter: number;
  repricedRetainedAmountCny: number;
  cumulativeRefundCny: number;
  refundAmountCny: number;
  cumulativeRefundOriginal: number;
  refundAmountOriginal: number;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundHours = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const parseRefundHours = (value: unknown): number | null => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 200) return null;
  const quarterUnits = Math.round(parsed * 4);
  if (Math.abs(parsed * 4 - quarterUnits) > 0.000001) return null;
  return roundHours(quarterUnits / 4);
};

export const computeRefundPricing = (input: RefundPricingInput): RefundPricingQuote => {
  const retainedHoursAfter = roundHours(
    Math.max(0, input.purchasedHours - input.priorActiveRefundHours - input.requestedHours)
  );
  const retainedUnitPrice = retainedHoursAfter >= input.discountThresholdHours
    ? input.discountUnitPriceCny
    : input.standardUnitPriceCny;
  const repricedRetainedAmountCny = roundMoney(retainedHoursAfter * retainedUnitPrice);
  const cumulativeRefundCny = roundMoney(
    Math.max(0, Math.min(input.originalAmountCny, input.originalAmountCny - repricedRetainedAmountCny))
  );
  const refundAmountCny = roundMoney(
    Math.max(0, cumulativeRefundCny - input.priorActiveRefundCny)
  );
  const cumulativeRefundOriginal = input.originalAmountCny > 0
    ? roundMoney(input.originalAmount * cumulativeRefundCny / input.originalAmountCny)
    : 0;
  const refundAmountOriginal = roundMoney(
    Math.max(0, cumulativeRefundOriginal - input.priorActiveRefundOriginal)
  );

  return {
    retainedHoursAfter,
    repricedRetainedAmountCny,
    cumulativeRefundCny,
    refundAmountCny,
    cumulativeRefundOriginal,
    refundAmountOriginal,
  };
};
