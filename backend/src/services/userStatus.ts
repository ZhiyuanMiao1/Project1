import { query } from '../db';

export type AccountStatus = 'active' | 'suspended';

const isMissingAccountStatusColumn = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'ER_BAD_FIELD_ERROR' || message.includes('account_status');
};

export const getUserAccountStatus = async (userId: number): Promise<AccountStatus> => {
  try {
    const rows = await query<Array<{ account_status?: string }>>(
      'SELECT account_status FROM users WHERE id = ? LIMIT 1',
      [userId]
    );
    return rows?.[0]?.account_status === 'suspended' ? 'suspended' : 'active';
  } catch (error) {
    if (isMissingAccountStatusColumn(error)) return 'active';
    throw error;
  }
};

export const isUserSuspended = async (userId: number) => {
  return (await getUserAccountStatus(userId)) === 'suspended';
};
