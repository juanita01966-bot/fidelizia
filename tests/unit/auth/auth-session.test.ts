import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from '@/lib/store/auth-session';

describe('store/auth-session (fail-closed compatibility)', () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    // Reset singleton via private field only for test isolation
    (SessionManager as unknown as { instance?: SessionManager }).instance = undefined;
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('starts unauthenticated and rejects all legacy hardcoded credentials and bypasses', () => {
    const manager = SessionManager.getInstance();
    const initial = manager.getSession();

    expect(initial.isAuthenticated).toBe(false);
    expect(initial.operatorName).toBe('');
    expect(manager.getAdminPassword()).toBe('');

    expect(manager.login('admin', '').success).toBe(false);
    expect(manager.login('admin', '12345678').success).toBe(false);
    expect(manager.login('admin', '9999').success).toBe(false);
    expect(manager.login('admin', 'AdminMaster2026@').success).toBe(false);
    expect(manager.login('staff', '').success).toBe(false);
    expect(manager.login('staff', '1234').success).toBe(false);
    expect(manager.login('staff', 'staff123').success).toBe(false);

    expect(manager.verifyMasterKey('AdminMaster2026@')).toBe(false);
    expect(manager.setAdminPasswordWithSecurityKey('AdminMaster2026@', 'newpass').success).toBe(false);
    expect(() => manager.setAdminPassword('newpass')).toThrow();

    // Unauthenticated switchRole must never elevate to authenticated admin
    manager.switchRole('admin');
    expect(manager.getSession().isAuthenticated).toBe(false);
  });

  it('hydrates from server session API via loginAsync and enforces role bounds on switchRole', async () => {
    globalThis.window = {} as Window & typeof globalThis;
    const fetchMock = vi
      .fn()
      // Constructor refreshSession call
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, session: null }),
      })
      // loginAsync as cashier
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          session: {
            userId: 'emp-1',
            merchantId: 'merch-1',
            merchantSlug: 'cafe-canelo',
            role: 'cashier',
            name: 'Santiago Barista',
          },
        }),
      })
      // logoutAsync
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const manager = SessionManager.getInstance();
    const loginResult = await manager.loginAsync({
      merchantSlug: 'cafe-canelo',
      identifier: 'santiago',
      secret: '1234',
    });

    expect(loginResult.success).toBe(true);
    expect(manager.getSession().isAuthenticated).toBe(true);
    expect(manager.getSession().role).toBe('staff');

    // Cashier cannot switch UI role to admin
    manager.switchRole('admin');
    expect(manager.getSession().role).toBe('staff');

    await manager.logoutAsync();
    expect(manager.getSession().isAuthenticated).toBe(false);
  });
});
