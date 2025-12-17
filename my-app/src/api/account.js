import client from './client';

export const fetchAccountProfile = () => {
  return client.get('/api/account/ids');
};

const accountApi = {
  fetchAccountProfile,
};

export default accountApi;
