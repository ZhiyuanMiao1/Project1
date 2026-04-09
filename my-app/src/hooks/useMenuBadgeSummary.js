import useCourseAlertSummary from './useCourseAlertSummary';
import useMessageUnreadSummary from './useMessageUnreadSummary';

const hasView = (views, expected) => {
  if (Array.isArray(views)) {
    return views.some((view) => String(view || '').trim().toLowerCase() === expected);
  }
  return String(views || '').trim().toLowerCase() === expected;
};

export default function useMenuBadgeSummary({ enabled = true, courseViews = [] } = {}) {
  const { totalUnreadCount: messageUnreadCount } = useMessageUnreadSummary(enabled);
  const wantsStudentCourses = hasView(courseViews, 'student');
  const wantsMentorCourses = hasView(courseViews, 'mentor');
  const { newCourseCount: studentCourseCount } = useCourseAlertSummary({
    enabled: enabled && wantsStudentCourses,
    view: 'student',
  });
  const { newCourseCount: mentorCourseCount } = useCourseAlertSummary({
    enabled: enabled && wantsMentorCourses,
    view: 'mentor',
  });

  const totalCourseCount = studentCourseCount + mentorCourseCount;

  return {
    messageUnreadCount,
    studentCourseCount,
    mentorCourseCount,
    totalCourseCount,
    totalBadgeCount: messageUnreadCount + totalCourseCount,
  };
}
