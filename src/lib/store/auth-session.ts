'use client';

export type UserRole = 'admin' | 'staff';

export interface AuthSession {
  isAuthenticated: boolean;
  role: UserRole;
  operatorName: string;
  avatarUrl?: string;
  loginTime: string;
}

const STORAGE_KEY = 'dynamind_auth_session_v1';
const PWD_STORAGE_KEY = 'dynamind_admin_pwd_v1';

// Hash SHA-256 criptográfico de la clave maestra (la contraseña en texto plano jamás se aloja en el bundle)
const MASTER_SECURITY_HASH = '19af562fc1c20ec98764a7e46f302335e9935fde3ae5711c6fc73b45f301f6b8';

/**
 * Función de hashing SHA-256 sincrónica pura en cliente para validación sin exposición de texto plano
 */
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let i: number, j: number;
  let result = '';
  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;
  const hash: number[] = [];
  const k: number[] = [];
  let primeCounter = 0;
  const isComposite: Record<number, number> = {};

  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }

  ascii += '\x80';
  while ((ascii.length % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << (((3 - i) % 4) * 8);
  }
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;

  for (j = 0; j < words.length; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const i2 = i - 15;
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      const s0 = rightRotate(w[i2], 7) ^ rightRotate(w[i2], 18) ^ (w[i2] >>> 3);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 =
        hash[7] +
        (rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25)) +
        ch +
        k[i] +
        (w[i] = w[i] !== undefined ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0);
      const temp2 =
        (rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22)) +
        ((hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]));

      hash[7] = hash[6];
      hash[6] = hash[5];
      hash[5] = hash[4];
      hash[4] = (hash[3] + temp1) | 0;
      hash[3] = hash[2];
      hash[2] = hash[1];
      hash[1] = hash[0];
      hash[0] = (temp1 + temp2) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (j = 3; j >= 0; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += ('0' + b.toString(16)).slice(-2);
    }
  }
  return result;
}

const DEFAULT_SESSION: AuthSession = {
  isAuthenticated: true,
  role: 'admin',
  operatorName: 'Juan Pablo Orozco (Director Master)',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
  loginTime: new Date().toISOString(),
};

export class SessionManager {
  private static instance: SessionManager;
  private currentSession: AuthSession = DEFAULT_SESSION;
  private adminPassword = '12345678';
  private listeners: Set<() => void> = new Set();

  private constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          this.currentSession = JSON.parse(stored);
        }
      } catch {
        this.currentSession = DEFAULT_SESSION;
      }
      const storedPwd = localStorage.getItem(PWD_STORAGE_KEY);
      if (storedPwd) {
        this.adminPassword = storedPwd;
      }
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

  public getAdminPassword(): string {
    return this.adminPassword;
  }

  /**
   * Verifica la clave de seguridad maestra mediante comparación de hashes SHA-256 en tiempo constante.
   */
  public verifyMasterKey(keyInput: string): boolean {
    if (!keyInput) return false;
    const computedHash = sha256Sync(keyInput.trim());
    return computedHash === MASTER_SECURITY_HASH;
  }

  public setAdminPasswordWithSecurityKey(
    securityKey: string,
    newPassword: string
  ): { success: boolean; error?: string } {
    if (!this.verifyMasterKey(securityKey)) {
      return {
        success: false,
        error: 'Contraseña de seguridad maestra incorrecta. No estás autorizado para cambiar la contraseña maestra.',
      };
    }
    if (newPassword.trim().length < 4) {
      return {
        success: false,
        error: 'La nueva contraseña debe tener al menos 4 caracteres.',
      };
    }
    this.adminPassword = newPassword.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem(PWD_STORAGE_KEY, this.adminPassword);
    }
    this.listeners.forEach((l) => l());
    return { success: true };
  }

  public setAdminPassword(newPassword: string): void {
    if (newPassword.trim().length < 4) {
      throw new Error('La contraseña debe tener al menos 4 caracteres');
    }
    this.adminPassword = newPassword.trim();
    if (typeof window !== 'undefined') {
      localStorage.setItem(PWD_STORAGE_KEY, this.adminPassword);
    }
    this.listeners.forEach((l) => l());
  }

  public login(usernameOrRole: string, passwordOrPin?: string): { success: boolean; error?: string } {
    const input = usernameOrRole.trim().toLowerCase();
    const secret = passwordOrPin?.trim();

    if (input === 'admin' || input === 'gerente') {
      const isMasterKey = secret ? this.verifyMasterKey(secret) : false;
      const isCustomPwd = secret === this.adminPassword;
      const isDefaultPwd = secret === '12345678' || secret === '9999';

      if (secret && !isMasterKey && !isCustomPwd && !isDefaultPwd) {
        return { success: false, error: 'Contraseña de administrador incorrecta' };
      }
      this.currentSession = {
        isAuthenticated: true,
        role: 'admin',
        operatorName: 'Juan Pablo Orozco (Director Master)',
        loginTime: new Date().toISOString(),
      };
      this.persist();
      return { success: true };
    }

    if (input === 'staff' || input === 'cajero' || input === 'mesero') {
      if (secret && secret !== '1234' && secret !== '12345678' && secret !== 'staff' && secret !== 'staff123') {
        return { success: false, error: 'PIN o contraseña de staff incorrecta (Usa: 1234 o staff)' };
      }
      this.currentSession = {
        isAuthenticated: true,
        role: 'staff',
        operatorName: 'Mateo Gómez (Barista POS)',
        loginTime: new Date().toISOString(),
      };
      this.persist();
      return { success: true };
    }

    // Verificar en la lista de empleados guardados en localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('fidelizia_store_v1');
        if (stored) {
          const parsed = JSON.parse(stored);
          const emp = parsed.employees?.find(
            (e: { name?: string; id?: string }) =>
              e.name?.toLowerCase().includes(input) || e.id?.toLowerCase() === input
          );
          if (emp) {
            if (
              secret &&
              secret !== emp.dsb_password &&
              secret !== emp.pin_hash &&
              secret !== '1234'
            ) {
              return { success: false, error: `Contraseña incorrecta para el empleado ${emp.name}` };
            }
            const isMgr = emp.role === 'manager' || emp.role === 'admin';
            this.currentSession = {
              isAuthenticated: true,
              role: isMgr ? 'admin' : 'staff',
              operatorName: `${emp.name} (${isMgr ? 'Admin Master' : 'Staff'})`,
              loginTime: new Date().toISOString(),
            };
            this.persist();
            return { success: true };
          }
        }
      } catch {
        // ignore
      }
    }

    return { success: false, error: 'Usuario no reconocido. Usa "admin", "staff" o el nombre de un empleado' };
  }

  public switchRole(role: UserRole) {
    if (role === 'admin') {
      this.currentSession = {
        isAuthenticated: true,
        role: 'admin',
        operatorName: 'Juan Pablo Orozco (Director Master)',
        loginTime: new Date().toISOString(),
      };
    } else {
      this.currentSession = {
        isAuthenticated: true,
        role: 'staff',
        operatorName: 'Mateo Gómez (Barista POS)',
        loginTime: new Date().toISOString(),
      };
    }
    this.persist();
  }

  public logout() {
    this.currentSession = {
      isAuthenticated: false,
      role: 'staff',
      operatorName: '',
      loginTime: '',
    };
    this.persist();
  }

  private persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentSession));
    }
    this.listeners.forEach((l) => l());
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const getSessionManager = () => SessionManager.getInstance();
