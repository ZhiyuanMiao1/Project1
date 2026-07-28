import { query } from '../db';

const safeStatus = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase() : ''
);

type MentorCourseRequestAccessInput = {
  requestId: number;
  studentUserId: number;
  mentorUserId: number;
  requestStatus: unknown;
};

export const canMentorReadCourseRequest = async ({
  requestId,
  studentUserId,
  mentorUserId,
  requestStatus,
}: MentorCourseRequestAccessInput) => {
  if (![requestId, studentUserId, mentorUserId].every((value) => Number.isFinite(value) && value > 0)) {
    return false;
  }

  const rows = await query<any[]>(
    `
    SELECT
      EXISTS (
        SELECT 1
        FROM message_items mi
        INNER JOIN message_threads mt
          ON mt.id = mi.thread_id
         AND mt.student_user_id = ?
         AND mt.mentor_user_id = ?
        WHERE mi.message_type = 'appointment_card'
          AND JSON_UNQUOTE(
            CASE
              WHEN JSON_VALID(mi.payload_json) THEN JSON_EXTRACT(mi.payload_json, '$.courseRequestId')
              ELSE NULL
            END
          ) = CAST(? AS CHAR)
        LIMIT 1
      ) AS is_linked_mentor,
      EXISTS (
        SELECT 1
        FROM message_items mi
        INNER JOIN message_threads mt
          ON mt.id = mi.thread_id
         AND mt.student_user_id = ?
        INNER JOIN appointment_statuses ast
          ON ast.appointment_message_id = mi.id
         AND ast.status = 'accepted'
        WHERE mi.message_type = 'appointment_card'
          AND JSON_UNQUOTE(
            CASE
              WHEN JSON_VALID(mi.payload_json) THEN JSON_EXTRACT(mi.payload_json, '$.courseRequestId')
              ELSE NULL
            END
          ) = CAST(? AS CHAR)
        LIMIT 1
      ) AS has_accepted_appointment
    `,
    [studentUserId, mentorUserId, requestId, studentUserId, requestId]
  );

  const access = rows?.[0] || {};
  const isLinkedMentor = access.is_linked_mentor === 1 || access.is_linked_mentor === true;
  if (isLinkedMentor) return true;

  const hasAcceptedAppointment =
    access.has_accepted_appointment === 1 || access.has_accepted_appointment === true;
  return safeStatus(requestStatus) === 'submitted' && !hasAcceptedAppointment;
};
