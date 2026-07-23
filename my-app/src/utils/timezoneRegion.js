const TIMEZONE_REGION_TRANSLATIONS = {
  随便看看: { key: 'timezoneModal.random', fallback: '随便看看' },
  欧洲: { key: 'timezoneModal.europe', fallback: '欧洲' },
  北美: { key: 'timezoneModal.northAmerica', fallback: '北美' },
  澳洲: { key: 'timezoneModal.oceania', fallback: '澳洲' },
  日韩: { key: 'timezoneModal.japanKorea', fallback: '日韩' },
  中国: { key: 'timezoneModal.china', fallback: '中国' },
};

export const getTimezoneRegionLabel = (region, t) => {
  const value = typeof region === 'string' ? region.trim() : '';
  if (!value) return '';

  const translation = TIMEZONE_REGION_TRANSLATIONS[value];
  if (!translation || typeof t !== 'function') return value;
  return t(translation.key, translation.fallback);
};

