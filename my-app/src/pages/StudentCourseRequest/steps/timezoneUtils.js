const TIMEZONE_NAME_OVERRIDES = {
  'Asia/Shanghai': '\u4e2d\u56fd\u6807\u51c6\u65f6\u95f4',
  'Asia/Tokyo': '\u65e5\u672c\u6807\u51c6\u65f6\u95f4',
  'Asia/Bangkok': '\u6cf0\u56fd\u65f6\u95f4',
  'Asia/Dubai': '\u6d77\u6e7e\u6807\u51c6\u65f6\u95f4',
  'Europe/London': '\u683c\u6797\u5c3c\u6c0f\u6807\u51c6\u65f6\u95f4',
  'Europe/Berlin': '\u4e2d\u6b27\u6807\u51c6\u65f6\u95f4',
  'Europe/Moscow': '\u83ab\u65af\u79d1\u65f6\u95f4',
  'America/Los_Angeles': '\u7f8e\u56fd\u592a\u5e73\u6d0b\u65f6\u95f4',
  'America/Denver': '\u7f8e\u56fd\u5c71\u5730\u65f6\u95f4',
  'America/Chicago': '\u7f8e\u56fd\u4e2d\u90e8\u65f6\u95f4',
  'America/New_York': '\u7f8e\u56fd\u4e1c\u90e8\u65f6\u95f4',
  'America/Sao_Paulo': '\u5df4\u897f\u5229\u4e9a\u65f6\u95f4',
  'Pacific/Auckland': '\u65b0\u897f\u5170\u6807\u51c6\u65f6\u95f4',
  'Australia/Brisbane': '\u6fb3\u5927\u5229\u4e9a\u4e1c\u90e8\u65f6\u95f4',
  'America/Halifax': '\u52a0\u62ff\u5927\u5927\u897f\u6d0b\u65f6\u95f4',
  'America/Anchorage': '\u7f8e\u56fd\u963f\u62c9\u65af\u52a0\u65f6\u95f4',
  'Pacific/Honolulu': '\u590f\u5a01\u5937\u65f6\u95f4',
  'Pacific/Pago_Pago': '\u8428\u6469\u4e9a\u65f6\u95f4',
  'Atlantic/Azores': '\u4e9a\u901f\u5c14\u7fa4\u5c9b\u65f6\u95f4',
  'Atlantic/South_Georgia': '\u5357\u4e54\u6cbb\u4e9a\u65f6\u95f4',
  'Africa/Johannesburg': '\u5357\u975e\u65f6\u95f4',
  'Asia/Karachi': '\u5df4\u57fa\u65af\u5766\u6807\u51c6\u65f6\u95f4',
  'Asia/Dhaka': '\u5b5f\u52a0\u62c9\u56fd\u6807\u51c6\u65f6\u95f4',
  'Pacific/Guadalcanal': '\u6240\u7f57\u95e8\u7fa4\u5c9b\u65f6\u95f4',
};

// 24 curated time zones: one representative per UTC hour offset (-11 to +12)
const FALLBACK_TIMEZONES = [
  'Pacific/Pago_Pago',       // UTC-11
  'Pacific/Honolulu',        // UTC-10
  'America/Anchorage',       // UTC-09
  'America/Los_Angeles',     // UTC-08
  'America/Denver',          // UTC-07
  'America/Chicago',         // UTC-06
  'America/New_York',        // UTC-05
  'America/Halifax',         // UTC-04
  'America/Sao_Paulo',       // UTC-03
  'Atlantic/South_Georgia',  // UTC-02
  'Atlantic/Azores',         // UTC-01
  'Europe/London',           // UTC±00
  'Europe/Berlin',           // UTC+01
  'Africa/Johannesburg',     // UTC+02 (no DST)
  'Europe/Moscow',           // UTC+03
  'Asia/Dubai',              // UTC+04
  'Asia/Karachi',            // UTC+05
  'Asia/Dhaka',              // UTC+06
  'Asia/Bangkok',            // UTC+07
  'Asia/Shanghai',           // UTC+08
  'Asia/Tokyo',              // UTC+09
  'Australia/Brisbane',      // UTC+10 (no DST)
  'Pacific/Guadalcanal',     // UTC+11
  'Pacific/Auckland',        // UTC+12
];

const extractCityName = (timeZone) => {
  if (!timeZone) {
    return '';
  }
  const segments = timeZone.split('/');
  if (segments.length <= 1) {
    return timeZone.replace(/_/g, ' ');
  }
  return segments.slice(1).join(' / ').replace(/_/g, ' ');
};

const getTimeZoneOffsetMinutes = (timeZone, referenceDate = new Date()) => {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(referenceDate).reduce((accumulator, part) => {
      if (part.type !== 'literal') {
        accumulator[part.type] = part.value;
      }
      return accumulator;
    }, {});
    const isoString = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}.000Z`;
    const tzAsUTC = new Date(isoString);
    const offsetMinutes = Math.round((tzAsUTC.getTime() - referenceDate.getTime()) / 60000);
    return offsetMinutes;
  } catch (error) {
    return 0;
  }
};

const formatTimeZoneOffset = (timeZone, referenceDate = new Date()) => {
  try {
    const offsetMinutes = getTimeZoneOffsetMinutes(timeZone, referenceDate);
    const sign = offsetMinutes >= 0 ? '+' : '-';
    const absMinutes = Math.abs(offsetMinutes);
    const hours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
    const minutes = String(absMinutes % 60).padStart(2, '0');
    return `(UTC${sign}${hours}:${minutes})`;
  } catch (error) {
    return '(UTC+00:00)';
  }
};

const buildTimeZoneLabel = (timeZone, referenceDate) => {
  const offset = formatTimeZoneOffset(timeZone, referenceDate);
  const cityName = extractCityName(timeZone);
  const overrideName = TIMEZONE_NAME_OVERRIDES[timeZone];
  const baseName = overrideName || cityName || timeZone;
  // Append English city name when available to keep clarity
  const suffix = overrideName && cityName && overrideName !== cityName ? ` - ${cityName}` : '';
  return `${offset} ${baseName}${suffix}`;
};

const getDefaultTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
  } catch (error) {
    return 'Asia/Shanghai';
  }
};

const buildTimeZoneOptions = (referenceDate = new Date()) => {
  return FALLBACK_TIMEZONES.map((timeZone) => ({
    value: timeZone,
    label: buildTimeZoneLabel(timeZone, referenceDate),
  }));
};

const orderTimeZoneOptionsAroundSelected = (options, selectedValue, referenceDate = new Date()) => {
  if (!selectedValue) return options;
  const decorated = options.map((o) => ({
    ...o,
    _offset: getTimeZoneOffsetMinutes(o.value, referenceDate),
  }));
  const selectedOffset = getTimeZoneOffsetMinutes(selectedValue, referenceDate);

  const later = decorated.filter((o) => o._offset > selectedOffset).sort((a, b) => b._offset - a._offset);
  const earlier = decorated.filter((o) => o._offset < selectedOffset).sort((a, b) => b._offset - a._offset);

  const selectedInList = decorated.find((o) => o.value === selectedValue);
  const selectedOption =
    selectedInList || {
      value: selectedValue,
      label: buildTimeZoneLabel(selectedValue, referenceDate),
      _offset: selectedOffset,
    };

  const result = [...later, selectedOption, ...earlier].map(({ _offset, ...rest }) => rest);
  const seen = new Set();
  return result.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
};

const SLOT_MINUTES = 15;
const MINUTES_IN_DAY = 24 * 60;

const getZonedParts = (timeZone, date = new Date()) => {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = fmt.formatToParts(date).reduce((acc, cur) => {
      if (cur.type !== 'literal') acc[cur.type] = cur.value;
      return acc;
    }, {});
    return {
      year: Number(parts.year),
      month: Number(parts.month),
      day: Number(parts.day),
      hour: Number(parts.hour),
      minute: Number(parts.minute),
      second: Number(parts.second),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
};

const keyFromParts = (year, month, day) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const parseKey = (key) => {
  if (!key) return null;
  const [y, m, d] = key.split('-').map((s) => parseInt(s, 10));
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
};
const keyToUtcMidday = (key) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0));
};
const addDaysToKey = (key, delta) => {
  const parsed = parseKey(key);
  if (!parsed) return key;
  const utcDate = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
  utcDate.setUTCDate(utcDate.getUTCDate() + delta);
  return keyFromParts(utcDate.getUTCFullYear(), utcDate.getUTCMonth() + 1, utcDate.getUTCDate());
};
const keyToDate = (key) => {
  const parsed = parseKey(key);
  if (!parsed) return null;
  return new Date(parsed.year, parsed.month - 1, parsed.day);
};
const mergeBlocksList = (blocks) => {
  if (!blocks || !blocks.length) return [];
  const sorted = [...blocks]
    .map((b) => ({ start: Math.min(b.start, b.end), end: Math.max(b.start, b.end) }))
    .sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    if (cur.start <= prev.end + 1) {
      prev.end = Math.max(prev.end, cur.end);
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
};
const getOffsetForKey = (timeZone, key) => {
  const ref = keyToUtcMidday(key);
  if (!ref) return 0;
  return getTimeZoneOffsetMinutes(timeZone, ref);
};
const convertSelectionsBetweenTimeZones = (selections, fromTz, toTz) => {
  if (!selections || fromTz === toTz) return selections;
  const result = {};
  Object.entries(selections).forEach(([key, blocks]) => {
    if (!Array.isArray(blocks) || !blocks.length) return;
    const oldOffset = getOffsetForKey(fromTz, key);
    const newOffset = getOffsetForKey(toTz, key);
    const delta = newOffset - oldOffset;
    if (!delta) {
      result[key] = mergeBlocksList([...(result[key] || []), ...blocks]);
      return;
    }
    blocks.forEach((block) => {
      const startMin = (block.start ?? 0) * SLOT_MINUTES + delta;
      const endMinExclusive = ((block.end ?? block.start ?? 0) + 1) * SLOT_MINUTES + delta;
      const startDay = Math.floor(startMin / MINUTES_IN_DAY);
      const endDay = Math.floor((endMinExclusive - 1) / MINUTES_IN_DAY);
      for (let dayOffset = startDay; dayOffset <= endDay; dayOffset++) {
        const dayStartMin = dayOffset * MINUTES_IN_DAY;
        const segStartMin = Math.max(startMin, dayStartMin);
        const segEndMin = Math.min(endMinExclusive, dayStartMin + MINUTES_IN_DAY);
        if (segStartMin >= segEndMin) continue;
        const segStartIdx = Math.max(0, Math.floor((segStartMin - dayStartMin) / SLOT_MINUTES));
        const segEndIdx = Math.min(95, Math.ceil((segEndMin - dayStartMin) / SLOT_MINUTES) - 1);
        const targetKey = addDaysToKey(key, dayOffset);
        const existing = result[targetKey] || [];
        result[targetKey] = mergeBlocksList([...existing, { start: segStartIdx, end: segEndIdx }]);
      }
    });
  });
  return result;
};
const shiftDayKeyForTimezone = (key, fromTz, toTz, anchorMinutes = 12 * 60) => {
  if (!key || fromTz === toTz) return key;
  const oldOffset = getOffsetForKey(fromTz, key);
  const newOffset = getOffsetForKey(toTz, key);
  const delta = newOffset - oldOffset;
  if (!delta) return key;
  const minuteMark = anchorMinutes + delta;
  const dayOffset = Math.floor(minuteMark / MINUTES_IN_DAY);
  if (!dayOffset) return key;
  return addDaysToKey(key, dayOffset);
};
const convertRangeKeysBetweenTimeZones = (keys, fromTz, toTz) => {
  if (!Array.isArray(keys) || fromTz === toTz) return keys;
  const converted = keys.map((k) => shiftDayKeyForTimezone(k, fromTz, toTz));
  return Array.from(new Set(converted));
};
const buildDateFromTimeZoneNow = (timeZone) => {
  const parts = getZonedParts(timeZone);
  return new Date(parts.year, parts.month - 1, parts.day);
};

const buildShortUTC = (timeZone) => {
  if (!timeZone) return 'UTC±0';
  try {
    const offMin = getTimeZoneOffsetMinutes(timeZone, new Date());
    const sign = offMin >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offMin) / 60);
    const mins = Math.abs(offMin) % 60;
    const minsPart = mins ? `:${String(mins).padStart(2, '0')}` : '';
    return `UTC${sign}${hours}${minsPart}`;
  } catch (e) {
    return 'UTC±0';
  }
};

const DEFAULT_TIME_ZONE = getDefaultTimeZone();

export {
  TIMEZONE_NAME_OVERRIDES,
  FALLBACK_TIMEZONES,
  extractCityName,
  getTimeZoneOffsetMinutes,
  formatTimeZoneOffset,
  buildTimeZoneLabel,
  getDefaultTimeZone,
  buildTimeZoneOptions,
  orderTimeZoneOptionsAroundSelected,
  getZonedParts,
  keyFromParts,
  parseKey,
  keyToUtcMidday,
  addDaysToKey,
  keyToDate,
  mergeBlocksList,
  getOffsetForKey,
  convertSelectionsBetweenTimeZones,
  convertRangeKeysBetweenTimeZones,
  shiftDayKeyForTimezone,
  buildDateFromTimeZoneNow,
  buildShortUTC,
  DEFAULT_TIME_ZONE,
};
