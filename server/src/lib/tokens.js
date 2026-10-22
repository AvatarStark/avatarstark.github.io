import { createHash, randomBytes } from 'node:crypto';

export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t) => createHash('sha256').update(String(t)).digest('hex');
export const looksLikeToken = (t) => typeof t === 'string' && /^[A-Za-z0-9_-]{40,60}$/.test(t);
