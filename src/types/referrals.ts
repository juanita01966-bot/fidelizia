import { z } from 'zod';

export const REFERRAL_COOKIE_NAME = 'fidz_ref';
export const REFERRAL_CODE_REGEX = /^[A-Z0-9-]{3,24}$/;
export const REFERRAL_MIGRATION_FILE =
  'supabase/migrations/20261121000001_qr_referrals_schema.sql';
export const REFERRAL_MIGRATION_REQUIRED_CODE = 'MIGRATION_REQUIRED';
export const REFERRAL_MIGRATION_REQUIRED_HINT =
  'Aplica la migración supabase/migrations/20261121000001_qr_referrals_schema.sql en el SQL Editor de Supabase para habilitar el módulo de Embajadores QR.';

export type ReferralMetricType =
  | 'unique_visits'
  | 'new_customers'
  | 'pos_verified_visits';

export type ReferralWinMode = 'goal' | 'top_n';

export type PromoterPrizeStatus =
  | 'pending'
  | 'qualified'
  | 'awarded'
  | 'disqualified';

export type PromoterComputedStatus =
  | 'awarded'
  | 'disqualified'
  | 'flagged'
  | 'qualified'
  | 'almost'
  | 'in_progress';

export interface ReferralCampaign {
  id: string;
  merchant_id: string;
  name: string;
  prize_description: string;
  metric_type: ReferralMetricType;
  win_mode: ReferralWinMode;
  goal_target: number;
  top_n: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReferralPromoter {
  id: string;
  merchant_id: string;
  campaign_id: string;
  name: string;
  phone: string | null;
  alias: string | null;
  code: string;
  is_active: boolean;
  prize_status: PromoterPrizeStatus;
  prize_awarded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralQrVisit {
  id: string;
  merchant_id: string;
  campaign_id: string;
  promoter_id: string;
  visitor_hash: string;
  ip_prefix: string | null;
  user_agent: string | null;
  is_unique_daily: boolean;
  converted_customer_id: string | null;
  created_at: string;
}

export interface ActivePromoterLookup {
  promoter: ReferralPromoter;
  campaign: Pick<
    ReferralCampaign,
    'id' | 'name' | 'is_active' | 'starts_at' | 'ends_at'
  >;
  merchant: {
    id: string;
    slug: string;
    name: string;
    is_active: boolean;
  };
}

export interface PromoterMetricsRow {
  promoter: ReferralPromoter;
  rank: number;
  totalScans: number;
  uniqueVisits: number;
  newCustomers: number;
  posVerifiedVisits: number;
  conversionRate: number;
  score: number;
  target: number;
  progressPct: number;
  isWinner: boolean;
  isSuspicious: boolean;
  suspiciousReasons: string[];
  computedStatus: PromoterComputedStatus;
  lastScanAt: string | null;
  lastCustomerAt: string | null;
}

export interface ReferralCampaignSummary {
  totalPromoters: number;
  activePromoters: number;
  totalScans: number;
  totalUniqueVisits: number;
  totalNewCustomers: number;
  totalPosVerifiedVisits: number;
  overallConversionRate: number;
  qualifiedCount: number;
  almostCount: number;
  awardedCount: number;
  flaggedCount: number;
  disqualifiedCount: number;
  topPromoter: {
    id: string;
    name: string;
    code: string;
    score: number;
    conversionRate: number;
  } | null;
}

export interface ReferralOverviewMerchant {
  id: string;
  name: string;
  slug: string;
  brand_color?: string;
  logo_url?: string | null;
}

export interface ReferralOverviewResponse {
  campaign: ReferralCampaign;
  merchant?: ReferralOverviewMerchant;
  summary: ReferralCampaignSummary;
  promoters: PromoterMetricsRow[];
}

export interface ReferredCustomerDetail {
  id: string;
  full_name: string;
  phone: string;
  referred_at: string | null;
  created_at: string;
  loyalty_tier: string;
  transactionsCount: number;
  totalVisits: number;
  isPosVerified: boolean;
  lastVisitAt: string | null;
}

export interface PromoterDetailResponse {
  campaign: ReferralCampaign;
  metrics: PromoterMetricsRow;
  referredCustomers: ReferredCustomerDetail[];
  recentVisits: ReferralQrVisit[];
}

export interface ReferralMigrationRequiredErrorPayload {
  success: false;
  error: typeof REFERRAL_MIGRATION_REQUIRED_CODE;
  message: string;
  migrationFile: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Normalizes a raw referral code to uppercase alphanumeric + hyphens (max 24 chars).
 * Strips accents/diacritics, converts spaces/underscores to hyphens, and removes invalid characters.
 */
export function normalizeReferralCode(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

export function isValidReferralCode(code: string): boolean {
  return REFERRAL_CODE_REGEX.test(code);
}

function randomCodeToken(length = 4): string {
  let token = '';
  for (let i = 0; i < length; i += 1) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    token += CODE_ALPHABET[idx];
  }
  return token;
}

/**
 * Generates a clean, readable referral code such as `MARIA01` or `PROMO-4F8A`,
 * avoiding any collision with `existingCodes`.
 */
export function generateReferralCode(
  name?: string | null,
  existingCodes?: ReadonlySet<string>
): string {
  const taken = existingCodes ?? new Set<string>();
  const normalizedName = name
    ? name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
    : '';

  const firstWord = normalizedName
    .split(/[^A-Z0-9]+/)
    .find((part) => part.length >= 2);

  const prefix = (firstWord ? firstWord.slice(0, 8) : 'PROMO').replace(
    /[^A-Z0-9]/g,
    ''
  );
  const safePrefix = prefix.length >= 2 ? prefix : 'PROMO';

  if (firstWord) {
    for (let i = 1; i <= 99; i += 1) {
      const candidate = `${safePrefix}${String(i).padStart(2, '0')}`.slice(0, 24);
      if (isValidReferralCode(candidate) && !taken.has(candidate)) {
        return candidate;
      }
    }
  }

  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = `${safePrefix.slice(0, 12)}-${randomCodeToken(4)}`;
    if (isValidReferralCode(candidate) && !taken.has(candidate)) {
      return candidate;
    }
  }

  return `PROMO-${randomCodeToken(6)}`;
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

export const ReferralMetricTypeSchema = z.enum([
  'unique_visits',
  'new_customers',
  'pos_verified_visits',
]);

export const ReferralWinModeSchema = z.enum(['goal', 'top_n']);

export const PromoterPrizeStatusSchema = z.enum([
  'pending',
  'qualified',
  'awarded',
  'disqualified',
]);

export const CreatePromoterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del embajador debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede superar 80 caracteres'),
  phone: z
    .string()
    .trim()
    .max(30, 'El teléfono excede 30 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  alias: z
    .string()
    .trim()
    .max(40, 'El alias excede 40 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  code: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => {
      if (!v) return undefined;
      return normalizeReferralCode(v);
    })
    .refine(
      (v) => v === undefined || REFERRAL_CODE_REGEX.test(v),
      'El código debe tener entre 3 y 24 caracteres alfanuméricos o guiones (A-Z, 0-9, -)'
    ),
  notes: z
    .string()
    .trim()
    .max(500, 'Las notas no pueden superar 500 caracteres')
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null)),
  is_active: z.boolean().optional().default(true),
});

export type CreatePromoterInput = z.infer<typeof CreatePromoterSchema>;

export const BatchCreatePromotersSchema = z.object({
  promoters: z
    .array(CreatePromoterSchema)
    .min(1, 'Debes incluir al menos un embajador')
    .max(50, 'Puedes agregar máximo 50 embajadores por lote'),
});

export type BatchCreatePromotersInput = z.infer<
  typeof BatchCreatePromotersSchema
>;

export const UpdatePromoterSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre del embajador debe tener al menos 2 caracteres')
      .max(80, 'El nombre no puede superar 80 caracteres')
      .optional(),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .nullable()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    alias: z
      .string()
      .trim()
      .max(40)
      .optional()
      .nullable()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
    code: z
      .string()
      .trim()
      .transform((v) => normalizeReferralCode(v))
      .refine(
        (v) => REFERRAL_CODE_REGEX.test(v),
        'El código debe tener entre 3 y 24 caracteres alfanuméricos o guiones (A-Z, 0-9, -)'
      )
      .optional(),
    is_active: z.boolean().optional(),
    prize_status: PromoterPrizeStatusSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(500)
      .optional()
      .nullable()
      .transform((v) => (v === undefined ? undefined : v && v.length > 0 ? v : null)),
  })
  .refine(
    (data) => Object.values(data).some((val) => val !== undefined),
    'Debes proporcionar al menos un campo para actualizar'
  );

export type UpdatePromoterInput = z.infer<typeof UpdatePromoterSchema>;

export const UpdateCampaignSchema = z
  .object({
    campaignId: z.string().uuid('ID de campaña inválido').optional(),
    name: z
      .string()
      .trim()
      .min(2, 'El nombre de la campaña debe tener al menos 2 caracteres')
      .max(120, 'El nombre de la campaña excede 120 caracteres')
      .optional(),
    prize_description: z
      .string()
      .trim()
      .min(2, 'Describe el premio de la campaña')
      .max(300, 'La descripción del premio excede 300 caracteres')
      .optional(),
    metric_type: ReferralMetricTypeSchema.optional(),
    win_mode: ReferralWinModeSchema.optional(),
    goal_target: z
      .number()
      .int('La meta debe ser un número entero')
      .min(1, 'La meta mínima es 1')
      .max(100000, 'La meta excede el límite permitido')
      .optional(),
    top_n: z
      .number()
      .int('Top N debe ser un número entero')
      .min(1, 'Top N mínimo es 1')
      .max(100, 'Top N máximo es 100')
      .optional(),
    starts_at: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de inicio inválida')
      .optional(),
    ends_at: z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha de cierre inválida')
      .nullable()
      .optional(),
    is_active: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.starts_at && data.ends_at) {
        return Date.parse(data.ends_at) >= Date.parse(data.starts_at);
      }
      return true;
    },
    'La fecha de cierre debe ser posterior o igual a la fecha de inicio'
  );

export type UpdateCampaignInput = z.infer<typeof UpdateCampaignSchema>;
