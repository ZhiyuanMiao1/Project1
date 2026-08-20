"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveClassroomRecordingConsent = exports.getClassroomRecordingConsentSummary = exports.ensureClassroomRecordingConsentsTable = exports.CURRENT_RECORDING_NOTICE_HASH = exports.CURRENT_RECORDING_NOTICE_VERSION = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../db");
exports.CURRENT_RECORDING_NOTICE_VERSION = '2026-08-20';
const RECORDING_NOTICE_CANONICAL_TEXT = [
    'Cloud recording covers classroom audio, video, screen sharing and classroom comments.',
    'Purposes: lesson replay, learning review, quality assurance and dispute handling.',
    'Access is limited to authorized lesson participants and platform personnel as needed.',
    'A participant may decline and enter the lesson without cloud recording.',
].join('\n');
exports.CURRENT_RECORDING_NOTICE_HASH = (0, crypto_1.createHash)('sha256')
    .update(RECORDING_NOTICE_CANONICAL_TEXT, 'utf8')
    .digest('hex');
let recordingConsentTableReady = false;
const ensureClassroomRecordingConsentsTable = async () => {
    if (recordingConsentTableReady)
        return;
    await (0, db_1.query)(`
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
exports.ensureClassroomRecordingConsentsTable = ensureClassroomRecordingConsentsTable;
const toIsoString = (value) => {
    if (!value)
        return '';
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
};
const getClassroomRecordingConsentSummary = async (context, currentUserId) => {
    await (0, exports.ensureClassroomRecordingConsentsTable)();
    const rows = await (0, db_1.query)(`SELECT user_id, participant_role, decision, notice_version, decided_at
     FROM classroom_recording_consents
     WHERE course_session_id = ? AND user_id IN (?, ?)`, [context.courseId, context.studentUserId, context.mentorUserId]);
    const byUserId = new Map(rows.map((row) => [Number(row.user_id), row]));
    const student = byUserId.get(context.studentUserId) || null;
    const mentor = byUserId.get(context.mentorUserId) || null;
    const current = currentUserId ? byUserId.get(currentUserId) || null : null;
    const currentVersionAccepted = (row) => (row?.decision === 'accepted' && row.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION);
    return {
        noticeVersion: exports.CURRENT_RECORDING_NOTICE_VERSION,
        currentDecision: current?.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION ? current.decision : '',
        currentDecidedAt: current?.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION
            ? toIsoString(current.decided_at)
            : '',
        studentDecision: student?.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION ? student.decision : '',
        mentorDecision: mentor?.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION ? mentor.decision : '',
        allAccepted: currentVersionAccepted(student) && currentVersionAccepted(mentor),
        hasDeclined: [student, mentor].some((row) => (row?.notice_version === exports.CURRENT_RECORDING_NOTICE_VERSION && row.decision === 'declined')),
    };
};
exports.getClassroomRecordingConsentSummary = getClassroomRecordingConsentSummary;
const saveClassroomRecordingConsent = async ({ context, userId, decision, locale, ip, userAgent, }) => {
    await (0, exports.ensureClassroomRecordingConsentsTable)();
    await (0, db_1.query)(`INSERT INTO classroom_recording_consents
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
       user_agent = VALUES(user_agent)`, [
        context.courseId,
        userId,
        context.roleInSession,
        exports.CURRENT_RECORDING_NOTICE_VERSION,
        exports.CURRENT_RECORDING_NOTICE_HASH,
        locale,
        decision,
        ip || null,
        userAgent || null,
    ]);
    return (0, exports.getClassroomRecordingConsentSummary)(context, userId);
};
exports.saveClassroomRecordingConsent = saveClassroomRecordingConsent;
