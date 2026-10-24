import { z } from 'zod';
import type { Database } from './database';

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

export type Merchant = Database['public']['Tables']['merchants']['Row'] & {
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
export type Employee = Database['public']['Tables']['employees']['Row'] & {
  dsb_password?: string;
};
export type Customer = Database['public']['Tables']['customers']['Row'] & {
  custom_reward?: string | null;
  discount_percentage?: number | null;
  loyalty_tier?: LoyaltyTier;
};
export type WalletPass = Database['public']['Tables']['wallet_passes']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'] & {
  discount_applied_percent?: number | null;
  original_amount?: number | null;
};
export type Redemption = Database['public']['Tables']['redemptions']['Row'];
export type ReviewFeedback = Database['public']['Tables']['reviews_feedback']['Row'];
export type Reservation = Database['public']['Tables']['reservations']['Row'];
export type FraudAlert = Database['public']['Tables']['fraud_alerts']['Row'];

// 1. ESQUEMA ONBOARDING CLIENTE (/join/[slug])
export const JoinCustomerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre excede los 100 caracteres'),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{1,14}$/, 'Formato telefónico inválido. Debe cumplir estándar internacional E.164 (Ej: +573001234567)'),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (AAAA-MM-DD)')
    .optional()
    .nullable(),
  termsAccepted: z
    .boolean()
    .refine((val) => val === true, 'Debes aceptar los términos y tratamiento de datos para continuar'),
});

export type JoinCustomerInput = z.infer<typeof JoinCustomerSchema>;

// 2. ESQUEMA ESCÁNER POS (/api/v1/pos/scan-visit)
export const ScanVisitSchema = z.object({
  merchantId: z.string().uuid('ID de comercio inválido'),
  employeePin: z.string().regex(/^\d{4}$/, 'El PIN debe contener exactamente 4 dígitos numéricos'),
  passSerialNumber: z.string().min(5, 'Serial de pase inválido'),
  ticketNumber: z
    .string()
    .trim()
    .min(2, 'El número de ticket es obligatorio')
    .max(50, 'El número de ticket excede 50 caracteres'),
  amount: z.number().nonnegative('El monto no puede ser negativo').default(0),
  scannerCoordinates: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional()
    .nullable(),
});

export type ScanVisitInput = z.infer<typeof ScanVisitSchema>;

// 3. ESQUEMA CANJE DE PREMIOS (/api/v1/pos/redeem-reward)
export const RedeemRewardSchema = z.object({
  merchantId: z.string().uuid(),
  passSerialNumber: z.string().min(5),
  managerPin: z.string().regex(/^\d{4}$/, 'El PIN del gerente debe contener 4 dígitos'),
  stampsToDeduct: z.number().int().positive().default(10),
});

export type RedeemRewardInput = z.infer<typeof RedeemRewardSchema>;

// 4. ESQUEMA REVIEW GATE (/api/v1/feedback)
export const ReviewFeedbackSchema = z.object({
  transactionId: z.string().uuid().optional().nullable(),
  merchantId: z.string().uuid(),
  customerPhone: z.string().optional().nullable(),
  rating: z.number().int().min(1).max(5),
  comments: z.string().trim().max(1000).optional().nullable(),
});

export type ReviewFeedbackInput = z.infer<typeof ReviewFeedbackSchema>;

// 5. ESQUEMA RESERVA VINCULADA (/api/v1/bookings)
export const CreateReservationSchema = z.object({
  merchantSlug: z.string().min(2),
  customerPhone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Formato telefónico E.164 requerido'),
  customerName: z.string().min(3),
  dateTime: z.string().min(10, 'Fecha y hora requerida'),
  guestsCount: z.number().int().min(1).max(50),
  notes: z.string().max(300).optional().nullable(),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// 6. ESQUEMA NOTIFICACIÓN PUSH MASIVA (/api/v1/crm/push-campaign)
export const PushCampaignSchema = z.object({
  merchantId: z.string().uuid(),
  segment: z.enum(['all', 'champion', 'loyal', 'at_risk', 'hibernating', 'birthday_month']),
  title: z.string().min(3).max(80),
  body: z.string().min(5).max(200),
  displayDurationHours: z.number().int().min(1).max(72).default(24),
});

export type PushCampaignInput = z.infer<typeof PushCampaignSchema>;
