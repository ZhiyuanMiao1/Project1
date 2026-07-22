export const loadMentorPage = () => import('./components/MentorPage/MentorPage');
export const loadStudentCourseRequestPage = () => import('./pages/StudentCourseRequest/StudentCourseRequestPage');
export const loadMentorProfileEditorPage = () => import('./pages/MentorProfileEditor/MentorProfileEditorPage');
export const loadFavoritesPage = () => import('./pages/Favorites/FavoritesPage');
export const loadFavoriteCollectionPage = () => import('./pages/Favorites/FavoriteCollectionPage');
export const loadCoursesPage = () => import('./pages/Courses/CoursesPage');
export const loadMessagesPage = () => import('./pages/Messages/MessagesPage');
export const loadRecentVisitsPage = () => import('./pages/RecentVisits/RecentVisitsPage');
export const loadAccountSettingsPage = () => import('./pages/AccountSettings/AccountSettingsPage');
export const loadMentorDetailPage = () => import('./pages/MentorDetail/MentorDetailPage');
export const loadCourseRequestDetailPage = () => import('./pages/CourseRequestDetail/CourseRequestDetailPage');
export const loadWalletPage = () => import('./pages/Wallet/WalletPage');
export const loadClassroomPage = () => import('./pages/Classroom/ClassroomPage');
export const loadHelpCenterPage = () => import('./pages/HelpCenter/HelpCenterPage');

const ROUTE_LOADERS = {
  mentorHome: loadMentorPage,
  studentCourseRequest: loadStudentCourseRequestPage,
  mentorProfileEditor: loadMentorProfileEditorPage,
  studentFavorites: loadFavoritesPage,
  favoriteCollection: loadFavoriteCollectionPage,
  studentCourses: loadCoursesPage,
  mentorCourses: loadCoursesPage,
  messages: loadMessagesPage,
  recentVisits: loadRecentVisitsPage,
  accountSettings: loadAccountSettingsPage,
  mentorDetail: loadMentorDetailPage,
  courseRequestDetail: loadCourseRequestDetailPage,
  wallet: loadWalletPage,
  classroom: loadClassroomPage,
  helpCenter: loadHelpCenterPage,
};

const preloadCache = new Map();

export const preloadRoute = (routeKey) => {
  const loader = ROUTE_LOADERS[routeKey];
  if (!loader) return null;

  if (!preloadCache.has(routeKey)) {
    preloadCache.set(
      routeKey,
      Promise.resolve()
        .then(loader)
        .catch((error) => {
          preloadCache.delete(routeKey);
          return Promise.reject(error);
        })
    );
  }

  return preloadCache.get(routeKey);
};

export const createRouteIntentProps = (routeKey) => {
  const preload = () => {
    preloadRoute(routeKey)?.catch(() => {});
  };

  return {
    onMouseEnter: preload,
    onFocus: preload,
    onPointerDown: preload,
  };
};
