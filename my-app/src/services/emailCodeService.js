import api from '../api/client';

const REGISTER_PURPOSE = 'register';

export const getEmailCodeErrorMessage = (error, fallback = '操作失败，请稍后再试') => {
  const data = error?.response?.data;
  const firstValidationMessage = Array.isArray(data?.errors) ? data.errors[0]?.msg : '';
  return firstValidationMessage || data?.error || error?.message || fallback;
};

export const sendRegisterEmailCode = async ({ email }) => {
  const res = await api.post('/api/auth/send-email-code', {
    email,
    purpose: REGISTER_PURPOSE,
  });
  return res?.data || {};
};

export const verifyRegisterEmailCode = async ({ email, code }) => {
  const res = await api.post('/api/auth/verify-email-code', {
    email,
    purpose: REGISTER_PURPOSE,
    code,
  });
  return res?.data || {};
};
