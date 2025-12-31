import client from './client';

export const fetchApprovedMentors = (params = {}) => {
  const directionId = typeof params?.directionId === 'string' ? params.directionId.trim() : '';
  return client.get('/api/mentors/approved', {
    params: directionId ? { directionId } : {},
  });
};

const mentorsApi = {
  fetchApprovedMentors,
};

export default mentorsApi;
