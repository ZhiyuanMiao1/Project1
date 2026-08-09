const normalizePrefix = (value: unknown) => (
  typeof value === 'string' ? value.trim().replace(/^\/+|\/+$/g, '') : ''
);

export const buildRecordingMp4Prefix = (roomId: string) => (
  `recordings/mp4/${roomId}`
);

export const buildRecordingHlsPrefix = (roomId: string) => (
  `recordings/hls/${roomId}`
);

export const toRecordingDisplayFileName = (fileName: string) => {
  const courseChannelIndex = fileName.indexOf('_course_');
  return courseChannelIndex >= 0 ? fileName.slice(courseChannelIndex + 1) : fileName;
};

export const resolveReplayMp4ObjectPrefix = (storagePrefix: unknown) => {
  const normalizedPrefix = normalizePrefix(storagePrefix);
  if (!normalizedPrefix) return '';

  const mp4Directory = normalizedPrefix.startsWith('recordings/mp4/')
    ? normalizedPrefix
    : `${normalizedPrefix}/mp4`;

  return `${mp4Directory}/`;
};
