import client from './client';

export const fetchApprovedMentors = () => {
  return client.get('/api/mentors/approved');
};

const mentorsApi = {
  fetchApprovedMentors,
};

export default mentorsApi;
