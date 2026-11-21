import { describe, it, expect } from 'vitest';
import { hashSecret, isBcryptHash, verifyPassword, verifyPin } from '@/lib/auth/password';

describe('auth/password (bcryptjs)', () => {
  it('hashes and verifies non-empty passwords with bcrypt', async () => {
    const hash = await hashSecret('CaneloSeguro2026!', 4);
    expect(isBcryptHash(hash)).toBe(true);
    expect(await verifyPassword('CaneloSeguro2026!', hash)).toBe(true);
    expect(await verifyPassword('WrongPassword', hash)).toBe(false);
  });

  it('rejects empty or whitespace-only secrets', async () => {
    await expect(hashSecret('')).rejects.toThrow(/empty/i);
    await expect(hashSecret('   ')).rejects.toThrow(/empty/i);

    const hash = await hashSecret('valid-secret', 4);
    expect(await verifyPassword('', hash)).toBe(false);
    expect(await verifyPassword('   ', hash)).toBe(false);
    expect(await verifyPassword('valid-secret', null)).toBe(false);
    expect(await verifyPassword('valid-secret', 'plaintext-hash')).toBe(false);
  });

  it('verifies 4-digit PINs only against valid bcrypt hashes and rejects plaintext PINs', async () => {
    const pinHash = await hashSecret('9999', 4);
    expect(await verifyPin('9999', pinHash)).toBe(true);
    expect(await verifyPin('1234', pinHash)).toBe(false);

    // Reject plaintext stored PINs
    expect(await verifyPin('1234', '1234')).toBe(false);
    expect(await verifyPin('9999', '9999')).toBe(false);

    // Reject non-4-digit PIN inputs
    expect(await verifyPin('', pinHash)).toBe(false);
    expect(await verifyPin('999', pinHash)).toBe(false);
    expect(await verifyPin('99999', pinHash)).toBe(false);
    expect(await verifyPin('abcd', pinHash)).toBe(false);
  });

  it('guards non-string inputs cleanly without crashing in isBcryptHash, hashSecret, verifyPassword, and verifyPin', async () => {
    const hash = await hashSecret('9999', 4);

    expect(isBcryptHash(1234 as unknown as string)).toBe(false);
    expect(isBcryptHash(null)).toBe(false);
    expect(isBcryptHash(undefined)).toBe(false);
    expect(isBcryptHash({ toString: () => hash })).toBe(false);

    await expect(hashSecret(1234 as unknown as string)).rejects.toThrow(/empty/i);
    await expect(hashSecret(null as unknown as string)).rejects.toThrow(/empty/i);

    expect(await verifyPassword(1234 as unknown as string, hash)).toBe(false);
    expect(await verifyPassword(null as unknown as string, hash)).toBe(false);
    expect(await verifyPassword('9999', 1234 as unknown as string)).toBe(false);

    expect(await verifyPin(9999 as unknown as string, hash)).toBe(false);
    expect(await verifyPin(null as unknown as string, hash)).toBe(false);
    expect(await verifyPin('9999', 1234 as unknown as string)).toBe(false);
  });
});
