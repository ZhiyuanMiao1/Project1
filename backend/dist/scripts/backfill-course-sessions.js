"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const requiredEnv = (name) => {
    const value = process.env[name];
    if (!value || !value.trim())
        throw new Error(`Missing env var: ${name}`);
    return value.trim();
};
const parsePort = (raw, fallback = 3306) => {
    const n = Number.parseInt(String(raw || '').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};
const pad2 = (n) => String(n).padStart(2, '0');
const formatUtcDatetime = (date) => {
    const y = date.getUTCFullYear();
    const m = pad2(date.getUTCMonth() + 1);
    const d = pad2(date.getUTCDate());
    const hh = pad2(date.getUTCHours());
    const mm = pad2(date.getUTCMinutes());
    const ss = pad2(date.getUTCSeconds());
    return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
};
const parseTimezoneOffsetMinutes = (raw) => {
    const s = String(raw || '')
        .trim()
        .replace(/\uFF0B/g, '+') // fullwidth plus
        .replace(/[\u2212\u2010\u2011\u2012\u2013\u2014\uFF0D]/g, '-'); // minus variants
    if (!s)
        return null;
    const match = s.match(/(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?:[:]\s*(\d{2}))?/i);
    if (!match)
        return null;
    const sign = match[1] === '-' ? -1 : 1;
    const hours = Number.parseInt(match[2], 10);
    const mins = match[3] ? Number.parseInt(match[3], 10) : 0;
    if (!Number.isFinite(hours) || hours > 14)
        return null;
    if (!Number.isFinite(mins) || mins < 0 || mins >= 60)
        return null;
    return sign * (hours * 60 + mins);
};
const parseWindowText = (windowText, createdAt) => {
    const raw = typeof windowText === 'string' ? windowText.trim() : '';
    if (!raw)
        return null;
    const normalized = raw.replace(/\s+/g, ' ').trim();
    const canonical = normalized
        .replace(/\uFF1A/g, ':') // fullwidth colon
        .replace(/[\u2013\u2014\uFF5E]/g, '-') // dash/tilde variants
        .replace(/\uFF0B/g, '+') // fullwidth plus
        .replace(/[\u2212\uFF0D]/g, '-'); // minus variants
    const tzMatch = canonical.match(/\(([^)]+)\)\s*$/);
    const tzLabel = tzMatch ? String(tzMatch[1] || '').trim() : '';
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(tzLabel) ?? parseTimezoneOffsetMinutes(canonical) ?? 0;
    const timeMatch = canonical.match(/(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/i);
    if (!timeMatch)
        return null;
    const startHour = Number.parseInt(timeMatch[1], 10);
    const startMinute = Number.parseInt(timeMatch[2], 10);
    const endHour = Number.parseInt(timeMatch[3], 10);
    const endMinute = Number.parseInt(timeMatch[4], 10);
    if (![startHour, startMinute, endHour, endMinute].every((n) => Number.isFinite(n)))
        return null;
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23)
        return null;
    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59)
        return null;
    const cnDateMatch = canonical.match(/(?:(\d{4})\s*\u5E74\s*)?(\d{1,2})\s*\u6708\s*(\d{1,2})\s*\u65E5/);
    const altDateMatch = canonical.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    const parsedYear = cnDateMatch?.[1] || altDateMatch?.[1] || '';
    const monthText = cnDateMatch?.[2] || altDateMatch?.[2] || '';
    const dayText = cnDateMatch?.[3] || altDateMatch?.[3] || '';
    const month = Number.parseInt(monthText, 10);
    const day = Number.parseInt(dayText, 10);
    if (!Number.isFinite(month) || !Number.isFinite(day))
        return null;
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    const buildStartUtc = (year) => {
        const utcMillis = Date.UTC(year, month - 1, day, startHour, startMinute, 0) - tzOffsetMinutes * 60000;
        return new Date(utcMillis);
    };
    const buildEndUtc = (startUtc) => {
        let durationMinutes = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        if (durationMinutes <= 0)
            durationMinutes += 24 * 60;
        const endUtc = new Date(startUtc.getTime() + durationMinutes * 60000);
        return { durationMinutes, endUtc };
    };
    let year = null;
    if (parsedYear) {
        const y = Number.parseInt(parsedYear, 10);
        if (Number.isFinite(y) && y >= 1970 && y <= 2100)
            year = y;
    }
    if (year == null) {
        const base = createdAt instanceof Date ? createdAt : new Date(createdAt);
        const baseYear = base.getUTCFullYear();
        const candidates = [baseYear - 1, baseYear, baseYear + 1];
        const baseMs = base.getTime();
        const computed = candidates.map((candidateYear) => {
            const startUtc = buildStartUtc(candidateYear);
            return { year: candidateYear, startUtc, diffMs: startUtc.getTime() - baseMs };
        });
        const acceptable = computed
            .filter((c) => c.diffMs >= -36 * 60 * 60 * 1000)
            .sort((a, b) => a.diffMs - b.diffMs);
        year = (acceptable[0] || computed.sort((a, b) => Math.abs(a.diffMs) - Math.abs(b.diffMs))[0])?.year ?? baseYear;
    }
    const startsAtUtc = buildStartUtc(year);
    if (!Number.isFinite(startsAtUtc.getTime()))
        return null;
    const { durationMinutes, endUtc } = buildEndUtc(startsAtUtc);
    const durationHours = Math.round((durationMinutes / 60) * 100) / 100;
    return {
        startsAtUtc,
        endsAtUtc: endUtc,
        durationHours,
        tzOffsetMinutes,
    };
};
async function main() {
    const host = requiredEnv('DB_HOST');
    const user = requiredEnv('DB_USER');
    const password = process.env.DB_PASSWORD || '';
    const database = requiredEnv('DB_NAME');
    const port = parsePort(process.env.DB_PORT, 3306);
    const connection = await promise_1.default.createConnection({ host, port, user, password, database, multipleStatements: false });
    const [acceptedRows] = await connection.query(`
    SELECT
      mi.id AS appointment_id,
      mi.thread_id,
      mi.payload_json,
      mi.created_at,
      t.student_user_id,
      t.mentor_user_id
    FROM message_items mi
    INNER JOIN appointment_statuses ast
      ON ast.appointment_message_id = mi.id
     AND ast.status = 'accepted'
    INNER JOIN message_threads t
      ON t.id = mi.thread_id
    WHERE mi.message_type = 'appointment_card'
    ORDER BY mi.id ASC
    `);
    let inserted = 0;
    let skipped = 0;
    let failedParse = 0;
    for (const row of acceptedRows || []) {
        const appointmentId = Number(row?.appointment_id);
        const studentUserId = Number(row?.student_user_id);
        const mentorUserId = Number(row?.mentor_user_id);
        const createdAt = row?.created_at ? new Date(row.created_at) : new Date();
        if (!Number.isFinite(appointmentId) || appointmentId <= 0)
            continue;
        if (!Number.isFinite(studentUserId) || studentUserId <= 0)
            continue;
        if (!Number.isFinite(mentorUserId) || mentorUserId <= 0)
            continue;
        let payload = null;
        try {
            payload = row?.payload_json ? JSON.parse(String(row.payload_json)) : null;
        }
        catch {
            payload = null;
        }
        const courseDirection = typeof payload?.courseDirectionId === 'string' && payload.courseDirectionId.trim()
            ? payload.courseDirectionId.trim()
            : null;
        const courseType = typeof payload?.courseTypeId === 'string' && payload.courseTypeId.trim()
            ? payload.courseTypeId.trim()
            : null;
        const windowText = typeof payload?.windowText === 'string' ? payload.windowText : '';
        const parsed = parseWindowText(windowText, createdAt);
        if (!parsed) {
            failedParse += 1;
            continue;
        }
        const startsAt = formatUtcDatetime(parsed.startsAtUtc);
        const status = parsed.endsAtUtc.getTime() <= Date.now() ? 'completed' : 'scheduled';
        const [existing] = await connection.query(`SELECT id FROM course_sessions WHERE student_user_id = ? AND mentor_user_id = ? AND starts_at = ? LIMIT 1`, [studentUserId, mentorUserId, startsAt]);
        if (existing && existing.length > 0) {
            skipped += 1;
            continue;
        }
        await connection.execute(`
      INSERT INTO course_sessions
        (student_user_id, mentor_user_id, course_direction, course_type, starts_at, duration_hours, status)
      VALUES
        (?, ?, ?, ?, ?, ?, ?)
      `, [
            studentUserId,
            mentorUserId,
            courseDirection,
            courseType,
            startsAt,
            parsed.durationHours,
            status,
        ]);
        inserted += 1;
    }
    console.log(JSON.stringify({
        acceptedInvites: Array.isArray(acceptedRows) ? acceptedRows.length : 0,
        inserted,
        skipped,
        failedParse,
    }, null, 2));
    await connection.end();
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
