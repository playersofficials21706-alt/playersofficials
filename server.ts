import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  db,
  hashPassword,
  hashToken,
  verifyEditToken,
  verifyPassword,
  type LinkRow,
  type ScanRow,
  type SiteEventRow,
  type UserRow,
} from './server/db.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_COOKIE = 'pqr_session';
const VISITOR_COOKIE = 'pqr_vid';
const ADMIN_EMAIL = 'playersofficials21706@gmail.com';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function isAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === ADMIN_EMAIL;
}

const RESERVED_CODES = new Set([
  'api',
  'auth',
  'account',
  'admin',
  'links',
  'playerqr',
  'r',
  'assets',
  'favicon.ico',
  'favicon.svg',
  'manifest.webmanifest',
  'robots.txt',
  'sitemap.xml',
]);

const SAFE_HOST_RE = /^[a-z0-9.-]+(?::\d{1,5})?$/i;

function getPublicBaseUrl(req: Request): string {
  const rawProto = req.headers['x-forwarded-proto'];
  const protoCandidate = Array.isArray(rawProto) ? rawProto[0] : rawProto;
  const proto =
    protoCandidate && protoCandidate.split(',')[0].trim().toLowerCase() === 'https'
      ? 'https'
      : req.protocol === 'https'
        ? 'https'
        : 'http';

  const rawForwardedHost = req.headers['x-forwarded-host'];
  const forwardedHost = Array.isArray(rawForwardedHost)
    ? rawForwardedHost[0]
    : rawForwardedHost;
  const reqHost = ((forwardedHost || req.get('host') || '').split(',')[0] || '').trim();
  if (
    reqHost &&
    SAFE_HOST_RE.test(reqHost) &&
    !reqHost.startsWith('localhost') &&
    !reqHost.startsWith('127.0.0.1') &&
    !reqHost.startsWith('0.0.0.0')
  ) {
    return `${proto}://${reqHost}`;
  }

  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured && configured !== 'MY_APP_URL') {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Fallback to localhost
    }
  }

  if (reqHost && SAFE_HOST_RE.test(reqHost)) {
    return `${proto}://${reqHost}`;
  }
  return `http://localhost:${PORT}`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const ALIAS_RE = /^[A-Za-z0-9_-]{3,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeVanityDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let cleaned = raw.trim().toLowerCase();
  if (!cleaned) return '';
  cleaned = cleaned.replace(/^https?:\/\//i, '').split(/[/?#]/)[0]?.replace(/\.+$/, '') || '';
  if (!cleaned || cleaned.length > 253 || !DOMAIN_RE.test(cleaned)) return null;
  return cleaned;
}

function normalizeDestinationUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return null;
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

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function signSession(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ uid: userId, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      uid?: string;
      exp?: number;
    };
    if (!data.uid || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
    return data.uid;
  } catch {
    return null;
  }
}

interface AuthSessionUser {
  id: string;
  email: string;
  vanityDomain: string;
  isAdmin: boolean;
}

function getAuthenticatedUser(
  req: Request,
  options?: { allowInactive?: boolean },
): (AuthSessionUser & { isActive: boolean }) | null {
  const authHeader = req.headers.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : undefined;
  const cookies = parseCookies(req);
  const userId = verifySession(bearerToken || cookies[SESSION_COOKIE]);
  if (!userId) return null;
  const user = db
    .prepare('SELECT id, email, vanity_domain, is_active FROM users WHERE id = ?')
    .get(userId) as
    | Pick<UserRow, 'id' | 'email' | 'vanity_domain' | 'is_active'>
    | undefined;
  if (!user) return null;
  const active = Boolean(user.is_active) || isAdminEmail(user.email);
  if (!active && !options?.allowInactive) return null;
  return {
    id: user.id,
    email: user.email,
    vanityDomain: user.vanity_domain || '',
    isAdmin: isAdminEmail(user.email),
    isActive: active,
  };
}

function requireAdmin(req: Request, res: Response): AuthSessionUser | null {
  const user = getAuthenticatedUser(req);
  if (!user) {
    res.status(401).json({ ok: false, error: 'Login required' });
    return null;
  }
  if (!user.isAdmin) {
    res.status(403).json({ ok: false, error: 'Admin access restricted to administrator.' });
    return null;
  }
  return user;
}

function setSessionCookie(req: Request, res: Response, userId: string): void {
  const token = signSession(userId);
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  const maxAge = 30 * 24 * 60 * 60;
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None; Partitioned`,
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`,
    );
  }
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps) {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None; Partitioned`,
    );
  } else {
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
    );
  }
}

function checkSameOriginOrHeader(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'PlayersQR') {
    next();
    return;
  }
  const origin = req.headers.origin;
  const rawForwardedHost = req.headers['x-forwarded-host'];
  const forwardedHost = Array.isArray(rawForwardedHost)
    ? rawForwardedHost[0]
    : rawForwardedHost;
  const host = ((forwardedHost || req.headers.host || '').split(',')[0] || '').trim();
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) {
        next();
        return;
      }
    } catch {
      // fall through to 403
    }
  }
  res.status(403).json({ ok: false, error: 'Invalid request origin' });
}

function generateShortCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(7);
  let out = '';
  for (let i = 0; i < 7; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function parseUserAgent(uaRaw: string | undefined): {
  device: string;
  os: string;
  browser: string;
} {
  const ua = uaRaw || '';

  let device = 'Desktop';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    device = 'Tablet';
  } else if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) {
    device = 'Mobile';
  }

  let os = 'Other';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/cros/i.test(ua)) os = 'ChromeOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Other';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
  else if (/chrome|crios/i.test(ua) && !/edg/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome|crios|android/i.test(ua)) browser = 'Safari';

  return { device, os, browser };
}

function detectLocation(req: Request): { country: string; city: string } {
  const headerCountry =
    (req.headers['cf-ipcountry'] as string | undefined) ||
    (req.headers['x-appengine-country'] as string | undefined) ||
    (req.headers['x-vercel-ip-country'] as string | undefined) ||
    (req.headers['x-country-code'] as string | undefined);

  const headerCity =
    (req.headers['cf-ipcity'] as string | undefined) ||
    (req.headers['x-appengine-city'] as string | undefined) ||
    (req.headers['x-vercel-ip-city'] as string | undefined) ||
    '';

  if (headerCountry && /^[A-Za-z]{2}$/.test(headerCountry) && headerCountry.toUpperCase() !== 'XX') {
    return {
      country: headerCountry.toUpperCase(),
      city: headerCity ? decodeURIComponent(headerCity).slice(0, 60) : '',
    };
  }

  const acceptLang = req.headers['accept-language'];
  if (typeof acceptLang === 'string') {
    const match = acceptLang.match(/[a-z]{2}-([A-Z]{2})/);
    if (match?.[1]) {
      return { country: match[1], city: '' };
    }
  }

  return { country: 'Unknown', city: '' };
}

function claimDeviceTokens(
  userId: string,
  tokens: unknown,
): void {
  if (!Array.isArray(tokens)) return;
  const findLink = db.prepare('SELECT code, edit_token_hash, owner_user_id FROM links WHERE code = ?');
  const assignOwner = db.prepare('UPDATE links SET owner_user_id = ? WHERE code = ? AND owner_user_id IS NULL');
  for (const item of tokens.slice(0, 100)) {
    if (!item || typeof item !== 'object') continue;
    const { code, token } = item as { code?: unknown; token?: unknown };
    if (typeof code !== 'string' || typeof token !== 'string') continue;
    const row = findLink.get(code) as Pick<LinkRow, 'code' | 'edit_token_hash' | 'owner_user_id'> | undefined;
    if (row && !row.owner_user_id && verifyEditToken(token, row.edit_token_hash)) {
      assignOwner.run(userId, row.code);
    }
  }
}

function resolveVisitorId(req: Request, res?: Response, explicitId?: unknown): string {
  const cookies = parseCookies(req);
  const cookieVid = cookies[VISITOR_COOKIE];
  if (cookieVid && cookieVid.length <= 64) return cookieVid;

  if (typeof explicitId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(explicitId)) {
    return explicitId;
  }

  const generated = crypto.randomUUID();
  if (res) {
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader(
      'Set-Cookie',
      isHttps
        ? `${VISITOR_COOKIE}=${encodeURIComponent(generated)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=None; Partitioned`
        : `${VISITOR_COOKIE}=${encodeURIComponent(generated)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
    );
  }
  return generated;
}

type TelemetryEventType =
  | 'site_visit'
  | 'qr_download_png'
  | 'qr_download_svg'
  | 'app_install'
  | 'user_signup'
  | 'user_login'
  | 'link_created';

function recordSiteEvent(
  req: Request,
  eventType: TelemetryEventType,
  opts: {
    res?: Response;
    userId?: string | null;
    userEmail?: string;
    path?: string;
    code?: string;
    visitorId?: unknown;
  } = {},
): void {
  const visitorId = resolveVisitorId(req, opts.res, opts.visitorId);
  const { device, os, browser } = parseUserAgent(req.headers['user-agent']);
  const { country, city } = detectLocation(req);
  const safePath =
    typeof opts.path === 'string' && opts.path.startsWith('/')
      ? opts.path.slice(0, 120)
      : '/';
  const safeCode =
    typeof opts.code === 'string' && ALIAS_RE.test(opts.code) ? opts.code : '';
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO site_events (event_type, visitor_id, user_id, user_email, path, code, device, os, browser, country, city, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    eventType,
    visitorId,
    opts.userId ?? null,
    opts.userEmail ?? '',
    safePath,
    safeCode,
    device,
    os,
    browser,
    country,
    city,
    now,
  );
}

function isAuthorizedOwner(
  link: Pick<LinkRow, 'owner_user_id' | 'edit_token_hash'>,
  user: { id: string; isAdmin?: boolean } | null,
  token: string,
): boolean {
  if (user?.isAdmin) return true;
  if (link.owner_user_id !== null) {
    return Boolean(user && user.id === link.owner_user_id);
  }
  return verifyEditToken(token, link.edit_token_hash);
}

function getSummaryForCodes(codes: string[]) {
  if (codes.length === 0) return [];
  const placeholders = codes.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT
        l.code,
        l.title,
        l.destination_url,
        l.is_active,
        l.created_at,
        COUNT(s.id) AS total,
        COUNT(DISTINCT s.visitor_id) AS uniq,
        COALESCE(SUM(CASE WHEN s.source = 'qr' THEN 1 ELSE 0 END), 0) AS qr
      FROM links l
      LEFT JOIN scans s ON s.code = l.code
      WHERE l.code IN (${placeholders})
      GROUP BY l.code
      ORDER BY l.created_at DESC`,
    )
    .all(...codes) as Array<{
    code: string;
    title: string;
    destination_url: string;
    is_active: number;
    created_at: string;
    total: number;
    uniq: number;
    qr: number;
  }>;
  return rows.map((row) => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

function buildLinkStats(code: string) {
  const scans = db
    .prepare(
      `SELECT id, code, source, visitor_id, device, os, browser, country, city, created_at
       FROM scans
       WHERE code = ?
       ORDER BY created_at DESC`,
    )
    .all(code) as unknown as ScanRow[];

  const total = scans.length;
  const uniqueVisitors = new Set<string>();
  let qr = 0;
  let direct = 0;
  let today = 0;

  const todayStr = new Date().toISOString().slice(0, 10);

  const dayMap = new Map<
    string,
    { total: number; qr: number; link: number; visitors: Set<string> }
  >();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { total: 0, qr: 0, link: 0, visitors: new Set() });
  }

  const deviceCounts = new Map<string, number>();
  const countryCounts = new Map<string, number>();
  const osCounts = new Map<string, number>();
  const browserCounts = new Map<string, number>();

  for (const s of scans) {
    uniqueVisitors.add(s.visitor_id);
    if (s.source === 'qr') qr++;
    else direct++;

    const dayKey = s.created_at.slice(0, 10);
    if (dayKey === todayStr) today++;

    const bucket = dayMap.get(dayKey);
    if (bucket) {
      bucket.total++;
      if (s.source === 'qr') bucket.qr++;
      else bucket.link++;
      bucket.visitors.add(s.visitor_id);
    }

    deviceCounts.set(s.device, (deviceCounts.get(s.device) || 0) + 1);
    countryCounts.set(s.country, (countryCounts.get(s.country) || 0) + 1);
    osCounts.set(s.os, (osCounts.get(s.os) || 0) + 1);
    browserCounts.set(s.browser, (browserCounts.get(s.browser) || 0) + 1);
  }

  const toSortedList = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

  const daily = Array.from(dayMap.entries()).map(([day, val]) => ({
    day,
    total: val.total,
    unique: val.visitors.size,
    qr: val.qr,
    link: val.link,
  }));

  return {
    total,
    unique: uniqueVisitors.size,
    qr,
    direct,
    today,
    daily,
    devices: toSortedList(deviceCounts),
    countries: toSortedList(countryCounts),
    os: toSortedList(osCounts),
    browsers: toSortedList(browserCounts),
    recent: scans.slice(0, 25).map((s) => ({
      source: s.source,
      device: s.device,
      os: s.os,
      browser: s.browser,
      country: s.country,
      city: s.city,
      created_at: s.created_at,
    })),
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', checkSameOriginOrHeader);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    const record = getAuthenticatedUser(req, { allowInactive: true });
    if (record && !record.isActive) {
      clearSessionCookie(req, res);
      res.json({
        user: null,
        sessionToken: null,
        accountDeactivated: true,
      });
      return;
    }
    if (record) {
      db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        record.id,
      );
    }
    res.json({
      user: record
        ? {
            id: record.id,
            email: record.email,
            vanityDomain: record.vanityDomain,
            isAdmin: record.isAdmin,
          }
        : null,
      sessionToken: record ? signSession(record.id) : null,
    });
  });

  app.post('/api/auth/signup', (req, res) => {
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!EMAIL_RE.test(emailRaw)) {
      res.status(400).json({ ok: false, error: 'Enter a valid email address' });
      return;
    }
    if (password.length < 6 || password.length > 128) {
      res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
      return;
    }

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(emailRaw);
    if (existing) {
      res.status(409).json({ ok: false, error: 'An account with this email already exists' });
      return;
    }

    const userId = crypto.randomUUID();
    const now = new Date().toISOString();
    const initialVanity = isAdminEmail(emailRaw) ? 'playersofficial.com' : '';
    db.prepare(
      'INSERT INTO users (id, email, password_hash, vanity_domain, is_active, last_active_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run(userId, emailRaw, hashPassword(password), initialVanity, now, now);

    claimDeviceTokens(userId, req.body?.deviceLinks);
    setSessionCookie(req, res, userId);
    recordSiteEvent(req, 'user_signup', {
      userId,
      userEmail: emailRaw,
      path: '/auth',
      visitorId: req.body?.visitorId,
    });
    res.json({
      ok: true,
      sessionToken: signSession(userId),
      user: {
        id: userId,
        email: emailRaw,
        vanityDomain: initialVanity,
        isAdmin: isAdminEmail(emailRaw),
      },
    });
  });

  app.post('/api/auth/login', (req, res) => {
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    const user = db
      .prepare('SELECT id, email, password_hash, vanity_domain, is_active FROM users WHERE email = ?')
      .get(emailRaw) as
      | Pick<UserRow, 'id' | 'email' | 'password_hash' | 'vanity_domain' | 'is_active'>
      | undefined;

    if (!user || !verifyPassword(password, user.password_hash)) {
      res.status(401).json({ ok: false, error: 'Wrong email or password' });
      return;
    }

    if (!user.is_active && !isAdminEmail(user.email)) {
      res.status(403).json({
        ok: false,
        error: 'Your account has been deactivated by the administrator.',
      });
      return;
    }

    db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      user.id,
    );
    claimDeviceTokens(user.id, req.body?.deviceLinks);
    setSessionCookie(req, res, user.id);
    recordSiteEvent(req, 'user_login', {
      userId: user.id,
      userEmail: user.email,
      path: '/auth',
      visitorId: req.body?.visitorId,
    });
    res.json({
      ok: true,
      sessionToken: signSession(user.id),
      user: {
        id: user.id,
        email: user.email,
        vanityDomain: user.vanity_domain || '',
        isAdmin: isAdminEmail(user.email),
      },
    });
  });

  app.patch('/api/account/vanity-domain', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Login required' });
      return;
    }

    const normalized = normalizeVanityDomain(req.body?.domain);
    if (normalized === null) {
      res.status(400).json({
        ok: false,
        error: 'Enter a valid domain name, like playersofficial.com or go.playersofficial.com',
      });
      return;
    }

    if (normalized) {
      const conflict = db
        .prepare('SELECT id FROM users WHERE LOWER(vanity_domain) = LOWER(?) AND id != ?')
        .get(normalized, user.id);
      if (conflict) {
        res.status(409).json({
          ok: false,
          error: 'That domain is already linked to another account.',
        });
        return;
      }
    }

    db.prepare('UPDATE users SET vanity_domain = ? WHERE id = ?').run(normalized, user.id);
    res.json({ ok: true, vanityDomain: normalized });
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.post('/api/auth/reset-password', (req, res) => {
    const emailRaw = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(emailRaw)) {
      res.status(400).json({ ok: false, error: 'Enter a valid email address' });
      return;
    }
    res.json({ ok: true });
  });

  app.post('/api/links', (req, res) => {
    const destination = normalizeDestinationUrl(req.body?.destination);
    if (!destination) {
      res.status(400).json({ ok: false, error: 'Enter a valid web address, like example.com/menu' });
      return;
    }

    const title =
      typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : '';
    const aliasRaw =
      typeof req.body?.alias === 'string' ? req.body.alias.trim() : '';

    let code = aliasRaw;
    if (code) {
      if (!ALIAS_RE.test(code)) {
        res.status(400).json({
          ok: false,
          error: 'Custom link: 3–32 letters, numbers, - or _',
        });
        return;
      }
      if (RESERVED_CODES.has(code.toLowerCase())) {
        res.status(400).json({ ok: false, error: 'That custom link is reserved — pick another.' });
        return;
      }
      const taken = db.prepare('SELECT code FROM links WHERE LOWER(code) = LOWER(?)').get(code);
      if (taken) {
        res.status(409).json({ ok: false, error: 'That short link is already taken — try another.' });
        return;
      }
    } else {
      for (let attempt = 0; attempt < 8; attempt++) {
        const candidate = generateShortCode();
        const exists = db.prepare('SELECT code FROM links WHERE code = ?').get(candidate);
        if (!exists) {
          code = candidate;
          break;
        }
      }
      if (!code) {
        res.status(500).json({ ok: false, error: 'Could not generate a link code. Please try again.' });
        return;
      }
    }

    const authHeader = req.headers.authorization;
    const hasBearerHeader =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
    const user = getAuthenticatedUser(req);
    if (hasBearerHeader && !user) {
      res.status(401).json({
        ok: false,
        error: 'Your session expired — please login again.',
      });
      return;
    }

    const editToken = crypto.randomBytes(24).toString('hex');
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO links (code, destination_url, title, edit_token_hash, owner_user_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    ).run(code, destination, title, hashToken(editToken), user?.id ?? null, now, now);

    recordSiteEvent(req, 'link_created', {
      userId: user?.id ?? null,
      userEmail: user?.email ?? '',
      path: '/',
      code,
      visitorId: req.body?.visitorId,
    });

    const summary = getSummaryForCodes([code])[0] ?? null;

    res.json({
      ok: true,
      code,
      token: user ? null : editToken,
      saved: Boolean(user),
      link: summary,
    });
  });

  app.post('/api/links/summary', (req, res) => {
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
    const lookup = db.prepare(
      'SELECT code, edit_token_hash, owner_user_id FROM links WHERE LOWER(code) = LOWER(?)',
    );
    const verifiedCodes: string[] = [];
    const seen = new Set<string>();

    for (const entry of rawItems.slice(0, 100)) {
      if (!entry || typeof entry !== 'object') continue;
      const { code, token } = entry as { code?: unknown; token?: unknown };
      if (typeof code !== 'string' || typeof token !== 'string' || !ALIAS_RE.test(code)) continue;
      const row = lookup.get(code) as
        | Pick<LinkRow, 'code' | 'edit_token_hash' | 'owner_user_id'>
        | undefined;
      if (
        row &&
        !seen.has(row.code) &&
        row.owner_user_id === null &&
        verifyEditToken(token, row.edit_token_hash)
      ) {
        seen.add(row.code);
        verifiedCodes.push(row.code);
      }
    }

    res.json({ ok: true, links: getSummaryForCodes(verifiedCodes) });
  });

  app.get('/api/my-links', (req, res) => {
    const user = getAuthenticatedUser(req);
    if (!user) {
      res.status(401).json({ ok: false, error: 'Login required' });
      return;
    }
    const ownedCodes = db
      .prepare('SELECT code FROM links WHERE owner_user_id = ? ORDER BY created_at DESC')
      .all(user.id) as Array<{ code: string }>;
    const summary = getSummaryForCodes(ownedCodes.map((r) => r.code));
    res.json({ ok: true, links: summary });
  });

  app.get('/api/links/:code', (req, res) => {
    const code = req.params.code;
    const link = db
      .prepare(
        'SELECT code, destination_url, title, edit_token_hash, owner_user_id, is_active, created_at, updated_at FROM links WHERE LOWER(code) = LOWER(?)',
      )
      .get(code) as LinkRow | undefined;

    if (!link) {
      res.status(404).json({ ok: false, error: 'Link not found' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const tokenHeader =
      typeof req.headers['x-link-token'] === 'string' ? req.headers['x-link-token'] : '';

    if (!isAuthorizedOwner(link, user, tokenHeader)) {
      if (link.owner_user_id !== null && !user) {
        res.status(401).json({
          ok: false,
          accessError: 'auth_required',
          error: 'Login to your account to view this link.',
        });
        return;
      }
      res.status(403).json({
        ok: false,
        accessError: 'forbidden',
        error: 'This link belongs to another account.',
      });
      return;
    }

    const stats = buildLinkStats(link.code);
    let ownerEmail: string | null = null;
    if (user?.isAdmin && link.owner_user_id) {
      const ownerRow = db
        .prepare('SELECT email FROM users WHERE id = ?')
        .get(link.owner_user_id) as { email: string } | undefined;
      ownerEmail = ownerRow?.email ?? null;
    }

    res.json({
      ok: true,
      link: {
        code: link.code,
        destination_url: link.destination_url,
        title: link.title,
        is_active: Boolean(link.is_active),
        created_at: link.created_at,
        updated_at: link.updated_at,
        isOwner: true,
        ...(ownerEmail ? { ownerEmail } : {}),
      },
      stats,
    });
  });

  app.patch('/api/links/:code', (req, res) => {
    const code = req.params.code;
    const link = db
      .prepare(
        'SELECT code, destination_url, title, edit_token_hash, owner_user_id, is_active FROM links WHERE LOWER(code) = LOWER(?)',
      )
      .get(code) as
      | Pick<LinkRow, 'code' | 'destination_url' | 'title' | 'edit_token_hash' | 'owner_user_id' | 'is_active'>
      | undefined;

    if (!link) {
      res.status(404).json({ ok: false, error: 'Link not found' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token
        : typeof req.headers['x-link-token'] === 'string'
          ? req.headers['x-link-token']
          : '';

    if (!isAuthorizedOwner(link, user, token)) {
      res.status(403).json({
        ok: false,
        error: 'Only the owner of this account link can modify or deactivate it.',
      });
      return;
    }

    const destination =
      req.body?.destination !== undefined
        ? normalizeDestinationUrl(req.body.destination)
        : link.destination_url;
    if (!destination) {
      res.status(400).json({ ok: false, error: 'Enter a valid web address' });
      return;
    }
    const title =
      typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 80) : link.title;
    const isActive =
      typeof req.body?.is_active === 'boolean' ? (req.body.is_active ? 1 : 0) : link.is_active;

    db.prepare(
      'UPDATE links SET destination_url = ?, title = ?, is_active = ?, updated_at = ? WHERE code = ?',
    ).run(destination, title, isActive, new Date().toISOString(), link.code);

    res.json({ ok: true, is_active: Boolean(isActive) });
  });

  app.delete('/api/links/:code', (req, res) => {
    const code = req.params.code;
    const link = db
      .prepare('SELECT code, edit_token_hash, owner_user_id FROM links WHERE LOWER(code) = LOWER(?)')
      .get(code) as Pick<LinkRow, 'code' | 'edit_token_hash' | 'owner_user_id'> | undefined;

    if (!link) {
      res.status(404).json({ ok: false, error: 'Link not found' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const token =
      typeof req.body?.token === 'string'
        ? req.body.token
        : typeof req.headers['x-link-token'] === 'string'
          ? req.headers['x-link-token']
          : '';

    if (!isAuthorizedOwner(link, user, token)) {
      res.status(403).json({ ok: false, error: 'Only the owner can delete this link.' });
      return;
    }

    db.prepare('DELETE FROM links WHERE code = ?').run(link.code);
    res.json({ ok: true });
  });

  app.post('/api/links/bulk-delete', (req, res) => {
    const rawItems: unknown[] = Array.isArray(req.body?.items) ? req.body.items : [];
    if (rawItems.length === 0) {
      res.status(400).json({ ok: false, error: 'Select at least one link to delete.' });
      return;
    }

    const user = getAuthenticatedUser(req);
    const lookup = db.prepare(
      'SELECT code, edit_token_hash, owner_user_id FROM links WHERE LOWER(code) = LOWER(?)',
    );
    const deleteStmt = db.prepare('DELETE FROM links WHERE code = ?');

    const deletedCodes: string[] = [];
    const seen = new Set<string>();

    for (const entry of rawItems.slice(0, 100)) {
      if (!entry || typeof entry !== 'object') continue;
      const { code, token } = entry as { code?: unknown; token?: unknown };
      if (typeof code !== 'string' || !ALIAS_RE.test(code)) continue;

      const link = lookup.get(code) as
        | Pick<LinkRow, 'code' | 'edit_token_hash' | 'owner_user_id'>
        | undefined;
      if (!link || seen.has(link.code)) continue;
      seen.add(link.code);

      if (isAuthorizedOwner(link, user, typeof token === 'string' ? token : '')) {
        deleteStmt.run(link.code);
        deletedCodes.push(link.code);
      }
    }

    if (deletedCodes.length === 0) {
      res.status(403).json({
        ok: false,
        error: 'No authorized links were deleted.',
      });
      return;
    }

    res.json({ ok: true, deletedCodes });
  });

  // Public site & QR download telemetry endpoint
  app.post('/api/telemetry/event', (req, res) => {
    const allowed = new Set<TelemetryEventType>([
      'site_visit',
      'qr_download_png',
      'qr_download_svg',
      'app_install',
    ]);
    const eventType = req.body?.event_type;
    if (typeof eventType !== 'string' || !allowed.has(eventType as TelemetryEventType)) {
      res.status(400).json({ ok: false, error: 'Unsupported telemetry event' });
      return;
    }

    const user = getAuthenticatedUser(req);
    recordSiteEvent(req, eventType as TelemetryEventType, {
      res,
      userId: user?.id ?? null,
      userEmail: user?.email ?? '',
      path: typeof req.body?.path === 'string' ? req.body.path : '/',
      code: typeof req.body?.code === 'string' ? req.body.code : '',
      visitorId: req.body?.visitorId,
    });

    res.json({ ok: true });
  });

  // Admin Dashboard Overview (strictly playersofficials21706@gmail.com only)
  app.get('/api/admin/overview', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const userTotals = db
      .prepare(
        `SELECT
          COUNT(*) AS totalUsers,
          COALESCE(SUM(CASE WHEN is_active = 1 OR LOWER(email) = LOWER(?) THEN 1 ELSE 0 END), 0) AS activeUsers,
          COALESCE(SUM(CASE WHEN is_active = 0 AND LOWER(email) != LOWER(?) THEN 1 ELSE 0 END), 0) AS deactivatedUsers
         FROM users`,
      )
      .get(ADMIN_EMAIL, ADMIN_EMAIL) as {
      totalUsers: number;
      activeUsers: number;
      deactivatedUsers: number;
    };

    const linkTotals = db
      .prepare(
        `SELECT
          COUNT(*) AS totalLinks,
          COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS activeLinks,
          COALESCE(SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END), 0) AS pausedLinks
         FROM links`,
      )
      .get() as { totalLinks: number; activeLinks: number; pausedLinks: number };

    const scans = db
      .prepare(
        `SELECT id, code, source, visitor_id, device, os, browser, country, city, created_at
         FROM scans
         ORDER BY created_at DESC`,
      )
      .all() as unknown as ScanRow[];

    const events = db
      .prepare(
        `SELECT id, event_type, visitor_id, user_id, user_email, path, code, device, os, browser, country, city, created_at
         FROM site_events
         ORDER BY created_at DESC`,
      )
      .all() as unknown as SiteEventRow[];

    const todayStr = new Date().toISOString().slice(0, 10);
    const dayMap = new Map<
      string,
      { visits: number; scans: number; linksCreated: number; downloads: number; signups: number }
    >();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setUTCDate(now.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, { visits: 0, scans: 0, linksCreated: 0, downloads: 0, signups: 0 });
    }

    const deviceCounts = new Map<string, number>();
    const countryCounts = new Map<string, number>();
    const osCounts = new Map<string, number>();
    const browserCounts = new Map<string, number>();

    const scanVisitors = new Set<string>();
    const siteVisitors = new Set<string>();
    let qrScans = 0;
    let linkClicks = 0;
    let todayScans = 0;

    for (const s of scans) {
      scanVisitors.add(s.visitor_id);
      if (s.source === 'qr') qrScans++;
      else linkClicks++;
      const dayKey = s.created_at.slice(0, 10);
      if (dayKey === todayStr) todayScans++;
      const bucket = dayMap.get(dayKey);
      if (bucket) bucket.scans++;

      deviceCounts.set(s.device, (deviceCounts.get(s.device) || 0) + 1);
      countryCounts.set(s.country, (countryCounts.get(s.country) || 0) + 1);
      osCounts.set(s.os, (osCounts.get(s.os) || 0) + 1);
      browserCounts.set(s.browser, (browserCounts.get(s.browser) || 0) + 1);
    }

    let totalSiteVisits = 0;
    let qrDownloadsPng = 0;
    let qrDownloadsSvg = 0;
    let totalAppInstalls = 0;
    let todayVisits = 0;
    let todayLinks = 0;
    let todaySignups = 0;

    for (const ev of events) {
      const dayKey = ev.created_at.slice(0, 10);
      const bucket = dayMap.get(dayKey);

      if (ev.event_type === 'site_visit') {
        totalSiteVisits++;
        siteVisitors.add(ev.visitor_id);
        if (dayKey === todayStr) todayVisits++;
        if (bucket) bucket.visits++;

        deviceCounts.set(ev.device, (deviceCounts.get(ev.device) || 0) + 1);
        countryCounts.set(ev.country, (countryCounts.get(ev.country) || 0) + 1);
        osCounts.set(ev.os, (osCounts.get(ev.os) || 0) + 1);
        browserCounts.set(ev.browser, (browserCounts.get(ev.browser) || 0) + 1);
      } else if (ev.event_type === 'qr_download_png') {
        qrDownloadsPng++;
        if (bucket) bucket.downloads++;
      } else if (ev.event_type === 'qr_download_svg') {
        qrDownloadsSvg++;
        if (bucket) bucket.downloads++;
      } else if (ev.event_type === 'app_install') {
        totalAppInstalls++;
        if (bucket) bucket.downloads++;
      } else if (ev.event_type === 'link_created') {
        if (dayKey === todayStr) todayLinks++;
        if (bucket) bucket.linksCreated++;
      } else if (ev.event_type === 'user_signup') {
        if (dayKey === todayStr) todaySignups++;
        if (bucket) bucket.signups++;
      }
    }

    const toSortedList = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const topLinks = db
      .prepare(
        `SELECT
          l.code,
          l.title,
          l.destination_url,
          l.is_active,
          l.created_at,
          COALESCE(u.email, '') AS owner_email,
          COUNT(s.id) AS total,
          COUNT(DISTINCT s.visitor_id) AS uniq,
          COALESCE(SUM(CASE WHEN s.source = 'qr' THEN 1 ELSE 0 END), 0) AS qr
        FROM links l
        LEFT JOIN users u ON u.id = l.owner_user_id
        LEFT JOIN scans s ON s.code = l.code
        GROUP BY l.code
        ORDER BY total DESC, l.created_at DESC
        LIMIT 10`,
      )
      .all() as Array<{
      code: string;
      title: string;
      destination_url: string;
      is_active: number;
      created_at: string;
      owner_email: string;
      total: number;
      uniq: number;
      qr: number;
    }>;

    res.json({
      ok: true,
      stats: {
        ...userTotals,
        ...linkTotals,
        totalScans: scans.length,
        uniqueScanVisitors: scanVisitors.size,
        qrScans,
        linkClicks,
        totalSiteVisits,
        uniqueSiteVisitors: siteVisitors.size,
        totalQrDownloads: qrDownloadsPng + qrDownloadsSvg,
        qrDownloadsPng,
        qrDownloadsSvg,
        totalAppInstalls,
        todayVisits,
        todayScans,
        todayLinks,
        todaySignups,
      },
      daily: Array.from(dayMap.entries()).map(([day, vals]) => ({ day, ...vals })),
      devices: toSortedList(deviceCounts),
      countries: toSortedList(countryCounts),
      os: toSortedList(osCounts),
      browsers: toSortedList(browserCounts),
      topLinks: topLinks.map((row) => ({ ...row, is_active: Boolean(row.is_active) })),
      recentEvents: events.slice(0, 40),
    });
  });

  app.get('/api/admin/users', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const users = db
      .prepare(
        `SELECT
          u.id,
          u.email,
          u.vanity_domain,
          u.is_active,
          u.last_active_at,
          u.created_at,
          (SELECT COUNT(*) FROM links l WHERE l.owner_user_id = u.id) AS link_count,
          (SELECT COUNT(*) FROM links l WHERE l.owner_user_id = u.id AND l.is_active = 1) AS active_link_count,
          (SELECT COUNT(*) FROM scans s INNER JOIN links l ON l.code = s.code WHERE l.owner_user_id = u.id) AS total_scans,
          (SELECT COUNT(*) FROM site_events se WHERE se.user_id = u.id AND se.event_type IN ('qr_download_png', 'qr_download_svg', 'app_install')) AS total_downloads
         FROM users u
         ORDER BY u.created_at DESC`,
      )
      .all() as Array<{
      id: string;
      email: string;
      vanity_domain: string;
      is_active: number;
      last_active_at: string;
      created_at: string;
      link_count: number;
      active_link_count: number;
      total_scans: number;
      total_downloads: number;
    }>;

    res.json({
      ok: true,
      users: users.map((u) => ({
        ...u,
        is_active: Boolean(u.is_active) || isAdminEmail(u.email),
        is_admin: isAdminEmail(u.email),
      })),
    });
  });

  app.get('/api/admin/users/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const target = db
      .prepare(
        'SELECT id, email, vanity_domain, is_active, last_active_at, created_at FROM users WHERE id = ?',
      )
      .get(req.params.id) as
      | Pick<UserRow, 'id' | 'email' | 'vanity_domain' | 'is_active' | 'last_active_at' | 'created_at'>
      | undefined;

    if (!target) {
      res.status(404).json({ ok: false, error: 'User not found' });
      return;
    }

    const ownedCodes = db
      .prepare('SELECT code FROM links WHERE owner_user_id = ? ORDER BY created_at DESC')
      .all(target.id) as Array<{ code: string }>;
    const links = getSummaryForCodes(ownedCodes.map((r) => r.code));

    const recentEvents = db
      .prepare(
        `SELECT id, event_type, visitor_id, user_id, user_email, path, code, device, os, browser, country, city, created_at
         FROM site_events
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 25`,
      )
      .all(target.id) as unknown as SiteEventRow[];

    res.json({
      ok: true,
      user: {
        ...target,
        is_active: Boolean(target.is_active) || isAdminEmail(target.email),
        is_admin: isAdminEmail(target.email),
      },
      links,
      recentEvents,
    });
  });

  app.patch('/api/admin/users/:id/status', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const target = db
      .prepare('SELECT id, email, is_active FROM users WHERE id = ?')
      .get(req.params.id) as Pick<UserRow, 'id' | 'email' | 'is_active'> | undefined;

    if (!target) {
      res.status(404).json({ ok: false, error: 'User not found' });
      return;
    }

    if (isAdminEmail(target.email)) {
      res.status(400).json({ ok: false, error: 'Cannot deactivate the primary admin account.' });
      return;
    }

    if (typeof req.body?.is_active !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Specify is_active boolean.' });
      return;
    }

    const nextActive = req.body.is_active ? 1 : 0;
    db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(nextActive, target.id);

    if (req.body?.pause_links === true) {
      db.prepare('UPDATE links SET is_active = ?, updated_at = ? WHERE owner_user_id = ?').run(
        nextActive,
        new Date().toISOString(),
        target.id,
      );
    }

    res.json({
      ok: true,
      id: target.id,
      is_active: Boolean(nextActive),
    });
  });

  app.get('/api/admin/links', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const rows = db
      .prepare(
        `SELECT
          l.code,
          l.title,
          l.destination_url,
          l.is_active,
          l.created_at,
          l.updated_at,
          l.owner_user_id,
          COALESCE(u.email, '') AS owner_email,
          COUNT(s.id) AS total,
          COUNT(DISTINCT s.visitor_id) AS uniq,
          COALESCE(SUM(CASE WHEN s.source = 'qr' THEN 1 ELSE 0 END), 0) AS qr
        FROM links l
        LEFT JOIN users u ON u.id = l.owner_user_id
        LEFT JOIN scans s ON s.code = l.code
        GROUP BY l.code
        ORDER BY l.created_at DESC
        LIMIT 500`,
      )
      .all() as Array<{
      code: string;
      title: string;
      destination_url: string;
      is_active: number;
      created_at: string;
      updated_at: string;
      owner_user_id: string | null;
      owner_email: string;
      total: number;
      uniq: number;
      qr: number;
    }>;

    res.json({
      ok: true,
      links: rows.map((row) => ({ ...row, is_active: Boolean(row.is_active) })),
    });
  });

  app.get('/api/admin/export-csv', (req, res) => {
    if (!requireAdmin(req, res)) return;

    const csvCell = (raw: unknown): string => {
      let str = raw === null || raw === undefined ? '' : String(raw);
      if (/^[=+\-@\t\r]/.test(str)) {
        str = `'${str}`;
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const eventRows = db
      .prepare(
        `SELECT
          se.created_at,
          'activity' AS category,
          se.event_type,
          se.user_email,
          se.visitor_id,
          se.code,
          COALESCE(l.title, '') AS title,
          COALESCE(l.destination_url, '') AS destination_url,
          se.device,
          se.os,
          se.browser,
          se.country,
          se.city,
          se.path
        FROM site_events se
        LEFT JOIN links l ON l.code = se.code`,
      )
      .all() as Array<{
      created_at: string;
      category: string;
      event_type: string;
      user_email: string;
      visitor_id: string;
      code: string;
      title: string;
      destination_url: string;
      device: string;
      os: string;
      browser: string;
      country: string;
      city: string;
      path: string;
    }>;

    const loggedLinkCodes = new Set(
      eventRows.filter((e) => e.event_type === 'link_created' && e.code).map((e) => e.code),
    );

    const linkRows = db
      .prepare(
        `SELECT
          l.created_at,
          l.code,
          l.title,
          l.destination_url,
          COALESCE(u.email, '') AS owner_email
        FROM links l
        LEFT JOIN users u ON u.id = l.owner_user_id`,
      )
      .all() as Array<{
      created_at: string;
      code: string;
      title: string;
      destination_url: string;
      owner_email: string;
    }>;

    const scanRows = db
      .prepare(
        `SELECT
          s.created_at,
          s.source,
          s.visitor_id,
          s.code,
          s.device,
          s.os,
          s.browser,
          s.country,
          s.city,
          COALESCE(l.title, '') AS title,
          COALESCE(l.destination_url, '') AS destination_url,
          COALESCE(u.email, '') AS owner_email
        FROM scans s
        LEFT JOIN links l ON l.code = s.code
        LEFT JOIN users u ON u.id = l.owner_user_id`,
      )
      .all() as Array<{
      created_at: string;
      source: string;
      visitor_id: string;
      code: string;
      device: string;
      os: string;
      browser: string;
      country: string;
      city: string;
      title: string;
      destination_url: string;
      owner_email: string;
    }>;

    const combined: Array<Array<string>> = [];

    for (const ev of eventRows) {
      combined.push([
        ev.created_at,
        ev.event_type === 'link_created' ? 'link_creation' : 'user_activity',
        ev.event_type,
        ev.user_email || 'Guest',
        ev.visitor_id,
        ev.code,
        ev.title,
        ev.destination_url,
        ev.device,
        ev.os,
        ev.browser,
        ev.country,
        ev.city,
        ev.path,
      ]);
    }

    for (const l of linkRows) {
      if (loggedLinkCodes.has(l.code)) continue;
      combined.push([
        l.created_at,
        'link_creation',
        'link_created',
        l.owner_email || 'Guest',
        '',
        l.code,
        l.title,
        l.destination_url,
        '',
        '',
        '',
        '',
        '',
        '/',
      ]);
    }

    for (const s of scanRows) {
      combined.push([
        s.created_at,
        'link_scan',
        s.source === 'qr' ? 'qr_scan' : 'link_click',
        s.owner_email || 'Guest',
        s.visitor_id,
        s.code,
        s.title,
        s.destination_url,
        s.device,
        s.os,
        s.browser,
        s.country,
        s.city,
        `/playerqr/${s.code}`,
      ]);
    }

    combined.sort((a, b) => (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0));

    const header = [
      'Timestamp',
      'Category',
      'Event Type',
      'User Email',
      'Visitor ID',
      'Short Code',
      'Title',
      'Destination URL',
      'Device',
      'OS',
      'Browser',
      'Country',
      'City',
      'Path',
    ];

    const lines = [
      header.map(csvCell).join(','),
      ...combined.map((row) => row.map(csvCell).join(',')),
    ];

    const dateTag = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="playersqr-admin-report-${dateTag}.csv"`,
    );
    res.send(lines.join('\r\n'));
  });

  // Dynamic QR & short link redirect endpoint (/playerqr/:code primary + /r/:code alias)
  const handleShortLinkRedirect = (req: Request, res: Response, next: NextFunction) => {
    const code = req.params.code;
    const link = db
      .prepare('SELECT code, destination_url, is_active FROM links WHERE LOWER(code) = LOWER(?)')
      .get(code) as Pick<LinkRow, 'code' | 'destination_url' | 'is_active'> | undefined;

    if (!link) {
      next();
      return;
    }

    if (!link.is_active) {
      res.status(410).send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link deactivated — PlayersQR</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f7f4eb;color:#1b1f2e;font-family:system-ui,sans-serif;padding:24px}main{max-width:420px;background:#fff;border:2px solid #1b1f2e;border-radius:14px;padding:28px;box-shadow:5px 5px 0 #1b1f2e;text-align:center}h1{margin:0 0 8px;font-size:22px;text-transform:uppercase}p{margin:0;color:#555;font-size:15px;line-height:1.5}</style></head><body><main><h1>Link paused</h1><p>This QR code and short link has been deactivated by its owner.</p></main></body></html>`,
      );
      return;
    }

    const source = req.query.s === 'qr' ? 'qr' : 'link';
    const cookies = parseCookies(req);
    let visitorId = cookies[VISITOR_COOKIE];
    if (!visitorId || visitorId.length > 64) {
      visitorId = crypto.randomUUID();
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.setHeader(
        'Set-Cookie',
        isHttps
          ? `${VISITOR_COOKIE}=${encodeURIComponent(visitorId)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=None; Partitioned`
          : `${VISITOR_COOKIE}=${encodeURIComponent(visitorId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`,
      );
    }

    const { device, os, browser } = parseUserAgent(req.headers['user-agent']);
    const { country, city } = detectLocation(req);

    db.prepare(
      `INSERT INTO scans (code, source, visitor_id, device, os, browser, country, city, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      link.code,
      source,
      visitorId,
      device,
      os,
      browser,
      country,
      city,
      new Date().toISOString(),
    );

    res.redirect(302, link.destination_url);
  };

  app.get('/robots.txt', (req, res) => {
    const baseUrl = getPublicBaseUrl(req);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Allow: /auth',
      'Allow: /playerqr/',
      'Disallow: /api/',
      'Disallow: /admin',
      'Disallow: /account',
      'Disallow: /links/',
      '',
      `Sitemap: ${baseUrl}/sitemap.xml`,
      '',
    ].join('\n');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(body);
  });

  app.get('/sitemap.xml', (req, res) => {
    const baseUrl = getPublicBaseUrl(req);
    const lastmod = new Date().toISOString().slice(0, 10);
    const publicPages = [
      { loc: `${baseUrl}/`, changefreq: 'daily', priority: '1.0' },
      { loc: `${baseUrl}/auth?mode=signup`, changefreq: 'monthly', priority: '0.7' },
      { loc: `${baseUrl}/auth?mode=login`, changefreq: 'monthly', priority: '0.6' },
    ];
    const urlsXml = publicPages
      .map(
        (page) =>
          `  <url>\n    <loc>${escapeXml(page.loc)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`,
      )
      .join('\n');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlsXml}\n</urlset>\n`;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  });

  app.get('/playerqr/:code', handleShortLinkRedirect);
  app.get('/r/:code', handleShortLinkRedirect);

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    app.use(express.static(distDir, { index: false }));
    app.get('*', (req, res) => {
      try {
        const baseUrl = getPublicBaseUrl(req);
        const cleanPath = (req.path || '/').replace(/[\r\n"<>]/g, '');
        const pageUrl = escapeHtmlAttr(`${baseUrl}${cleanPath}`);
        let html = fs.readFileSync(indexHtmlPath, 'utf8');
        html = html
          .replace(
            /(<meta\s+(?:property="og:image"|name="twitter:image")\s+content=")(\/[^"]+)(")/g,
            (_match, p1: string, p2: string, p3: string) =>
              `${p1}${escapeHtmlAttr(`${baseUrl}${p2}`)}${p3}`,
          )
          .replace(
            '</head>',
            `    <link rel="canonical" href="${pageUrl}" />\n    <meta property="og:url" content="${pageUrl}" />\n  </head>`,
          );
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch {
        res.sendFile(indexHtmlPath);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PlayersQR server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
