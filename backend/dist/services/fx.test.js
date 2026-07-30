"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const assert_1 = __importDefault(require("assert"));
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
    };
});
async function run() {
    try {
        const { quoteCnyToUsd, toPublicFxQuote } = await Promise.resolve().then(() => __importStar(require('./fx')));
        const [oneHour, tenHours] = await Promise.all([
            quoteCnyToUsd(600),
            quoteCnyToUsd(5000),
        ]);
        assert_1.default.equal(requestCount, 1, 'concurrent quotes should share one Frankfurter request');
        assert_1.default.equal(oneHour.usdAmount, '84.00');
        assert_1.default.equal(tenHours.usdAmount, '700.00');
        assert_1.default.equal(oneHour.provider, 'frankfurter');
        assert_1.default.match(oneHour.quoteId, /^frankfurter:2026-07-30:/);
        const publicQuote = toPublicFxQuote(oneHour);
        assert_1.default.equal(publicQuote.provider, 'frankfurter');
        assert_1.default.equal(publicQuote.rate_date, '2026-07-30');
        assert_1.default.equal(publicQuote.markup_bps, 0);
        assert_1.default.equal(publicQuote.stale, false);
        console.log('Frankfurter FX service tests passed');
    }
    finally {
        global.fetch = originalFetch;
    }
}
run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
