import QRCode from 'qrcode';

export interface QrColorPreset {
  name: string;
  dark: string;
  light: string;
}

export const QR_COLOR_PRESETS: QrColorPreset[] = [
  { name: 'Ink', dark: '#1b1f2e', light: '#ffffff' },
  { name: 'Pitch', dark: '#0f5a3a', light: '#ffffff' },
  { name: 'Volt', dark: '#1b1f2e', light: '#e4f75a' },
  { name: 'Ember', dark: '#b8361e', light: '#fff8ec' },
];

export type QrPatternShape = 'square' | 'rounded' | 'dots' | 'diamond';
export type QrLogoPreset =
  | 'none'
  | 'playersqr'
  | 'star'
  | 'bolt'
  | 'trophy'
  | 'globe'
  | 'custom';

export interface QrStyleConfig {
  fgColor: string;
  bgColor: string;
  shape: QrPatternShape;
  logoType: QrLogoPreset;
  customLogoUrl?: string;
}

export const DEFAULT_QR_STYLE: QrStyleConfig = {
  fgColor: '#1b1f2e',
  bgColor: '#ffffff',
  shape: 'square',
  logoType: 'none',
};

export const QR_FG_SWATCHES: Array<{ label: string; color: string }> = [
  { label: 'Ink', color: '#1b1f2e' },
  { label: 'Pitch', color: '#0f5a3a' },
  { label: 'Ember', color: '#b8361e' },
  { label: 'Cobalt', color: '#1d4ed8' },
  { label: 'Violet', color: '#6d28d9' },
  { label: 'Black', color: '#000000' },
];

export const SAFE_HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const SAFE_LOGO_DATA_URL_RE =
  /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export function sanitizeHexColor(raw: string | undefined, fallback: string): string {
  return raw && SAFE_HEX_COLOR_RE.test(raw) ? raw.toLowerCase() : fallback;
}

export function sanitizeQrStyle(raw: Partial<QrStyleConfig> | undefined): QrStyleConfig {
  const shape: QrPatternShape =
    raw?.shape === 'rounded' || raw?.shape === 'dots' || raw?.shape === 'diamond'
      ? raw.shape
      : 'square';
  const logoType: QrLogoPreset =
    raw?.logoType === 'playersqr' ||
    raw?.logoType === 'star' ||
    raw?.logoType === 'bolt' ||
    raw?.logoType === 'trophy' ||
    raw?.logoType === 'globe' ||
    raw?.logoType === 'custom'
      ? raw.logoType
      : 'none';
  const customLogoUrl =
    typeof raw?.customLogoUrl === 'string' && SAFE_LOGO_DATA_URL_RE.test(raw.customLogoUrl)
      ? raw.customLogoUrl
      : undefined;

  return {
    fgColor: sanitizeHexColor(raw?.fgColor, DEFAULT_QR_STYLE.fgColor),
    bgColor: sanitizeHexColor(raw?.bgColor, DEFAULT_QR_STYLE.bgColor),
    shape,
    logoType: logoType === 'custom' && !customLogoUrl ? 'none' : logoType,
    customLogoUrl,
  };
}

// 24x24 SVG path commands for crisp built-in center icons
export const QR_LOGO_ICON_PATHS: Record<
  Exclude<QrLogoPreset, 'none' | 'custom'>,
  { label: string; paths: string[] }
> = {
  playersqr: {
    label: 'PlayersQR',
    paths: [
      'M3 3h7v7H3V3zm2 2v3h3V5H5zm9-2h7v7h-7V3zm2 2v3h3V5h-3zM3 14h7v7H3v-7zm2 2v3h3v-3H5zm9-2h3v3h-3v-3zm4 0h3v3h-3v-3zm-4 4h3v3h-3v-3zm4 0h3v3h-3v-3z',
    ],
  },
  bolt: {
    label: 'Bolt',
    paths: ['M13 2L4 14h7l-1 8 10-12h-7l0-8z'],
  },
  star: {
    label: 'Star',
    paths: [
      'M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9L12 2.5z',
    ],
  },
  trophy: {
    label: 'Trophy',
    paths: [
      'M6 3h12v4a6 6 0 0 1-5 5.91V16h3v2H8v-2h3v-3.09A6 6 0 0 1 6 7V3zm-3 2h2v3a3 3 0 0 1-2-2.83V5zm16 0h2v.17A3 3 0 0 1 19 8V5zM7 19h10v2H7v-2z',
    ],
  },
  globe: {
    label: 'Globe',
    paths: [
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm7.93 9h-3.02a15.6 15.6 0 0 0-1.36-5.26A8.03 8.03 0 0 1 19.93 11zM12 4.04c.93 1.32 1.69 3.49 1.93 6.96h-3.86c.24-3.47 1-5.64 1.93-6.96zM4.07 13h3.02c.2 1.9.69 3.7 1.36 5.26A8.03 8.03 0 0 1 4.07 13zm3.02-2H4.07a8.03 8.03 0 0 1 4.38-5.26A15.6 15.6 0 0 0 7.09 11zM12 19.96c-.93-1.32-1.69-3.49-1.93-6.96h3.86c-.24 3.47-1 5.64-1.93 6.96zm3.55-1.7A15.6 15.6 0 0 0 16.91 13h3.02a8.03 8.03 0 0 1-4.38 5.26z',
    ],
  },
};

export function isFinderModule(row: number, col: number, size: number): boolean {
  const inTopLeft = row < 7 && col < 7;
  const inTopRight = row < 7 && col >= size - 7;
  const inBottomLeft = row >= size - 7 && col < 7;
  return inTopLeft || inTopRight || inBottomLeft;
}

export function buildStyledQrMatrix(
  value: string,
  hasLogo: boolean,
): { size: number; grid: boolean[][] } | null {
  if (!value) return null;
  try {
    const qr = QRCode.create(value, {
      errorCorrectionLevel: hasLogo ? 'H' : 'M',
    });
    const size = qr.modules.size;
    const grid: boolean[][] = [];
    for (let r = 0; r < size; r++) {
      const rowArr: boolean[] = [];
      for (let c = 0; c < size; c++) {
        rowArr.push(Boolean(qr.modules.get(r, c)));
      }
      grid.push(rowArr);
    }
    return { size, grid };
  } catch {
    return null;
  }
}

export function isCenterQuietZone(
  row: number,
  col: number,
  size: number,
  hasLogo: boolean,
): boolean {
  if (!hasLogo) return false;
  const half = Math.max(2, Math.floor(size * 0.13));
  const center = (size - 1) / 2;
  return Math.abs(row - center) <= half && Math.abs(col - center) <= half;
}

export function buildStyledQrSvgMarkup(
  value: string,
  rawStyle: Partial<QrStyleConfig>,
  margin = 2,
): string {
  const style = sanitizeQrStyle(rawStyle);
  const hasLogo = style.logoType !== 'none';
  const matrix = buildStyledQrMatrix(value, hasLogo);
  if (!matrix) return '';

  const { size, grid } = matrix;
  const total = size + margin * 2;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="geometricPrecision">`,
  );
  parts.push(`<rect width="${total}" height="${total}" fill="${style.bgColor}"/>`);

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c] || isCenterQuietZone(r, c, size, hasLogo)) continue;
      const x = c + margin;
      const y = r + margin;
      const finder = isFinderModule(r, c, size);

      if (finder || style.shape === 'square') {
        const radius = finder && style.shape !== 'square' ? ' rx="0.2" ry="0.2"' : '';
        parts.push(
          `<rect x="${x}" y="${y}" width="1" height="1"${radius} fill="${style.fgColor}"/>`,
        );
      } else if (style.shape === 'rounded') {
        parts.push(
          `<rect x="${x + 0.06}" y="${y + 0.06}" width="0.88" height="0.88" rx="0.28" ry="0.28" fill="${style.fgColor}"/>`,
        );
      } else if (style.shape === 'dots') {
        parts.push(
          `<circle cx="${x + 0.5}" cy="${y + 0.5}" r="0.43" fill="${style.fgColor}"/>`,
        );
      } else if (style.shape === 'diamond') {
        parts.push(
          `<polygon points="${x + 0.5},${y + 0.04} ${x + 0.96},${y + 0.5} ${x + 0.5},${y + 0.96} ${x + 0.04},${y + 0.5}" fill="${style.fgColor}"/>`,
        );
      }
    }
  }

  if (hasLogo) {
    const boxSize = Math.max(4, Math.floor(size * 0.25));
    const boxStart = (total - boxSize) / 2;
    const pad = boxSize * 0.14;
    parts.push(
      `<rect x="${boxStart}" y="${boxStart}" width="${boxSize}" height="${boxSize}" rx="${boxSize * 0.22}" fill="${style.bgColor}" stroke="${style.fgColor}" stroke-width="${Math.max(0.25, boxSize * 0.06)}"/>`,
    );

    if (style.logoType === 'custom' && style.customLogoUrl) {
      const imgSize = boxSize - pad * 2;
      const imgPos = boxStart + pad;
      parts.push(
        `<image href="${style.customLogoUrl}" x="${imgPos}" y="${imgPos}" width="${imgSize}" height="${imgSize}" preserveAspectRatio="xMidYMid meet"/>`,
      );
    } else if (style.logoType !== 'none' && style.logoType !== 'custom') {
      const iconDef = QR_LOGO_ICON_PATHS[style.logoType];
      const iconArea = boxSize - pad * 2.2;
      const scale = iconArea / 24;
      const tx = boxStart + (boxSize - iconArea) / 2;
      const ty = boxStart + (boxSize - iconArea) / 2;
      parts.push(`<g transform="translate(${tx},${ty}) scale(${scale})" fill="${style.fgColor}">`);
      for (const d of iconDef.paths) {
        parts.push(`<path d="${d}"/>`);
      }
      parts.push('</g>');
    }
  }

  parts.push('</svg>');
  return parts.join('');
}

export async function renderStyledQrPngDataUrl(
  value: string,
  rawStyle: Partial<QrStyleConfig>,
  px = 1024,
  margin = 2,
): Promise<string> {
  const style = sanitizeQrStyle(rawStyle);
  const hasLogo = style.logoType !== 'none';
  const matrix = buildStyledQrMatrix(value, hasLogo);
  if (!matrix) return '';

  const { size, grid } = matrix;
  const total = size + margin * 2;
  const cell = px / total;

  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, px, px);
  ctx.fillStyle = style.fgColor;

  const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c] || isCenterQuietZone(r, c, size, hasLogo)) continue;
      const x = (c + margin) * cell;
      const y = (r + margin) * cell;
      const finder = isFinderModule(r, c, size);

      if (finder || style.shape === 'square') {
        if (finder && style.shape !== 'square') {
          drawRoundedRect(x, y, cell + 0.3, cell + 0.3, cell * 0.2);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
        }
      } else if (style.shape === 'rounded') {
        drawRoundedRect(x + cell * 0.06, y + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.28);
        ctx.fill();
      } else if (style.shape === 'dots') {
        ctx.beginPath();
        ctx.arc(x + cell * 0.5, y + cell * 0.5, cell * 0.43, 0, Math.PI * 2);
        ctx.fill();
      } else if (style.shape === 'diamond') {
        ctx.beginPath();
        ctx.moveTo(x + cell * 0.5, y + cell * 0.04);
        ctx.lineTo(x + cell * 0.96, y + cell * 0.5);
        ctx.lineTo(x + cell * 0.5, y + cell * 0.96);
        ctx.lineTo(x + cell * 0.04, y + cell * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  if (hasLogo) {
    const boxModules = Math.max(4, Math.floor(size * 0.25));
    const boxPx = boxModules * cell;
    const boxPos = ((total - boxModules) / 2) * cell;
    const padPx = boxPx * 0.14;

    drawRoundedRect(boxPos, boxPos, boxPx, boxPx, boxPx * 0.22);
    ctx.fillStyle = style.bgColor;
    ctx.fill();
    ctx.lineWidth = Math.max(2, boxPx * 0.06);
    ctx.strokeStyle = style.fgColor;
    ctx.stroke();

    if (style.logoType === 'custom' && style.customLogoUrl) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const area = boxPx - padPx * 2;
          const imgPos = boxPos + padPx;
          ctx.save();
          drawRoundedRect(imgPos, imgPos, area, area, area * 0.14);
          ctx.clip();
          ctx.drawImage(img, imgPos, imgPos, area, area);
          ctx.restore();
          resolve();
        };
        img.onerror = () => resolve();
        img.src = style.customLogoUrl!;
      });
    } else if (style.logoType !== 'none' && style.logoType !== 'custom') {
      const iconDef = QR_LOGO_ICON_PATHS[style.logoType];
      const iconArea = boxPx - padPx * 2.2;
      const scale = iconArea / 24;
      const tx = boxPos + (boxPx - iconArea) / 2;
      const ty = boxPos + (boxPx - iconArea) / 2;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(scale, scale);
      ctx.fillStyle = style.fgColor;
      for (const d of iconDef.paths) {
        const p2d = new Path2D(d);
        ctx.fill(p2d);
      }
      ctx.restore();
    }
  }

  return canvas.toDataURL('image/png');
}

export const ALIAS_REGEX = /^[A-Za-z0-9_-]{3,32}$/;

export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.hostname.includes('.') && parsed.hostname !== 'localhost') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function isValidAlias(alias: string): boolean {
  return ALIAS_REGEX.test(alias);
}

export const DOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function normalizeVanityDomain(raw: string): string | null {
  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) return '';
  cleaned = cleaned.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]?.replace(/\.+$/, '') || '';
  if (!cleaned || cleaned.length > 253 || !DOMAIN_REGEX.test(cleaned)) return null;
  return cleaned;
}

export function buildShortUrl(
  origin: string,
  code: string,
  source: 'link' | 'qr' = 'link',
  vanityDomain?: string,
): string {
  const baseOrigin = vanityDomain
    ? `https://${vanityDomain.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`
    : origin.replace(/\/+$/, '');
  const base = `${baseOrigin}/playerqr/${code}`;
  return source === 'qr' ? `${base}?s=qr` : base;
}

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

export function formatCountryName(code: string): string {
  if (!code || code === 'Unknown' || code.length !== 2) return 'Unknown';
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function formatChartDay(dayIso: string): string {
  const date = new Date(`${dayIso}T00:00:00`);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 2592000) return rtf.format(Math.round(diffSeconds / 86400), 'day');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
