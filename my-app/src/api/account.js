import client from './client';

export const fetchAccountProfile = () => {
  return client.get('/api/account/ids');
};

export const fetchHomeCourseOrder = () => {
  return client.get('/api/account/home-course-order');
};

export const saveHomeCourseOrder = (orderIds = []) => {
  return client.put('/api/account/home-course-order', { orderIds });
};

const accountApi = {
  fetchAccountProfile,
  fetchHomeCourseOrder,
  saveHomeCourseOrder,
};

export default accountApi;
