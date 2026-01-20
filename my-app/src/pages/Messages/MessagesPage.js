import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FiCalendar, FiChevronLeft, FiChevronRight, FiClock, FiVideo, FiX } from 'react-icons/fi';
import BrandMark from '../../components/common/BrandMark/BrandMark';
import StudentAuthModal from '../../components/AuthModal/StudentAuthModal';
import MentorAuthModal from '../../components/AuthModal/MentorAuthModal';
import api from '../../api/client';
import { useLocation } from 'react-router-dom';
import { getAuthToken } from '../../utils/authStorage';
import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../constants/courseMappings';
import './MessagesPage.css';

const stripDisplaySuffix = (value) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\s*(导师|老师|同学)\s*$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const getThreadCounterpartDisplayName = (thread) => {
  if (!thread) return '';
  if (typeof thread.counterpartId === 'string' && thread.counterpartId.trim()) {
    return thread.counterpartId.trim();
  }
  return stripDisplaySuffix(thread.counterpart);
};

const getThreadMyRole = (thread) => {
  const role = typeof thread?.myRole === 'string' ? thread.myRole.trim().toLowerCase() : '';
  return role === 'mentor' ? 'mentor' : 'student';
};

const getCourseTitleParts = (thread, scheduleCard) => {
  const directionId = scheduleCard?.courseDirectionId || thread?.courseDirectionId || 'others';
  const courseTypeId = scheduleCard?.courseTypeId || thread?.courseTypeId || 'others';

  const courseName = DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || '其它课程方向';
  const courseType = COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || '其它类型';
  const DirectionIcon = DIRECTION_ICON_MAP[directionId] || DIRECTION_ICON_MAP.others || null;
  const CourseTypeIcon = COURSE_TYPE_ICON_MAP[courseTypeId] || COURSE_TYPE_ICON_MAP.others || null;

  return { courseName, courseType, directionId, courseTypeId, DirectionIcon, CourseTypeIcon };
};

const SCHEDULE_STATUS_META = {
  pending: { label: '待确认', tone: 'pending' },
  accepted: { label: '已接受', tone: 'accept' },
  rejected: { label: '已拒绝', tone: 'reject' },
  rescheduling: { label: '修改时间中', tone: 'reschedule' },
};

const normalizeScheduleStatus = (value) => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key in SCHEDULE_STATUS_META) return key;
  return 'pending';
};

const buildScheduleCardsFromThread = (thread) => {
  if (!thread) return [];

  const history = Array.isArray(thread.scheduleHistory)
    ? thread.scheduleHistory
        .filter((item) => item && typeof item === 'object')
        .map((item, index) => ({ ...item, __key: `history-${index}`, __primary: false }))
    : [];

  const main = thread.schedule && typeof thread.schedule === 'object'
    ? [{ ...thread.schedule, __key: 'main', __primary: true }]
    : [];

  return [...history, ...main];
};

/* const STUDENT_THREADS = [
  {
    id: 's-01',
    subject: '日程确认',
    counterpart: 'Mia 导师',
    counterpartMeta: '导师 · 机器学习',
    courseDirectionId: 'ml',
    courseTypeId: 'pre-study',
    time: '今天 09:12',
    unread: true,
    tags: ['待确认', '日程邀请'],
    summary: 'Mia：我这周可以安排一次课前预习，你看这个时间方便吗？',
    schedule: {
      direction: 'incoming',
      window: '12月30日 周二 20:00-21:30 (GMT+8)',
      meetingId: '会议号：710 332 091',
      courseDirectionId: 'ml',
      courseTypeId: 'pre-study',
    },
    messages: [
      { id: 's-01-1', author: 'Mia 导师', from: 'them', time: '09:12', text: '我这周可以安排一次课前预习，你看这个时间方便吗？' },
      { id: 's-01-2', author: '我', from: 'me', time: '09:18', text: '可以的，我会提前把要点整理好。' },
    ],
  },
  {
    id: 's-02',
    subject: '日程确认',
    counterpart: '李老师',
    counterpartMeta: '导师 · CS 基础',
    courseDirectionId: 'algo',
    courseTypeId: 'final-review',
    time: '昨天 20:46',
    unread: false,
    tags: ['日程已发送'],
    summary: '我：发了期末复习的时间，等老师确认。',
    schedule: {
      direction: 'outgoing',
      window: '12月29日 周一 19:30-21:00 (GMT+8)',
      meetingId: '会议号：603 221 448',
      status: 'pending',
      courseDirectionId: 'algo',
      courseTypeId: 'final-review',
    },
    messages: [
      { id: 's-02-1', author: '我', from: 'me', time: '20:46', text: '老师我这边整理了复习计划，想约 12月29日 19:30-21:00（GMT+8）一起过一遍。' },
      { id: 's-02-2', author: '李老师', from: 'them', time: '20:53', text: '收到，我看下当晚安排，晚点回复你。' },
    ],
  },
  {
    id: 's-03',
    subject: '日程已确认',
    counterpart: 'Ken 导师',
    counterpartMeta: '导师 · 数据分析',
    courseDirectionId: 'data-analysis',
    courseTypeId: 'course-selection',
    time: '周二 14:26',
    unread: false,
    tags: ['已接受'],
    summary: 'Ken：OK，已确认时间。',
    schedule: {
      direction: 'outgoing',
      window: '12月27日 周六 10:00-11:00 (GMT+8)',
      meetingId: '会议号：884 112 309',
      status: 'accepted',
      courseDirectionId: 'data-analysis',
      courseTypeId: 'course-selection',
    },
    scheduleHistory: [
      {
        direction: 'outgoing',
        window: '12月26日 周五 21:00-22:00 (GMT+8)',
        meetingId: '会议号：884 112 309',
        readOnly: true,
        courseDirectionId: 'data-analysis',
        courseTypeId: 'course-selection',
      },
    ],
    messages: [
      { id: 's-03-1', author: '我', from: 'me', time: '14:20', text: '导师我想约一节选课指导，您看周末上午可以吗？' },
      { id: 's-03-2', author: 'Ken 导师', from: 'them', time: '14:26', text: '可以，10:00-11:00 我这边确认了。' },
    ],
  },
  {
    id: 's-04',
    subject: '日程被拒绝',
    counterpart: '陈老师',
    counterpartMeta: '导师 · 编程基础',
    courseDirectionId: 'cs-foundation',
    courseTypeId: 'assignment-project',
    time: '周一 11:02',
    unread: false,
    tags: ['已拒绝'],
    summary: '陈老师：这两天排满了，能否换个时间？',
    schedule: {
      direction: 'outgoing',
      window: '12月26日 周五 15:00-16:30 (GMT+8)',
      meetingId: '会议号：352 771 904',
      status: 'rejected',
      courseDirectionId: 'cs-foundation',
      courseTypeId: 'assignment-project',
    },
    messages: [
      { id: 's-04-1', author: '我', from: 'me', time: '10:58', text: '老师我想约一次作业项目答疑，12月26日 15:00-16:30（GMT+8）您方便吗？' },
      { id: 's-04-2', author: '陈老师', from: 'them', time: '11:02', text: '这两天排满了，你看看下周再约？' },
    ],
  },
  {
    id: 's-05',
    subject: '修改时间中',
    counterpart: '赵老师',
    counterpartMeta: '导师 · 写作',
    courseDirectionId: 'writing',
    courseTypeId: 'in-class-support',
    time: '今天 13:40',
    unread: false,
    tags: ['修改时间中'],
    summary: '我：正在发起新的时间选择。',
    schedule: {
      direction: 'outgoing',
      window: '12月31日 周三 20:30-22:00 (GMT+8)',
      meetingId: '会议号：612 938 155',
      status: 'rescheduling',
      courseDirectionId: 'writing',
      courseTypeId: 'in-class-support',
    },
    scheduleHistory: [
      {
        direction: 'outgoing',
        window: '12月30日 周二 20:00-21:30 (GMT+8)',
        meetingId: '会议号：612 938 155',
        readOnly: true,
        courseDirectionId: 'writing',
        courseTypeId: 'in-class-support',
      },
      {
        direction: 'incoming',
        window: '12月31日 周三 19:30-21:00 (GMT+8)',
        meetingId: '会议号：612 938 155',
        readOnly: true,
        courseDirectionId: 'writing',
        courseTypeId: 'in-class-support',
      },
    ],
    messages: [
      { id: 's-05-1', author: '赵老师', from: 'them', time: '13:18', text: '我周二可能赶不回来，能否周三晚些？' },
      { id: 's-05-2', author: '我', from: 'me', time: '13:40', text: '好的，我这边重新发一个周三的时间。' },
    ],
  },
  {
    id: 's-06',
    subject: '日程确认',
    counterpart: 'Lily 导师',
    counterpartMeta: '导师 · 统计',
    courseDirectionId: 'statistics',
    courseTypeId: 'final-review',
    time: '周三 18:10',
    unread: false,
    tags: ['待确认'],
    summary: 'Lily：我们可以针对期末复习梳理重点。',
    schedule: {
      direction: 'incoming',
      window: '12月28日 周日 14:00-15:30 (GMT+8)',
      meetingId: '会议号：905 114 872',
      courseDirectionId: 'statistics',
      courseTypeId: 'final-review',
    },
    messages: [
      { id: 's-06-1', author: 'Lily 导师', from: 'them', time: '18:10', text: '我这周日有空，我们可以针对期末复习梳理重点。' },
      { id: 's-06-2', author: '我', from: 'me', time: '18:16', text: '好，我把错题清单先发您。' },
    ],
  },
*/

/* const MENTOR_THREADS = [
  {
    id: 'm-01',
    subject: '日程邀请',
    counterpart: 'Alex 同学',
    counterpartId: 'S12',
    counterpartMeta: '学生 · 新预约',
    courseDirectionId: 'algo',
    courseTypeId: 'assignment-project',
    time: '今天 08:40',
    unread: true,
    tags: ['待确认'],
    summary: 'Alex：老师我想约一次作业项目辅导。',
    schedule: {
      direction: 'incoming',
      window: '12月29日 周一 21:00-22:30 (GMT+8)',
      meetingId: '会议号：410 229 637',
      courseDirectionId: 'algo',
      courseTypeId: 'assignment-project',
    },
    messages: [
      { id: 'm-01-1', author: 'Alex 同学', from: 'them', time: '08:40', text: '老师我想约一次作业项目辅导，您看这个时间可以吗？' },
      { id: 'm-01-2', author: '我', from: 'me', time: '08:52', text: '可以，我这边看下资料后给你建议。' },
    ],
  },
  {
    id: 'm-02',
    subject: '日程邀请',
    counterpart: 'Joyce',
    counterpartId: 'S21',
    counterpartMeta: '学生 · 待确认',
    courseDirectionId: 'ml',
    courseTypeId: 'pre-study',
    time: '昨天 19:10',
    unread: false,
    tags: ['待确认'],
    summary: 'Joyce：想约一节机器学习课前预习。',
    schedule: {
      direction: 'incoming',
      window: '12月28日 周日 20:00-21:00 (GMT+8)',
      meetingId: '会议号：771 332 991',
      courseDirectionId: 'ml',
      courseTypeId: 'pre-study',
    },
    messages: [
      { id: 'm-02-1', author: 'Joyce', from: 'them', time: '19:10', text: '老师想约一节机器学习课前预习，您看周日晚上可以吗？' },
      { id: 'm-02-2', author: '我', from: 'me', time: '19:18', text: '可以，先把你目前的进度和疑问发我。' },
    ],
  },
  {
    id: 'm-03',
    subject: '日程已发送',
    counterpart: '王同学',
    counterpartId: 'S07',
    counterpartMeta: '学生 · 新预约',
    courseDirectionId: 'statistics',
    courseTypeId: 'final-review',
    time: '周二 14:30',
    unread: false,
    tags: ['待确认'],
    summary: '我：已发送期末复习时间，等待确认。',
    schedule: {
      direction: 'outgoing',
      window: '12月27日 周六 16:00-17:30 (GMT+8)',
      meetingId: '会议号：118 204 555',
      status: 'pending',
      courseDirectionId: 'statistics',
      courseTypeId: 'final-review',
    },
    messages: [
      { id: 'm-03-1', author: '王同学', from: 'them', time: '14:30', text: '老师我想复习一下统计，您看周末能安排吗？' },
      { id: 'm-03-2', author: '我', from: 'me', time: '14:38', text: '可以，我发一个时间给你确认。' },
    ],
  },
  {
    id: 'm-04',
    subject: '已确认',
    counterpart: 'Lily 同学',
    counterpartId: 'S18',
    counterpartMeta: '学生 · 已确认',
    courseDirectionId: 'data-analysis',
    courseTypeId: 'course-selection',
    time: '今天 13:10',
    unread: false,
    tags: ['已接受'],
    summary: '对方已确认选课指导时间。',
    schedule: {
      direction: 'outgoing',
      window: '12月30日 周二 18:30-19:30 (GMT+8)',
      meetingId: '会议号：932 610 077',
      status: 'accepted',
      courseDirectionId: 'data-analysis',
      courseTypeId: 'course-selection',
    },
    messages: [
      { id: 'm-04-1', author: '我', from: 'me', time: '13:10', text: '我给你发一个选课指导时间：12月30日 18:30-19:30（GMT+8）。' },
      { id: 'm-04-2', author: 'Lily 同学', from: 'them', time: '13:16', text: '收到！我这边确认没问题。' },
    ],
  },
  {
    id: 'm-05',
    subject: '未能确认',
    counterpart: 'Sarah 同学',
    counterpartId: 'S31',
    counterpartMeta: '学生 · 待调整',
    courseDirectionId: 'cs-foundation',
    courseTypeId: 'pre-study',
    time: '周一 11:05',
    unread: false,
    tags: ['已拒绝'],
    summary: '对方表示时间冲突。',
    schedule: {
      direction: 'outgoing',
      window: '12月28日 周日 09:30-10:30 (GMT+8)',
      meetingId: '会议号：500 118 606',
      status: 'rejected',
      courseDirectionId: 'cs-foundation',
      courseTypeId: 'pre-study',
    },
    messages: [
      { id: 'm-05-1', author: '我', from: 'me', time: '11:05', text: '我发了一个课前预习的时间，你看周日早上可以吗？' },
      { id: 'm-05-2', author: 'Sarah 同学', from: 'them', time: '11:12', text: '抱歉老师，那天早上我有考试冲突。' },
    ],
  },
  {
    id: 'm-06',
    subject: '修改时间中',
    counterpart: 'Kevin 同学',
    counterpartId: 'S44',
    counterpartMeta: '学生 · 待确认',
    courseDirectionId: 'cybersecurity',
    courseTypeId: 'others',
    time: '今天 16:25',
    unread: true,
    tags: ['修改时间中'],
    summary: '我：正在调整新的授课时间。',
    schedule: {
      direction: 'outgoing',
      window: '12月31日 周三 15:00-16:00 (GMT+8)',
      meetingId: '会议号：240 771 118',
      status: 'rescheduling',
      courseDirectionId: 'cybersecurity',
      courseTypeId: 'others',
    },
    scheduleHistory: [
      {
        direction: 'outgoing',
        window: '12月30日 周二 14:00-15:00 (GMT+8)',
        meetingId: '会议号：240 771 118',
        readOnly: true,
        courseDirectionId: 'cybersecurity',
        courseTypeId: 'others',
      },
      {
        direction: 'incoming',
        window: '12月31日 周三 14:30-15:30 (GMT+8)',
        meetingId: '会议号：240 771 118',
        readOnly: true,
        courseDirectionId: 'cybersecurity',
        courseTypeId: 'others',
      },
    ],
    messages: [
      { id: 'm-06-1', author: 'Kevin 同学', from: 'them', time: '16:25', text: '老师周二下午临时有事，能否改到周三？' },
      { id: 'm-06-2', author: '我', from: 'me', time: '16:33', text: '可以，我这边重新发一个周三的时间给你确认。' },
    ],
  },
*/

const formatHoverTime = (rawValue) => {
  if (!rawValue) return '';
  const text = String(rawValue).trim();
  if (!text) return '';

  const now = new Date();
  const toDateLabel = (date) => `${date.getMonth() + 1}\u6708${date.getDate()}\u65e5`;
  const timeMatch = text.match(/(\d{1,2}:\d{2})/);
  const timePart = timeMatch ? timeMatch[1] : '';

  const parsed = Date.parse(text);
  const looksLikeIso = /T\d{2}:\d{2}:\d{2}/.test(text) || /Z$/.test(text);
  if (!Number.isNaN(parsed) && looksLikeIso) {
    const dt = new Date(parsed);
    const pad2 = (n) => String(n).padStart(2, '0');
    const localTimePart = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

    const sameYmd = (a, b) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

    if (sameYmd(dt, now)) return localTimePart;

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (sameYmd(dt, yesterday)) return `${toDateLabel(dt)} ${localTimePart}`;

    return `${toDateLabel(dt)} ${localTimePart}`;
  }

  if (text.startsWith('今天')) {
    const trimmed = text.replace(/^今天\s*/, '').trim();
    return timePart || trimmed || text;
  }

  if (text.startsWith('昨天')) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    const dateLabel = toDateLabel(d);
    return timePart ? `${dateLabel} ${timePart}` : dateLabel;
  }

  const weekMatch = text.match(/^(周[一二三四五六日天])/);
  if (weekMatch) {
    const map = { 周日: 0, 周天: 0, 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6 };
    const targetDay = map[weekMatch[1]];
    if (typeof targetDay === 'number') {
      const d = new Date(now);
      const currentDay = now.getDay();
      const diff = currentDay === targetDay ? 7 : (currentDay - targetDay + 7) % 7;
      d.setDate(d.getDate() - diff);
      const dateLabel = toDateLabel(d);
      return timePart ? `${dateLabel} ${timePart}` : dateLabel;
    }
  }

  const monthDayMatch = text.match(/(\d{1,2}月\d{1,2}日)/);
  if (monthDayMatch) {
    return timePart ? `${monthDayMatch[1]} ${timePart}` : monthDayMatch[1];
  }

  if (timePart) return timePart;

  return text;
};

const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const formatThreadTimeLabel = (rawValue) => {
  const text = String(rawValue || '').trim();
  if (!text) return '';
  if (/^(今天|昨天|周[一二三四五六日天])\b/.test(text) || /月\\d{1,2}日/.test(text)) return text;

  const parsed = Date.parse(text);
  if (Number.isNaN(parsed)) return text;

  const dt = new Date(parsed);
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const timePart = `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

  const sameYmd = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (sameYmd(dt, now)) return `今天 ${timePart}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameYmd(dt, yesterday)) return `昨天 ${timePart}`;

  const diffDays = Math.floor((now.getTime() - dt.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    const week = weekdayLabels[dt.getDay()] || '';
    return `${week} ${timePart}`;
  }

  return `${dt.getMonth() + 1}月${dt.getDate()}日 ${timePart}`;
};

const formatFullDate = (date) => {
  if (!(date instanceof Date)) return '';
  const label = weekdayLabels[date.getDay()] || '';
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${label}`;
};

const minutesToTimeLabel = (minutes) => {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const normalized = Math.max(0, minutes);
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const formatScheduleWindow = (date, startMinutes, endMinutes, timezoneLabel = 'GMT+08') => {
  if (!(date instanceof Date)) return '';
  const weekdayLabel = weekdayLabels[date.getDay()] || '';
  const startLabel = minutesToTimeLabel(startMinutes);
  const endLabel = minutesToTimeLabel(endMinutes);
  if (!startLabel || !endLabel) return '';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayLabel} ${startLabel}-${endLabel} (${timezoneLabel})`;
};

const toMiddayDate = (value = new Date()) => {
  const base = value instanceof Date ? new Date(value) : new Date(value);
  base.setHours(12, 0, 0, 0);
  return base;
};

const DEFAULT_SCHEDULE_WINDOW = '11月11日 周二 14:00-15:00 (GMT+8)';
const DEFAULT_MEETING_ID = '会议号：123 456 789';

const toYmdKey = (dateLike) => {
  if (!dateLike) return '';
  const d = toMiddayDate(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const availabilityBlocksToSlots = (blocks) => {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block) => {
      const startIndex = Number(block?.start);
      const endIndex = Number(block?.end);
      if (!Number.isFinite(startIndex) || !Number.isFinite(endIndex)) return null;
      const start = Math.max(0, Math.min(95, Math.floor(startIndex)));
      const end = Math.max(0, Math.min(95, Math.floor(endIndex)));
      const startMinutes = Math.min(start, end) * 15;
      const endMinutes = (Math.max(start, end) + 1) * 15;
      if (endMinutes <= startMinutes) return null;
      return { startMinutes, endMinutes };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMinutes - b.startMinutes);
};

const intersectSlots = (a = [], b = []) => {
  const result = [];
  let i = 0;
  let j = 0;
  const sortedA = [...a].sort((x, y) => x.startMinutes - y.startMinutes);
  const sortedB = [...b].sort((x, y) => x.startMinutes - y.startMinutes);

  while (i < sortedA.length && j < sortedB.length) {
    const slotA = sortedA[i];
    const slotB = sortedB[j];
    const start = Math.max(slotA.startMinutes, slotB.startMinutes);
    const end = Math.min(slotA.endMinutes, slotB.endMinutes);
    if (end > start) result.push({ startMinutes: start, endMinutes: end });

    if (slotA.endMinutes < slotB.endMinutes) i += 1;
    else j += 1;
  }

  return result;
};

const buildMockAvailability = (date, role) => {
  const day = date?.getDay?.() ?? 1;
  const isWeekend = day === 0 || day === 6;

  if (role === 'student') {
    return isWeekend
      ? [
        { startMinutes: 13 * 60, endMinutes: 16 * 60 },
        { startMinutes: 19 * 60, endMinutes: 21 * 60 },
      ]
      : [
        { startMinutes: 12 * 60, endMinutes: 13 * 60 + 30 },
        { startMinutes: 14 * 60, endMinutes: 15 * 60 + 30 },
        { startMinutes: 20 * 60, endMinutes: 21 * 60 + 30 },
      ];
  }

  return isWeekend
    ? [
      { startMinutes: 15 * 60, endMinutes: 17 * 60 + 30 },
      { startMinutes: 20 * 60, endMinutes: 21 * 60 },
    ]
    : [
      { startMinutes: 11 * 60 + 30, endMinutes: 12 * 60 + 30 },
      { startMinutes: 14 * 60 + 30, endMinutes: 17 * 60 },
      { startMinutes: 19 * 60, endMinutes: 20 * 60 + 30 },
    ];
};

function MessagesPage() {
  const location = useLocation();
  const isMentorView = useMemo(() => {
    return location.pathname.startsWith('/mentor');
  }, [location.pathname]);

  const homeHref = isMentorView ? '/mentor' : '/student';
  const menuAnchorRef = useRef(null);
  const messageBodyScrollRef = useRef(null);
  const scheduleCardSendTimeoutRef = useRef(null);
  const entryAnimatedThreadRef = useRef(null);
  const rescheduleScrollRef = useRef(null);
  const rescheduleInitialScrollSet = useRef(false);
  const rescheduleResizeRef = useRef(null);
  const [showStudentAuth, setShowStudentAuth] = useState(false);
  const [showMentorAuth, setShowMentorAuth] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return !!getAuthToken();
  });
  const [errorMessage, setErrorMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [appointmentBusyId, setAppointmentBusyId] = useState(null);
  const [decisionMenuForId, setDecisionMenuForId] = useState(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSourceId, setRescheduleSourceId] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState(() => toMiddayDate());
  const [rescheduleSelection, setRescheduleSelection] = useState(null);
  const [myAvailabilityStatus, setMyAvailabilityStatus] = useState('idle'); // idle | loading | loaded | error
  const [myAvailability, setMyAvailability] = useState(null);
  const [threads, setThreads] = useState([]);
  const [threadsStatus, setThreadsStatus] = useState('idle'); // idle | loading | loaded | error
  const [threadsError, setThreadsError] = useState('');

  useEffect(() => {
    const handler = (e) => {
      if (typeof e?.detail?.isLoggedIn !== 'undefined') {
        setIsLoggedIn(!!e.detail.isLoggedIn);
      } else {
        setIsLoggedIn(!!getAuthToken());
      }
    };
    window.addEventListener('auth:changed', handler);
    return () => window.removeEventListener('auth:changed', handler);
  }, []);

  useEffect(() => {
    if (isLoggedIn) {
      setErrorMessage('');
      return;
    }
    setErrorMessage('请登录后查看消息');
  }, [isLoggedIn]);

  useEffect(() => {
    if (isLoggedIn) return;
    setMyAvailabilityStatus('idle');
    setMyAvailability(null);
  }, [isLoggedIn]);

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn || !rescheduleOpen) return () => { alive = false; };

    setMyAvailabilityStatus('loading');
    api.get('/api/account/availability')
      .then((res) => {
        if (!alive) return;
        setMyAvailability(res?.data?.availability || null);
        setMyAvailabilityStatus('loaded');
      })
      .catch(() => {
        if (!alive) return;
        setMyAvailabilityStatus('error');
      });

    return () => { alive = false; };
  }, [isLoggedIn, rescheduleOpen]);

  useEffect(() => {
    if (rescheduleOpen) return;
    const resizeState = rescheduleResizeRef.current;
    if (resizeState) {
      document.body.style.userSelect = resizeState.previousUserSelect ?? '';
      document.body.classList.remove('reschedule-resizing');
      rescheduleResizeRef.current = null;
    }
    setRescheduleSelection(null);
    setRescheduleSourceId(null);
  }, [rescheduleOpen]);

  useEffect(() => {
    setRescheduleSelection(null);
  }, [rescheduleDate]);

  const hasThreads = threads.length > 0;

  useEffect(() => {
    let alive = true;
    if (!isLoggedIn) {
      setThreads([]);
      setThreadsStatus('idle');
      setThreadsError('');
      return () => { alive = false; };
    }

    setThreadsStatus('loading');
    setThreadsError('');
    api.get('/api/messages/threads')
      .then((res) => {
        if (!alive) return;
        const next = Array.isArray(res?.data?.threads) ? res.data.threads : [];
        setThreads(next);
        setThreadsStatus('loaded');
      })
      .catch((err) => {
        if (!alive) return;
        const msg = err?.response?.data?.error || err?.message || '加载会话失败，请稍后再试';
        setThreads([]);
        setThreadsStatus('error');
        setThreadsError(String(msg));
      });

    return () => { alive = false; };
  }, [isLoggedIn]);

  const [activeId, setActiveId] = useState(() => threads[0]?.id || null);
  const [openMoreId, setOpenMoreId] = useState(null);

  useEffect(() => {
    const target = location?.state?.threadId;
    const preferred = target && threads.some((t) => String(t?.id) === String(target)) ? String(target) : null;
    const keepActive = activeId && threads.some((t) => String(t?.id) === String(activeId)) ? activeId : null;
    setActiveId(preferred || keepActive || threads[0]?.id || null);
    setOpenMoreId(null);
  }, [activeId, location?.state?.threadId, threads]);

  useEffect(() => {
    if (!openMoreId) return undefined;

    const handleOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.message-more')) return;
      setOpenMoreId(null);
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }, [openMoreId]);

  const activeThread = threads.find((item) => item.id === activeId) || threads[0];
  const activeCounterpartDisplayName = useMemo(() => getThreadCounterpartDisplayName(activeThread), [activeThread]);
  const isMentorInThread = useMemo(() => getThreadMyRole(activeThread) === 'mentor', [activeThread]);
  const activeAvatarUrl = useMemo(() => {
    const url = typeof activeThread?.counterpartAvatarUrl === 'string' ? activeThread.counterpartAvatarUrl.trim() : '';
    return url;
  }, [activeThread]);
  const detailAvatarInitial = useMemo(() => {
    const name = activeCounterpartDisplayName || '';
    return name.trim().charAt(0) || '·';
  }, [activeCounterpartDisplayName]);
  const scheduleTitle = activeThread?.subject || '日程';
  const activeSchedule = activeThread?.schedule && typeof activeThread.schedule === 'object' ? activeThread.schedule : null;
  const scheduleWindow = (typeof activeSchedule?.window === 'string' && activeSchedule.window.trim())
    ? activeSchedule.window
    : DEFAULT_SCHEDULE_WINDOW;
  const meetingId = (typeof activeSchedule?.meetingId === 'string' && activeSchedule.meetingId.trim())
    ? activeSchedule.meetingId
    : DEFAULT_MEETING_ID;

  const [scheduleCards, setScheduleCards] = useState(() => buildScheduleCardsFromThread(activeThread));
  const [isScheduleCardSending, setIsScheduleCardSending] = useState(false);

  useEffect(() => () => {
    if (scheduleCardSendTimeoutRef.current) {
      clearTimeout(scheduleCardSendTimeoutRef.current);
      scheduleCardSendTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    setScheduleCards(buildScheduleCardsFromThread(activeThread));
  }, [activeThread]);

  useEffect(() => {
    const scrollEl = messageBodyScrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }, [activeThread?.id, scheduleCards]);

  useEffect(() => {
    setActionError('');
    setDecisionMenuForId(null);
    setRescheduleOpen(false);
    setRescheduleSourceId(null);
    setRescheduleDate(toMiddayDate());
    setIsScheduleCardSending(false);
    if (scheduleCardSendTimeoutRef.current) {
      clearTimeout(scheduleCardSendTimeoutRef.current);
      scheduleCardSendTimeoutRef.current = null;
    }
  }, [activeThread?.id]);

  useEffect(() => {
    const targetThreadId = location?.state?.threadId;
    const animateKey = location?.state?.animateKey;
    if (!targetThreadId) return;
    if (!activeThread?.id || String(activeThread.id) !== String(targetThreadId)) return;

    const dedupeKey = animateKey ? String(animateKey) : `thread:${String(targetThreadId)}`;
    if (entryAnimatedThreadRef.current === dedupeKey) return;
    entryAnimatedThreadRef.current = dedupeKey;

    setIsScheduleCardSending(true);
    if (scheduleCardSendTimeoutRef.current) clearTimeout(scheduleCardSendTimeoutRef.current);
    scheduleCardSendTimeoutRef.current = setTimeout(() => {
      setIsScheduleCardSending(false);
      scheduleCardSendTimeoutRef.current = null;
    }, 900);
  }, [activeThread?.id, location?.state?.animateKey, location?.state?.threadId]);

  const persistAppointmentDecision = async (appointmentId, status) => {
    if (!appointmentId || !status) return false;
    setActionError('');
    setAppointmentBusyId(String(appointmentId));
    try {
      await api.post(`/api/messages/appointments/${encodeURIComponent(String(appointmentId))}/decision`, { status });
      return true;
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '更新日程状态失败，请稍后再试';
      setActionError(String(msg));
      return false;
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleAppointmentDecision = async (appointmentId, status) => {
    if (!appointmentId || !status) return;
    setDecisionMenuForId(null);
    const ok = await persistAppointmentDecision(appointmentId, status);
    if (!ok) return;
    setScheduleCards((prev) => prev.map((card) => (String(card?.id) === String(appointmentId) ? { ...card, status } : card)));

    try {
      const res = await api.get('/api/messages/threads');
      const nextThreads = Array.isArray(res?.data?.threads) ? res.data.threads : [];
      setThreads(nextThreads);
      setThreadsStatus('loaded');
      setThreadsError('');
    } catch {}
  };

  const openRescheduleFor = (appointmentId) => {
    if (!appointmentId) return;
    setActionError('');
    setDecisionMenuForId(null);
    setRescheduleSourceId(String(appointmentId));
    setRescheduleOpen(true);
  };

  useEffect(() => {
    if (!decisionMenuForId) return undefined;

    const handleOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.schedule-decision-wrapper')) return;
      setDecisionMenuForId(null);
    };

    window.addEventListener('mousedown', handleOutside, true);
    window.addEventListener('touchstart', handleOutside, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside, true);
      window.removeEventListener('touchstart', handleOutside, true);
    };
  }, [decisionMenuForId]);

  useEffect(() => {
    if (!rescheduleOpen) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setRescheduleOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [rescheduleOpen]);

  const timelineConfig = useMemo(() => ({
    startHour: 0,
    endHour: 24,
    rowHeight: 56,
    timeColumnWidth: 74,
    bodyPaddingTop: 0,
    timezoneLabel: 'GMT+08',
  }), []);

  const handleRescheduleTimelineClick = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const rawMinutes = timelineConfig.startHour * 60 + offsetY / pixelsPerMinute;
    const snappedStart = Math.round(rawMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxStart = timelineConfig.endHour * 60 - 60;
    const startMinutes = Math.max(minStart, Math.min(maxStart, snappedStart));
    setRescheduleSelection({ startMinutes, endMinutes: startMinutes + 60 });
  };

  const clearRescheduleResizeState = () => {
    const state = rescheduleResizeRef.current;
    if (!state) return;
    document.body.style.userSelect = state.previousUserSelect ?? '';
    document.body.classList.remove('reschedule-resizing');
    rescheduleResizeRef.current = null;
  };

  const handleSelectionResizePointerMove = (event) => {
    const state = rescheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;

    event.preventDefault();
    const pixelsPerMinute = timelineConfig.rowHeight / 60;
    const deltaMinutes = (event.clientY - state.startY) / pixelsPerMinute;
    const snappedDelta = Math.round(deltaMinutes / 15) * 15;
    const minStart = timelineConfig.startHour * 60;
    const maxEnd = timelineConfig.endHour * 60;
    const minDuration = 15;

    if (state.edge === 'start') {
      const startMinutes = Math.max(
        minStart,
        Math.min(state.endMinutes - minDuration, state.startMinutes + snappedDelta),
      );
      setRescheduleSelection({ startMinutes, endMinutes: state.endMinutes });
      return;
    }

    const endMinutes = Math.max(
      state.startMinutes + minDuration,
      Math.min(maxEnd, state.endMinutes + snappedDelta),
    );
    setRescheduleSelection({ startMinutes: state.startMinutes, endMinutes });
  };

  const handleSelectionResizePointerUp = (event) => {
    const state = rescheduleResizeRef.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    clearRescheduleResizeState();
  };

  const handleSelectionResizePointerDown = (edge) => (event) => {
    if (!rescheduleSelection) return;
    event.preventDefault();
    event.stopPropagation();

    clearRescheduleResizeState();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}

    rescheduleResizeRef.current = {
      edge,
      pointerId: event.pointerId,
      startY: event.clientY,
      startMinutes: rescheduleSelection.startMinutes,
      endMinutes: rescheduleSelection.endMinutes,
      previousUserSelect: document.body.style.userSelect,
    };
    document.body.style.userSelect = 'none';
    document.body.classList.add('reschedule-resizing');
  };

  const displayHours = useMemo(
    () => Array.from({ length: timelineConfig.endHour - timelineConfig.startHour }, (_, index) => timelineConfig.startHour + index),
    [timelineConfig.endHour, timelineConfig.startHour],
  );

  const counterpartDisplayName = useMemo(() => {
    return activeCounterpartDisplayName || '';
  }, [activeCounterpartDisplayName]);

  const participantLabels = useMemo(() => {
    return {
      left: '我',
      right: counterpartDisplayName,
    };
  }, [counterpartDisplayName]);

  const myAvailabilitySlots = useMemo(() => {
    if (myAvailability && typeof myAvailability === 'object') {
      const key = toYmdKey(rescheduleDate);
      const blocks = myAvailability.daySelections?.[key];
      return availabilityBlocksToSlots(blocks);
    }
    if (myAvailabilityStatus === 'idle' || myAvailabilityStatus === 'loading') return null;
    return [];
  }, [myAvailability, myAvailabilityStatus, rescheduleDate]);

  const availability = useMemo(() => {
    const mySlots = Array.isArray(myAvailabilitySlots) ? myAvailabilitySlots : [];
    const counterpartSlots = buildMockAvailability(rescheduleDate, isMentorInThread ? 'student' : 'mentor');
    const studentSlots = isMentorInThread ? counterpartSlots : mySlots;
    const mentorSlots = isMentorInThread ? mySlots : counterpartSlots;
    return {
      studentSlots,
      mentorSlots,
      commonSlots: intersectSlots(studentSlots, mentorSlots),
    };
  }, [isMentorInThread, myAvailabilitySlots, rescheduleDate]);

  const shiftRescheduleDate = (deltaDays) => {
    setRescheduleDate((prev) => {
      const today = toMiddayDate();
      const next = toMiddayDate(prev);
      next.setDate(next.getDate() + deltaDays);
      return next < today ? today : next;
    });
  };

  const handleRescheduleSend = async () => {
    if (!rescheduleSelection) return;
    if (!activeThread?.id) return;
    const nextWindow = formatScheduleWindow(
      rescheduleDate,
      rescheduleSelection.startMinutes,
      rescheduleSelection.endMinutes,
      timelineConfig.timezoneLabel,
    );
    if (!nextWindow) return;

    setIsScheduleCardSending(true);
    if (scheduleCardSendTimeoutRef.current) clearTimeout(scheduleCardSendTimeoutRef.current);
    scheduleCardSendTimeoutRef.current = setTimeout(() => {
      setIsScheduleCardSending(false);
      scheduleCardSendTimeoutRef.current = null;
    }, 900);

    const sourceAppointmentId = rescheduleSourceId;
    const sourceCard =
      (sourceAppointmentId ? scheduleCards.find((card) => String(card?.id) === String(sourceAppointmentId)) : null)
      || scheduleCards.find((card) => Boolean(card?.__primary))
      || null;

    setScheduleCards((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return prev;
      const primaryIndex = prev.findIndex((item) => Boolean(item?.__primary));
      if (primaryIndex < 0) return prev;
      const primary = prev[primaryIndex];
      const rest = prev.filter((_, index) => index !== primaryIndex);

      const primaryDirection = primary?.direction === 'outgoing' ? 'outgoing' : 'incoming';
      const primaryStatusKey = normalizeScheduleStatus(primary?.status);
      const shouldUpdateExistingPending = primaryDirection === 'outgoing' && primaryStatusKey === 'pending';

      const historyEntry = {
        ...primary,
        __primary: false,
        __pendingReschedule: false,
        readOnly: true,
        __key: `history-${Date.now()}`,
      };

      const updatedPrimary = {
        ...primary,
        __pendingReschedule: true,
        direction: 'outgoing',
        status: 'pending',
        window: nextWindow,
        __primary: true,
      };

      if (shouldUpdateExistingPending) {
        return [...rest, updatedPrimary];
      }

      return [...rest, historyEntry, updatedPrimary];
    });

    try {
      if (sourceAppointmentId && sourceCard?.direction !== 'outgoing') {
        // Mark the original proposal as "rescheduling" so both parties see the state.
        await persistAppointmentDecision(sourceAppointmentId, 'rescheduling');
      }

      const courseDirectionId = String(sourceCard?.courseDirectionId || activeThread?.courseDirectionId || '');
      const courseTypeId = String(sourceCard?.courseTypeId || activeThread?.courseTypeId || '');
      const meetingIdText = String(sourceCard?.meetingId || meetingId || '');

      await api.post(`/api/messages/threads/${encodeURIComponent(String(activeThread.id))}/appointments`, {
        windowText: nextWindow,
        meetingId: meetingIdText,
        courseDirectionId,
        courseTypeId,
      });

      const res = await api.get('/api/messages/threads');
      const nextThreads = Array.isArray(res?.data?.threads) ? res.data.threads : [];
      setThreads(nextThreads);
      setThreadsStatus('loaded');
      setThreadsError('');
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || '发送修改时间失败，请稍后再试';
      setActionError(String(msg));
    } finally {
      setRescheduleOpen(false);
      setRescheduleSourceId(null);
    }
  };

  const columns = useMemo(() => {
    const mySlots = isMentorInThread ? availability.mentorSlots : availability.studentSlots;
    const counterpartSlots = isMentorInThread ? availability.studentSlots : availability.mentorSlots;
    return { mySlots, counterpartSlots };
  }, [availability.mentorSlots, availability.studentSlots, isMentorInThread]);

  const rescheduleMinDate = toMiddayDate();
  const isReschedulePrevDisabled = toMiddayDate(rescheduleDate).getTime() <= rescheduleMinDate.getTime();

  useEffect(() => {
    if (!rescheduleOpen) {
      rescheduleInitialScrollSet.current = false;
      return;
    }
    if (rescheduleInitialScrollSet.current) return;

    const scrollEl = rescheduleScrollRef.current;
    if (!scrollEl) return;

    rescheduleInitialScrollSet.current = true;
    const targetMinutes = 11 * 60;
    const top = (targetMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60);
    scrollEl.scrollTop = Math.max(0, top);
  }, [rescheduleOpen, timelineConfig.rowHeight, timelineConfig.startHour]);

  return (
    <div className="messages-page">
      <div className="container">
        <header className="messages-header">
          <BrandMark className="nav-logo-text" to={homeHref} />
          <button
            type="button"
            className="icon-circle messages-menu"
            aria-label="更多菜单"
            ref={menuAnchorRef}
            onClick={() => (isMentorView ? setShowMentorAuth(true) : setShowStudentAuth(true))}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="5" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="5" y1="16" x2="20" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <section className="messages-hero">
          <h1>消息</h1>
        </section>

        {(errorMessage || threadsError || actionError) && (
          <div className="messages-alert">{errorMessage || threadsError || actionError}</div>
        )}

        {isLoggedIn && (
        <section className="messages-shell" aria-label="消息列表与详情">
          <div className="messages-list-pane">
            <div className="messages-list-title">
              <div>
                <div className="messages-title-label">最近</div>
                <div className="messages-title-sub">
                  会话
                </div>
              </div>
              <div className="messages-pill">{threads.length} 个会话</div>
            </div>
            <div className="messages-list">
              {threads.length === 0
                ? null
                : threads.map((thread) => {
                    const threadCounterpartDisplayName = getThreadCounterpartDisplayName(thread);
                    const initial = threadCounterpartDisplayName.trim().charAt(0) || '·';
                    const avatarUrl = typeof thread?.counterpartAvatarUrl === 'string' ? thread.counterpartAvatarUrl.trim() : '';
                    const isActive = thread.id === activeThread?.id;
                    const timeLabel = formatThreadTimeLabel(thread.time || '');
                    const timeParts = timeLabel.split(/\s+/).filter(Boolean);
                    const displayDate = (timeParts[0] === '今天' && timeParts[1]) ? timeParts[1] : (timeParts[0] || timeLabel);

                    const hasCourseMeta =
                      Boolean(thread?.courseDirectionId || thread?.courseTypeId) ||
                      Boolean(thread?.schedule?.courseDirectionId || thread?.schedule?.courseTypeId);
                    const listTitleParts = hasCourseMeta ? getCourseTitleParts(thread, thread?.schedule) : null;
                    const listSubtitle = listTitleParts
                      ? `${listTitleParts.courseName} - ${listTitleParts.courseType}`
                      : (thread.subject || '');
                    return (
                      <button
                        key={thread.id}
                        type="button"
                        className={`message-item ${isActive ? 'is-active' : ''} ${openMoreId === thread.id ? 'is-menu-open' : ''}`}
                        onClick={() => {
                          setActiveId(thread.id);
                          setOpenMoreId(null);
                        }}
                        aria-pressed={isActive}
                      >
                          <div className="message-item-shell">
                            <div className="message-avatar" aria-hidden="true">
                              <span className="message-avatar-fallback">{initial}</span>
                              {avatarUrl ? (
                                <img
                                  className="message-avatar-img"
                                  src={avatarUrl}
                                  alt=""
                                  loading="lazy"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                  }}
                                />
                              ) : null}
                            </div>
                            <div className="message-content">
                              <div className="message-name">{threadCounterpartDisplayName}</div>
                              <div className="message-subject">{listSubtitle}</div>
                            </div>
                          <div className="message-meta-col">
                            <div className="message-time">{displayDate}</div>
                            <div
                              className="message-more"
                              aria-label="更多操作"
                              role="presentation"
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMoreId((prev) => (prev === thread.id ? null : thread.id));
                              }}
                            >
                              <span />
                              <span />
                              <span />
                              {openMoreId === thread.id && (
                                <div className="message-more-menu" role="menu">
                                  <button
                                    type="button"
                                    className="message-more-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMoreId(null);
                                    }}
                                  >
                                    <span className="message-more-icon" aria-hidden="true">
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path
                                          d="M12 4.5l1.88 3.81 4.2.61-3.04 2.96.72 4.19L12 14.97l-3.76 1.98.72-4.19-3.04-2.96 4.2-.61L12 4.5z"
                                          fill="currentColor"
                                        />
                                      </svg>
                                    </span>
                                    加星标
                                  </button>
                                  <button
                                    type="button"
                                    className="message-more-item"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpenMoreId(null);
                                    }}
                                  >
                                    <span className="message-more-icon" aria-hidden="true">
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                        <path
                                          d="M5.5 7.5h13v11a1 1 0 01-1 1h-11a1 1 0 01-1-1v-11z"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinejoin="round"
                                        />
                                        <path
                                          d="M9 7.5V6.2c0-.39.31-.7.7-.7h4.6c.39 0 .7.31.7.7v1.3"
                                          stroke="currentColor"
                                          strokeWidth="1.4"
                                          strokeLinecap="round"
                                        />
                                        <path d="M8 11.5h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                                      </svg>
                                    </span>
                                    归档
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
            </div>
          </div>

          <div className="messages-divider" aria-hidden="true" />

          <div className="messages-detail-pane">
            {hasThreads ? (activeThread ? (
              <>
                <div className="message-detail-head">
                  <div className="message-detail-identity">
                    <div className="message-detail-avatar" aria-hidden="true">
                      <span className="message-avatar-fallback">{detailAvatarInitial}</span>
                      {activeAvatarUrl ? (
                        <img
                          className="message-avatar-img"
                          src={activeAvatarUrl}
                          alt=""
                          loading="lazy"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                    </div>
                    <div className="message-detail-name">{activeCounterpartDisplayName}</div>
                  </div>
                </div>

                <div className="message-detail-body" ref={messageBodyScrollRef}>
                  {scheduleCards.map((scheduleCard) => {
                    const cardDirection = scheduleCard?.direction === 'outgoing' ? 'outgoing' : 'incoming';
                    const isOutgoing = cardDirection === 'outgoing';
                    const isPrimary = Boolean(scheduleCard?.__primary);
                    const cardHoverTime = formatHoverTime(scheduleCard?.time || activeThread?.time || '');

                    const windowText = (typeof scheduleCard?.window === 'string' && scheduleCard.window.trim())
                      ? scheduleCard.window
                      : (isPrimary ? scheduleWindow : DEFAULT_SCHEDULE_WINDOW);
                    const meetingText = (typeof scheduleCard?.meetingId === 'string' && scheduleCard.meetingId.trim())
                      ? scheduleCard.meetingId
                      : (isPrimary ? meetingId : DEFAULT_MEETING_ID);

                    const statusKey = normalizeScheduleStatus(scheduleCard?.status);
                    const statusMeta = SCHEDULE_STATUS_META[statusKey] || SCHEDULE_STATUS_META.pending;

                    const showActions = !isOutgoing && isPrimary;
                    const isActionDisabled = false;
                    const isSendingCard = isScheduleCardSending && isPrimary && isOutgoing && statusKey === 'pending';
                    const statusClassName =
                      statusMeta.tone === 'accept'
                        ? 'accept-btn'
                        : statusMeta.tone === 'reject'
                          ? 'reject-btn'
                          : statusMeta.tone === 'reschedule'
                            ? 'reschedule-btn'
                            : 'pending-btn';

                    const titleParts = getCourseTitleParts(activeThread, scheduleCard);

                    const decisionPopoverActions = (() => {
                      if (statusKey === 'accepted') {
                        return [
                          { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
                          { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
                        ];
                      }
                      if (statusKey === 'rejected') {
                        return [
                          { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
                          { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
                        ];
                      }
                      if (statusKey === 'rescheduling') {
                        return [
                          { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
                          { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
                        ];
                      }
                      return [
                        { key: 'accept', label: '接受', value: 'accepted', tone: 'accept' },
                        { key: 'reject', label: '拒绝', value: 'rejected', tone: 'reject' },
                        { key: 'reschedule', label: '修改时间', value: 'rescheduling', tone: 'reschedule' },
                      ];
                    })();

                    return (
                      <div
                        key={scheduleCard.__key || scheduleCard.id || windowText}
                        className={`schedule-row ${isOutgoing ? 'is-outgoing' : ''}`}
                      >
                        {!isOutgoing && (
                          <div className="message-detail-avatar schedule-avatar" aria-hidden="true">
                            <span className="message-avatar-fallback">{detailAvatarInitial}</span>
                            {activeAvatarUrl ? (
                              <img
                                className="message-avatar-img"
                                src={activeAvatarUrl}
                                alt=""
                                loading="lazy"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            ) : null}
                          </div>
                        )}
                        <div className={`schedule-card ${isSendingCard ? 'is-sending' : ''}`}>
                          <div className="schedule-card-top">
                            <div className="schedule-card-top-row">
                              <div className="schedule-card-icon" aria-hidden="true">
                                <FiCalendar size={18} />
                              </div>
                              <div className="schedule-card-title-text">日程</div>
                            </div>
                            <div className="schedule-card-title">
                              <span className="schedule-card-title-piece">
                                <span className="schedule-card-title-icon" aria-hidden="true">
                                  {titleParts.DirectionIcon ? <titleParts.DirectionIcon size={14} /> : null}
                                </span>
                                <span className="schedule-card-title-main">{titleParts.courseName || scheduleTitle}</span>
                              </span>
                              {titleParts.courseType ? (
                                <>
                                  <span className="schedule-card-title-sep" aria-hidden="true">-</span>
                                  <span className="schedule-card-title-piece">
                                    <span className="schedule-card-title-icon" aria-hidden="true">
                                      {titleParts.CourseTypeIcon ? <titleParts.CourseTypeIcon size={14} /> : null}
                                    </span>
                                    <span className="schedule-card-title-sub">{titleParts.courseType}</span>
                                  </span>
                                </>
                              ) : null}
                            </div>
                          </div>

                          <div className="schedule-time-row">
                            <FiClock size={16} aria-hidden="true" />
                            <span>{windowText}</span>
                          </div>

                          <div className="schedule-link-row">
                            <FiVideo size={16} aria-hidden="true" />
                            <a className="schedule-link" href="https://zoom.us" target="_blank" rel="noreferrer">加入Zoom视频会议</a>
                          </div>

                          <div className="schedule-meeting-id">{meetingText}</div>

                          <div className="schedule-card-bottom">
                            {showActions ? (
                              <div className="schedule-actions">
                                {statusKey === 'pending' ? (
                                  <>
                                    <button
                                      type="button"
                                      className="schedule-btn accept-btn"
                                      onClick={() => handleAppointmentDecision(scheduleCard.id, 'accepted')}
                                      disabled={isActionDisabled || String(appointmentBusyId) === String(scheduleCard.id)}
                                    >
                                      <span className="schedule-btn-icon check" aria-hidden="true" />
                                      接受
                                    </button>
                                    <button
                                      type="button"
                                      className="schedule-btn reject-btn"
                                      onClick={() => handleAppointmentDecision(scheduleCard.id, 'rejected')}
                                      disabled={isActionDisabled || String(appointmentBusyId) === String(scheduleCard.id)}
                                    >
                                      <span className="schedule-btn-icon minus" aria-hidden="true" />
                                      拒绝
                                    </button>
                                    <button
                                      type="button"
                                      className="schedule-btn reschedule-btn"
                                      onClick={() => openRescheduleFor(scheduleCard.id)}
                                      disabled={isActionDisabled || String(appointmentBusyId) === String(scheduleCard.id)}
                                    >
                                      <span className="schedule-btn-icon reschedule" aria-hidden="true" />
                                      修改时间
                                    </button>
                                  </>
                                ) : (
                                  <div
                                    className={`schedule-decision-wrapper ${String(decisionMenuForId) === String(scheduleCard.id) ? 'menu-open' : ''}`}
                                    onMouseEnter={() => setDecisionMenuForId(String(scheduleCard.id))}
                                    onMouseLeave={() => setDecisionMenuForId(null)}
                                  >
                                    <button
                                      type="button"
                                      className={`schedule-btn merged ${statusClassName}`}
                                      onClick={() => setDecisionMenuForId((prev) => (String(prev) === String(scheduleCard.id) ? null : String(scheduleCard.id)))}
                                      disabled={isActionDisabled || String(appointmentBusyId) === String(scheduleCard.id)}
                                    >
                                      {statusKey === 'accepted' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                                      {statusKey === 'rejected' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                                      {statusKey === 'rescheduling' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                                      {statusMeta.label}
                                      <span
                                        className={`schedule-decision-arrow ${String(decisionMenuForId) === String(scheduleCard.id) ? 'open' : ''}`}
                                        aria-hidden="true"
                                      />
                                    </button>
                                    {String(decisionMenuForId) === String(scheduleCard.id) && (
                                      <div className="schedule-decision-popover" role="menu">
                                        <div className="schedule-decision-popover-title">修改日程状态为</div>
                                        <div className={`schedule-decision-popover-actions ${decisionPopoverActions.length === 1 ? 'single-action' : ''}`}>
                                          {decisionPopoverActions.map((action) => (
                                            <button
                                              key={action.key}
                                              type="button"
                                              className={`schedule-btn small inline-action ${
                                                action.tone === 'accept'
                                                  ? 'accept-btn'
                                                  : action.tone === 'reject'
                                                    ? 'reject-btn'
                                                    : 'reschedule-btn'
                                              }`}
                                              onClick={() => {
                                                if (action.value === 'rescheduling') openRescheduleFor(scheduleCard.id);
                                                else handleAppointmentDecision(scheduleCard.id, action.value);
                                              }}
                                              disabled={isActionDisabled || String(appointmentBusyId) === String(scheduleCard.id)}
                                            >
                                              {action.tone === 'accept' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                                              {action.tone === 'reject' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                                              {action.tone === 'reschedule' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                                              {action.label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="schedule-actions">
                                <button
                                  type="button"
                                  className={
                                    statusKey === 'pending'
                                      ? `schedule-btn status-btn ${statusClassName}`
                                      : `schedule-btn merged ${statusClassName}`
                                  }
                                  disabled
                                  aria-label={`日程状态：${statusMeta.label}`}
                                >
                                  {isSendingCard && <span className="schedule-btn-spinner" aria-hidden="true" />}
                                  {statusKey === 'accepted' && <span className="schedule-btn-icon check" aria-hidden="true" />}
                                  {statusKey === 'rejected' && <span className="schedule-btn-icon minus" aria-hidden="true" />}
                                  {statusKey === 'rescheduling' && <span className="schedule-btn-icon reschedule" aria-hidden="true" />}
                                  {statusMeta.label}
                                </button>
                              </div>
                            )}
                          </div>

                          {cardHoverTime && (
                            <div className="schedule-hover-time" aria-hidden="true">
                              {cardHoverTime}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="messages-empty messages-empty-center">选择左侧的一条会话查看详情</div>
            )) : (
              <div className="messages-empty messages-empty-center">{threadsStatus === 'loading' ? '加载中…' : '暂无会话'}</div>
            )}
          </div>
        </section>
        )}
      </div>

      {showStudentAuth && (
        <StudentAuthModal
          onClose={() => setShowStudentAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          isLoggedIn={isLoggedIn}
          align="right"
          alignOffset={23}
        />
      )}

      {showMentorAuth && (
        <MentorAuthModal
          onClose={() => setShowMentorAuth(false)}
          anchorRef={menuAnchorRef}
          leftAlignRef={menuAnchorRef}
          forceLogin={false}
          align="right"
          alignOffset={23}
        />
      )}

      {rescheduleOpen && (
        <div
          className="reschedule-overlay"
          role="presentation"
          onClick={() => setRescheduleOpen(false)}
        >
          <aside
            className="reschedule-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="修改时间"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="reschedule-header">
              <div className="reschedule-header-left">
                <button
                  type="button"
                  className="reschedule-header-btn icon"
                  aria-label="前一天"
                  disabled={isReschedulePrevDisabled}
                  onClick={() => shiftRescheduleDate(-1)}
                >
                  <FiChevronLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="reschedule-header-btn icon"
                  aria-label="后一天"
                  onClick={() => shiftRescheduleDate(1)}
                >
                  <FiChevronRight size={18} aria-hidden="true" />
                </button>
                <div className="reschedule-date-title">{formatFullDate(rescheduleDate)}</div>
              </div>
              <button
                type="button"
                className="reschedule-header-btn icon close"
                aria-label="关闭"
                onClick={() => setRescheduleOpen(false)}
              >
                <FiX size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="reschedule-timeline">
              <div
                className="reschedule-timeline-head"
                style={{ '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px` }}
              >
                <div className="reschedule-tz">{timelineConfig.timezoneLabel}</div>
                <div className="reschedule-person">{participantLabels.left}</div>
                <div className="reschedule-person">{participantLabels.right}</div>
              </div>

              <div className="reschedule-timeline-scroll" ref={rescheduleScrollRef}>
                <div
                  className="reschedule-timeline-body"
                  style={{
                    '--rs-row-height': `${timelineConfig.rowHeight}px`,
                    '--rs-time-col-width': `${timelineConfig.timeColumnWidth}px`,
                    '--rs-body-padding-top': `${timelineConfig.bodyPaddingTop}px`,
                    '--rs-timeline-height': `${timelineConfig.rowHeight * (timelineConfig.endHour - timelineConfig.startHour)}px`,
                  }}
                >
                  <div
                    className="reschedule-time-col"
                    aria-hidden="true"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {displayHours.map((hour) => (
                      <div key={hour} className="reschedule-time-label">
                        {hour === 0 ? null : (
                          <span className="reschedule-time-text">{`${String(hour).padStart(2, '0')}:00`}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div
                    className="reschedule-column left"
                    aria-label="我的空闲时间"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {columns.mySlots.map((slot, index) => (
                      <div
                        key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                        className="reschedule-slot availability"
                        style={{
                          top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                      </div>
                    ))}
                  </div>

                  <div
                    className="reschedule-column right"
                    aria-label="对方空闲时间"
                    onClick={handleRescheduleTimelineClick}
                  >
                    {columns.counterpartSlots.map((slot, index) => (
                      <div
                        key={`${slot.startMinutes}-${slot.endMinutes}-${index}`}
                        className="reschedule-slot availability"
                        style={{
                          top: `${(slot.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(slot.endMinutes - slot.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        {minutesToTimeLabel(slot.startMinutes)} - {minutesToTimeLabel(slot.endMinutes)}
                      </div>
                    ))}
                  </div>

                  {rescheduleSelection && (
                    <div className="reschedule-selection-layer" aria-hidden="true">
                      <div
                        className="reschedule-slot selection"
                        style={{
                          top: `${(rescheduleSelection.startMinutes - timelineConfig.startHour * 60) * (timelineConfig.rowHeight / 60)}px`,
                          height: `${(rescheduleSelection.endMinutes - rescheduleSelection.startMinutes) * (timelineConfig.rowHeight / 60)}px`,
                        }}
                      >
                        <div
                          className="reschedule-selection-handle top"
                          role="presentation"
                          onPointerDown={handleSelectionResizePointerDown('start')}
                          onPointerMove={handleSelectionResizePointerMove}
                          onPointerUp={handleSelectionResizePointerUp}
                          onPointerCancel={handleSelectionResizePointerUp}
                        />
                        <div
                          className="reschedule-selection-handle bottom"
                          role="presentation"
                          onPointerDown={handleSelectionResizePointerDown('end')}
                          onPointerMove={handleSelectionResizePointerMove}
                          onPointerUp={handleSelectionResizePointerUp}
                          onPointerCancel={handleSelectionResizePointerUp}
                        />
                        {minutesToTimeLabel(rescheduleSelection.startMinutes)} - {minutesToTimeLabel(rescheduleSelection.endMinutes)}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>

            <div className="reschedule-footer">
              <button
                type="button"
                className="reschedule-send-btn"
                onClick={handleRescheduleSend}
                disabled={!rescheduleSelection}
              >
                发送预约
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default MessagesPage;
