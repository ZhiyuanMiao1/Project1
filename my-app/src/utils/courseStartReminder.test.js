import {
  formatCourseReminderClock,
  getActiveCourseReminder,
  getClassroomCourseIdFromPath,
  isClassroomPathForCourse,
} from './courseStartReminder';

describe('courseStartReminder', () => {
  const startsAt = '2026-04-20T10:00:00.000Z';
  const course = {
    id: '42',
    startsAt,
    durationHours: 1,
    status: 'scheduled',
  };

  test('activates from five minutes before start until course end', () => {
    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T09:54:59.000Z'),
    })).toBeNull();

    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T09:55:00.000Z'),
    })?.id).toBe('42');

    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T10:59:59.000Z'),
    })?.id).toBe('42');

    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T11:00:00.000Z'),
    })).toBeNull();
  });

  test('suppresses reminders for opened or handled classrooms', () => {
    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T09:58:00.000Z'),
      pathname: '/classroom/42',
    })).toBeNull();

    expect(getActiveCourseReminder({
      courses: [course],
      now: Date.parse('2026-04-20T09:58:00.000Z'),
      handledCourseIds: new Set(['42']),
    })).toBeNull();
  });

  test('parses classroom course ids from paths', () => {
    expect(getClassroomCourseIdFromPath('/classroom/42')).toBe('42');
    expect(isClassroomPathForCourse('/classroom/42', '42')).toBe(true);
    expect(isClassroomPathForCourse('/classroom/42', '43')).toBe(false);
  });

  test('formats numeric reminder clocks', () => {
    expect(formatCourseReminderClock(4 * 60 * 1000 + 59000)).toBe('04:59');
    expect(formatCourseReminderClock(65 * 60 * 1000 + 3000)).toBe('1:05:03');
  });
});
