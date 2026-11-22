import {
  DEFAULT_QR_STYLE,
  QR_COLOR_PRESETS,
  sanitizeQrStyle,
  type QrStyleConfig,
} from './qr';

export interface SavedDeviceLink {
  code: string;
  token: string;
  createdAt: string;
}

export interface LinkSummaryItem {
  code: string;
  title: string;
  destination_url: string;
  is_active?: boolean;
  created_at: string;
  total: number;
  uniq: number;
  qr: number;
}

export interface AuthUser {
  id: string;
  email: string;
  vanityDomain?: string;
  isAdmin?: boolean;
}

const STORAGE_KEY = 'playersqr:links';
const COLOR_PREF_KEY = 'playersqr:color-prefs';
const QR_STYLE_KEY = 'playersqr:qr-styles';
const VISITOR_STORAGE_KEY = 'playersqr:vid';

// Held strictly in JS memory (never localStorage/sessionStorage) for iframe reliability
let memorySessionToken: string | null = null;
let sessionExpiredHandler: (() => void) | null = null;

export function setSessionToken(token: string | null): void {
  memorySessionToken = token;
}

export function getSessionToken(): string | null {
  return memorySessionToken;
}

export function setOnSessionExpired(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

export function readSavedLinks(): SavedDeviceLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedDeviceLink =>
        Boolean(item && typeof item.code === 'string' && typeof item.token === 'string'),
    );
  } catch {
    return [];
  }
}

export function saveDeviceLink(entry: SavedDeviceLink): SavedDeviceLink[] {
  const existing = readSavedLinks().filter((item) => item.code !== entry.code);
  const next = [entry, ...existing];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  return next;
}

export function removeDeviceLink(code: string): SavedDeviceLink[] {
  const next = readSavedLinks().filter((item) => item.code !== code);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function removeDeviceLinks(codes: string[]): SavedDeviceLink[] {
  const toRemove = new Set(codes);
  const next = readSavedLinks().filter((item) => !toRemove.has(item.code));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export function clearDeviceLinks(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function readColorPref(code: string): number {
  try {
    const raw = localStorage.getItem(COLOR_PREF_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, number>;
    return typeof map[code] === 'number' ? map[code] : 0;
  } catch {
    return 0;
  }
}

export function saveColorPref(code: string, presetIdx: number): void {
  try {
    const raw = localStorage.getItem(COLOR_PREF_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    map[code] = presetIdx;
    localStorage.setItem(COLOR_PREF_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function readQrStyle(code: string): QrStyleConfig {
  try {
    const raw = localStorage.getItem(QR_STYLE_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, Partial<QrStyleConfig>>;
      if (map[code]) {
        return sanitizeQrStyle(map[code]);
      }
    }
    const colorIdx = readColorPref(code);
    const preset = QR_COLOR_PRESETS[colorIdx] ?? QR_COLOR_PRESETS[0];
    return {
      ...DEFAULT_QR_STYLE,
      fgColor: preset.dark,
      bgColor: preset.light,
    };
  } catch {
    return DEFAULT_QR_STYLE;
  }
}

export function saveQrStyle(code: string, style: QrStyleConfig): void {
  try {
    const raw = localStorage.getItem(QR_STYLE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, QrStyleConfig>) : {};
    map[code] = sanitizeQrStyle(style);
    localStorage.setItem(QR_STYLE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('X-Requested-With', 'PlayersQR');
  const hadSessionToken = Boolean(memorySessionToken);
  if (memorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${memorySessionToken}`);
  }
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && hadSessionToken) {
    memorySessionToken = null;
    sessionExpiredHandler?.();
  }

  const data = (await response.json()) as T;
  return data;
}

export function getOrCreateVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) return existing;
    const next =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(VISITOR_STORAGE_KEY, next);
    return next;
  } catch {
    return '';
  }
}

export function trackTelemetryEvent(
  eventType: 'site_visit' | 'qr_download_png' | 'qr_download_svg' | 'app_install',
  details: { path?: string; code?: string } = {},
): void {
  const visitorId = getOrCreateVisitorId();
  apiFetch('/api/telemetry/event', {
    method: 'POST',
    body: JSON.stringify({
      event_type: eventType,
      path: details.path ?? (typeof window !== 'undefined' ? window.location.pathname : '/'),
      code: details.code ?? '',
      visitorId,
    }),
  }).catch(() => {
    // ignore telemetry errors silently
  });
}
