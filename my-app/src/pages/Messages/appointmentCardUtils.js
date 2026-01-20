import {
  COURSE_TYPE_ICON_MAP,
  COURSE_TYPE_ID_TO_LABEL,
  DIRECTION_ICON_MAP,
  DIRECTION_ID_TO_LABEL,
} from '../../constants/courseMappings';

export const SCHEDULE_STATUS_META = {
  pending: { label: '待确认', tone: 'pending' },
  accepted: { label: '已接受', tone: 'accept' },
  rejected: { label: '已拒绝', tone: 'reject' },
  rescheduling: { label: '修改时间中', tone: 'reschedule' },
};

export const normalizeScheduleStatus = (value) => {
  const key = typeof value === 'string' ? value.trim() : '';
  if (key in SCHEDULE_STATUS_META) return key;
  return 'pending';
};

export const getCourseTitleParts = (thread, scheduleCard) => {
  const directionId = scheduleCard?.courseDirectionId || thread?.courseDirectionId || 'others';
  const courseTypeId = scheduleCard?.courseTypeId || thread?.courseTypeId || 'others';

  const courseName =
    DIRECTION_ID_TO_LABEL[directionId] || DIRECTION_ID_TO_LABEL.others || '其它课程方向';
  const courseType =
    COURSE_TYPE_ID_TO_LABEL[courseTypeId] || COURSE_TYPE_ID_TO_LABEL.others || '其它类型';
  const DirectionIcon = DIRECTION_ICON_MAP[directionId] || DIRECTION_ICON_MAP.others || null;
  const CourseTypeIcon = COURSE_TYPE_ICON_MAP[courseTypeId] || COURSE_TYPE_ICON_MAP.others || null;

  return { courseName, courseType, directionId, courseTypeId, DirectionIcon, CourseTypeIcon };
};

