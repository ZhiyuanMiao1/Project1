import React, { useEffect, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { fetchAccountPaymentsSummary } from '../../../api/account';
import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../../constants/courseMappings';
import { useI18n } from '../../../i18n/language';

const formatCny = (value, language = 'zh-CN') => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2,
  }).format(value);
};

const formatCourseHours = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, '');
  return normalized;
};

const toOffsetLabel = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '--';
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absoluteMinutes / 60)).padStart(2, '0');
  const minutes = String(absoluteMinutes % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
};

const formatDateTime = (value, language = 'zh-CN') => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';

  const parts = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year || '--'}/${map.month || '--'}/${map.day || '--'} ${map.hour || '--'}:${map.minute || '--'}`;
};

const normalizeNumber = (value) => {
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizePaymentRecord = (item) => {
  const id = item?.id;
  const time = typeof item?.time === 'string' ? item.time : '';
  if (id == null || !time) return null;

  return {
    id: String(id),
    time,
    amount: Number(normalizeNumber(item?.amount).toFixed(2)),
    courseHours: Number(normalizeNumber(item?.courseHours).toFixed(2)),
  };
};

const normalizeIncomeRecord = (item) => {
  const id = item?.id;
  const time = typeof item?.time === 'string' ? item.time : '';
  if (id == null || !time) return null;

  return {
    id: String(id),
    time,
    amount: Number(normalizeNumber(item?.amount).toFixed(2)),
    teachingHours: Number(normalizeNumber(item?.teachingHours).toFixed(2)),
    studentId: typeof item?.studentId === 'string' ? item.studentId : '',
    courseDirectionId: typeof item?.courseDirectionId === 'string' ? item.courseDirectionId : '',
    courseTypeId: typeof item?.courseTypeId === 'string' ? item.courseTypeId : '',
  };
};

function RechargeTable({ records = [] }) {
  const { language, t } = useI18n();
  return (
    <div className="settings-orders-table-wrapper">
      <table className="settings-orders-table">
        <thead>
          <tr>
            <th scope="col">{t('payments.timeZone', '时区')}</th>
            <th scope="col">{t('payments.time', '时间')}</th>
            <th scope="col">{t('payments.amount', '金额')}</th>
            <th scope="col">{t('payments.courseHours', '获得课时')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="settings-recharge-timezone">{toOffsetLabel(new Date(record.time))}</td>
              <td className="settings-orders-time">{formatDateTime(record.time, language)}</td>
              <td className="settings-orders-amount">{formatCny(record.amount, language)}</td>
              <td className="settings-recharge-hours">{formatCourseHours(record.courseHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomeTable({ records = [] }) {
  const { language, t, getCourseDirectionLabel } = useI18n();
  const [expandedRecordIds, setExpandedRecordIds] = useState(() => ({}));

  const toggleExpanded = (id) => {
    setExpandedRecordIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRowKeyDown = (e, id) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded(id);
    }
  };

  return (
    <div className="settings-orders-table-wrapper">
      <table className="settings-orders-table">
        <thead>
          <tr>
            <th scope="col">{t('payments.timeZone', '时区')}</th>
            <th scope="col">{t('payments.time', '时间')}</th>
            <th scope="col">{t('payments.amount', '金额')}</th>
            <th scope="col">{t('payments.teachingHours', '授课时长')}</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const expanded = !!expandedRecordIds[record.id];
            const directionId = record.courseDirectionId || 'others';
            const courseTypeId = record.courseTypeId || 'others';
            const courseName = getCourseDirectionLabel(directionId, DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || t('payments.otherDirection', '其它课程方向'));
            const courseTypeName = COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || t('payments.otherType', '其它类型');
            const DirectionIcon = DIRECTION_ICON_MAP[directionId] || DIRECTION_ICON_MAP.others;
            const CourseTypeIcon = COURSE_TYPE_ICON_MAP[courseTypeId] || COURSE_TYPE_ICON_MAP.others;
            const detailsId = `settings-income-detail-${record.id}`;

            return (
              <React.Fragment key={record.id}>
                <tr
                  className={`settings-income-row ${expanded ? 'is-expanded' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded}
                  aria-controls={detailsId}
                  onClick={() => toggleExpanded(record.id)}
                  onKeyDown={(e) => handleRowKeyDown(e, record.id)}
                >
                  <td className="settings-recharge-timezone">{toOffsetLabel(new Date(record.time))}</td>
                  <td className="settings-orders-time">{formatDateTime(record.time, language)}</td>
                  <td className="settings-orders-amount">{formatCny(record.amount, language)}</td>
                  <td className="settings-recharge-hours">{formatCourseHours(record.teachingHours)}</td>
                </tr>
                <tr
                  id={detailsId}
                  className="settings-income-detail-row"
                  hidden={!expanded}
                >
                  <td colSpan={4}>
                    <div className="settings-income-detail">
                      <div className="settings-income-detail-item settings-income-detail-item--student">
                        <span className="settings-income-detail-value">{record.studentId || '--'}</span>
                      </div>
                      <div className="settings-income-detail-item settings-income-detail-item--course">
                        <span className="settings-income-detail-icon" aria-hidden="true">
                          {DirectionIcon ? <DirectionIcon size={16} /> : null}
                        </span>
                        <span className="settings-income-detail-value">{courseName}</span>
                      </div>
                      <div className="settings-income-detail-item settings-income-detail-item--type">
                        <span className="settings-income-detail-icon" aria-hidden="true">
                          {CourseTypeIcon ? <CourseTypeIcon size={16} /> : null}
                        </span>
                        <span className="settings-income-detail-value">{courseTypeName}</span>
                      </div>
                    </div>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentsSection({ isLoggedIn = false }) {
  const { t } = useI18n();
  const [paymentsExpanded, setPaymentsExpanded] = useState(false);
  const [incomeExpanded, setIncomeExpanded] = useState(false);
  const [status, setStatus] = useState('idle');
  const [paymentRecords, setPaymentRecords] = useState([]);
  const [incomeRecords, setIncomeRecords] = useState([]);

  useEffect(() => {
    if (!isLoggedIn) {
      setStatus('idle');
      setPaymentRecords([]);
      setIncomeRecords([]);
      return undefined;
    }

    let alive = true;
    setStatus('loading');

    fetchAccountPaymentsSummary()
      .then((res) => {
        if (!alive) return;
        const data = res?.data || {};
        const nextPaymentRecords = Array.isArray(data.paymentRecords)
          ? data.paymentRecords.map(normalizePaymentRecord).filter(Boolean)
          : [];
        const nextIncomeRecords = Array.isArray(data.incomeRecords)
          ? data.incomeRecords.map(normalizeIncomeRecord).filter(Boolean)
          : [];
        setPaymentRecords(nextPaymentRecords);
        setIncomeRecords(nextIncomeRecords);
        setStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setPaymentRecords([]);
        setIncomeRecords([]);
        setStatus('error');
      });

    return () => {
      alive = false;
    };
  }, [isLoggedIn]);

  const paymentSummary = status === 'loading'
    ? t('payments.loading', '加载中...')
    : (paymentRecords.length ? t('payments.rechargeRecords', `充值记录（${paymentRecords.length}）`, { count: paymentRecords.length }) : t('payments.noRecords', '暂无记录'));
  const incomeSummary = status === 'loading'
    ? t('payments.loading', '加载中...')
    : (incomeRecords.length ? t('payments.incomeRecords', `收入记录（${incomeRecords.length}）`, { count: incomeRecords.length }) : t('payments.noRecords', '暂无记录'));

  return (
    <>
      <div className="settings-accordion-item">
        <button
          type="button"
          className="settings-accordion-trigger"
          aria-expanded={paymentsExpanded}
          aria-controls="settings-payments-history"
          onClick={() => setPaymentsExpanded((prev) => !prev)}
        >
          <div className="settings-row-main">
            <div className="settings-row-title">{t('payments.payment', '付款')}</div>
            <div className="settings-row-value">{paymentSummary}</div>
          </div>
          <span className="settings-accordion-icon" aria-hidden="true">
            <FiChevronDown size={18} />
          </span>
        </button>
        <div
          id="settings-payments-history"
          className="settings-accordion-panel"
          hidden={!paymentsExpanded}
        >
          {status === 'loading' ? (
            <div className="settings-orders-empty">{t('common.loading', '加载中...')}</div>
          ) : status === 'error' ? (
            <div className="settings-orders-empty">{t('payments.loadPaymentsFailed', '付款记录加载失败，请稍后再试')}</div>
          ) : paymentRecords.length ? (
            <RechargeTable records={paymentRecords} />
          ) : (
            <div className="settings-orders-empty">{t('payments.noRechargeRecords', '暂无充值记录')}</div>
          )}
        </div>
      </div>

      <div className="settings-accordion-item">
        <button
          type="button"
          className="settings-accordion-trigger"
          aria-expanded={incomeExpanded}
          aria-controls="settings-income-history"
          onClick={() => setIncomeExpanded((prev) => !prev)}
        >
          <div className="settings-row-main">
            <div className="settings-row-title">{t('payments.income', '收入')}</div>
            <div className="settings-row-value">{incomeSummary}</div>
          </div>
          <span className="settings-accordion-icon" aria-hidden="true">
            <FiChevronDown size={18} />
          </span>
        </button>
        <div
          id="settings-income-history"
          className="settings-accordion-panel"
          hidden={!incomeExpanded}
        >
          {status === 'loading' ? (
            <div className="settings-orders-empty">{t('common.loading', '加载中...')}</div>
          ) : status === 'error' ? (
            <div className="settings-orders-empty">{t('payments.loadIncomeFailed', '收入记录加载失败，请稍后再试')}</div>
          ) : incomeRecords.length ? (
            <IncomeTable records={incomeRecords} />
          ) : (
            <div className="settings-orders-empty">{t('payments.noIncomeRecords', '暂无收入记录')}</div>
          )}
        </div>
      </div>
    </>
  );
}

export default PaymentsSection;
