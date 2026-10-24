import { 
  Merchant, 
  Location, 
  Employee, 
  Customer, 
  WalletPass, 
  Transaction, 
  Redemption, 
  ReviewFeedback, 
  Reservation, 
  FraudAlert,
  LoyaltyTier,
  TierConfig
} from '@/types/domain';
import { getSessionManager } from './auth-session';

export const DEFAULT_TIER_CONFIG: TierConfig = {
  bronzeMin: 0,
  silverMin: 2,
  goldMin: 5,
  championMin: 10,
};

export function calculateCustomerTier(rewardsRedeemed: number, config: TierConfig = DEFAULT_TIER_CONFIG): LoyaltyTier {
  if (rewardsRedeemed >= (config.championMin ?? 10)) return 'champion';
  if (rewardsRedeemed >= (config.goldMin ?? 5)) return 'gold';
  if (rewardsRedeemed >= (config.silverMin ?? 2)) return 'silver';
  return 'bronze';
}

export function getTierMeta(tier: LoyaltyTier) {
  switch (tier) {
    case 'champion':
      return {
        label: 'CHAMPION VIP',
        hex: '#8b5cf6',
        color: 'text-purple-400',
        bgColor: 'bg-purple-500/20',
        borderColor: 'border-purple-500/40',
        badgeBg: 'bg-gradient-to-r from-purple-900/60 to-purple-600/40',
        iconColor: '#c084fc',
        description: 'Élite Máxima · Beneficios de Autor & Descuento Permanente',
      };
    case 'gold':
      return {
        label: 'ORO',
        hex: '#d4a373',
        color: 'text-amber-400',
        bgColor: 'bg-amber-500/20',
        borderColor: 'border-amber-500/40',
        badgeBg: 'bg-gradient-to-r from-amber-900/60 to-yellow-600/40',
        iconColor: '#fbbf24',
        description: 'Miembro Preferencial · Sorpresas en Cumpleaños',
      };
    case 'silver':
      return {
        label: 'PLATA',
        hex: '#94a3b8',
        color: 'text-slate-300',
        bgColor: 'bg-slate-500/20',
        borderColor: 'border-slate-400/40',
        badgeBg: 'bg-gradient-to-r from-slate-800/80 to-slate-600/40',
        iconColor: '#cbd5e1',
        description: 'Cliente Frecuente · Doble sello en eventos',
      };
    case 'bronze':
    default:
      return {
        label: 'BRONCE',
        hex: '#b45309',
        color: 'text-amber-600',
        bgColor: 'bg-amber-700/20',
        borderColor: 'border-amber-700/40',
        badgeBg: 'bg-gradient-to-r from-amber-950/80 to-amber-800/40',
        iconColor: '#d97706',
        description: 'Comunidad Inicial · Acumulación estándar',
      };
  }
}

// Semilla inicial canónica para pruebas locales y producción
const INITIAL_MERCHANT: Merchant = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: 'user-dynamind-001',
  name: 'Café Canelo & Specialty Roasters',
  slug: 'cafe-canelo',
  logo_url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=400&q=80',
  brand_color: '#8b5cf6',
  secondary_color: '#09090b',
  google_place_id: 'ChIJdeK1bW6fP44RkC6cK2JkR1w', // Placeholder Place ID
  stamps_needed: 10,
  reward_description: 'Café de Especialidad + Croissant de Almendras',
  cooldown_hours: 3,
  scanner_geofence_meters: 250,
  tier_config: DEFAULT_TIER_CONFIG,
  loyalty_program_mode: 'multi_tier',
  card_morphology: 'orthogonal',
  card_gradient: {
    preset: 'roasted_gold',
    from: '#241407',
    via: '#140b04',
    to: '#080402',
    angle: 180,
  },
  reward_milestones: [
    { stamp_number: 3, reward: 'Galleta Artesanal de Avena', icon: 'cookie' },
    { stamp_number: 6, reward: 'Bebida Fría de la Casa', icon: 'coffee' },
    { stamp_number: 10, reward: 'Café de Especialidad + Croissant de Almendras', icon: 'gift' },
  ],
  preconfigured_rewards: [
    'Café Americano de Especialidad (Cortesía)',
    'Galleta Artesanal de Avena & Canela',
    'Doble Sello de Bonificación en Próxima Visita',
  ],
  card_pattern: 'guilloche',
  show_emv_chip: true,
  show_hologram: true,
  opening_hours: {
    monday: { open: '07:30', close: '21:00', closed: false },
    tuesday: { open: '07:30', close: '21:00', closed: false },
    wednesday: { open: '07:30', close: '21:00', closed: false },
    thursday: { open: '07:30', close: '22:00', closed: false },
    friday: { open: '07:30', close: '23:00', closed: false },
    saturday: { open: '08:00', close: '23:00', closed: false },
    sunday: { open: '08:30', close: '20:00', closed: false },
  },
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const INITIAL_LOCATION: Location = {
  id: 'loc-001',
  merchant_id: INITIAL_MERCHANT.id,
  name: 'Sede Zona G - Calle 85',
  address: 'Calle 85 # 11-53, Chapinero, Bogotá',
  latitude: 4.6682,
  longitude: -74.0538,
  radius_meters: 100,
  relevant_text: '¡Estás cerca de Café Canelo! Pasa por tu espresso y suma tu sello de hoy',
  is_active: true,
  created_at: new Date().toISOString(),
};

const INITIAL_EMPLOYEES: Employee[] = [
  {
    id: 'emp-001',
    merchant_id: INITIAL_MERCHANT.id,
    location_id: 'loc-001',
    name: 'Mateo Cajero',
    pin_hash: '1234', // PIN en claro para validación directa en local/demo
    dsb_password: 'staff',
    role: 'cashier',
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'emp-002',
    merchant_id: INITIAL_MERCHANT.id,
    location_id: 'loc-001',
    name: 'Laura Gerente',
    pin_hash: '9999',
    dsb_password: 'admin',
    role: 'manager',
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-001',
    merchant_id: INITIAL_MERCHANT.id,
    phone: '+573001234567',
    full_name: 'Carlos Mendoza',
    birthdate: '1995-10-24',
    terms_accepted_at: new Date().toISOString(),
    rfm_segment: 'champion',
    loyalty_tier: 'champion',
    custom_reward: 'Bolsa de Café Geisha 250g de Origen',
    discount_percentage: 15,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust-002',
    merchant_id: INITIAL_MERCHANT.id,
    phone: '+573109876543',
    full_name: 'Valentina Duque',
    birthdate: '1998-05-12',
    terms_accepted_at: new Date().toISOString(),
    rfm_segment: 'loyal',
    loyalty_tier: 'silver',
    custom_reward: 'Croissant Almendras en Cumpleaños',
    discount_percentage: 5,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust-003',
    merchant_id: INITIAL_MERCHANT.id,
    phone: '+573155554433',
    full_name: 'Andrés Restrepo',
    birthdate: '1990-11-03',
    terms_accepted_at: new Date().toISOString(),
    rfm_segment: 'at_risk',
    loyalty_tier: 'bronze',
    custom_reward: null,
    discount_percentage: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_PASSES: WalletPass[] = [
  {
    id: 'pass-001',
    customer_id: 'cust-001',
    merchant_id: INITIAL_MERCHANT.id,
    pass_type: 'google',
    pass_serial_number: 'PASS-CANELO-001',
    push_token: 'apns-demo-token-001',
    authentication_token: 'auth-token-canelo-001',
    current_stamps: 8,
    total_visits: 24,
    total_rewards_redeemed: 11, // Champion (>= 10)
    last_visit_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pass-002',
    customer_id: 'cust-002',
    merchant_id: INITIAL_MERCHANT.id,
    pass_type: 'google',
    pass_serial_number: 'PASS-CANELO-002',
    push_token: 'google-demo-token-002',
    authentication_token: 'auth-token-canelo-002',
    current_stamps: 9,
    total_visits: 9,
    total_rewards_redeemed: 3, // Plata (>= 2)
    last_visit_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'pass-003',
    customer_id: 'cust-003',
    merchant_id: INITIAL_MERCHANT.id,
    pass_type: 'google',
    pass_serial_number: 'PASS-CANELO-003',
    push_token: 'apns-demo-token-003',
    authentication_token: 'auth-token-canelo-003',
    current_stamps: 3,
    total_visits: 4,
    total_rewards_redeemed: 0, // Bronce (< 2)
    last_visit_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 25).toISOString(),
    status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx-001',
    merchant_id: INITIAL_MERCHANT.id,
    location_id: 'loc-001',
    employee_id: 'emp-001',
    customer_id: 'cust-001',
    pass_id: 'pass-001',
    ticket_number: 'FAC-1001',
    amount: 32000,
    stamps_awarded: 1,
    balance_after: 8,
    client_latitude: 4.6682,
    client_longitude: -74.0538,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'tx-002',
    merchant_id: INITIAL_MERCHANT.id,
    location_id: 'loc-001',
    employee_id: 'emp-001',
    customer_id: 'cust-002',
    pass_id: 'pass-002',
    ticket_number: 'FAC-1002',
    amount: 24500,
    stamps_awarded: 1,
    balance_after: 9,
    client_latitude: 4.6682,
    client_longitude: -74.0538,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
];

const INITIAL_FRAUD_ALERTS: FraudAlert[] = [
  {
    id: 'fa-001',
    merchant_id: INITIAL_MERCHANT.id,
    employee_id: 'emp-001',
    customer_id: 'cust-003',
    alert_type: 'cooldown_violation',
    severity: 'medium',
    details: {
      ticket_number: 'FAC-9988',
      reason: 'Intento de escanear 2 veces en menos de 3 horas',
    },
    is_resolved: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  },
];

const INITIAL_RESERVATIONS: Reservation[] = [
  {
    id: 'res-001',
    merchant_id: INITIAL_MERCHANT.id,
    customer_id: 'cust-001',
    location_id: 'loc-001',
    date_time: new Date(Date.now() + 1000 * 60 * 60 * 28).toISOString(),
    guests_count: 2,
    status: 'confirmed',
    notes: 'Mesa cerca a la ventana para aniversario',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const INITIAL_REVIEWS: ReviewFeedback[] = [
  {
    id: 'rev-001',
    merchant_id: INITIAL_MERCHANT.id,
    customer_id: 'cust-001',
    transaction_id: 'tx-001',
    rating: 5,
    comments: '¡El mejor flat white de Bogotá! La atención de Mateo fue increíble.',
    is_public_redirect: true,
    manager_contacted: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
];

// Clase Singleton de Almacén con Reactividad Cross-Tab
export class FideliziaStore {
  private static instance: FideliziaStore;
  private channel: BroadcastChannel | null = null;
  private listeners: Set<() => void> = new Set();

  public merchant: Merchant = INITIAL_MERCHANT;
  public locations: Location[] = [INITIAL_LOCATION];
  public employees: Employee[] = INITIAL_EMPLOYEES;
  public customers: Customer[] = INITIAL_CUSTOMERS;
  public passes: WalletPass[] = INITIAL_PASSES;
  public transactions: Transaction[] = INITIAL_TRANSACTIONS;
  public redemptions: Redemption[] = [];
  public reviews: ReviewFeedback[] = INITIAL_REVIEWS;
  public reservations: Reservation[] = INITIAL_RESERVATIONS;
  public fraudAlerts: FraudAlert[] = INITIAL_FRAUD_ALERTS;
  private inFlightTickets: Set<string> = new Set();

  private constructor() {
    this.initStorage();
    if (typeof window !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('fidelizia_sync_bus');
        this.channel.onmessage = (event) => {
          if (event.data?.type === 'STORE_MUTATED') {
            this.loadFromStorage();
            this.notify();
          }
        };
      } catch {
        // Fallback si BroadcastChannel no está disponible
      }
    }
  }

  public static getInstance(): FideliziaStore {
    if (!FideliziaStore.instance) {
      FideliziaStore.instance = new FideliziaStore();
    }
    return FideliziaStore.instance;
  }

  private initStorage() {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('fidelizia_store_v1');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.merchant = { ...INITIAL_MERCHANT, ...(parsed.merchant || {}) };
        this.locations = parsed.locations || this.locations;
        this.employees = parsed.employees || this.employees;
        this.customers = parsed.customers || this.customers;
        this.passes = parsed.passes || this.passes;
        this.transactions = parsed.transactions || this.transactions;
        this.redemptions = parsed.redemptions || this.redemptions;
        this.reviews = parsed.reviews || this.reviews;
        this.reservations = parsed.reservations || this.reservations;
        this.fraudAlerts = parsed.fraudAlerts || this.fraudAlerts;
      } catch (err) {
        console.error('Error parsing stored fidelizia state:', err);
      }
    } else {
      this.persist();
    }
  }

  private loadFromStorage() {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('fidelizia_store_v1');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.merchant = { ...INITIAL_MERCHANT, ...(parsed.merchant || {}) };
        this.locations = parsed.locations || this.locations;
        this.employees = parsed.employees || this.employees;
        this.customers = parsed.customers || this.customers;
        this.passes = parsed.passes || this.passes;
        this.transactions = parsed.transactions || this.transactions;
        this.redemptions = parsed.redemptions || this.redemptions;
        this.reviews = parsed.reviews || this.reviews;
        this.reservations = parsed.reservations || this.reservations;
        this.fraudAlerts = parsed.fraudAlerts || this.fraudAlerts;
      } catch {
        // ignore
      }
    }
  }

  private persist() {
    if (typeof window === 'undefined') return;
    const state = {
      merchant: this.merchant,
      locations: this.locations,
      employees: this.employees,
      customers: this.customers,
      passes: this.passes,
      transactions: this.transactions,
      redemptions: this.redemptions,
      reviews: this.reviews,
      reservations: this.reservations,
      fraudAlerts: this.fraudAlerts,
    };
    try {
      localStorage.setItem('fidelizia_store_v1', JSON.stringify(state));
      this.channel?.postMessage({ type: 'STORE_MUTATED' });
    } catch (err) {
      console.warn('LocalStorage persist error:', err);
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  // 1. ONBOARDING CLIENTE EXPRESS (10 SEG)
  public registerCustomer(input: {
    fullName: string;
    phone: string;
    birthdate?: string | null;
    passType: 'apple' | 'google';
  }): { customer: Customer; pass: WalletPass } {
    const existing = this.customers.find((c) => c.phone === input.phone);
    let customer: Customer;

    if (existing) {
      customer = existing;
    } else {
      customer = {
        id: `cust-${Date.now()}`,
        merchant_id: this.merchant.id,
        phone: input.phone,
        full_name: input.fullName,
        birthdate: input.birthdate || null,
        terms_accepted_at: new Date().toISOString(),
        rfm_segment: 'new',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.customers.unshift(customer);
    }

    let pass = this.passes.find((p) => p.customer_id === customer.id && p.pass_type === input.passType);
    if (!pass) {
      const serial = `PASS-CANELO-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      pass = {
        id: `pass-${Date.now()}`,
        customer_id: customer.id,
        merchant_id: this.merchant.id,
        pass_type: input.passType,
        pass_serial_number: serial,
        push_token: `push-token-${serial}`,
        authentication_token: `auth-${Math.random().toString(36).substring(2, 10)}`,
        current_stamps: 1, // Primer sello de bienvenida
        total_visits: 1,
        total_rewards_redeemed: 0,
        last_visit_at: new Date().toISOString(),
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.passes.unshift(pass);
    }

    this.persist();
    this.notify();
    return { customer, pass };
  }

  // 2. ESCÁNER POS CON 5 CAPAS ANTIFRAUDE OBLIGATORIAS
  public processScanVisit(params: {
    merchantId: string;
    employeePin: string;
    passSerialNumber: string;
    ticketNumber: string;
    amount: number;
    scannerLat?: number | null;
    scannerLng?: number | null;
  }) {
    // 0. CANDADO ATÓMICO DE CONCURRENCIA & ANTI-BURST (Idempotencia en vuelo)
    const normalizedTicket = params.ticketNumber.trim().toLowerCase();
    const flightKey = `${params.merchantId}:${normalizedTicket}`;
    if (this.inFlightTickets.has(flightKey)) {
      throw new Error(`TRANSACCIÓN EN CURSO: El ticket "${params.ticketNumber}" ya se está procesando activamente.`);
    }
    this.inFlightTickets.add(flightKey);

    try {
      // A. Validar Empleado por PIN
      const employee = this.employees.find((e) => e.pin_hash === params.employeePin && e.is_active);
      if (!employee) {
        throw new Error('PIN de empleado inválido o inactivo');
      }

      // B. Validar Pase (Con auto-provisioning de rescate para tarjetas recién generadas)
      let pass = this.passes.find((p) => p.pass_serial_number === params.passSerialNumber && p.merchant_id === params.merchantId);
      if (!pass) {
        // Rescate amigable: Si la tarjeta se generó en otro dispositivo, la registramos en este nodo
        const autoCreated = this.registerCustomer({
          fullName: 'Miembro Café Canelo',
          phone: '+573000000000',
          passType: 'google',
        });
        autoCreated.pass.pass_serial_number = params.passSerialNumber;
        pass = autoCreated.pass;
      }

      if (pass.status !== 'active') {
        throw new Error('Esta tarjeta se encuentra suspendida');
      }

      let customer = this.customers.find((c) => c.id === pass.customer_id);
      if (!customer) {
        const autoCreated = this.registerCustomer({
          fullName: 'Miembro Café Canelo',
          phone: '+573000000000',
          passType: 'google',
        });
        customer = autoCreated.customer;
        pass.customer_id = customer.id;
      }

      // C. CAPA ANTIFRAUDE #1: Deduplicación Estricta de Ticket
      const ticketExists = this.transactions.some(
        (tx) => tx.merchant_id === params.merchantId && tx.ticket_number.toLowerCase() === normalizedTicket
      );
    if (ticketExists) {
      this.fraudAlerts.unshift({
        id: `fa-${Date.now()}`,
        merchant_id: params.merchantId,
        employee_id: employee.id,
        customer_id: customer.id,
        alert_type: 'ticket_reused',
        severity: 'high',
        details: {
          ticket_number: params.ticketNumber,
          employee_name: employee.name,
          attempt_time: new Date().toISOString(),
        },
        is_resolved: false,
        created_at: new Date().toISOString(),
      });
      this.persist();
      this.notify();
      throw new Error(`FRAUDE BLOQUEADO: El ticket "${params.ticketNumber}" ya fue utilizado previamente.`);
    }

    // D. CAPA ANTIFRAUDE #2: Cooldown Temporal (3 horas)
    const customerTransactions = this.transactions
      .filter((t) => t.customer_id === customer.id && t.merchant_id === params.merchantId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const lastTx = customerTransactions[0];
    if (lastTx) {
      const hoursSinceLast = (Date.now() - new Date(lastTx.created_at).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < this.merchant.cooldown_hours) {
        const remainingMinutes = Math.ceil((this.merchant.cooldown_hours - hoursSinceLast) * 60);
        this.fraudAlerts.unshift({
          id: `fa-${Date.now()}`,
          merchant_id: params.merchantId,
          employee_id: employee.id,
          customer_id: customer.id,
          alert_type: 'cooldown_violation',
          severity: 'medium',
          details: {
            ticket_number: params.ticketNumber,
            employee_name: employee.name,
            hoursSinceLast,
            requiredHours: this.merchant.cooldown_hours,
          },
          is_resolved: false,
          created_at: new Date().toISOString(),
        });
        this.persist();
        this.notify();
        throw new Error(
          `COOLDOWN ACTIVO: El cliente ya sumó un sello recientemente. Debe esperar ${remainingMinutes} minutos más.`
        );
      }
    }

    // E. CAPA ANTIFRAUDE #3: Geocerca del Escáner (Si se aportan coordenadas)
    if (params.scannerLat && params.scannerLng && this.locations[0]) {
      const loc = this.locations[0];
      const distMeters = this.calculateDistance(params.scannerLat, params.scannerLng, loc.latitude, loc.longitude);
      if (distMeters > this.merchant.scanner_geofence_meters) {
        this.fraudAlerts.unshift({
          id: `fa-${Date.now()}`,
          merchant_id: params.merchantId,
          employee_id: employee.id,
          customer_id: customer.id,
          alert_type: 'geofence_breach',
          severity: 'high',
          details: {
            distMeters: Math.round(distMeters),
            maxAllowed: this.merchant.scanner_geofence_meters,
            scannerCoords: { lat: params.scannerLat, lng: params.scannerLng },
          },
          is_resolved: false,
          created_at: new Date().toISOString(),
        });
        this.persist();
        this.notify();
        throw new Error(`GEOCERCA VIOLADA: El escáner se encuentra a ${Math.round(distMeters)}m del local autorizado.`);
      }
    }

    // F. Mutación Atómica de Balances
    const newStamps = pass.current_stamps + 1;
    const newVisits = pass.total_visits + 1;
    const isRewardReady = newStamps >= this.merchant.stamps_needed;

    pass.current_stamps = newStamps;
    pass.total_visits = newVisits;
    pass.last_visit_at = new Date().toISOString();
    pass.updated_at = new Date().toISOString();

    // Actualizar todos los pases del cliente
    this.passes
      .filter((p) => p.customer_id === customer.id)
      .forEach((p) => {
        p.current_stamps = newStamps;
        p.total_visits = newVisits;
        p.last_visit_at = new Date().toISOString();
      });

    // Actualizar segmento RFM y Tier
    if (newVisits >= 8) customer.rfm_segment = 'champion';
    else if (newVisits >= 4) customer.rfm_segment = 'loyal';

    const currentTier = calculateCustomerTier(pass.total_rewards_redeemed, this.merchant.tier_config);
    customer.loyalty_tier = currentTier;

    // Cálculo de Descuento por Beneficio Exclusivo del Cliente
    const discountPercent = customer.discount_percentage || 0;
    const originalAmount = params.amount || 0;
    const finalAmount = discountPercent > 0 
      ? Math.round(originalAmount * (1 - discountPercent / 100)) 
      : originalAmount;

    const txId = `tx-${Date.now()}`;
    const newTx: Transaction = {
      id: txId,
      merchant_id: params.merchantId,
      location_id: this.locations[0]?.id || null,
      employee_id: employee.id,
      customer_id: customer.id,
      pass_id: pass.id,
      ticket_number: params.ticketNumber.trim().toUpperCase(),
      amount: finalAmount,
      original_amount: originalAmount,
      discount_applied_percent: discountPercent > 0 ? discountPercent : null,
      stamps_awarded: 1,
      balance_after: newStamps,
      client_latitude: params.scannerLat || null,
      client_longitude: params.scannerLng || null,
      created_at: new Date().toISOString(),
    };

    this.transactions.unshift(newTx);
    this.persist();
    this.notify();

    return {
      success: true,
      transactionId: txId,
      customerName: customer.full_name,
      customerTier: currentTier,
      customReward: customer.custom_reward || null,
      discountPercent,
      originalAmount,
      finalAmount,
      stampsCurrent: newStamps,
      stampsNeeded: this.merchant.stamps_needed,
      rewardReady: isRewardReady,
      rewardDescription: this.merchant.reward_description,
      ticketNumber: newTx.ticket_number,
    };
    } finally {
      this.inFlightTickets.delete(flightKey);
    }
  }

  // 3. CANJE DE PREMIOS (EXIGE PIN DE GERENTE)
  public redeemReward(params: {
    merchantId: string;
    passSerialNumber: string;
    managerPin: string;
    stampsToDeduct: number;
  }) {
    const manager = this.employees.find(
      (e) => e.pin_hash === params.managerPin && (e.role === 'manager' || e.role === 'admin') && e.is_active
    );
    if (!manager) {
      throw new Error('PIN de Gerente inválido para autorizar el canje de recompensa');
    }

    const pass = this.passes.find((p) => p.pass_serial_number === params.passSerialNumber);
    if (!pass) throw new Error('Tarjeta no encontrada');

    if (pass.current_stamps < params.stampsToDeduct) {
      throw new Error(`Sellos insuficientes. Se requieren ${params.stampsToDeduct} sellos para este canje.`);
    }

    const customer = this.customers.find((c) => c.id === pass.customer_id);
    const newStamps = pass.current_stamps - params.stampsToDeduct;

    this.passes
      .filter((p) => p.customer_id === pass.customer_id)
      .forEach((p) => {
        p.current_stamps = newStamps;
        p.total_rewards_redeemed += 1;
      });

    this.redemptions.unshift({
      id: `red-${Date.now()}`,
      merchant_id: params.merchantId,
      customer_id: pass.customer_id,
      employee_id: manager.id,
      pass_id: pass.id,
      stamps_deducted: params.stampsToDeduct,
      reward_name: this.merchant.reward_description,
      authorized_by_manager_id: manager.id,
      redeemed_at: new Date().toISOString(),
    });

    this.persist();
    this.notify();

    return {
      success: true,
      customerName: customer?.full_name || 'Cliente',
      rewardName: this.merchant.reward_description,
      stampsRemaining: newStamps,
    };
  }

  // 4. REVIEW GATE (4-5 GOOGLE MAPS / 1-3 BUZÓN PRIVADO)
  public submitFeedback(params: {
    transactionId?: string | null;
    merchantId: string;
    rating: number;
    comments?: string | null;
  }) {
    const isPublicRedirect = params.rating >= 4;
    const newFeedback: ReviewFeedback = {
      id: `rev-${Date.now()}`,
      merchant_id: params.merchantId,
      customer_id: this.customers[0]?.id || 'cust-anon',
      transaction_id: params.transactionId || null,
      rating: params.rating,
      comments: params.comments || null,
      is_public_redirect: isPublicRedirect,
      manager_contacted: false,
      created_at: new Date().toISOString(),
    };

    this.reviews.unshift(newFeedback);
    this.persist();
    this.notify();

    return {
      success: true,
      isPublicRedirect,
      googlePlaceUrl: this.merchant.google_place_id 
        ? `https://search.google.com/local/writereview?placeid=${this.merchant.google_place_id}` 
        : 'https://maps.google.com',
    };
  }

  // 5. MOTOR DE RESERVAS SINCRONIZADO
  public createReservation(params: {
    merchantSlug: string;
    customerPhone: string;
    customerName: string;
    dateTime: string;
    guestsCount: number;
    notes?: string | null;
  }) {
    let customer = this.customers.find((c) => c.phone === params.customerPhone);
    if (!customer) {
      customer = {
        id: `cust-${Date.now()}`,
        merchant_id: this.merchant.id,
        phone: params.customerPhone,
        full_name: params.customerName,
        birthdate: null,
        terms_accepted_at: new Date().toISOString(),
        rfm_segment: 'new',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.customers.unshift(customer);
    }

    const res: Reservation = {
      id: `res-${Date.now()}`,
      merchant_id: this.merchant.id,
      customer_id: customer.id,
      location_id: this.locations[0]?.id || null,
      date_time: params.dateTime,
      guests_count: params.guestsCount,
      status: 'confirmed',
      notes: params.notes || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.reservations.unshift(res);
    this.persist();
    this.notify();

    return { success: true, reservation: res, customerName: customer.full_name };
  }

  // 6. DISPARO PUSH MASIVO CRM
  public sendPushCampaign(params: {
    segment: string;
    title: string;
    body: string;
  }) {
    let targetCustomers = this.customers;
    if (params.segment !== 'all') {
      targetCustomers = this.customers.filter((c) => c.rfm_segment === params.segment);
    }

    const targetPasses = this.passes.filter((p) =>
      targetCustomers.some((c) => c.id === p.customer_id)
    );

    this.persist();
    this.notify();

    return {
      success: true,
      recipientsCount: targetPasses.length,
      customersImpacted: targetCustomers.length,
      sentAt: new Date().toISOString(),
    };
  }

  // 7. GESTIÓN DE BENEFICIOS PERSONALIZADOS POR CLIENTE (ADMIN EXCLUSIVO)
  public updateCustomerBenefits(
    customerId: string,
    customReward: string | null,
    discountPercentage: number | null
  ) {
    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) throw new Error('Cliente no encontrado');

    customer.custom_reward = customReward && customReward.trim().length > 0 ? customReward.trim() : null;
    customer.discount_percentage = 
      typeof discountPercentage === 'number' && discountPercentage > 0 
        ? Math.min(Math.max(discountPercentage, 0), 100) 
        : null;
    customer.updated_at = new Date().toISOString();

    this.persist();
    this.notify();
    return customer;
  }

  // 8. CONFIGURACIÓN DINÁMICA DE UMBRALES DE RANGOS DE LEALTAD
  public updateTierConfig(config: TierConfig) {
    this.merchant.tier_config = {
      bronzeMin: Math.max(0, config.bronzeMin ?? 0),
      silverMin: Math.max(1, config.silverMin ?? 2),
      goldMin: Math.max(2, config.goldMin ?? 5),
      championMin: Math.max(3, config.championMin ?? 10),
    };
    this.merchant.updated_at = new Date().toISOString();

    // Recalcular tiers de todos los clientes
    this.customers.forEach((c) => {
      const pass = this.passes.find((p) => p.customer_id === c.id);
      if (pass) {
        c.loyalty_tier = calculateCustomerTier(pass.total_rewards_redeemed, this.merchant.tier_config);
      }
    });

    this.persist();
    this.notify();
    return this.merchant.tier_config;
  }

  // 8.1. CAMBIO MANUAL DE RANGO DE CLIENTE (PROTEGIDO POR AdminMaster2026@)
  public updateCustomerTierManually(
    customerId: string,
    newTier: LoyaltyTier,
    masterSecurityKey: string
  ): { success: boolean; error?: string } {
    if (!getSessionManager().verifyMasterKey(masterSecurityKey)) {
      return {
        success: false,
        error: 'Contraseña de seguridad maestra incorrecta. No estás autorizado para alterar el rango del miembro.',
      };
    }

    const customer = this.customers.find((c) => c.id === customerId);
    if (!customer) {
      return { success: false, error: 'Cliente no encontrado en el sistema.' };
    }

    customer.loyalty_tier = newTier;
    customer.updated_at = new Date().toISOString();
    this.persist();
    this.notify();
    return { success: true };
  }

  // 9. AJUSTES GENERALES DEL COMERCIO Y PERSONALIZADOR DE TARJETA
  public updateMerchantSettings(updates: Partial<Merchant>) {
    this.merchant = {
      ...this.merchant,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.persist();
    this.notify();
    return this.merchant;
  }

  // 9.1. GESTIÓN DE LAS 3 OPCIONES PRECONFIGURADAS DE RECOMPENSAS
  public updatePreconfiguredRewards(rewards: [string, string, string]) {
    this.merchant.preconfigured_rewards = [
      rewards[0]?.trim() || 'Café Americano de Especialidad (Cortesía)',
      rewards[1]?.trim() || 'Galleta Artesanal de Avena & Canela',
      rewards[2]?.trim() || 'Doble Sello de Bonificación en Próxima Visita',
    ];
    this.merchant.updated_at = new Date().toISOString();
    this.persist();
    this.notify();
    return this.merchant.preconfigured_rewards;
  }

  // 10. GESTIÓN DE PERSONAL & PINES TÁCTICOS
  public updateEmployee(employeeId: string, updates: Partial<Employee>) {
    const emp = this.employees.find((e) => e.id === employeeId);
    if (!emp) throw new Error('Empleado no encontrado');

    if (updates.pin_hash && !/^\d{4}$/.test(updates.pin_hash)) {
      throw new Error('El PIN debe contener exactamente 4 dígitos numéricos');
    }

    Object.assign(emp, updates);
    this.persist();
    this.notify();
    return emp;
  }

  public addEmployee(newEmp: Omit<Employee, 'id' | 'created_at'>) {
    if (!/^\d{4}$/.test(newEmp.pin_hash)) {
      throw new Error('El PIN debe contener exactamente 4 dígitos numéricos');
    }
    if (newEmp.dsb_password && newEmp.dsb_password.trim().length < 4) {
      throw new Error('La contraseña de acceso al DSB debe tener al menos 4 caracteres');
    }
    const emp: Employee = {
      ...newEmp,
      dsb_password: newEmp.dsb_password?.trim() || 'staff123',
      id: `emp-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    this.employees.push(emp);
    this.persist();
    this.notify();
    return emp;
  }

  public deleteEmployee(employeeId: string) {
    if (this.employees.length <= 1) {
      throw new Error('Debe existir al menos un empleado o cajero registrado en el sistema');
    }
    this.employees = this.employees.filter((e) => e.id !== employeeId);
    this.persist();
    this.notify();
  }

  // 11. AUDITORÍA ANTIFRAUDE: RESOLVER ALERTA
  public resolveFraudAlert(alertId: string) {
    const alert = this.fraudAlerts.find((a) => a.id === alertId);
    if (alert) {
      alert.is_resolved = true;
      this.persist();
      this.notify();
    }
  }

  // 12. INTEGRACIÓN NATIVA APPLE & GOOGLE WALLET
  public async registerAppleDevice(serial: string, deviceLibraryId: string, pushToken: string): Promise<void> {
    const pass = this.passes.find((p) => p.pass_serial_number === serial);
    if (pass) {
      pass.push_token = pushToken;
      this.persist();
      this.notify();
    }
  }

  public async unregisterAppleDevice(serial: string, deviceLibraryId: string): Promise<void> {
    const pass = this.passes.find((p) => p.pass_serial_number === serial);
    if (pass) {
      pass.push_token = null;
      this.persist();
      this.notify();
    }
  }

  public async getSerialsByDevice(deviceLibraryId: string): Promise<string[]> {
    return this.passes.map((p) => p.pass_serial_number);
  }

  public async getPassWithCustomerBySerial(serial: string): Promise<{ customer: Customer; pass: WalletPass } | null> {
    const pass = this.passes.find((p) => p.pass_serial_number === serial);
    if (!pass) return null;
    const customer = this.customers.find((c) => c.id === pass.customer_id);
    if (!customer) return null;
    return { customer, pass };
  }

  public async updatePassStamps(passId: string, updatedStamps: number): Promise<WalletPass> {
    const pass = this.passes.find((p) => p.id === passId);
    if (!pass) throw new Error('Pase no encontrado');
    pass.current_stamps = updatedStamps;
    pass.total_visits = (pass.total_visits || 0) + 1;
    pass.last_visit_at = new Date().toISOString();
    this.persist();
    this.notify();
    return pass;
  }

  // Utilidad Haversine para cálculo de distancia en metros
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export const getStore = () => FideliziaStore.getInstance();
export const fideliziaStore = FideliziaStore.getInstance();
