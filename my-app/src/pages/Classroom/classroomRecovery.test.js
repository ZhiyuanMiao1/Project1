import {
  getRemoteUnavailableStatusText,
  isRemoteUnavailableError,
  isRetryableRemotePlayError,
} from './classroomRecovery';

describe('classroomRecovery', () => {
  test('treats code 50026 and equivalent remote missing messages as recoverable', () => {
    expect(isRemoteUnavailableError({ code: 50026 })).toBe(true);
    expect(isRemoteUnavailableError({ message: 'no remote user founded' })).toBe(true);
    expect(isRemoteUnavailableError({ message: 'remote user does not exist' })).toBe(true);
    expect(isRemoteUnavailableError({ message: 'stream not exist yet' })).toBe(true);
    expect(isRemoteUnavailableError({ message: '对方暂未推流' })).toBe(true);
  });

  test('keeps retrying for remote playback availability errors', () => {
    expect(isRetryableRemotePlayError({ code: 50026 })).toBe(true);
    expect(isRetryableRemotePlayError({ message: 'timeout waiting remote stream' })).toBe(true);
    expect(isRetryableRemotePlayError({ message: 'fatal sdk crash' })).toBe(false);
  });

  test('builds user-facing waiting text from remote presence state', () => {
    expect(getRemoteUnavailableStatusText({ remoteLabel: '学生A', remotePresent: false })).toBe('已进入课堂，等待学生A加入...');
    expect(getRemoteUnavailableStatusText({ remoteLabel: '学生A', remotePresent: true })).toBe('双方已进入课堂，等待学生A画面...');
    expect(getRemoteUnavailableStatusText({ remoteLabel: '学生A', hadRemoteStream: true, remotePresent: false })).toBe('对方暂时离线，等待重新加入...');
  });
});
