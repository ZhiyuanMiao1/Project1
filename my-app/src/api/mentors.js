import client from './client';

export const fetchApprovedMentors = (params = {}) => {
  const directionId = typeof params?.directionId === 'string' ? params.directionId.trim() : '';
  return client.get('/api/mentors/approved', {
    params: directionId ? { directionId } : {},
  });
};

export const fetchMentorAvailability = (mentorId) => {
  const id = typeof mentorId === 'string' ? mentorId.trim() : '';
  return client.get(`/api/mentors/${encodeURIComponent(id)}/availability`);
};

const mentorsApi = {
  fetchApprovedMentors,
  fetchMentorAvailability,
};

export default mentorsApi;
