import client from './client';

export const fetchAccountMe = () => {
  return client.get('/api/account/me');
};

export const updateAccountMe = ({ salutation } = {}) => {
  return client.patch('/api/account/me', { salutation });
};

const accountApi = {
  fetchAccountMe,
  updateAccountMe,
};

export default accountApi;

