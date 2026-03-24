import { Request, Response, Router } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { query } from '../db';
import { requireAuth } from '../middleware/auth';
import { buildContentDisposition, getOssClient } from '../services/ossClient';
import {
  ClassroomHttpError,
  isClassroomClosed,
  isMissingClassroomSchemaError,
  loadAuthorizedClassroomContext,
  parseStoredUtcDate,
  safeText,
} from '../services/classroomAccess';

const router = Router();

const MAX_TEXT_LENGTH = 4000;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MESSAGE_FETCH_LIMIT = 200;
const SIGNED_URL_EXPIRE_SECONDS = 120;
const ALLOWED_FILE_EXTS = new Set(['pdf', 'ppt', 'pptx', 'doc', 'docx', 'png', 'jpg', 'jpeg', 'zip']);

const isHex32 = (value: unknown) => typeof value === 'string' && /^[0-9a-f]{32}$/i.test(value.trim());

const isMissingClassroomChatSchemaError = (err: any) => {
  if (isMissingClassroomSchemaError(err)) return true;
  const code = typeof err?.code === 'string' ? err.code : '';
  if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return message.includes('classroom_messages') || message.includes('classroom_temp_files');
};

const normalizeIso = (value: unknown) => {
  const parsed = parseStoredUtcDate(value);
  if (!parsed) return '';
  return parsed.toISOString();
};

const resolveCleanupTimestamp = (startsAtIso: string, durationHours: number) => {
  const startsAt = parseStoredUtcDate(startsAtIso);
  if (!startsAt) return new Date();
  return new Date(startsAt.getTime() + Math.max(Number(durationHours) || 0, 0) * 60 * 60 * 1000);
};

const MESSAGE_FETCH_LIMIT_SQL = String(MESSAGE_FETCH_LIMIT);

const markClassroomFilesReady = async (classroomId: number, cleanupAfter = new Date()) => {
  const result = await query<ResultSetHeader>(
    `
    UPDATE classroom_temp_files
    SET cleanup_status = 'ready',
        cleanup_after = COALESCE(cleanup_after, ?)
    WHERE classroom_id = ?
      AND cleanup_status = 'active'
    `,
    [cleanupAfter, classroomId]
  );

  return Number(result?.affectedRows || 0);
};

const buildSignedDownloadUrl = (ossKey: string, fileName: string) => {
  const client = getOssClient();
  if (!client) return null;
  return client.signatureUrl(ossKey, {
    expires: SIGNED_URL_EXPIRE_SECONDS,
    response: {
      'content-disposition': buildContentDisposition(fileName),
    },
  });
};

const mapSenderRole = (
  senderUserId: number,
  studentUserId: number,
  mentorUserId: number
) => {
  if (senderUserId === mentorUserId) return 'mentor';
  if (senderUserId === studentUserId) return 'student';
  return '';
};

router.get('/:courseId/chat', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课堂ID' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
    const chatClosed = isClassroomClosed(context);
    if (chatClosed) {
      await markClassroomFilesReady(courseId, new Date());
    }

    const messageRows = await query<any[]>(
      `
      SELECT *
      FROM (
        SELECT
          cm.id,
          cm.sender_user_id,
          cm.message_type,
          cm.text_content,
          cm.file_id,
          cm.created_at,
          ctf.original_file_name,
          ctf.content_type,
          ctf.size_bytes,
          ctf.ext,
          ctf.cleanup_status
        FROM classroom_messages cm
        LEFT JOIN classroom_temp_files ctf
          ON ctf.classroom_id = cm.classroom_id
         AND ctf.file_id = cm.file_id
        WHERE cm.classroom_id = ?
        ORDER BY cm.id DESC
        LIMIT ${MESSAGE_FETCH_LIMIT_SQL}
      ) recent_messages
      ORDER BY id ASC
      `,
      [courseId]
    );

    const messages = (messageRows || []).map((row) => {
      const senderUserId = Number(row?.sender_user_id);
      const senderRole = mapSenderRole(senderUserId, context.studentUserId, context.mentorUserId);
      const messageType = safeText(row?.message_type).toLowerCase();
      const fileId = safeText(row?.file_id).toLowerCase();

      return {
        id: String(row?.id || ''),
        messageType,
        senderUserId: Number.isFinite(senderUserId) ? senderUserId : null,
        senderRole,
        createdAt: normalizeIso(row?.created_at),
        textContent: messageType === 'text' ? safeText(row?.text_content) : '',
        file: messageType === 'file' && fileId
          ? {
              fileId,
              fileName: safeText(row?.original_file_name),
              sizeBytes: Number(row?.size_bytes) || 0,
              contentType: safeText(row?.content_type) || null,
              ext: safeText(row?.ext).toLowerCase(),
              cleanupStatus: safeText(row?.cleanup_status).toLowerCase() || 'active',
            }
          : null,
      };
    });

    const lastMessageId = messages.length ? String(messages[messages.length - 1]?.id || '') : '';

    return res.json({
      messages,
      lastMessageId,
      chatClosed,
      cleanupEligible: chatClosed,
    });
  } catch (error) {
    if (error instanceof ClassroomHttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (isMissingClassroomChatSchemaError(error)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Fetch classroom chat error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/:courseId/chat/messages', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课堂ID' });
  }

  const messageType = safeText(req.body?.messageType).toLowerCase();
  if (messageType !== 'text' && messageType !== 'file') {
    return res.status(400).json({ error: '无效消息类型' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
    if (isClassroomClosed(context)) {
      return res.status(409).json({ error: '课堂已结束，当前聊天为只读状态' });
    }

    if (messageType === 'text') {
      const textContent = safeText(req.body?.textContent);
      if (!textContent) return res.status(400).json({ error: '消息内容不能为空' });
      if (textContent.length > MAX_TEXT_LENGTH) return res.status(400).json({ error: '消息内容过长' });

      const result = await query<ResultSetHeader>(
        `
        INSERT INTO classroom_messages (classroom_id, sender_user_id, message_type, text_content, file_id)
        VALUES (?, ?, 'text', ?, NULL)
        `,
        [courseId, req.user.id, textContent]
      );

      return res.json({
        id: Number(result?.insertId || 0),
        messageType: 'text',
      });
    }

    const file = req.body?.file;
    const fileId = safeText(file?.fileId).toLowerCase();
    const fileName = safeText(file?.fileName);
    const ext = safeText(file?.ext).toLowerCase();
    const contentType = safeText(file?.contentType) || null;
    const ossKey = safeText(file?.ossKey);
    const fileUrl = safeText(file?.fileUrl);
    const sizeBytes = Number(file?.sizeBytes);

    if (!isHex32(fileId)) return res.status(400).json({ error: '文件标识无效' });
    if (!fileName) return res.status(400).json({ error: '缺少文件名' });
    if (!ALLOWED_FILE_EXTS.has(ext)) return res.status(400).json({ error: '不支持的文件格式' });
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_FILE_BYTES) {
      return res.status(400).json({ error: '文件大小无效' });
    }

    const keyPrefix = `temp/classrooms/${courseId}/`;
    if (!ossKey.startsWith(keyPrefix)) {
      return res.status(400).json({ error: '文件路径无效' });
    }
    if (!fileUrl) return res.status(400).json({ error: '缺少文件地址' });

    const existingRows = await query<any[]>(
      `
      SELECT classroom_id, uploader_user_id
      FROM classroom_temp_files
      WHERE file_id = ?
      LIMIT 1
      `,
      [fileId]
    );
    const existingFile = existingRows?.[0] || null;
    if (existingFile) {
      const existingClassroomId = Number(existingFile.classroom_id);
      const existingUploaderUserId = Number(existingFile.uploader_user_id);
      if (existingClassroomId !== courseId || existingUploaderUserId !== req.user.id) {
        return res.status(409).json({ error: '该文件不可发送到当前课堂' });
      }
    } else {
      const cleanupAfter = resolveCleanupTimestamp(context.startsAt, context.durationHours);
      await query<ResultSetHeader>(
        `
        INSERT INTO classroom_temp_files (
          classroom_id,
          uploader_user_id,
          file_id,
          original_file_name,
          content_type,
          size_bytes,
          ext,
          oss_key,
          file_url,
          cleanup_status,
          cleanup_after
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
        `,
        [
          courseId,
          req.user.id,
          fileId,
          fileName,
          contentType,
          sizeBytes,
          ext,
          ossKey,
          fileUrl,
          cleanupAfter,
        ]
      );
    }

    const result = await query<ResultSetHeader>(
      `
      INSERT INTO classroom_messages (classroom_id, sender_user_id, message_type, text_content, file_id)
      VALUES (?, ?, 'file', NULL, ?)
      `,
      [courseId, req.user.id, fileId]
    );

    return res.json({
      id: Number(result?.insertId || 0),
      messageType: 'file',
      fileId,
    });
  } catch (error) {
    if (error instanceof ClassroomHttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (isMissingClassroomChatSchemaError(error)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Send classroom chat message error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.post('/:courseId/chat/files/prepare-cleanup', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课堂ID' });
  }

  try {
    const context = await loadAuthorizedClassroomContext(courseId, req.user.id);
    if (!isClassroomClosed(context)) {
      return res.status(409).json({ error: '课堂进行中，暂不可清理临时文件' });
    }

    const updatedCount = await markClassroomFilesReady(courseId, new Date());
    return res.json({
      classroomId: String(courseId),
      cleanupEligible: true,
      updatedCount,
    });
  } catch (error) {
    if (error instanceof ClassroomHttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (isMissingClassroomChatSchemaError(error)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Prepare classroom file cleanup error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

router.get('/:courseId/chat/files/:fileId/download-url', requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: '未授权' });

  const courseId = Number.parseInt(String(req.params.courseId || ''), 10);
  const fileId = safeText(req.params.fileId).toLowerCase();
  if (!Number.isFinite(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '无效课堂ID' });
  }
  if (!isHex32(fileId)) {
    return res.status(400).json({ error: '无效文件标识' });
  }

  try {
    await loadAuthorizedClassroomContext(courseId, req.user.id);

    const fileRows = await query<any[]>(
      `
      SELECT original_file_name, oss_key, cleanup_status
      FROM classroom_temp_files
      WHERE classroom_id = ? AND file_id = ?
      LIMIT 1
      `,
      [courseId, fileId]
    );
    const row = fileRows?.[0];
    if (!row) return res.status(404).json({ error: '未找到文件' });

    const cleanupStatus = safeText(row?.cleanup_status).toLowerCase();
    if (cleanupStatus === 'deleted') {
      return res.status(410).json({ error: '文件已清理' });
    }

    const fileName = safeText(row?.original_file_name);
    const ossKey = safeText(row?.oss_key);
    const url = buildSignedDownloadUrl(ossKey, fileName);
    if (!url) return res.status(500).json({ error: 'OSS 未配置' });

    return res.json({
      fileId,
      url,
      expiresAt: Math.floor(Date.now() / 1000) + SIGNED_URL_EXPIRE_SECONDS,
    });
  } catch (error) {
    if (error instanceof ClassroomHttpError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (isMissingClassroomChatSchemaError(error)) {
      return res.status(500).json({ error: '数据库未升级，请先执行 backend/schema.sql' });
    }
    console.error('Create classroom file download url error:', error);
    return res.status(500).json({ error: '服务器错误，请稍后再试' });
  }
});

export default router;
