"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
const toNumber = (value, fallback = 0) => {
    const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
    return Number.isFinite(parsed) ? parsed : fallback;
};
async function ensureColumn(name, sql) {
    const [rows] = await db_1.pool.query(`SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'billing_orders'
       AND COLUMN_NAME = ?`, [name]);
    if (Number(rows?.[0]?.count || 0) === 0) {
        await db_1.pool.query(sql);
    }
}
async function main() {
    await ensureColumn('remaining_hours', 'ALTER TABLE billing_orders ADD COLUMN remaining_hours DECIMAL(10,2) NULL AFTER topup_hours');
    await ensureColumn('pricing_version', `ALTER TABLE billing_orders
       ADD COLUMN pricing_version VARCHAR(32) NOT NULL DEFAULT 'tier-v1' AFTER unit_price_cny,
       ADD COLUMN standard_unit_price_cny DECIMAL(10,2) NOT NULL DEFAULT 600.00 AFTER pricing_version,
       ADD COLUMN discount_threshold_hours DECIMAL(10,2) NOT NULL DEFAULT 10.00 AFTER standard_unit_price_cny,
       ADD COLUMN discount_unit_price_cny DECIMAL(10,2) NOT NULL DEFAULT 500.00 AFTER discount_threshold_hours`);
    await db_1.pool.query(`CREATE TABLE IF NOT EXISTS billing_hour_allocations (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      billing_order_id BIGINT NOT NULL,
      course_session_id BIGINT NULL,
      allocation_kind ENUM('lesson','legacy') NOT NULL DEFAULT 'lesson',
      source_key VARCHAR(64) NOT NULL,
      hours DECIMAL(10,2) NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_billing_hour_allocation_source (billing_order_id, source_key),
      KEY idx_billing_hour_allocations_user (user_id, created_at),
      KEY idx_billing_hour_allocations_session (course_session_id),
      CONSTRAINT fk_billing_hour_allocations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_hour_allocations_order FOREIGN KEY (billing_order_id) REFERENCES billing_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await db_1.pool.query(`CREATE TABLE IF NOT EXISTS billing_refunds (
      id BIGINT NOT NULL AUTO_INCREMENT,
      public_id CHAR(36) NOT NULL,
      user_id INT NOT NULL,
      billing_order_id BIGINT NOT NULL,
      provider VARCHAR(20) NOT NULL DEFAULT 'paypal',
      requested_hours DECIMAL(10,2) NOT NULL,
      amount_cny DECIMAL(10,2) NOT NULL,
      currency_code CHAR(3) NOT NULL,
      amount_original DECIMAL(10,2) NOT NULL,
      paypal_request_id VARCHAR(78) NOT NULL,
      paypal_refund_id VARCHAR(64) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING',
      balance_reserved TINYINT(1) NOT NULL DEFAULT 1,
      failure_code VARCHAR(80) NULL,
      failure_message VARCHAR(500) NULL,
      provider_response_json LONGTEXT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      completed_at TIMESTAMP NULL DEFAULT NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_billing_refunds_public_id (public_id),
      UNIQUE KEY uniq_billing_refunds_paypal_request (paypal_request_id),
      UNIQUE KEY uniq_billing_refunds_paypal_refund (paypal_refund_id),
      KEY idx_billing_refunds_user_created (user_id, created_at),
      KEY idx_billing_refunds_order_status (billing_order_id, status),
      CONSTRAINT fk_billing_refunds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      CONSTRAINT fk_billing_refunds_order FOREIGN KEY (billing_order_id) REFERENCES billing_orders(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    const [anomalyRows] = await db_1.pool.query(`SELECT u.id, u.lesson_balance_hours, COALESCE(SUM(bo.topup_hours), 0) AS purchased_hours
     FROM users u
     LEFT JOIN billing_orders bo
       ON bo.user_id = u.id AND bo.credited_at IS NOT NULL
     GROUP BY u.id, u.lesson_balance_hours
     HAVING u.lesson_balance_hours < 0
        OR u.lesson_balance_hours > COALESCE(SUM(bo.topup_hours), 0)`);
    if (anomalyRows.length) {
        throw new Error(`退款迁移已中止：发现 ${anomalyRows.length} 个钱包余额异常账户`);
    }
    const conn = await db_1.pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query(`UPDATE billing_orders target
       JOIN (
         SELECT ranked.id,
                LEAST(
                  ranked.topup_hours,
                  GREATEST(0, ranked.lesson_balance_hours - ranked.newer_hours)
                ) AS backfilled_remaining
         FROM (
           SELECT bo.id,
                  bo.topup_hours,
                  u.lesson_balance_hours,
                  COALESCE(
                    SUM(bo.topup_hours) OVER (
                      PARTITION BY bo.user_id
                      ORDER BY bo.credited_at DESC, bo.id DESC
                      ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
                    ),
                    0
                  ) AS newer_hours
           FROM billing_orders bo
           INNER JOIN users u ON u.id = bo.user_id
           WHERE bo.credited_at IS NOT NULL
         ) ranked
       ) calculated ON calculated.id = target.id
       SET target.remaining_hours = calculated.backfilled_remaining
       WHERE target.remaining_hours IS NULL`);
        await conn.query(`INSERT IGNORE INTO billing_hour_allocations
         (user_id, billing_order_id, course_session_id, allocation_kind, source_key, hours)
       SELECT user_id, id, NULL, 'legacy', 'legacy',
              ROUND(topup_hours - COALESCE(remaining_hours, 0), 2)
       FROM billing_orders
       WHERE credited_at IS NOT NULL
         AND topup_hours - COALESCE(remaining_hours, 0) > 0`);
        const [validationRows] = await conn.query(`SELECT u.id,
              u.lesson_balance_hours,
              COALESCE(SUM(bo.remaining_hours), 0) AS reconstructed_hours
       FROM users u
       LEFT JOIN billing_orders bo
         ON bo.user_id = u.id AND bo.credited_at IS NOT NULL
       GROUP BY u.id, u.lesson_balance_hours
       HAVING ABS(u.lesson_balance_hours - COALESCE(SUM(bo.remaining_hours), 0)) > 0.001`);
        if (validationRows.length) {
            throw new Error(`退款迁移校验失败：${validationRows.length} 个账户余额不一致`);
        }
        await conn.commit();
        const [summaryRows] = await db_1.pool.query(`SELECT COUNT(*) AS credited_orders,
              COALESCE(SUM(remaining_hours), 0) AS refundable_hours
       FROM billing_orders
       WHERE credited_at IS NOT NULL`);
        const summary = summaryRows?.[0] || {};
        console.log(`退款迁移完成：${Number(summary.credited_orders || 0)} 笔已充值订单，`
            + `${toNumber(summary.refundable_hours).toFixed(2)} 小时可退款`);
    }
    catch (error) {
        try {
            await conn.rollback();
        }
        catch { }
        throw error;
    }
    finally {
        conn.release();
    }
}
main()
    .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
})
    .finally(async () => {
    await db_1.pool.end();
});
