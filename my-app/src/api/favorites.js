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

export const fetchFavoriteItems = ({ role, collectionId, itemType, idsOnly } = {}) => {
  const params = {};
  if (role) params.role = role;
  if (collectionId) params.collectionId = collectionId;
  if (itemType) params.itemType = itemType;
  if (idsOnly) params.idsOnly = 1;
  return client.get('/api/favorites/items', { params });
};

export const deleteFavoriteItem = (id) => {
  return client.delete(`/api/favorites/items/${id}`);
};

export const toggleFavoriteItem = ({ role, itemType, itemId, payload } = {}) => {
  return client.post('/api/favorites/toggle', { role, itemType, itemId, payload });
};

const favoritesApi = {
  fetchFavoriteCollections,
  createFavoriteCollection,
  deleteFavoriteCollection,
  fetchFavoriteItems,
  deleteFavoriteItem,
  toggleFavoriteItem,
};

export default favoritesApi;
