import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export const validHash = value => /^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(value || '');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return 'scrypt:' + salt + ':' + (await derive(password, salt, 64)).toString('hex');
}
export async function verifyPassword(password, hash) {
  if (!validHash(hash)) return false;
  const [, salt, expected] = hash.split(':');
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(expected, 'hex'));
}
export function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 14 || password.length > 256) {
    const error = new Error('Use a password between 14 and 256 characters.');
    error.statusCode = 400;
    throw error;
  }
}
