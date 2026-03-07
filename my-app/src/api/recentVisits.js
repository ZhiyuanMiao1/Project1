import client from './client';

export const fetchRecentVisits = ({ role, itemType, limit, offset } = {}) => {
  const params = {};
  if (role) params.role = role;
  if (itemType) params.itemType = itemType;

  const limitNumber = Number(limit);
  if (Number.isFinite(limitNumber) && limitNumber > 0) params.limit = limitNumber;

  const offsetNumber = Number(offset);
  if (Number.isFinite(offsetNumber) && offsetNumber >= 0) params.offset = offsetNumber;

  return client.get('/api/recent-visits/items', { params });
};

export const recordRecentVisit = ({ role, itemType, itemId, payload } = {}) => {
  return client.post('/api/recent-visits/record', { role, itemType, itemId, payload });
};

export const deleteRecentVisit = (id) => {
  return client.delete(`/api/recent-visits/items/${id}`);
};

const recentVisitsApi = {
  fetchRecentVisits,
  recordRecentVisit,
  deleteRecentVisit,
};

export default recentVisitsApi;
