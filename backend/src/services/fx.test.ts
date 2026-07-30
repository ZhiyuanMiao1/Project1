import assert from 'assert';

const originalFetch = global.fetch;
let requestCount = 0;

global.fetch = (async () => {
  requestCount += 1;
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({
      date: '2026-07-30',
      base: 'CNY',
      quote: 'USD',
      rate: 0.14,
    }),
  } as Response;
}) as typeof fetch;

async function run() {
  try {
    const { quoteCnyToUsd, toPublicFxQuote } = await import('./fx');
    const [oneHour, tenHours] = await Promise.all([
      quoteCnyToUsd(600),
      quoteCnyToUsd(5000),
    ]);

    assert.equal(requestCount, 1, 'concurrent quotes should share one Frankfurter request');
    assert.equal(oneHour.usdAmount, '84.00');
    assert.equal(tenHours.usdAmount, '700.00');
    assert.equal(oneHour.provider, 'frankfurter');
    assert.match(oneHour.quoteId, /^frankfurter:2026-07-30:/);

    const publicQuote = toPublicFxQuote(oneHour);
    assert.equal(publicQuote.provider, 'frankfurter');
    assert.equal(publicQuote.rate_date, '2026-07-30');
    assert.equal(publicQuote.markup_bps, 0);
    assert.equal(publicQuote.stale, false);

    console.log('Frankfurter FX service tests passed');
  } finally {
    global.fetch = originalFetch;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
