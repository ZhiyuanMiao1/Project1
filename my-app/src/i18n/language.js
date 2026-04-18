import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const LANGUAGE_STORAGE_KEY = 'mentory.systemLanguage.v1';

export const LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

const SUPPORTED_LANGUAGE_VALUES = new Set(LANGUAGE_OPTIONS.map((item) => item.value));

const en = {
  'app.route.mentorProfile': 'Mentor Profile',
  'app.route.courseRequest': 'Post a Course Request',
  'app.route.favorites': 'Favorites',
  'app.route.favoriteCollection': 'Favorite Collection',
  'app.route.recentVisits': 'Recent Visits',
  'app.route.courses': 'Courses',
  'app.route.messages': 'Messages',
  'app.route.wallet': 'Wallet',
  'app.route.settings': 'Settings',
  'app.route.help': 'Help Center',
  'app.route.profileEditor': 'Edit Profile Card',
  'app.route.mentorCourses': 'Mentor Courses',
  'app.route.requestDetail': 'Course Request Detail',
  'app.route.classroom': 'Classroom',

  'common.loading': 'Loading...',
  'common.loadingEllipsis': 'Loading...',
  'common.notProvided': 'Not provided',
  'common.notActivated': 'Not activated',
  'common.loginFirst': 'Please log in first',
  'common.loadFailed': 'Failed to load',
  'common.unset': 'Not set',
  'common.save': 'Save',
  'common.saving': 'Saving...',
  'common.edit': 'Edit',
  'common.change': 'Change',
  'common.cancel': 'Cancel',
  'common.modify': 'Change',
  'common.optional': 'Optional',
  'common.search': 'Search',
  'common.uploading': 'Uploading...',
  'common.uploadFailed': 'Upload failed. Please try again later.',
  'common.avatarTooLarge': 'Avatar image must be 5 MB or smaller',
  'common.chooseImageFile': 'Please choose an image file',
  'common.incompleteSignature': 'Upload signature response is incomplete',
  'common.ossCorsUploadFailed': 'Upload failed. Please check the OSS CORS configuration.',
  'common.avatarUpdated': 'Avatar updated',
  'common.saveFailed': 'Save failed. Please try again later.',
  'common.pendingReminders': 'Pending reminders',
  'common.menuMore': 'More menu',
  'common.openMentor': 'Activate',
  'auth.sessionExpired': 'Session expired. Please log in again.',
  'lessonHours.respondFailed': 'Failed to process lesson-hour confirmation. Please try again later.',
  'lessonHours.disputeInvalid': 'Enter the correct hours in 0.25-hour increments.',
  'lessonHours.disputeTitle': 'Enter the correct lesson hours',

  'nav.students': 'Students',
  'nav.mentors': 'Mentors',
  'nav.publishCourseRequest': 'Post Course Request',
  'nav.editProfileCard': 'Edit Profile Card',
  'nav.timeZone': 'Time zone',
  'nav.chooseMentorTimeZone': 'Choose mentor time zone',
  'nav.chooseStudentTimeZone': 'Choose student time zone',
  'nav.mentorSpecialty': 'Mentor specialty',
  'nav.chooseMentorSpecialty': 'Choose mentor specialty',
  'nav.courseType': 'Course type',
  'nav.chooseCourseType': 'Choose course type',
  'nav.firstLessonDate': 'First lesson date',
  'nav.chooseFirstLessonDate': 'Choose first lesson date',
  'nav.exactSearch': 'Exact search',
  'nav.exactSearchPlaceholder': 'Enter MentorID or mentor name',
  'nav.loadingTimeZoneFilter': 'Loading time zone filter...',
  'nav.loadingMentorSpecialty': 'Loading mentor specialty...',
  'nav.loadingMenu': 'Loading menu...',
  'nav.loadingCourseDrafts': 'Loading course drafts...',
  'nav.reviewingCannotEdit': 'Under review. Editing is unavailable.',
  'nav.editUnavailable': 'Profile card cannot be edited now',
  'nav.mentorReviewing': 'Mentor account is under review. Editing is unavailable.',
  'nav.actionFailed': 'Action failed. Please try again later.',

  'settings.title': 'Settings & Data',
  'settings.aria': 'Settings & Data',
  'settings.options': 'Settings options',
  'settings.sectionContent': '{section} content',
  'settings.section.profile': 'Personal Info',
  'settings.section.studentData': 'Student Data',
  'settings.section.mentorData': 'Mentor Data',
  'settings.section.security': 'Security & Privacy',
  'settings.section.notifications': 'Notifications',
  'settings.section.payments': 'Payments & Billing',
  'settings.section.language': 'Language & Preferences',
  'settings.toast.mentorSubmitted': 'Mentor application submitted. We will review it soon.',

  'profile.email': 'Email',
  'profile.degree': 'Degree',
  'profile.school': 'School',
  'profile.timeZone': 'Time zone',
  'profile.availability': 'Availability',
  'profile.choose': 'Select',
  'profile.timeZoneFallback': 'Time zone',
  'profile.timeZoneSaved': 'Time zone saved',
  'profile.availabilitySaved': 'Availability saved',
  'profile.availabilityDays': 'Set for {count} days',
  'profile.availabilityEditor.loginHint': 'Log in to set availability',
  'profile.availabilityEditor.timeZone': 'Time zone: {zone}',
  'profile.availabilityEditor.calendar': 'Availability calendar',
  'profile.availabilityEditor.selector': 'Availability selector',
  'profile.degree.bachelor': "Bachelor's",
  'profile.degree.master': "Master's",
  'profile.degree.phd': 'PhD',

  'studentData.aria': 'Student data',
  'studentData.overview': 'Student data overview',
  'studentData.metrics': 'Student data metrics',
  'studentData.changeAvatar': 'Change avatar',
  'studentData.subtitleFallback': 'Mentory Student',
  'studentData.classes': 'Classes',
  'studentData.reviews': 'Reviews',
  'studentData.joined': 'Joined Mentory',
  'studentData.unit.times': 'times',
  'studentData.unit.items': 'reviews',
  'studentData.unit.days': 'days',
  'studentData.writtenReviews': 'Reviews I wrote',
  'studentData.writtenReviewsList': 'Reviews I wrote list',
  'studentData.emptyReviews': 'No reviews yet',
  'studentData.mentorFallback': 'Mentor',

  'mentorData.aria': 'Mentor data',
  'mentorData.overview': 'Mentor data overview',
  'mentorData.metrics': 'Mentor data metrics',
  'mentorData.changeAvatar': 'Change avatar',
  'mentorData.subtitleFallback': 'Mentory Mentor',
  'mentorData.classes': 'Classes',
  'mentorData.receivedReviews': 'Reviewed',
  'mentorData.joined': 'Joined Mentory',
  'mentorData.aboutMeReviews': 'Reviews about me',
  'mentorData.aboutMeReviewsList': 'Reviews about me list',

  'reviews.emptyText': 'No written review',
  'reviews.ratingAria': 'Rating {rating}',

  'security.password': 'Login password',
  'security.passwordSet': 'Set',
  'security.newPasswordPlaceholder': 'New password (at least 6 characters)',
  'security.confirmPasswordPlaceholder': 'Confirm new password',
  'security.minPassword': 'Password must be at least 6 characters',
  'security.passwordMismatch': 'The two passwords do not match',
  'security.passwordSaved': 'Password changed',
  'security.passwordSaveFailed': 'Change failed. Please try again later.',
  'security.dataPersonalization': 'Data personalization',
  'security.dataPersonalizationValue': 'Used to improve recommendations',

  'notifications.email': 'Email notifications',
  'notifications.emailValue': 'Important updates and course reminders, excluding verification codes',
  'notifications.enabled': 'Email reminders enabled',
  'notifications.disabled': 'Email reminders disabled',

  'payments.payment': 'Payments',
  'payments.income': 'Income',
  'payments.loading': 'Loading...',
  'payments.noRecords': 'No records',
  'payments.rechargeRecords': 'Top-up records ({count})',
  'payments.incomeRecords': 'Income records ({count})',
  'payments.loadPaymentsFailed': 'Failed to load payment records. Please try again later.',
  'payments.loadIncomeFailed': 'Failed to load income records. Please try again later.',
  'payments.noRechargeRecords': 'No top-up records',
  'payments.noIncomeRecords': 'No income records',
  'payments.timeZone': 'Time zone',
  'payments.time': 'Time',
  'payments.amount': 'Amount',
  'payments.courseHours': 'Course hours',
  'payments.teachingHours': 'Teaching hours',
  'payments.otherDirection': 'Other course direction',
  'payments.otherType': 'Other type',

  'language.language': 'Language',
  'language.current.zh-CN': '简体中文',
  'language.current.en': 'English',
  'language.dialogTitle': 'Change Language',
  'language.dialogDescription': 'Choose the language used across Mentory on this device',
  'language.option.zh-CN': '简体中文',
  'language.option.en': 'English',
  'language.saved': 'Language changed',
  'language.homeOrder': 'Home course order',
  'language.homeOrder.custom': 'Custom',
  'language.homeOrder.default': 'Default order',
  'language.homeOrderHint': 'Drag course cards to adjust the home course order. Changes save automatically.',
  'language.restoreDefault': 'Restore default',
  'language.orderAria': 'Home course order',
  'language.dragAria': 'Drag to reorder: {label}',
  'language.orderSaved': 'Home course order saved',
  'language.orderDefaultRestored': 'Default order restored',
};

const COURSE_DIRECTION_EN_LABELS = {
  'cs-foundation': 'Programming Fundamentals',
  algo: 'Data Structures & Algorithms',
  ml: 'Machine Learning',
  'ai-large-model': 'AI Large Models',
  'data-analysis': 'Data Analysis',
  'business-analytics': 'Business Analytics',
  'advanced-math': 'Advanced Mathematics',
  statistics: 'Probability & Statistics',
  physics: 'Physics',
  'electrical-electronics': 'Electrical & Electronics',
  'mechanical-engineering': 'Mechanical Engineering',
  'civil-structural': 'Civil / Structural',
  'life-science': 'Life Sciences',
  'public-health': 'Public Health',
  chemistry: 'Chemistry',
  'materials-science': 'Materials Science',
  'software-engineering': 'Software Engineering',
  'cloud-computing': 'Cloud Computing',
  cybersecurity: 'Cybersecurity',
  finance: 'Finance',
  accounting: 'Accounting',
  economics: 'Economics',
  marketing: 'Marketing',
  management: 'Management',
  psychology: 'Psychology',
  education: 'Education',
  'design-creative': 'Design / Creative',
  linguistics: 'Linguistics',
  'communication-studies': 'Communication Studies',
  law: 'Law',
  writing: 'Academic Writing & Editing',
  'career-coaching': 'Career Coaching',
  others: 'Other Course Direction',
};

const normalizeLanguage = (value) => {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (raw === 'zh' || raw === 'zh-CN') return 'zh-CN';
  if (raw === 'en' || raw === 'en-US' || raw === 'en-GB') return 'en';
  return SUPPORTED_LANGUAGE_VALUES.has(raw) ? raw : 'zh-CN';
};

export const getStoredLanguage = () => {
  if (typeof window === 'undefined') return 'zh-CN';
  try {
    return normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));
  } catch {
    return 'zh-CN';
  }
};

const formatMessage = (template, replacements) => {
  if (!replacements || typeof replacements !== 'object') return template;
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(replacements, key)
      ? String(replacements[key])
      : match
  ));
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(getStoredLanguage);

  const setLanguage = useCallback((nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setLanguageState(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
        window.dispatchEvent(new CustomEvent('mentory:language-changed', { detail: { language: normalized } }));
      } catch {}
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
    }
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleStorage = (event) => {
      if (event.key === LANGUAGE_STORAGE_KEY) setLanguageState(normalizeLanguage(event.newValue));
    };
    const handleLanguageChanged = (event) => {
      setLanguageState(normalizeLanguage(event?.detail?.language));
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('mentory:language-changed', handleLanguageChanged);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('mentory:language-changed', handleLanguageChanged);
    };
  }, []);

  const t = useCallback((key, fallback, replacements) => {
    const fallbackText = typeof fallback === 'string' ? fallback : key;
    if (language !== 'en') return formatMessage(fallbackText, replacements);
    return formatMessage(en[key] || fallbackText, replacements);
  }, [language]);

  const getCourseDirectionLabel = useCallback((id, fallback) => {
    if (language !== 'en') return fallback;
    return COURSE_DIRECTION_EN_LABELS[id] || fallback;
  }, [language]);

  const value = useMemo(() => ({
    language,
    isEnglish: language === 'en',
    setLanguage,
    t,
    getCourseDirectionLabel,
  }), [getCourseDirectionLabel, language, setLanguage, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(LanguageContext);
  if (value) return value;
  return {
    language: 'zh-CN',
    isEnglish: false,
    setLanguage: () => {},
    t: (_key, fallback, replacements) => formatMessage(typeof fallback === 'string' ? fallback : _key, replacements),
    getCourseDirectionLabel: (_id, fallback) => fallback,
  };
}
