import bcrypt from 'bcryptjs';

const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const FOUR_DIGIT_PIN_REGEX = /^\d{4}$/;

export function isBcryptHash(value: unknown): boolean {
  return typeof value === 'string' && BCRYPT_HASH_REGEX.test(value);
}

export async function hashSecret(plain: string, rounds = 10): Promise<string> {
  if (typeof plain !== 'string' || plain.trim().length === 0) {
    throw new Error('Secret cannot be empty');
  }
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(
  plain: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (typeof plain !== 'string' || plain.trim().length === 0) return false;
  if (!isBcryptHash(storedHash)) return false;
  return bcrypt.compare(plain, storedHash as string);
}

export async function verifyPin(
  plainPin: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (typeof plainPin !== 'string' || !FOUR_DIGIT_PIN_REGEX.test(plainPin)) return false;
  if (!isBcryptHash(storedHash)) return false;
  return bcrypt.compare(plainPin, storedHash as string);
}
