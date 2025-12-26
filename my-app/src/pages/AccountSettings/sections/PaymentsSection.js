import React, { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../../constants/courseMappings';

const MOCK_RECHARGE_RECORDS = [
  { id: 'topup-2025-12-18-01', timeZone: 'UTC+08:00', time: '2025/12/18 20:10', amount: 200, courseHours: 2 },
  { id: 'topup-2025-12-10-02', timeZone: 'UTC+08:00', time: '2025/12/10 14:32', amount: 300, courseHours: 3 },
  { id: 'topup-2025-11-26-03', timeZone: 'UTC+08:00', time: '2025/11/26 09:05', amount: 150, courseHours: 1.5 },
];

const MOCK_INCOME_RECORDS = [
  {
    id: 'income-2025-12-16-01',
    timeZone: 'UTC+08:00',
    time: '2025/12/16 21:40',
    amount: 360,
    teachingHours: 1.5,
    studentId: 's44',
    courseDirectionId: 'statistics',
    courseTypeId: 'final-review',
  },
  {
    id: 'income-2025-12-03-02',
    timeZone: 'UTC+08:00',
    time: '2025/12/03 18:20',
    amount: 240,
    teachingHours: 1,
    studentId: 's12',
    courseDirectionId: 'algo',
    courseTypeId: 'pre-study',
  },
];

const cnyFormatter = new Intl.NumberFormat('zh-CN', {
  style: 'currency',
  currency: 'CNY',
  maximumFractionDigits: 2,
});

const formatCny = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return cnyFormatter.format(value);
};

const formatCourseHours = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  const normalized = Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
  return normalized;
};

function RechargeTable({ records = [] }) {
  return (
    <div className="settings-orders-table-wrapper">
      <table className="settings-orders-table">
        <thead>
          <tr>
            <th scope="col">时区</th>
            <th scope="col">时间</th>
            <th scope="col">金额</th>
            <th scope="col">获得课时</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td className="settings-recharge-timezone">{record.timeZone}</td>
              <td className="settings-orders-time">{record.time}</td>
              <td className="settings-orders-amount">{formatCny(record.amount)}</td>
              <td className="settings-recharge-hours">{formatCourseHours(record.courseHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IncomeTable({ records = [] }) {
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
            <th scope="col">时区</th>
            <th scope="col">时间</th>
            <th scope="col">金额</th>
            <th scope="col">授课时长</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const expanded = !!expandedRecordIds[record.id];
            const directionId = record.courseDirectionId || 'others';
            const courseTypeId = record.courseTypeId || 'others';
            const courseName = DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || '其它课程方向';
            const courseTypeName = COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || '其它类型';
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
                  <td className="settings-recharge-timezone">{record.timeZone}</td>
                  <td className="settings-orders-time">{record.time}</td>
                  <td className="settings-orders-amount">{formatCny(record.amount)}</td>
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

function PaymentsSection() {
  const [paymentsExpanded, setPaymentsExpanded] = useState(false);
  const [receiptsExpanded, setReceiptsExpanded] = useState(false);

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
            <div className="settings-row-title">付款</div>
            <div className="settings-row-value">
              {MOCK_RECHARGE_RECORDS.length ? `充值记录（${MOCK_RECHARGE_RECORDS.length}）` : '暂无记录'}
            </div>
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
          {MOCK_RECHARGE_RECORDS.length ? (
            <RechargeTable records={MOCK_RECHARGE_RECORDS} />
          ) : (
            <div className="settings-orders-empty">暂无充值记录</div>
          )}
        </div>
      </div>

      <div className="settings-accordion-item">
        <button
          type="button"
          className="settings-accordion-trigger"
          aria-expanded={receiptsExpanded}
          aria-controls="settings-receipts-history"
          onClick={() => setReceiptsExpanded((prev) => !prev)}
        >
          <div className="settings-row-main">
            <div className="settings-row-title">收款</div>
            <div className="settings-row-value">
              {MOCK_INCOME_RECORDS.length ? `入账记录（${MOCK_INCOME_RECORDS.length}）` : '暂无记录'}
            </div>
          </div>
          <span className="settings-accordion-icon" aria-hidden="true">
            <FiChevronDown size={18} />
          </span>
        </button>
        <div
          id="settings-receipts-history"
          className="settings-accordion-panel"
          hidden={!receiptsExpanded}
        >
          {MOCK_INCOME_RECORDS.length ? (
            <IncomeTable records={MOCK_INCOME_RECORDS} />
          ) : (
            <div className="settings-orders-empty">暂无入账记录</div>
          )}
        </div>
      </div>
    </>
  );
}

export default PaymentsSection;

