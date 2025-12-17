import client from './client';

export const fetchAccountIds = () => {
  return client.get('/api/account/ids');
};

const accountApi = {
  fetchAccountIds,
};

export default accountApi;
