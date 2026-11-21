'use client';

export type UserRole = 'admin' | 'staff';

export interface AuthSession {
  isAuthenticated: boolean;
  role: UserRole;
  operatorName: string;
  avatarUrl?: string;
  loginTime: string;
  userId?: string;
  merchantId?: string;
  merchantSlug?: string;
  serverRole?: 'admin' | 'manager' | 'cashier';
}

interface ServerSessionDto {
  userId: string;
  merchantId: string;
  merchantSlug: string;
  role: 'admin' | 'manager' | 'cashier';
  name: string;
}

const UNAUTHENTICATED_SESSION: AuthSession = {
  isAuthenticated: false,
  role: 'staff',
  operatorName: '',
  loginTime: '',
};

function mapServerSession(serverSession: ServerSessionDto): AuthSession {
  const uiRole: UserRole =
    serverSession.role === 'admin' || serverSession.role === 'manager' ? 'admin' : 'staff';
  return {
    isAuthenticated: true,
    role: uiRole,
    operatorName: serverSession.name,
    loginTime: new Date().toISOString(),
    userId: serverSession.userId,
    merchantId: serverSession.merchantId,
    merchantSlug: serverSession.merchantSlug,
    serverRole: serverSession.role,
  };
}

export class SessionManager {
  private static instance: SessionManager;
  private currentSession: AuthSession = { ...UNAUTHENTICATED_SESSION };
  private listeners: Set<() => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      void this.refreshSession();
    }
  }

  public static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  public getSession(): AuthSession {
    return this.currentSession;
  }

  public async refreshSession(): Promise<AuthSession> {
    if (typeof window === 'undefined') {
      return this.currentSession;
    }

    try {
      const res = await fetch('/api/v1/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        this.currentSession = { ...UNAUTHENTICATED_SESSION };
        this.notify();
        return this.currentSession;
      }

      const data = (await res.json()) as {
        authenticated?: boolean;
        session?: ServerSessionDto | null;
      };

      if (data.authenticated && data.session) {
        this.currentSession = mapServerSession(data.session);
      } else {
        this.currentSession = { ...UNAUTHENTICATED_SESSION };
      }
    } catch {
      this.currentSession = { ...UNAUTHENTICATED_SESSION };
    }

    this.notify();
    return this.currentSession;
  }

  public async loginAsync(params: {
    merchantSlug?: string;
    identifier: string;
    secret: string;
  }): Promise<{ success: boolean; error?: string; session?: AuthSession }> {
    const identifier = params.identifier.trim();
    const secret = params.secret.trim();

    if (!identifier || !secret) {
      return { success: false, error: 'Usuario y contraseña o PIN son obligatorios.' };
    }

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          merchantSlug: params.merchantSlug?.trim() || 'cafe-canelo',
          identifier,
          secret,
        }),
      });

      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        message?: string;
        session?: ServerSessionDto;
      };

      if (!res.ok || !data.success || !data.session) {
        return {
          success: false,
          error: data.message || 'Credenciales inválidas',
        };
      }

      this.currentSession = mapServerSession(data.session);
      this.notify();
      return { success: true, session: this.currentSession };
    } catch {
      return {
        success: false,
        error: 'No se pudo conectar con el servidor de autenticación.',
      };
    }
  }

  public async logoutAsync(): Promise<void> {
    this.currentSession = { ...UNAUTHENTICATED_SESSION };
    this.notify();
    if (typeof window !== 'undefined') {
      try {
        await fetch('/api/v1/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // Ignore network errors on logout cleanup
      }
    }
  }

  /**
   * Fail-closed synchronous compatibility stub for legacy M4 callers.
   * Never authenticates offline or accepts hardcoded credentials.
   */
  public login(_usernameOrRole: string, passwordOrPin?: string): { success: boolean; error?: string } {
    if (!passwordOrPin || passwordOrPin.trim().length === 0) {
      return {
        success: false,
        error: 'La contraseña o PIN es obligatorio.',
      };
    }
    return {
      success: false,
      error: 'Usa el inicio de sesión seguro del servidor (/api/v1/auth/login).',
    };
  }

  public switchRole(role: UserRole): void {
    if (!this.currentSession.isAuthenticated) {
      return;
    }

    const canPreviewAdmin =
      this.currentSession.serverRole === 'admin' || this.currentSession.serverRole === 'manager';

    if (role === 'admin' && !canPreviewAdmin) {
      return;
    }

    this.currentSession = {
      ...this.currentSession,
      role,
    };
    this.notify();
  }

  public logout(): void {
    this.currentSession = { ...UNAUTHENTICATED_SESSION };
    this.notify();
    if (typeof window !== 'undefined') {
      void fetch('/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
  }

  public verifyMasterKey(_keyInput: string): boolean {
    return false;
  }

  public setAdminPasswordWithSecurityKey(
    _securityKey: string,
    _newPassword: string
  ): { success: boolean; error?: string } {
    return {
      success: false,
      error: 'Operación disponible solo vía endpoint autenticado del servidor.',
    };
  }

  public setAdminPassword(_newPassword: string): void {
    throw new Error('El cambio de contraseña requiere autenticación en el servidor.');
  }

  public getAdminPassword(): string {
    return '';
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const getSessionManager = () => SessionManager.getInstance();
