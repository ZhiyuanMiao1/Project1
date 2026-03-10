const AVATAR_PALETTES = [
  { background: '#FDECC8', foreground: '#B07A1A' },
  { background: '#FCE7F3', foreground: '#BE5F8F' },
  { background: '#E0F2FE', foreground: '#4D88A8' },
  { background: '#DCFCE7', foreground: '#4A8A68' },
  { background: '#EDE9FE', foreground: '#8A71C8' },
  { background: '#FFEAD5', foreground: '#C07A52' },
  { background: '#E6FFFB', foreground: '#4E938C' },
  { background: '#FEF3C7', foreground: '#B98A49' },
  { background: '#E0E7FF', foreground: '#7181C7' },
  { background: '#FCE7E3', foreground: '#C16A83' },
  { background: '#EAF4FF', foreground: '#5D8FE0' },
  { background: '#ECFCCB', foreground: '#7EA14C' },
];

const avatarDataUrlCache = new Map();

const normalizeText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
};

const hashSeed = (seed) => {
  const raw = normalizeText(seed) || 'avatar';
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const getAvatarInitial = (value) => {
  const raw = normalizeText(value);
  if (!raw) return '';

  const chars = Array.from(raw);
  const initial = chars.find((char) => /[\p{L}\p{N}]/u.test(char)) || chars[0] || '';
  return /^[a-z]$/i.test(initial) ? initial.toUpperCase() : initial;
};

export const buildAvatarPlaceholderSrc = ({
  name = '',
  seed = '',
  size = 256,
  borderRadius,
} = {}) => {
  const normalizedName = normalizeText(name);
  const normalizedSeed = normalizeText(seed) || normalizedName || 'avatar';
  const normalizedSize = Number.isFinite(Number(size)) ? Math.max(64, Math.floor(Number(size))) : 256;
  const normalizedRadius = Number.isFinite(Number(borderRadius))
    ? Math.max(0, Math.min(normalizedSize / 2, Math.floor(Number(borderRadius))))
    : Math.round(normalizedSize / 2);
  const cacheKey = `${normalizedName}::${normalizedSeed}::${normalizedSize}::${normalizedRadius}`;

  if (avatarDataUrlCache.has(cacheKey)) {
    return avatarDataUrlCache.get(cacheKey);
  }

  const palette = AVATAR_PALETTES[hashSeed(normalizedSeed) % AVATAR_PALETTES.length];
  const initial = getAvatarInitial(normalizedName);
  const fontSize = Math.round(normalizedSize * 0.42);
  const textMarkup = initial
    ? `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-weight="700" fill="${palette.foreground}" font-family="Arial, Helvetica, sans-serif">${escapeXml(initial)}</text>`
    : '';

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${normalizedSize}" height="${normalizedSize}" viewBox="0 0 ${normalizedSize} ${normalizedSize}">
      <rect width="${normalizedSize}" height="${normalizedSize}" rx="${normalizedRadius}" fill="${palette.background}" />
      ${textMarkup}
    </svg>
  `.trim();

  const dataUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  avatarDataUrlCache.set(cacheKey, dataUrl);
  return dataUrl;
};

export const resolveAvatarSrc = ({
  src = '',
  name = '',
  seed = '',
  size = 256,
} = {}) => {
  const normalizedSrc = normalizeText(src);
  if (normalizedSrc) return normalizedSrc;
  return buildAvatarPlaceholderSrc({ name, seed, size });
};

export const applyAvatarFallback = (event, options = {}) => {
  const fallbackSrc = buildAvatarPlaceholderSrc(options);
  if (!event?.currentTarget) return;
  if (event.currentTarget.src === fallbackSrc) return;
  event.currentTarget.onerror = null;
  event.currentTarget.src = fallbackSrc;
};
