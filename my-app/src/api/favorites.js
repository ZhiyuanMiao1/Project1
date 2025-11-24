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

export default {
  fetchFavoriteCollections,
  createFavoriteCollection,
  deleteFavoriteCollection,
};
