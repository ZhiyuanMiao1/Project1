import apiClient from '../api/client';

const PAYPAL_SCRIPT_ID = 'paypal-web-sdk-v6-core';
const PAYPAL_ENV = String(process.env.REACT_APP_PAYPAL_ENV || 'sandbox').trim().toLowerCase();
const PAYPAL_SCRIPT_SRC =
  PAYPAL_ENV === 'live'
    ? 'https://www.paypal.com/web-sdk/v6/core'
    : 'https://www.sandbox.paypal.com/web-sdk/v6/core';

let paypalScriptPromise = null;
let paypalInitPromise = null;

let cachedSdkInstance = null;
let cachedIsEligible = null;
let cachedInitError = null;

const createError = (message, cause) => {
  const err = new Error(message);
  if (cause) err.cause = cause;
  return err;
};

const isLocalhost = () => {
  if (typeof window === 'undefined') return false;
  return window.location?.hostname === 'localhost';
};

export const getPayPalWarmupSnapshot = () => ({
  sdkInstance: cachedSdkInstance,
  isEligible: cachedIsEligible,
  initError: cachedInitError,
});

export const warmupPayPal = async () => {
  if (typeof window === 'undefined') return null;
  if (isLocalhost()) return { skipped: true, reason: 'localhost_not_supported' };

  try {
    return await ensurePayPalReady();
  } catch {
    return null;
  }
};

export async function ensurePayPalReady() {
  if (cachedSdkInstance && typeof cachedIsEligible === 'boolean' && !cachedInitError) {
    return { sdkInstance: cachedSdkInstance, isEligible: cachedIsEligible };
  }

  if (paypalInitPromise) return paypalInitPromise;

  paypalInitPromise = (async () => {
    cachedInitError = null;

    const paypal = await ensurePayPalScriptLoaded();
    if (!paypal?.createInstance) {
      throw createError('PayPal SDK 未就绪，请稍后重试。');
    }

    let tokenData = null;
    try {
      tokenData = await apiClient
        .get('/api/paypal-api/auth/browser-safe-client-token')
        .then((r) => r?.data || null);
    } catch (e) {
      throw createError('PayPal 初始化失败，请稍后重试。', e);
    }

    const clientToken = tokenData?.accessToken;
    if (!clientToken) {
      throw createError(tokenData?.hint || tokenData?.error || 'PayPal 初始化失败，请稍后重试。');
    }

    const sdkInstance = await paypal.createInstance({
      clientToken,
      components: ['paypal-payments'],
      pageType: 'checkout',
    });

    const methodsResponse = await sdkInstance.findEligibleMethods({ currencyCode: 'USD' });
    const methods =
      typeof methodsResponse?.isEligible === 'function'
        ? methodsResponse
        : (typeof sdkInstance?.hydrateEligibleMethods === 'function'
          ? sdkInstance.hydrateEligibleMethods(methodsResponse)
          : methodsResponse);
    const eligible = typeof methods?.isEligible === 'function' ? methods.isEligible('paypal') : false;

    cachedSdkInstance = sdkInstance;
    cachedIsEligible = Boolean(eligible);
    cachedInitError = null;

    return { sdkInstance, isEligible: cachedIsEligible };
  })()
    .catch((err) => {
      const message = err instanceof Error && err.message ? err.message : 'PayPal 初始化失败，请稍后重试。';
      cachedSdkInstance = null;
      cachedIsEligible = null;
      cachedInitError = message;
      throw err;
    })
    .finally(() => {
      paypalInitPromise = null;
    });

  return paypalInitPromise;
}

export async function ensurePayPalScriptLoaded() {
  if (typeof window === 'undefined') {
    throw createError('PayPal SDK unavailable in server environment');
  }

  if (window.paypal?.createInstance) return window.paypal;

  if (paypalScriptPromise) return paypalScriptPromise;

  paypalScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(PAYPAL_SCRIPT_ID);

    const finalize = () => {
      const paypal = window.paypal;
      if (paypal?.createInstance) return resolve(paypal);
      return reject(createError('PayPal SDK 加载失败，请检查网络后重试。'));
    };

    if (existing) {
      if (window.paypal?.createInstance) return resolve(window.paypal);
      existing.addEventListener('load', finalize, { once: true });
      existing.addEventListener('error', () => reject(createError('PayPal SDK 加载失败，请检查网络后重试。')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = PAYPAL_SCRIPT_ID;
    script.async = true;
    script.src = PAYPAL_SCRIPT_SRC;
    script.onload = finalize;
    script.onerror = () => reject(createError('PayPal SDK 加载失败，请检查网络后重试。'));
    document.body.appendChild(script);
  })
    .catch((err) => {
      paypalScriptPromise = null;
      throw err;
    });

  return paypalScriptPromise;
}
