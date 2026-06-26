import { createHmac, timingSafeEqual } from 'node:crypto';

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required');
}
if (process.env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET must be at least 32 characters');
}

const SECRET = process.env.SESSION_SECRET;

export interface PendingData {
  action: 'recommend' | 'subscribe';
  uri: string;
  origin: string;
  title: string;
}

function hmac(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export function signSessionId(id: string): string {
  return `${id}.${hmac(id)}`;
}

export function verifySessionId(signed: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot === -1) return null;
  const id = signed.slice(0, dot);
  if (!safeEqual(signed.slice(dot + 1), hmac(id))) return null;
  return id;
}

export function encodePending(data: PendingData): string {
  const json = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${json}.${hmac(json)}`;
}

export function decodePending(encoded: string): PendingData | null {
  const dot = encoded.lastIndexOf('.');
  if (dot === -1) return null;
  const json = encoded.slice(0, dot);
  if (!safeEqual(encoded.slice(dot + 1), hmac(json))) return null;
  try {
    return JSON.parse(Buffer.from(json, 'base64url').toString()) as PendingData;
  } catch {
    return null;
  }
}
