import { z } from 'zod';
import type { Database, EmployeeRole } from './database';

export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'champion';

export type LoyaltyProgramMode = 'multi_tier' | 'single_card';

export type CardMorphology = 'rounded' | 'orthogonal' | 'chamfered' | 'cutout';

export interface CardGradientConfig {
  preset: string;
  from: string;
  via?: string;
  to: string;
  angle?: number;
}

export interface RewardMilestone {
  id?: string;
  stamp_number: number;
  reward: string;
  icon?: 'coffee' | 'gift' | 'cookie' | 'sparkles' | 'percent' | 'star' | 'cup';
}

export interface TierConfig {
  bronzeMin: number;
  silverMin: number;
  goldMin: number;
  championMin: number;
}

export type CardPattern = 'guilloche' | 'grid_matrix' | 'brushed_titanium' | 'luxury_filigree' | 'carbon_fiber';

export type Merchant = Omit<
  Database['public']['Tables']['merchants']['Row'],
  | 'tier_config'
  | 'preconfigured_rewards'
  | 'card_pattern'
  | 'show_emv_chip'
  | 'show_hologram'
  | 'loyalty_program_mode'
  | 'card_morphology'
  | 'card_gradient'
  | 'reward_milestones'
> & {
  tier_config?: TierConfig;
  preconfigured_rewards?: [string, string, string];
  card_pattern?: CardPattern;
  show_emv_chip?: boolean;
  show_hologram?: boolean;
  loyalty_program_mode?: LoyaltyProgramMode;
  card_morphology?: CardMorphology;
  card_gradient?: CardGradientConfig;
  reward_milestones?: RewardMilestone[];
};
export type Location = Database['public']['Tables']['locations']['Row'];
export type Employee = Omit<
  Database['public']['Tables']['employees']['Row'],
  'username' | 'email' | 'password_hash' | 'dsb_password_hash'
> & {
  username?: string | null;
  email?: string | null;
  password_hash?: string | null;
  dsb_password_hash?: string | null;
  dsb_password?: string;
};
export type Customer = Omit<
  Database['public']['Tables']['customers']['Row'],
  'custom_reward' | 'discount_percentage' | 'loyalty_tier' | 'total_rewards_redeemed'
> & {
  custom_reward?: string | null;
  discount_percentage?: number | null;
  loyalty_tier?: LoyaltyTier;
  total_rewards_redeemed?: number;
  referred_by_promoter_id?: string | null;
  referred_at?: string | null;
};
export type WalletPass = Omit<
  Database['public']['Tables']['wallet_passes']['Row'],
  'last_push_title' | 'last_push_message' | 'last_push_at' | 'push_count_24h' | 'push_window_reset_at'
> & {
  last_push_title?: string | null;
  last_push_message?: string | null;
  last_push_at?: string | null;
  push_count_24h?: number;
  push_window_reset_at?: string | null;
};
export type AppleDeviceRegistration = Database['public']['Tables']['apple_device_registrations']['Row'];
export type Transaction = Omit<
  Database['public']['Tables']['transactions']['Row'],
  'discount_applied_percent' | 'original_amount'
> & {
  discount_applied_percent?: number | null;
  original_amount?: number | null;
};
export type Redemption = Database['public']['Tables']['redemptions']['Row'];
export type ReviewFeedback = Database['public']['Tables']['reviews_feedback']['Row'];
export type Reservation = Database['public']['Tables']['reservations']['Row'];
export type FraudAlert = Database['public']['Tables']['fraud_alerts']['Row'];

export interface AuthSession {
  userId: string;
  merchantId: string;
  merchantSlug: string;
  role: EmployeeRole;
  name: string;
  iat?: number;
  exp?: number;
}

function isValidIsoCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// 1. ESQUEMA ONBOARDING CLIENTE (/api/v1/customers/register & /join/[slug])
export const CustomerRegisterSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre excede los 100 caracteres'),
  phone: z
    .string()
    .trim()
    .regex(
      /^\+[1-9]\d{1,14}$/,
      'Formato telefónico inválido. Debe cumplir estándar internacional E.164 (Ej: +573001234567)'
    ),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD)')
    .refine(isValidIsoCalendarDate, 'Fecha de nacimiento inválida')
    .optional()
    .nullable(),
  passType: z.enum(['apple', 'google']).optional().default('google'),
  merchantSlug: z.string().trim().min(2).max(80).optional(),
  serialNumber: z.string().trim().min(5).max(100).optional(),
  referralCode: z.string().trim().max(32).optional().nullable(),
  termsAccepted: z
    .boolean()
    .refine((val) => val === true, 'Debes aceptar los términos y tratamiento de datos para continuar'),
});

export type CustomerRegisterInput = z.infer<typeof CustomerRegisterSchema>;
export const JoinCustomerSchema = CustomerRegisterSchema;
export type JoinCustomerInput = CustomerRegisterInput;

// 2. ESQUEMA CONFIGURACIÓN DE COMERCIO (/api/v1/merchant/settings)
const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/, 'Color hexadecimal inválido');

export const TierConfigSchema = z
  .object({
    bronzeMin: z.number().int().min(0).max(100),
    silverMin: z.number().int().min(1).max(200),
    goldMin: z.number().int().min(2).max(500),
    championMin: z.number().int().min(3).max(1000),
  })
  .refine(
    (cfg) => cfg.bronzeMin <= cfg.silverMin && cfg.silverMin <= cfg.goldMin && cfg.goldMin <= cfg.championMin,
    'Los umbrales de nivel deben estar en orden ascendente (Bronce <= Plata <= Oro <= Champion)'
  );

export const CardGradientSchema = z.object({
  preset: z.string().trim().min(1).max(60),
  from: HexColorSchema,
  via: HexColorSchema.optional(),
  to: HexColorSchema,
  angle: z.number().min(0).max(360).optional(),
});

export const RewardMilestoneSchema = z.object({
  id: z.string().trim().max(64).optional(),
  stamp_number: z.number().int().min(1).max(30),
  reward: z.string().trim().min(2).max(150),
  icon: z.enum(['coffee', 'gift', 'cookie', 'sparkles', 'percent', 'star', 'cup']).optional(),
});

export const MerchantSettingsSchema = z.object({
  merchantSlug: z.string().trim().min(2).max(80).optional(),
  name: z.string().trim().min(2).max(120).optional(),
  logo_url: z
    .string()
    .trim()
    .url('URL de logo inválida')
    .max(500)
    .refine(isHttpOrHttpsUrl, 'La URL del logo debe usar protocolo http:// o https://')
    .optional()
    .nullable(),
  brand_color: HexColorSchema.optional(),
  secondary_color: HexColorSchema.optional(),
  google_place_id: z.string().trim().max(255).optional().nullable(),
  stamps_needed: z.number().int().min(1).max(30).optional(),
  reward_description: z.string().trim().min(3).max(300).optional(),
  cooldown_hours: z.number().int().min(1).max(48).optional(),
  scanner_geofence_meters: z.number().int().min(20).max(5000).optional(),
  card_pattern: z
    .enum(['guilloche', 'grid_matrix', 'brushed_titanium', 'luxury_filigree', 'carbon_fiber'])
    .optional(),
  show_emv_chip: z.boolean().optional(),
  show_hologram: z.boolean().optional(),
  loyalty_program_mode: z.enum(['multi_tier', 'single_card']).optional(),
  card_morphology: z.enum(['rounded', 'orthogonal', 'chamfered', 'cutout']).optional(),
  card_gradient: CardGradientSchema.optional(),
  reward_milestones: z.array(RewardMilestoneSchema).max(10).optional(),
  preconfigured_rewards: z
    .tuple([
      z.string().trim().min(2).max(160),
      z.string().trim().min(2).max(160),
      z.string().trim().min(2).max(160),
    ])
    .optional(),
  tier_config: TierConfigSchema.optional(),
});

export type MerchantSettingsInput = z.infer<typeof MerchantSettingsSchema>;

// 3. ESQUEMA ESCÁNER POS (/api/v1/pos/scan-visit)
export const ScanVisitSchema = z.object({
  merchantId: z.string().uuid('ID de comercio inválido'),
  employeePin: z.string().regex(/^\d{4}$/, 'El PIN debe contener exactamente 4 dígitos numéricos'),
  passSerialNumber: z.string().trim().min(5, 'Serial de pase inválido').max(100),
  ticketNumber: z
    .string()
    .trim()
    .min(2, 'El número de ticket es obligatorio')
    .max(50, 'El número de ticket excede 50 caracteres'),
  amount: z.number().nonnegative('El monto no puede ser negativo').default(0),
  locationId: z.string().uuid('ID de sede inválido').optional().nullable(),
  stampsToAward: z.number().int().min(1).max(10).default(1),
  scannerCoordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional()
    .nullable(),
});

export type ScanVisitInput = z.infer<typeof ScanVisitSchema>;

// 4. ESQUEMA CANJE DE PREMIOS (/api/v1/pos/redeem-reward)
export const RedeemRewardSchema = z.object({
  merchantId: z.string().uuid('ID de comercio inválido'),
  passSerialNumber: z.string().trim().min(5, 'Serial de pase inválido').max(100),
  managerPin: z.string().regex(/^\d{4}$/, 'El PIN del gerente debe contener 4 dígitos'),
  stampsToDeduct: z.number().int().min(1).max(30).optional(),
  rewardName: z.string().trim().min(2).max(200).optional(),
});

export function createRedeemRewardSchema(merchantStampsNeeded: number) {
  return RedeemRewardSchema.extend({
    stampsToDeduct: z
      .number()
      .int()
      .min(1)
      .max(merchantStampsNeeded)
      .default(merchantStampsNeeded),
  });
}

export type RedeemRewardInput = z.infer<typeof RedeemRewardSchema>;

// 5. ESQUEMA REVIEW GATE (/api/v1/feedback)
export const FeedbackSchema = z.object({
  transactionId: z.string().uuid().optional().nullable(),
  merchantId: z.string().uuid(),
  customerPhone: z.string().trim().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comments: z.string().trim().max(1000).optional().nullable(),
});

export type FeedbackInput = z.infer<typeof FeedbackSchema>;
export const ReviewFeedbackSchema = FeedbackSchema;
export type ReviewFeedbackInput = FeedbackInput;

// 6. ESQUEMA RESERVA VINCULADA (/api/v1/bookings)
export const BookingSchema = z.object({
  merchantSlug: z.string().trim().min(2).max(80),
  customerPhone: z.string().trim().regex(/^\+[1-9]\d{1,14}$/, 'Formato telefónico E.164 requerido'),
  customerName: z.string().trim().min(3, 'Nombre mínimo de 3 caracteres').max(120),
  dateTime: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha y hora inválida'),
  guestsCount: z.number().int().min(1).max(50),
  notes: z.string().trim().max(300).optional().nullable(),
  locationId: z.string().uuid().optional().nullable(),
});

export type BookingInput = z.infer<typeof BookingSchema>;
export const CreateReservationSchema = BookingSchema;
export type CreateReservationInput = BookingInput;

// 7. ESQUEMA NOTIFICACIÓN PUSH (/api/v1/notifications/push & /api/v1/crm/push-campaign)
export const PushNotificationSchema = z.object({
  merchantId: z.string().uuid().optional(),
  segment: z
    .enum(['all', 'champion', 'loyal', 'at_risk', 'hibernating', 'new', 'birthday_month', 'individual'])
    .default('all'),
  title: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres').max(80),
  body: z.string().trim().min(5, 'El mensaje debe tener al menos 5 caracteres').max(200),
  customerId: z.string().uuid().optional(),
  serialNumber: z.string().trim().min(5).max(100).optional(),
  targetCustomerName: z.string().trim().max(120).optional(),
  displayDurationHours: z.number().int().min(1).max(72).default(24),
});

export type PushNotificationInput = z.infer<typeof PushNotificationSchema>;
export const PushCampaignSchema = PushNotificationSchema;
export type PushCampaignInput = PushNotificationInput;

// 8. ESQUEMA AUTENTICACIÓN SERVIDOR (/api/v1/auth/login)
export const LoginSchema = z.object({
  merchantSlug: z.string().trim().min(2).max(80).default('cafe-canelo'),
  identifier: z.string().trim().min(1, 'Usuario o identificador requerido').max(120),
  secret: z
    .string()
    .refine((s) => s.trim().length > 0, 'Contraseña o PIN requerido')
    .pipe(z.string().max(128)),
});

export type LoginInput = z.infer<typeof LoginSchema>;
