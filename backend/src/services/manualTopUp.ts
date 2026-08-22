import crypto from 'crypto';
import type { ResultSetHeader } from 'mysql2';
import { pool } from '../db';
import { computeTopUpPrice, parseTopUpHours } from './paypal';
import { BILLING_ORDER_EXPIRY_DAYS, expireStaleBillingOrders } from './billingOrderExpiry';

export type ManualTopUpProvider = 'alipay' | 'wechat';

const providerPrefix = (provider: ManualTopUpProvider) => provider === 'alipay' ? 'ALI' : 'WX';

export const createManualTopUpOrder = async (
  userId: number,
  provider: ManualTopUpProvider,
  rawHours: unknown
) => {
  const hours = parseTopUpHours(rawHours);
  if (!hours) throw Object.assign(new Error('请输入正确的充值课时'), { statusCode: 400 });

  const pricing = computeTopUpPrice(hours);
  const temporaryProviderOrderId = `${providerPrefix(provider)}-INIT-${crypto.randomUUID()}`;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    const [insertResult] = await conn.query<ResultSetHeader>(
      `INSERT INTO billing_orders (
         user_id, provider, provider_order_id, status,
         topup_hours, unit_price_cny, amount_cny,
         pricing_version, standard_unit_price_cny,
         discount_threshold_hours, discount_unit_price_cny,
         currency_code, amount_usd, provider_create_json
       ) VALUES (?, ?, ?, 'CREATED', ?, ?, ?,
         'tier-v2', 799.00, 10.00, 699.00, 'CNY', 0.00, ?)`,
      [
        userId,
        provider,
        temporaryProviderOrderId,
        hours,
        pricing.unitPriceCny,
        pricing.amountCny,
        JSON.stringify({ source: 'wallet_payment_create', createdAt: new Date().toISOString() }),
      ]
    );

    const orderId = Number(insertResult.insertId);
    const paymentReference = String(orderId);
    await conn.query(
      `UPDATE billing_orders
       SET provider_order_id = ?, provider_create_json = ?
       WHERE id = ?`,
      [
        paymentReference,
        JSON.stringify({
          source: 'wallet_payment_create',
          paymentReference,
          createdAt: new Date().toISOString(),
        }),
        orderId,
      ]
    );
    await conn.commit();

    return {
      id: orderId,
      provider,
      provider_order_id: paymentReference,
      paymentReference,
      status: 'CREATED',
      topup_hours: hours,
      amount_cny: pricing.amountCny,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const reportManualTopUpPaid = async (
  userId: number,
  provider: ManualTopUpProvider,
  rawOrderId: unknown
) => {
  await expireStaleBillingOrders();
  const orderId = Number(rawOrderId);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    throw Object.assign(new Error('无效的充值订单，请重新打开付款窗口'), { statusCode: 400 });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<any[]>(
      `SELECT id, provider, provider_order_id, status, topup_hours, amount_cny, created_at
       FROM billing_orders
       WHERE id = ? AND user_id = ? AND provider = ?
       LIMIT 1 FOR UPDATE`,
      [orderId, userId, provider]
    );
    const order = rows?.[0];
    if (!order) throw Object.assign(new Error('未找到充值订单'), { statusCode: 404 });

    const status = String(order.status || '').toUpperCase();
    if (status === 'CREATED' || status === 'APPROVED') {
      await conn.query(
        `UPDATE billing_orders
         SET status = 'PENDING_RECEIPT', updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [orderId]
      );
      order.status = 'PENDING_RECEIPT';
    } else if (status !== 'PENDING_RECEIPT') {
      throw Object.assign(new Error(status === 'VOIDED' ? `订单已超过${BILLING_ORDER_EXPIRY_DAYS}天付款期限` : '该订单当前无法申报付款'), { statusCode: 409 });
    }

    await conn.commit();
    return order;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

export const manualTopUpErrorStatus = (error: any) => {
  const status = Number(error?.statusCode);
  return Number.isInteger(status) && status >= 400 && status < 600 ? status : 500;
};
