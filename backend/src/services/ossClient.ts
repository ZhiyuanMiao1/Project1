import OSS from 'ali-oss';

const normalizeRegion = (region: string) => {
  const clean = (region || '').trim();
  if (!clean) return '';
  return clean.startsWith('oss-') ? clean : `oss-${clean}`;
};

let cached: OSS | null = null;

export const getOssClient = () => {
  if (cached) return cached;

  const bucket = (process.env.OSS_BUCKET || '').trim();
  const region = normalizeRegion(process.env.OSS_REGION || '');
  const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || '').trim();
  const accessKeySecret = (process.env.OSS_ACCESS_KEY_SECRET || '').trim();

  if (!bucket || !region || !accessKeyId || !accessKeySecret) return null;

  cached = new OSS({
    bucket,
    region,
    accessKeyId,
    accessKeySecret,
    secure: true,
  });

  return cached;
};

export const buildContentDisposition = (fileName: string) => {
  const raw = typeof fileName === 'string' ? fileName.trim() : '';
  const safe = raw
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\\"]/g, '_')
    .slice(0, 180) || 'download';

  const encoded = encodeURIComponent(raw || safe).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`;
};
