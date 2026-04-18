import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export const LANGUAGE_STORAGE_KEY = 'mentory.systemLanguage.v1';

export const LANGUAGE_OPTIONS = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

const SUPPORTED_LANGUAGE_VALUES = new Set(LANGUAGE_OPTIONS.map((item) => item.value));

const en = {
  'app.route.mentorProfile': 'Mentor Profile',
  'app.route.courseRequest': 'Post Request',
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
  'common.login': 'Log In',
  'common.register': 'Register',
  'common.logout': 'Log Out',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.deleting': 'Deleting...',
  'common.create': 'Create',
  'common.creating': 'Creating...',
  'common.confirm': 'Confirm',
  'common.done': 'Done',
  'common.multiSelect': 'Select',
  'common.processing': 'Processing...',
  'common.select': 'Select',
  'common.deselect': 'Deselect',
  'common.selected': 'Selected',
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
  'common.success': 'Success',
  'common.autoClose': 'Will close automatically',
  'common.newCourseAlert': 'New course alert',
  'common.unreadMessages': 'Unread messages',
  'auth.sessionExpired': 'Session expired. Please log in again.',
  'auth.unavailableDuringMentorReview': 'Unavailable while mentor account is under review',
  'auth.profileEditUnavailable': 'Profile card cannot be edited now',
  'auth.mentorPendingCannotEdit': 'Mentor account is under review. Profile editing is unavailable.',
  'auth.actionFailed': 'Action failed. Please try again later.',
  'lessonHours.respondFailed': 'Failed to process lesson-hour confirmation. Please try again later.',
  'lessonHours.disputeInvalid': 'Enter the correct hours in 0.25-hour increments.',
  'lessonHours.disputeTitle': 'Enter the correct lesson hours',

  'nav.students': 'Students',
  'nav.mentors': 'Mentors',
  'nav.publishCourseRequest': 'Post Request',
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

  'courses.title': 'Courses',
  'courses.loginRequired': 'Please log in to view courses',
  'courses.studentLoadFailed': 'Failed to load student courses',
  'courses.mentorLoadFailed': 'Failed to load mentor courses',
  'courses.loadFailed': 'Failed to load courses. Please try again later.',
  'courses.partialLoadFailed': 'Some courses failed to load. Showing successfully loaded courses only.',
  'courses.loading': 'Loading...',
  'courses.loadFailedTitle': 'Failed to load',
  'courses.tryAgain': 'Please try again later',
  'courses.emptyTitle': 'No courses yet',
  'courses.emptySubtitle': 'Courses will appear here after you create or accept them',
  'courses.month': '{month}',
  'courses.replaySoon': 'Replay will be available soon',
  'courses.invalidCourseId': 'Course information is invalid. Please refresh and try again.',
  'courses.invalidReviewScores': 'Please choose a score from 1 to 5 for each review dimension.',
  'courses.invalidReviewComment': 'Written review can be up to 1000 characters.',
  'courses.courseNotFound': 'This course was not found and cannot be reviewed.',
  'courses.courseNotCompleted': 'This course has not ended yet and cannot be reviewed.',
  'courses.submitReviewFailed': 'Failed to submit review. Please try again later.',
  'courses.lessonHoursInvalid': 'Enter valid lesson hours in 0.25-hour increments.',
  'courses.submitLessonHoursFailed': 'Failed to submit lesson hours. Please try again later.',
  'courses.enterClassroom': 'Enter Classroom',
  'courses.checkingHours': 'Checking hours...',
  'courses.hoursLoadFailed': 'Failed to load lesson-hour info',
  'courses.goTopUp': 'Top Up',
  'courses.viewReplay': 'View Replay',
  'courses.myReview': 'My Review',
  'courses.reviewMentor': 'Review Mentor',
  'courses.fillLessonHours': 'Fill Hours',
  'courses.lessonHoursLocked': 'The student has confirmed the hours. Editing is unavailable.',
  'courses.submitLessonHoursTitle': 'Submit actual hours for this lesson',
  'courses.reviewUpdatedTitle': 'Review Updated',
  'courses.reviewUpdatedDesc': 'Your review has been updated and the new scores replaced the previous record.',
  'courses.reviewSubmittedTitle': 'Thanks for your feedback',
  'courses.reviewSubmittedDesc': 'Your review has been submitted. We will use your feedback to improve mentor service.',
  'courses.mentorLoginRequired': 'Please log in with a mentor account',
  'courses.accessDenied': 'This account does not have access',
  'courses.studentCoursesLoadFailed': 'Failed to load student courses',
  'courses.mentorCoursesLoadFailed': 'Failed to load mentor courses',
  'courses.retry': 'Retry',
  'courses.loginOrRegister': 'Log in / Register',
  'courses.switchAccount': 'Switch Account',
  'courses.mentorCalendarHint': 'Log in to access the mentor course calendar',
  'courses.mentorReadyTitle': 'You are ready',
  'courses.mentorReadyDesc': 'We will finish the mentor review soon. After approval, you can access mentor courses.',
  'courses.mentorOnlyTitle': 'Mentors Only',
  'courses.mentorOnlyHint': 'Please log in with a mentor account to view this page',
  'courses.reviewComingSoon': 'Follow-up will be available soon',
  'courseDetail.aria': 'Course details',
  'courseDetail.close': 'Close course details',
  'courseDetail.courseType': 'Course Type',
  'courseDetail.date': 'Date',
  'courseDetail.duration': 'Duration',
  'courseReview.aria': 'Review mentor',
  'courseReview.close': 'Close review dialog',
  'courseReview.category.clarity': 'Clear explanation',
  'courseReview.category.communication': 'Smooth communication',
  'courseReview.category.preparation': 'Well prepared',
  'courseReview.category.expertise': 'Professional knowledge',
  'courseReview.category.punctuality': 'Punctual',
  'courseReview.scoreGroupAria': '{label} rating',
  'courseReview.scoreAria': '{label} {score} points',
  'courseReview.unrated': 'Not rated',
  'courseReview.commentLabel': 'Written review (optional)',
  'courseReview.commentPlaceholder': 'Share your experience, takeaways, or suggestions from this lesson as a reference for other students',
  'courseReview.update': 'Update Review',
  'courseReview.submit': 'Submit Review',
  'courseReview.submitting': 'Submitting...',

  'favorites.title': 'Favorites',
  'favorites.heroStudent': 'Student and mentor favorites are separate. Organize mentor groups by course direction or goal.',
  'favorites.heroMentor': 'Mentor and student favorites are separate. Organize student groups here.',
  'favorites.recent': 'Recent Visits',
  'favorites.today': 'Today',
  'favorites.yesterday': 'Yesterday',
  'favorites.noRecent': 'No recent visits',
  'favorites.recentDesc': 'Recently viewed favorites stay here so you can return to where you left off',
  'favorites.newCollection': 'New collection',
  'favorites.createdAt': 'Created {date}',
  'favorites.systemDefault': 'System default',
  'favorites.loginRequiredCollections': 'Please log in to view favorite collections',
  'favorites.loginRequiredFavorites': 'Please log in to view favorites',
  'favorites.invalidCollectionId': 'Favorite collection ID is invalid',
  'favorites.noPermissionCollections': 'This account does not have access to favorite collections',
  'favorites.noPermissionCollection': 'This account does not have access to this favorite collection',
  'favorites.collectionNotFound': 'Favorite collection not found',
  'favorites.loadCollectionsFailed': 'Failed to load favorite collections. Please try again later.',
  'favorites.loadFailed': 'Failed to load. Please try again later.',
  'favorites.deleteFailed': 'Delete failed. Please try again later.',
  'favorites.createFailed': 'Create failed. Please try again later.',
  'favorites.nameRequired': 'Enter a collection name',
  'favorites.loginBeforeCreate': 'Please log in before creating a collection',
  'favorites.loadingCollections': 'Loading favorite collections',
  'favorites.removeFavorite': 'Remove favorite',
  'favorites.emptyCollection': 'Empty collection',
  'favorites.coverAlt': '{title} cover {index}',
  'favorites.createNewTitle': 'Create New Collection',
  'favorites.createStudentDesc': 'Organize student groups by course direction, student profile, or goal.',
  'favorites.createMentorDesc': 'Organize mentor groups by course direction, mentor style, or goal.',
  'favorites.newFavorite': 'New Favorite',
  'favorites.deleteTitle': 'Delete this collection?',
  'favorites.deleteDesc': '"{title}" will be permanently deleted',
  'favorites.createTitle': 'New Collection',
  'favorites.namePlaceholder': 'Name',
  'favorites.back': 'Back to favorites',
  'favorites.empty': 'No favorites yet',
  'favorites.bulkActions': 'Bulk actions',
  'favorites.selectedCount': '{count} selected',
  'favorites.unfavorite': 'Unfavorite',
  'favorites.moveTo': 'Move to...',
  'favorites.moveTitle': 'Move to Collection',
  'favorites.noOtherCollections': 'No other collections. Create one from the favorites page first.',
  'favorites.chooseTarget': 'Choose a collection',
  'favorites.chooseCollection': 'Choose collection',
  'favorites.moveFailed': 'Move failed. Please try again later.',
  'favorites.moveTargetRequired': 'Choose a target collection',
  'favorites.moveFailedCount': '{count} items failed to unfavorite. Please try again later.',
  'favorites.moving': 'Moving...',
  'favorites.move': 'Move',
  'favorites.defaultCollection': 'Default Collection',
  'favorites.defaultCollectionSpaced': 'Default Collection',

  'recent.older': 'Earlier',
  'recent.title': 'Recent Visits',
  'recent.edit': 'Edit',
  'recent.removeRecord': 'Remove this record',
  'recent.loginRequired': 'Please log in to view recent visits',
  'recent.noPermission': 'This account does not have access to recent visits',
  'recent.loadFailed': 'Failed to load recent visits. Please try again later.',
  'recent.deleteFailed': 'Delete failed. Please try again later.',
  'recent.mentorEmpty': 'No student visit records yet',
  'recent.studentEmpty': 'No mentor visit records yet',

  'courseOnboarding.title': 'Complete Course Details',
  'courseOnboarding.close': 'Close',
  'courseOnboarding.chooseCourse': 'Choose course',
  'courseOnboarding.loading': 'Loading...',
  'courseOnboarding.empty': 'No courses yet',
  'courseOnboarding.otherDirection': 'Other Course Direction',
  'courseOnboarding.unknownType': 'Unknown Type',
  'courseOnboarding.deleteFailed': 'Delete failed. Please try again later.',
  'courseOnboarding.deleteDraft': 'Delete draft',
  'courseOnboarding.deleteSubmitted': 'Delete submitted request',
  'courseOnboarding.unpublished': 'Unpublished',
  'courseOnboarding.createdAt': 'Created {date}',
  'courseOnboarding.delete': 'Delete',
  'courseOnboarding.createEntryAria': 'Create course entry',
  'courseOnboarding.startCreating': 'Start Creating a New Course',
  'courseOnboarding.createNew': 'Create New Course',

  'wallet.title': 'Wallet',
  'wallet.loginRequired': 'Please log in to view your wallet',
  'wallet.summaryAria': 'Wallet overview',
  'wallet.balanceAria': 'Balance',
  'wallet.remainingHours': 'Remaining Hours',
  'wallet.hours': 'hours',
  'wallet.monthSpending': 'This Month',
  'wallet.totalTopUp': 'Total Top-up',
  'wallet.topUp': 'Top Up',
  'wallet.topUpMethod': 'Top-up method',
  'wallet.topUpHours': 'Top-up hours',
  'wallet.duration': 'Top-up duration',
  'wallet.chooseHours': 'Choose hours',
  'wallet.quickHours': 'Quick hours',
  'wallet.enterHours': 'Enter hours',
  'wallet.priceDetails': 'Price details',
  'wallet.lessThan10': 'Top-up duration < 10 hours',
  'wallet.atLeast10': 'Top-up duration >= 10 hours',
  'wallet.price600': 'CNY 600/hour',
  'wallet.price500': 'CNY 500/hour',
  'wallet.total': 'Total',
  'wallet.topUpNow': 'Top Up Now',
  'wallet.open127': 'Open with 127.0.0.1',
  'wallet.paypalUnavailable': 'PayPal is unavailable',
  'wallet.tips': 'Tips',
  'wallet.tipRealtime': 'Balance updates immediately after a successful top-up',
  'wallet.tipHelp': 'For payment issues, contact us from Help Center',
  'wallet.paySuccess': 'Payment Successful',
  'wallet.fxInvalid': 'FX quote data is invalid. Please try again.',
  'wallet.fxFailed': 'Failed to get FX quote. Please try again later.',
  'wallet.localhostUnsupported': 'PayPal sandbox client token does not support localhost. Open this page with 127.0.0.1.',
  'wallet.paypalInitFailed': 'PayPal initialization failed. Please try again later.',
  'wallet.invalidHours': 'Enter a valid number of hours',
  'wallet.paypalTryLater': 'PayPal is unavailable. Please try again later.',
  'wallet.fxLoading': 'Getting live FX quote. Please try again shortly.',
  'wallet.noFxQuote': 'No FX quote is available. Please try again later.',
  'wallet.fxExpiredRefreshing': 'FX quote expired. Refreshing the latest quote.',
  'wallet.paypalNotReady': 'PayPal is not ready yet. Please try again shortly.',
  'wallet.redirectingPayPal': 'Redirecting to PayPal...',
  'wallet.fxUpdatedContinue': 'FX quote updated. Continuing with the latest quote.',
  'wallet.paymentCompletedStatus': 'Payment completed. Status: {status}',
  'wallet.captureFailed': 'Payment approved, but capture failed. Please check your balance later.',
  'wallet.paymentCanceled': 'Payment canceled',
  'wallet.paymentFailed': 'Payment failed. Please try again later.',
  'wallet.fxExpiredClickAgain': 'FX quote expired. Refreshing the latest quote. Please click pay again.',
  'wallet.fxInvalidClickAgain': 'FX quote is invalid. Refreshing the latest quote. Please click pay again.',
  'wallet.paymentInitFailed': 'Payment initialization failed. Please try again later.',
  'wallet.paypalDesc': 'Supports international cards and balance',
  'wallet.alipay': 'Alipay',
  'wallet.alipayDesc': 'Recommended for users in China',
  'wallet.wechat': 'WeChat Pay',
  'wallet.wechatDesc': 'Fast payment through WeChat',
  'wallet.selectedFallback': 'Selected method',
  'wallet.selectedMethod': 'Selected {method}, hours {hours}, unit price CNY {unitPrice}/hour, total CNY {total}. Top-up is under development.',

  'messages.title': 'Messages',
  'messages.loginRequired': 'Please log in to view messages',
  'messages.loadThreadsFailed': 'Failed to load conversations. Please try again later.',
  'messages.schedule': 'Schedule',
  'messages.starFailed': 'Failed to star. Please try again later.',
  'messages.unstarFailed': 'Failed to unstar. Please try again later.',
  'messages.archiveFailed': 'Failed to archive conversation. Please try again later.',
  'messages.shellAria': 'Messages list and details',
  'messages.recent': 'Recent',
  'messages.conversations': 'Conversations',
  'messages.conversationCount': '{count} conversations',
  'messages.me': 'Me',
  'messages.otherParty': 'Other party',
  'messages.starred': 'Starred',
  'messages.unreadThread': 'Unread messages in this conversation',
  'messages.moreActions': 'More actions',
  'messages.star': 'Star',
  'messages.unstar': 'Unstar',
  'messages.archive': 'Archive',
  'messages.scheduleNextLesson': 'Schedule next lesson',
  'messages.reschedule': 'Reschedule',
  'messages.prevDay': 'Previous day',
  'messages.nextDay': 'Next day',
  'messages.close': 'Close',
  'messages.myAvailability': 'My availability',
  'messages.otherAvailability': 'Other party availability',
  'messages.sendAppointment': 'Send Appointment',
  'messages.selectConversation': 'Select a conversation on the left to view details',
  'messages.noConversations': 'No conversations yet',
  'messages.today': 'Today',
  'messages.yesterday': 'Yesterday',
  'messages.weekday.sun': 'Sun',
  'messages.weekday.mon': 'Mon',
  'messages.weekday.tue': 'Tue',
  'messages.weekday.wed': 'Wed',
  'messages.weekday.thu': 'Thu',
  'messages.weekday.fri': 'Fri',
  'messages.weekday.sat': 'Sat',
  'messages.dateTime.monthDay': '{month}/{day} {time}',
  'messages.dateTime.fullDate': '{year}/{month}/{day} {label}',
  'messages.dateTime.window': '{month}/{day} {weekday} {start}-{end} ({timezone})',

  'appointment.onlyRecallOwn': 'Only schedules you sent can be recalled',
  'appointment.expiredCannotRecall': 'Schedule expired and cannot be recalled',
  'appointment.respondedCannotRecall': 'The other party has responded, so this cannot be recalled',
  'appointment.accept': 'Accept',
  'appointment.reject': 'Reject',
  'appointment.reschedule': 'Reschedule',
  'appointment.changeStatusTo': 'Change schedule status to',
  'appointment.moreActions': 'More actions',
  'appointment.scheduleNextLesson': 'Schedule next lesson',
  'appointment.deleteForMe': 'Delete for me',
  'appointment.recall': 'Recall',
  'appointment.schedule': 'Schedule',
  'appointment.joinMeeting': 'Join video meeting',
  'appointment.statusAria': 'Schedule status: {status}',
  'appointment.status.pending': 'Pending',
  'appointment.status.accepted': 'Accepted',
  'appointment.status.rejected': 'Rejected',
  'appointment.status.rescheduling': 'Rescheduling',
  'appointment.status.expired': 'Expired',

  'lessonHours.dialogAria': 'Fill lesson hours',
  'lessonHours.close': 'Close',
  'lessonHours.hoursLabel': 'Lesson hours',
  'lessonHours.hoursUnit': 'hours',
  'lessonHours.hint': 'Lesson hours are calculated in 0.25-hour increments. Values that are not multiples of 0.25 will be rounded to the nearest valid value.',
  'lessonHours.submit': 'Submit',
  'lessonHours.submitting': 'Submitting...',
  'lessonHours.pendingCourse': 'Course',
  'lessonHours.student': 'Student',
  'lessonHours.mentor': 'Mentor',
  'lessonHours.pendingTitleMentor': 'The student disputed this lesson’s hours',
  'lessonHours.pendingTitleStudent': 'Confirm the actual hours for this lesson',
  'lessonHours.pendingSubtitle': 'This window will stay open until you respond',
  'lessonHours.originalHours': 'Original mentor-submitted hours',
  'lessonHours.mentorSubmittedHours': 'Mentor-submitted hours',
  'lessonHours.studentClaimedHours': 'Student-claimed hours',
  'lessonHours.tipMentor': 'Confirm to close with the student’s dispute; submit for platform review to escalate.',
  'lessonHours.tipStudent': 'If the hours are incorrect, dispute directly so the mentor can review again.',
  'lessonHours.submitPlatformReview': 'Submit for Platform Review',
  'lessonHours.dispute': 'Dispute',
  'lessonHours.confirmStudentDispute': 'Confirm Student Dispute',
  'lessonHours.confirmHours': 'Confirm Hours',
  'lessonHours.pendingAria': 'Pending lesson-hour confirmation',
  'lessonHours.queue': '{count} lesson-hour confirmations remain and will be handled one by one',
  'lessonHours.processing': 'Processing...',

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

const COURSE_TYPE_EN_LABELS = {
  'course-selection': 'Course Selection',
  'pre-study': 'Pre-study',
  'assignment-project': 'Assignments & Projects',
  'final-review': 'Final Review',
  'in-class-support': 'Graduation Thesis',
  others: 'Other Type',
};

const COURSE_DIRECTION_ZH_TO_ID = {
  '编程基础': 'cs-foundation',
  '数据结构与算法': 'algo',
  '机器学习': 'ml',
  'AI 大模型': 'ai-large-model',
  '数据分析': 'data-analysis',
  '商业分析': 'business-analytics',
  '高等数学': 'advanced-math',
  '概率与统计': 'statistics',
  '物理学': 'physics',
  '电气与电子': 'electrical-electronics',
  '机械工程': 'mechanical-engineering',
  '土木 / 结构': 'civil-structural',
  '生命科学': 'life-science',
  '健康与公共卫生': 'public-health',
  '化学': 'chemistry',
  '材料科学': 'materials-science',
  '软件工程': 'software-engineering',
  '云计算': 'cloud-computing',
  '网络安全': 'cybersecurity',
  '金融学': 'finance',
  '会计学': 'accounting',
  '经济学': 'economics',
  '市场营销': 'marketing',
  '管理学': 'management',
  '心理学': 'psychology',
  '教育学': 'education',
  '设计 / 创意': 'design-creative',
  '语言学': 'linguistics',
  '传播学': 'communication-studies',
  '法律': 'law',
  '论文写作与润色': 'writing',
  '求职辅导': 'career-coaching',
  '其它课程方向': 'others',
  '其他课程方向': 'others',
};

const COURSE_TYPE_ZH_TO_ID = {
  '选课指导': 'course-selection',
  '课前预习': 'pre-study',
  '作业项目': 'assignment-project',
  '期末复习': 'final-review',
  '毕业论文': 'in-class-support',
  '其它类型': 'others',
  '其他课程类型': 'others',
  '其它课程类型': 'others',
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

  const getCourseDirectionDisplayLabel = useCallback((idOrLabel, fallback) => {
    const raw = typeof idOrLabel === 'string' ? idOrLabel.trim() : idOrLabel;
    const fallbackRaw = typeof fallback === 'string' ? fallback.trim() : fallback;
    const id = COURSE_DIRECTION_EN_LABELS[raw]
      ? raw
      : COURSE_DIRECTION_ZH_TO_ID[raw]
        || (COURSE_DIRECTION_EN_LABELS[fallbackRaw] ? fallbackRaw : COURSE_DIRECTION_ZH_TO_ID[fallbackRaw]);
    if (language !== 'en') return fallbackRaw || raw;
    return COURSE_DIRECTION_EN_LABELS[id] || fallbackRaw || raw;
  }, [language]);

  const getCourseTypeLabel = useCallback((idOrLabel, fallback) => {
    const raw = typeof idOrLabel === 'string' ? idOrLabel.trim() : idOrLabel;
    const fallbackRaw = typeof fallback === 'string' ? fallback.trim() : fallback;
    const id = COURSE_TYPE_EN_LABELS[raw]
      ? raw
      : COURSE_TYPE_ZH_TO_ID[raw]
        || (COURSE_TYPE_EN_LABELS[fallbackRaw] ? fallbackRaw : COURSE_TYPE_ZH_TO_ID[fallbackRaw]);
    if (language !== 'en') return fallbackRaw || raw;
    return COURSE_TYPE_EN_LABELS[id] || fallbackRaw || raw;
  }, [language]);

  const value = useMemo(() => ({
    language,
    isEnglish: language === 'en',
    setLanguage,
    t,
    getCourseDirectionLabel,
    getCourseDirectionDisplayLabel,
    getCourseTypeLabel,
  }), [getCourseDirectionDisplayLabel, getCourseDirectionLabel, getCourseTypeLabel, language, setLanguage, t]);

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
    getCourseDirectionDisplayLabel: (_id, fallback) => fallback,
    getCourseTypeLabel: (_id, fallback) => fallback,
  };
}
