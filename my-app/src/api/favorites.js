import client from './client';

export const fetchFavoriteCollections = (role) => {
  return client.get('/api/favorites/collections', { params: { role } });
};

export const createFavoriteCollection = (name, role) => {
  return client.post('/api/favorites/collections', { name, role });
};

export const deleteFavoriteCollection = (id) => {
  return client.delete(`/api/favorites/collections/${id}`);
};

export const fetchFavoriteItems = ({ role, collectionId, itemType, idsOnly, limit } = {}) => {
  const params = {};
  if (role) params.role = role;
  if (collectionId) params.collectionId = collectionId;
  if (itemType) params.itemType = itemType;
  if (idsOnly) params.idsOnly = 1;
  const limitNumber = Number(limit);
  if (Number.isFinite(limitNumber) && limitNumber > 0) params.limit = limitNumber;
  return client.get('/api/favorites/items', { params });
};

export const deleteFavoriteItem = (id) => {
  return client.delete(`/api/favorites/items/${id}`);
};

export const toggleFavoriteItem = ({ role, itemType, itemId, payload } = {}) => {
  return client.post('/api/favorites/toggle', { role, itemType, itemId, payload });
};

export const moveFavoriteItems = ({ role, itemIds, targetCollectionId } = {}) => {
  return client.put('/api/favorites/items/move', { role, itemIds, targetCollectionId });
};

const favoritesApi = {
  fetchFavoriteCollections,
  createFavoriteCollection,
  deleteFavoriteCollection,
  fetchFavoriteItems,
  deleteFavoriteItem,
  toggleFavoriteItem,
  moveFavoriteItems,
};

export default favoritesApi;
