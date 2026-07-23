import { getTimezoneRegionLabel } from './timezoneRegion';

describe('getTimezoneRegionLabel', () => {
  const englishLabels = {
    'timezoneModal.random': 'Explore',
    'timezoneModal.europe': 'Europe',
    'timezoneModal.northAmerica': 'North America',
    'timezoneModal.oceania': 'Oceania',
    'timezoneModal.japanKorea': 'Japan / Korea',
    'timezoneModal.china': 'China',
  };
  const t = (key, fallback) => englishLabels[key] || fallback;

  test('translates the stable Chinese region value for display', () => {
    expect(getTimezoneRegionLabel('北美', t)).toBe('North America');
    expect(getTimezoneRegionLabel('中国', t)).toBe('China');
  });

  test('preserves empty and unknown region values', () => {
    expect(getTimezoneRegionLabel('', t)).toBe('');
    expect(getTimezoneRegionLabel('Other region', t)).toBe('Other region');
  });
});

