import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'playersqr.db');
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    vanity_domain TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_active_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS links (
    code TEXT PRIMARY KEY,
    destination_url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    edit_token_hash TEXT NOT NULL,
    owner_user_id TEXT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    source TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    device TEXT NOT NULL,
    os TEXT NOT NULL,
    browser TEXT NOT NULL,
    country TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    FOREIGN KEY (code) REFERENCES links(code) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS site_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    visitor_id TEXT NOT NULL,
    user_id TEXT NULL,
    user_email TEXT NOT NULL DEFAULT '',
    path TEXT NOT NULL DEFAULT '/',
    code TEXT NOT NULL DEFAULT '',
    device TEXT NOT NULL DEFAULT 'Desktop',
    os TEXT NOT NULL DEFAULT 'Other',
    browser TEXT NOT NULL DEFAULT 'Other',
    country TEXT NOT NULL DEFAULT 'Unknown',
    city TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scans_code_created ON scans(code, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_links_owner ON links(owner_user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_site_events_created ON site_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_site_events_type_created ON site_events(event_type, created_at DESC);
`);

try {
  db.exec(`ALTER TABLE links ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
} catch {
  // column already exists
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN vanity_domain TEXT NOT NULL DEFAULT '';`);
} catch {
  // column already exists
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;`);
} catch {
  // column already exists
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN last_active_at TEXT NOT NULL DEFAULT '';`);
} catch {
  // column already exists
}

db.prepare(
  `UPDATE users SET vanity_domain = 'playersofficial.com' WHERE LOWER(email) = 'playersofficials21706@gmail.com' AND vanity_domain = ''`,
).run();

db.prepare(
  `UPDATE users SET is_active = 1 WHERE LOWER(email) = 'playersofficials21706@gmail.com' AND is_active = 0`,
).run();

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  vanity_domain: string;
  is_active: number;
  last_active_at: string;
  created_at: string;
}

export interface LinkRow {
  code: string;
  destination_url: string;
  title: string;
  edit_token_hash: string;
  owner_user_id: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ScanRow {
  id: number;
  code: string;
  source: 'qr' | 'link';
  visitor_id: string;
  device: string;
  os: string;
  browser: string;
  country: string;
  city: string;
  created_at: string;
}

export interface SiteEventRow {
  id: number;
  event_type: string;
  visitor_id: string;
  user_id: string | null;
  user_email: string;
  path: string;
  code: string;
  device: string;
  os: string;
  browser: string;
  country: string;
  city: string;
  created_at: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifyEditToken(token: string, storedHash: string): boolean {
  if (!token || !storedHash) return false;
  const candidate = Buffer.from(hashToken(token), 'hex');
  const target = Buffer.from(storedHash, 'hex');
  if (candidate.length !== target.length) return false;
  return crypto.timingSafeEqual(candidate, target);
}
