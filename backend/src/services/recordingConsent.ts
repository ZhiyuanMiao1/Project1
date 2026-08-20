import { createHash } from 'crypto';
import { query as dbQuery } from '../db';
import type { AuthorizedClassroomContext, SessionRole } from './classroomAccess';

export const CURRENT_RECORDING_NOTICE_VERSION = '2026-08-20';

const RECORDING_NOTICE_CANONICAL_TEXT = [
  'Cloud recording covers classroom audio, video, screen sharing and classroom comments.',
  'Purposes: lesson replay, learning review, quality assurance and dispute handling.',
  'Access is limited to authorized lesson participants and platform personnel as needed.',
  'A participant who does not agree must exit the classroom.',
  'Acceptance is reused across Mentory classrooms for this notice version.',
].join('\n');

export const CURRENT_RECORDING_NOTICE_HASH = createHash('sha256')
  .update(RECORDING_NOTICE_CANONICAL_TEXT, 'utf8')
  .digest('hex');

export type RecordingConsentDecision = 'accepted' | 'declined';

type RecordingConsentRow = {
  user_id: number | string;
  participant_role: SessionRole;
  decision: RecordingConsentDecision;
  notice_version: string;
  decided_at: Date | string | null;
};

let recordingConsentTableReady = false;

export const ensureClassroomRecordingConsentsTable = async () => {
  if (recordingConsentTableReady) return;

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS classroom_recording_consents (
      id BIGINT NOT NULL AUTO_INCREMENT,
      course_session_id BIGINT NOT NULL,
      user_id INT NOT NULL,
      participant_role ENUM('mentor','student') NOT NULL,
      notice_version VARCHAR(40) NOT NULL,
      notice_hash CHAR(64) NOT NULL,
      notice_locale ENUM('zh-CN','en') NOT NULL DEFAULT 'zh-CN',
      decision ENUM('accepted','declined') NOT NULL,
      decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip VARCHAR(45) NULL,
      user_agent VARCHAR(255) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_classroom_recording_consent (course_session_id, user_id),
      KEY idx_classroom_recording_consents_course (course_session_id, decision),
      KEY idx_classroom_recording_consents_user (user_id, decided_at),
      CONSTRAINT fk_classroom_recording_consents_course FOREIGN KEY (course_session_id) REFERENCES course_sessions(id) ON DELETE CASCADE,
      CONSTRAINT fk_classroom_recording_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  recordingConsentTableReady = true;
};

const toIsoString = (value: Date | string | null) => {
  if (!value) return '';
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};

export const getClassroomRecordingConsentSummary = async (
  context: AuthorizedClassroomContext,
  currentUserId?: number
) => {
  await ensureClassroomRecordingConsentsTable();
  const rows = await dbQuery<RecordingConsentRow[]>(
    `SELECT user_id, participant_role, decision, notice_version, decided_at
     FROM classroom_recording_consents
     WHERE course_session_id = ? AND user_id IN (?, ?)`,
    [context.courseId, context.studentUserId, context.mentorUserId]
  );

  const acceptedRows = await dbQuery<RecordingConsentRow[]>(
    `SELECT user_id, participant_role, decision, notice_version, decided_at
     FROM classroom_recording_consents
     WHERE user_id IN (?, ?)
       AND notice_version = ?
       AND decision = 'accepted'
     ORDER BY decided_at DESC`,
    [context.studentUserId, context.mentorUserId, CURRENT_RECORDING_NOTICE_VERSION]
  );

  const byUserId = new Map(rows.map((row) => [Number(row.user_id), row]));
  const acceptedByUserId = new Map<number, RecordingConsentRow>();
  acceptedRows.forEach((row) => {
    const userId = Number(row.user_id);
    if (!acceptedByUserId.has(userId)) acceptedByUserId.set(userId, row);
  });
  const student = byUserId.get(context.studentUserId) || null;
  const mentor = byUserId.get(context.mentorUserId) || null;
  const current = currentUserId ? byUserId.get(currentUserId) || null : null;
  const effectiveStudent = acceptedByUserId.get(context.studentUserId) || student;
  const effectiveMentor = acceptedByUserId.get(context.mentorUserId) || mentor;
  const effectiveCurrent = currentUserId
    ? acceptedByUserId.get(currentUserId) || current
    : null;
  const currentVersionAccepted = (row: RecordingConsentRow | null) => (
    row?.decision === 'accepted' && row.notice_version === CURRENT_RECORDING_NOTICE_VERSION
  );

  return {
    noticeVersion: CURRENT_RECORDING_NOTICE_VERSION,
    currentDecision: effectiveCurrent?.notice_version === CURRENT_RECORDING_NOTICE_VERSION
      ? effectiveCurrent.decision
      : '',
    currentDecidedAt: effectiveCurrent?.notice_version === CURRENT_RECORDING_NOTICE_VERSION
      ? toIsoString(effectiveCurrent.decided_at)
      : '',
    studentDecision: effectiveStudent?.notice_version === CURRENT_RECORDING_NOTICE_VERSION
      ? effectiveStudent.decision
      : '',
    mentorDecision: effectiveMentor?.notice_version === CURRENT_RECORDING_NOTICE_VERSION
      ? effectiveMentor.decision
      : '',
    allAccepted: currentVersionAccepted(effectiveStudent) && currentVersionAccepted(effectiveMentor),
    hasDeclined: [effectiveStudent, effectiveMentor].some((row) => (
      row?.notice_version === CURRENT_RECORDING_NOTICE_VERSION && row.decision === 'declined'
    )),
  };
};

export const saveClassroomRecordingConsent = async ({
  context,
  userId,
  decision,
  locale,
  ip,
  userAgent,
}: {
  context: AuthorizedClassroomContext;
  userId: number;
  decision: RecordingConsentDecision;
  locale: 'zh-CN' | 'en';
  ip?: string;
  userAgent?: string;
}) => {
  await ensureClassroomRecordingConsentsTable();
  await dbQuery(
    `INSERT INTO classroom_recording_consents
      (course_session_id, user_id, participant_role, notice_version, notice_hash, notice_locale, decision, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       participant_role = VALUES(participant_role),
       notice_version = VALUES(notice_version),
       notice_hash = VALUES(notice_hash),
       notice_locale = VALUES(notice_locale),
       decision = VALUES(decision),
       decided_at = CURRENT_TIMESTAMP,
       ip = VALUES(ip),
       user_agent = VALUES(user_agent)`,
    [
      context.courseId,
      userId,
      context.roleInSession,
      CURRENT_RECORDING_NOTICE_VERSION,
      CURRENT_RECORDING_NOTICE_HASH,
      locale,
      decision,
      ip || null,
      userAgent || null,
    ]
  );

  return getClassroomRecordingConsentSummary(context, userId);
};
