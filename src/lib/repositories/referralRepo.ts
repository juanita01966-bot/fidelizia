import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseAdminClient } from '@/lib/supabase/server';
import {
  REFERRAL_MIGRATION_FILE,
  REFERRAL_MIGRATION_REQUIRED_CODE,
  REFERRAL_MIGRATION_REQUIRED_HINT,
  generateReferralCode,
  isValidReferralCode,
  normalizeReferralCode,
  type ActivePromoterLookup,
  type CreatePromoterInput,
  type PromoterComputedStatus,
  type PromoterDetailResponse,
  type PromoterMetricsRow,
  type ReferralCampaign,
  type ReferralCampaignSummary,
  type ReferralOverviewMerchant,
  type ReferralOverviewResponse,
  type ReferralPromoter,
  type ReferralQrVisit,
  type ReferredCustomerDetail,
  type UpdateCampaignInput,
  type UpdatePromoterInput,
} from '@/types/referrals';
import { customerRepo } from './customerRepo';

// ============================================================================
// TYPED REFERRAL SCHEMA PROJECTION (avoids modifying generated database.ts)
// Uses `type` aliases (not `interface`) so PostgREST GenericTable constraint
// (`Record<string, unknown>`) is satisfied without `any`.
// ============================================================================

type ReferralCampaignRow = {
  id: string;
  merchant_id: string;
  name: string;
  prize_description: string;
  metric_type: ReferralCampaign['metric_type'];
  win_mode: ReferralCampaign['win_mode'];
  goal_target: number;
  top_n: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type ReferralPromoterRow = {
  id: string;
  merchant_id: string;
  campaign_id: string;
  name: string;
  phone: string | null;
  alias: string | null;
  code: string;
  is_active: boolean;
  prize_status: ReferralPromoter['prize_status'];
  prize_awarded_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type ReferralQrVisitRow = {
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
};

type ReferredCustomerRow = {
  id: string;
  merchant_id: string;
  full_name: string;
  phone: string;
  loyalty_tier: string;
  created_at: string;
  referred_by_promoter_id: string | null;
  referred_at: string | null;
};

type ReferralDatabaseSchema = {
  public: {
    Tables: {
      referral_campaigns: {
        Row: ReferralCampaignRow;
        Insert: Partial<ReferralCampaignRow> & { merchant_id: string };
        Update: Partial<ReferralCampaignRow>;
        Relationships: [];
      };
      referral_promoters: {
        Row: ReferralPromoterRow;
        Insert: Partial<ReferralPromoterRow> & {
          merchant_id: string;
          campaign_id: string;
          name: string;
          code: string;
        };
        Update: Partial<ReferralPromoterRow>;
        Relationships: [];
      };
      referral_qr_visits: {
        Row: ReferralQrVisitRow;
        Insert: Partial<ReferralQrVisitRow> & {
          merchant_id: string;
          campaign_id: string;
          promoter_id: string;
          visitor_hash: string;
        };
        Update: Partial<ReferralQrVisitRow>;
        Relationships: [];
      };
      customers: {
        Row: ReferredCustomerRow;
        Insert: Partial<ReferredCustomerRow>;
        Update: Partial<ReferredCustomerRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

function asReferralDb(
  client: SupabaseAdminClient
): SupabaseClient<ReferralDatabaseSchema> {
  return client as unknown as SupabaseClient<ReferralDatabaseSchema>;
}

// ============================================================================
// DOMAIN ERRORS
// ============================================================================

export class ReferralMigrationRequiredError extends Error {
  readonly code = REFERRAL_MIGRATION_REQUIRED_CODE;
  readonly migrationFile = REFERRAL_MIGRATION_FILE;
  readonly hint = REFERRAL_MIGRATION_REQUIRED_HINT;

  constructor(detail?: string) {
    super(
      detail
        ? `${REFERRAL_MIGRATION_REQUIRED_HINT} (${detail})`
        : REFERRAL_MIGRATION_REQUIRED_HINT
    );
    this.name = 'ReferralMigrationRequiredError';
  }
}

export class ReferralConflictError extends Error {
  readonly code = 'CODE_ALREADY_EXISTS';

  constructor(message: string) {
    super(message);
    this.name = 'ReferralConflictError';
  }
}

export class ReferralNotFoundError extends Error {
  readonly code = 'NOT_FOUND';

  constructor(message: string) {
    super(message);
    this.name = 'ReferralNotFoundError';
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

export function isMigrationMissingError(err: unknown): boolean {
  if (err instanceof ReferralMigrationRequiredError) return true;
  if (!err || typeof err !== 'object') return false;

  const pgErr = err as PostgrestLikeError;
  const code = pgErr.code ?? '';
  const msg = pgErr.message ?? '';

  if (code === '42P01' || code === 'PGRST205') {
    return true;
  }
  if (
    code === '42703' &&
    /referred_by_promoter_id|referred_at|referral_/i.test(msg)
  ) {
    return true;
  }
  return /relation "public\.referral_|Could not find the table 'public\.referral_|referred_by_promoter_id/i.test(
    msg
  );
}

function isUniqueViolationError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const pgErr = err as PostgrestLikeError;
  return (
    pgErr.code === '23505' ||
    /duplicate key|unique constraint/i.test(pgErr.message ?? '')
  );
}

function throwFormattedReferralError(context: string, err: unknown): never {
  if (isMigrationMissingError(err)) {
    const pgErr = err as PostgrestLikeError;
    throw new ReferralMigrationRequiredError(pgErr?.code || pgErr?.message);
  }
  if (err instanceof Error) {
    throw new Error(`[${context}] ${err.message}`);
  }
  const pgErr = err as PostgrestLikeError | null;
  throw new Error(`[${context}] ${pgErr?.message ?? 'Unexpected database error'}`);
}

// ============================================================================
// PRIVACY, HASHING & PHONE MATCHING HELPERS
// ============================================================================

export function extractIpPrefix(rawIp: string | null | undefined): string | null {
  if (!rawIp) return null;
  const firstHop = rawIp.split(',')[0]?.trim();
  if (!firstHop) return null;

  const normalized = firstHop.replace(/^::ffff:/i, '');

  // IPv4 -> /24 prefix (anonymizes last octet while preserving network burst grouping)
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(normalized);
  if (ipv4Match) {
    return `${ipv4Match[1]}.${ipv4Match[2]}.${ipv4Match[3]}.0/24`;
  }

  // IPv6 -> /64 prefix (first 4 hextets)
  if (normalized.includes(':')) {
    const parts = normalized.split(':').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts.slice(0, 4).join(':')}::/64`;
    }
  }

  return normalized.slice(0, 45);
}

export function computeVisitorHash(
  rawIp: string | null | undefined,
  userAgent: string | null | undefined,
  dateUtc: Date = new Date()
): string {
  const cleanIp = (rawIp?.split(',')[0]?.trim() || 'unknown-ip').replace(
    /^::ffff:/i,
    ''
  );
  const cleanUa = (userAgent?.trim() || 'unknown-ua').slice(0, 256);
  const dayKey = dateUtc.toISOString().slice(0, 10);
  const salt =
    process.env.REFERRAL_HASH_SALT ||
    process.env.JWT_SECRET ||
    'fidelizia-qr-referral-salt-v1';

  return crypto
    .createHash('sha256')
    .update(`${salt}|${cleanIp}|${cleanUa}|${dayKey}`)
    .digest('hex');
}

export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

export function arePhonesEquivalent(
  phoneA: string | null | undefined,
  phoneB: string | null | undefined
): boolean {
  const digitsA = normalizePhoneDigits(phoneA);
  const digitsB = normalizePhoneDigits(phoneB);
  if (digitsA.length < 7 || digitsB.length < 7) return false;
  if (digitsA === digitsB) return true;
  if (digitsA.length >= 10 && digitsB.length >= 10) {
    return digitsA.slice(-10) === digitsB.slice(-10);
  }
  return false;
}

// ============================================================================
// PURE SCORING, RANKING & ANTI-FRAUD ENGINE (UNIT-TESTED)
// ============================================================================

export interface RankingVisitInput {
  promoter_id: string;
  ip_prefix: string | null;
  is_unique_daily: boolean;
  created_at: string;
}

export interface RankingCustomerInput {
  id: string;
  referred_by_promoter_id: string | null;
  created_at: string;
  referred_at?: string | null;
}

export interface ComputePromoterRankingsInput {
  campaign: ReferralCampaign;
  promoters: ReferralPromoter[];
  visits: RankingVisitInput[];
  customers: RankingCustomerInput[];
  customerTransactionCounts: Record<string, number>;
  customerPassVisits?: Record<string, number>;
}

const IP_BURST_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const IP_BURST_THRESHOLD = 10;
const DUPLICATE_VELOCITY_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const DUPLICATE_MIN_SCANS = 10;
const DUPLICATE_RATIO_THRESHOLD = 0.5;
const DUPLICATE_VELOCITY_COUNT_THRESHOLD = 6;

export function detectPromoterSuspiciousActivity(
  promoterVisits: RankingVisitInput[]
): { isSuspicious: boolean; suspiciousReasons: string[] } {
  const reasons: string[] = [];

  if (promoterVisits.length === 0) {
    return { isSuspicious: false, suspiciousReasons: reasons };
  }

  // Rule 1: >= 10 scans from the same ip_prefix within any 10-minute window
  const timestampsByPrefix = new Map<string, number[]>();
  for (const visit of promoterVisits) {
    const prefix = visit.ip_prefix?.trim();
    if (!prefix) continue;
    const ts = Date.parse(visit.created_at);
    if (Number.isNaN(ts)) continue;
    const list = timestampsByPrefix.get(prefix);
    if (list) {
      list.push(ts);
    } else {
      timestampsByPrefix.set(prefix, [ts]);
    }
  }

  let maxIpBurst = 0;
  for (const timestamps of timestampsByPrefix.values()) {
    if (timestamps.length < IP_BURST_THRESHOLD) continue;
    timestamps.sort((a, b) => a - b);
    let left = 0;
    for (let right = 0; right < timestamps.length; right += 1) {
      while (timestamps[right] - timestamps[left] > IP_BURST_WINDOW_MS) {
        left += 1;
      }
      const windowCount = right - left + 1;
      if (windowCount > maxIpBurst) {
        maxIpBurst = windowCount;
      }
    }
  }

  if (maxIpBurst >= IP_BURST_THRESHOLD) {
    reasons.push(
      `Ráfaga detectada: ${maxIpBurst} escaneos desde la misma red en menos de 10 min`
    );
  }

  // Rule 2: >= 50% duplicate scans with unusually high velocity
  const totalScans = promoterVisits.length;
  const duplicateTimestamps: number[] = [];
  for (const visit of promoterVisits) {
    if (!visit.is_unique_daily) {
      const ts = Date.parse(visit.created_at);
      if (!Number.isNaN(ts)) {
        duplicateTimestamps.push(ts);
      }
    }
  }

  const duplicateCount = duplicateTimestamps.length;
  const duplicateRatio = totalScans > 0 ? duplicateCount / totalScans : 0;

  if (totalScans >= DUPLICATE_MIN_SCANS && duplicateRatio >= DUPLICATE_RATIO_THRESHOLD) {
    duplicateTimestamps.sort((a, b) => a - b);
    let maxDupIn30m = 0;
    let left = 0;
    for (let right = 0; right < duplicateTimestamps.length; right += 1) {
      while (
        duplicateTimestamps[right] - duplicateTimestamps[left] >
        DUPLICATE_VELOCITY_WINDOW_MS
      ) {
        left += 1;
      }
      const count = right - left + 1;
      if (count > maxDupIn30m) {
        maxDupIn30m = count;
      }
    }

    if (maxDupIn30m >= DUPLICATE_VELOCITY_COUNT_THRESHOLD) {
      reasons.push(
        `Alto índice de escaneos repetidos (${Math.round(duplicateRatio * 100)}%, ${maxDupIn30m} duplicados en 30 min)`
      );
    }
  }

  return {
    isSuspicious: reasons.length > 0,
    suspiciousReasons: reasons,
  };
}

function getScoreForMetric(
  metricType: ReferralCampaign['metric_type'],
  counts: {
    uniqueVisits: number;
    newCustomers: number;
    posVerifiedVisits: number;
  }
): number {
  switch (metricType) {
    case 'unique_visits':
      return counts.uniqueVisits;
    case 'pos_verified_visits':
      return counts.posVerifiedVisits;
    case 'new_customers':
    default:
      return counts.newCustomers;
  }
}

export function computePromoterRankings(
  input: ComputePromoterRankingsInput
): PromoterMetricsRow[] {
  const {
    campaign,
    promoters,
    visits,
    customers,
    customerTransactionCounts,
    customerPassVisits = {},
  } = input;

  const visitsByPromoter = new Map<string, RankingVisitInput[]>();
  for (const visit of visits) {
    const list = visitsByPromoter.get(visit.promoter_id);
    if (list) {
      list.push(visit);
    } else {
      visitsByPromoter.set(visit.promoter_id, [visit]);
    }
  }

  const customersByPromoter = new Map<string, RankingCustomerInput[]>();
  for (const customer of customers) {
    if (!customer.referred_by_promoter_id) continue;
    const list = customersByPromoter.get(customer.referred_by_promoter_id);
    if (list) {
      list.push(customer);
    } else {
      customersByPromoter.set(customer.referred_by_promoter_id, [customer]);
    }
  }

  interface IntermediateRow {
    promoter: ReferralPromoter;
    totalScans: number;
    uniqueVisits: number;
    newCustomers: number;
    posVerifiedVisits: number;
    conversionRate: number;
    score: number;
    isSuspicious: boolean;
    suspiciousReasons: string[];
    lastScanAt: string | null;
    lastCustomerAt: string | null;
  }

  const intermediate: IntermediateRow[] = promoters.map((promoter) => {
    const pVisits = visitsByPromoter.get(promoter.id) ?? [];
    const pCustomers = customersByPromoter.get(promoter.id) ?? [];

    const totalScans = pVisits.length;
    let uniqueVisits = 0;
    let lastScanAt: string | null = null;
    let lastScanMs = -Infinity;

    for (const v of pVisits) {
      if (v.is_unique_daily) uniqueVisits += 1;
      const ms = Date.parse(v.created_at);
      if (!Number.isNaN(ms) && ms > lastScanMs) {
        lastScanMs = ms;
        lastScanAt = v.created_at;
      }
    }

    const newCustomers = pCustomers.length;
    let posVerifiedVisits = 0;
    let lastCustomerAt: string | null = null;
    let lastCustomerMs = -Infinity;

    for (const c of pCustomers) {
      const txCount = customerTransactionCounts[c.id] ?? 0;
      const passVisits = customerPassVisits[c.id] ?? 0;
      if (txCount >= 1 || passVisits > 1) {
        posVerifiedVisits += 1;
      }
      const refTime = c.referred_at || c.created_at;
      const ms = Date.parse(refTime);
      if (!Number.isNaN(ms) && ms > lastCustomerMs) {
        lastCustomerMs = ms;
        lastCustomerAt = refTime;
      }
    }

    const conversionRate =
      uniqueVisits > 0
        ? Math.min(100, Math.round((newCustomers / uniqueVisits) * 1000) / 10)
        : 0;

    const score = getScoreForMetric(campaign.metric_type, {
      uniqueVisits,
      newCustomers,
      posVerifiedVisits,
    });

    const fraud = detectPromoterSuspiciousActivity(pVisits);

    return {
      promoter,
      totalScans,
      uniqueVisits,
      newCustomers,
      posVerifiedVisits,
      conversionRate,
      score,
      isSuspicious: fraud.isSuspicious,
      suspiciousReasons: fraud.suspiciousReasons,
      lastScanAt,
      lastCustomerAt,
    };
  });

  // Sort: eligible (non-disqualified) first, then score desc, tie-breakers:
  // posVerifiedVisits desc -> newCustomers desc -> uniqueVisits desc -> created_at asc -> name asc
  intermediate.sort((a, b) => {
    const aDisq = a.promoter.prize_status === 'disqualified' ? 1 : 0;
    const bDisq = b.promoter.prize_status === 'disqualified' ? 1 : 0;
    if (aDisq !== bDisq) return aDisq - bDisq;

    if (b.score !== a.score) return b.score - a.score;
    if (b.posVerifiedVisits !== a.posVerifiedVisits) {
      return b.posVerifiedVisits - a.posVerifiedVisits;
    }
    if (b.newCustomers !== a.newCustomers) {
      return b.newCustomers - a.newCustomers;
    }
    if (b.uniqueVisits !== a.uniqueVisits) {
      return b.uniqueVisits - a.uniqueVisits;
    }

    const aCreated = Date.parse(a.promoter.created_at) || 0;
    const bCreated = Date.parse(b.promoter.created_at) || 0;
    if (aCreated !== bCreated) return aCreated - bCreated;

    return a.promoter.name.localeCompare(b.promoter.name);
  });

  // Determine target cutoff for progress bar & top_n
  const eligibleRows = intermediate.filter(
    (r) => r.promoter.prize_status !== 'disqualified'
  );
  const topNIndex = Math.max(0, campaign.top_n - 1);
  const topNCutoffScore =
    eligibleRows.length > topNIndex && eligibleRows[topNIndex].score > 0
      ? eligibleRows[topNIndex].score
      : Math.max(1, eligibleRows[0]?.score ?? campaign.goal_target);

  let eligibleRankCounter = 0;

  return intermediate.map((row, idx): PromoterMetricsRow => {
    const rank = idx + 1;
    const isDisqualified = row.promoter.prize_status === 'disqualified';
    if (!isDisqualified) {
      eligibleRankCounter += 1;
    }

    const target =
      campaign.win_mode === 'goal'
        ? Math.max(1, campaign.goal_target)
        : Math.max(1, topNCutoffScore);

    const progressPct = Math.min(100, Math.round((row.score / target) * 100));

    const isWinner = isDisqualified
      ? false
      : campaign.win_mode === 'goal'
        ? row.score >= campaign.goal_target
        : eligibleRankCounter <= campaign.top_n && row.score > 0;

    let computedStatus: PromoterComputedStatus;
    if (row.promoter.prize_status === 'awarded') {
      computedStatus = 'awarded';
    } else if (isDisqualified) {
      computedStatus = 'disqualified';
    } else if (row.isSuspicious) {
      computedStatus = 'flagged';
    } else if (isWinner || row.promoter.prize_status === 'qualified') {
      computedStatus = 'qualified';
    } else if (progressPct >= 70 && row.score > 0) {
      computedStatus = 'almost';
    } else {
      computedStatus = 'in_progress';
    }

    return {
      promoter: row.promoter,
      rank,
      totalScans: row.totalScans,
      uniqueVisits: row.uniqueVisits,
      newCustomers: row.newCustomers,
      posVerifiedVisits: row.posVerifiedVisits,
      conversionRate: row.conversionRate,
      score: row.score,
      target,
      progressPct,
      isWinner,
      isSuspicious: row.isSuspicious,
      suspiciousReasons: row.suspiciousReasons,
      computedStatus,
      lastScanAt: row.lastScanAt,
      lastCustomerAt: row.lastCustomerAt,
    };
  });
}

export function computeCampaignSummary(
  rows: PromoterMetricsRow[]
): ReferralCampaignSummary {
  let activePromoters = 0;
  let totalScans = 0;
  let totalUniqueVisits = 0;
  let totalNewCustomers = 0;
  let totalPosVerifiedVisits = 0;
  let qualifiedCount = 0;
  let almostCount = 0;
  let awardedCount = 0;
  let flaggedCount = 0;
  let disqualifiedCount = 0;

  for (const row of rows) {
    if (row.promoter.is_active) activePromoters += 1;
    totalScans += row.totalScans;
    totalUniqueVisits += row.uniqueVisits;
    totalNewCustomers += row.newCustomers;
    totalPosVerifiedVisits += row.posVerifiedVisits;

    if (row.computedStatus === 'awarded') {
      awardedCount += 1;
      qualifiedCount += 1;
    } else if (row.computedStatus === 'qualified') {
      qualifiedCount += 1;
    } else if (row.computedStatus === 'almost') {
      almostCount += 1;
    } else if (row.computedStatus === 'flagged') {
      flaggedCount += 1;
    } else if (row.computedStatus === 'disqualified') {
      disqualifiedCount += 1;
    }
  }

  const overallConversionRate =
    totalUniqueVisits > 0
      ? Math.min(
          100,
          Math.round((totalNewCustomers / totalUniqueVisits) * 1000) / 10
        )
      : 0;

  const leader = rows.find(
    (r) => r.computedStatus !== 'disqualified' && r.score > 0
  );

  return {
    totalPromoters: rows.length,
    activePromoters,
    totalScans,
    totalUniqueVisits,
    totalNewCustomers,
    totalPosVerifiedVisits,
    overallConversionRate,
    qualifiedCount,
    almostCount,
    awardedCount,
    flaggedCount,
    disqualifiedCount,
    topPromoter: leader
      ? {
          id: leader.promoter.id,
          name: leader.promoter.name,
          code: leader.promoter.code,
          score: leader.score,
          conversionRate: leader.conversionRate,
        }
      : null,
  };
}

// ============================================================================
// REPOSITORY INPUT/OUTPUT TYPES
// ============================================================================

export interface RecordQrVisitParams {
  merchantId: string;
  campaignId: string;
  promoterId: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface BatchCreatePromotersResult {
  created: ReferralPromoter[];
  skipped: Array<{ name: string; code?: string; reason: string }>;
}

export interface AttributeNewCustomerParams {
  merchantId: string;
  customerId: string;
  customerPhone: string;
  referralCode: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AttributeNewCustomerResult {
  attributed: boolean;
  reason?:
    | 'invalid_code'
    | 'promoter_not_found'
    | 'self_referral_blocked'
    | 'already_attributed'
    | 'migration_required';
  promoterId?: string;
  promoterCode?: string;
  promoterName?: string;
}

// ============================================================================
// REPOSITORY IMPLEMENTATION
// ============================================================================

export const referralRepo = {
  async getOrCreateActiveCampaign(
    client: SupabaseAdminClient,
    merchantId: string
  ): Promise<ReferralCampaign> {
    const db = asReferralDb(client);

    const { data: activeCampaign, error: fetchErr } = await db
      .from('referral_campaigns')
      .select('*')
      .eq('merchant_id', merchantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchErr) {
      throwFormattedReferralError('referralRepo.getOrCreateActiveCampaign:fetch', fetchErr);
    }

    if (activeCampaign) {
      return activeCampaign;
    }

    // Preserve paused campaigns instead of auto-creating a duplicate empty campaign
    const { data: latestCampaign, error: fallbackErr } = await db
      .from('referral_campaigns')
      .select('*')
      .eq('merchant_id', merchantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fallbackErr) {
      throwFormattedReferralError(
        'referralRepo.getOrCreateActiveCampaign:fallback',
        fallbackErr
      );
    }

    if (latestCampaign) {
      return latestCampaign;
    }

    const { data: created, error: createErr } = await db
      .from('referral_campaigns')
      .insert({
        merchant_id: merchantId,
        name: 'Campaña Embajadores QR',
        prize_description: 'Premio especial al alcanzar la meta de referidos',
        metric_type: 'new_customers',
        win_mode: 'goal',
        goal_target: 10,
        top_n: 3,
        is_active: true,
      })
      .select('*')
      .single();

    if (createErr || !created) {
      throwFormattedReferralError(
        'referralRepo.getOrCreateActiveCampaign:create',
        createErr ?? new Error('Insert failed')
      );
    }

    return created;
  },

  async updateCampaign(
    client: SupabaseAdminClient,
    merchantId: string,
    campaignId: string,
    patch: UpdateCampaignInput
  ): Promise<ReferralCampaign> {
    const db = asReferralDb(client);

    const updatePayload: Partial<ReferralCampaign> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.name !== undefined) updatePayload.name = patch.name;
    if (patch.prize_description !== undefined) {
      updatePayload.prize_description = patch.prize_description;
    }
    if (patch.metric_type !== undefined) updatePayload.metric_type = patch.metric_type;
    if (patch.win_mode !== undefined) updatePayload.win_mode = patch.win_mode;
    if (patch.goal_target !== undefined) updatePayload.goal_target = patch.goal_target;
    if (patch.top_n !== undefined) updatePayload.top_n = patch.top_n;
    if (patch.starts_at !== undefined) updatePayload.starts_at = patch.starts_at;
    if (patch.ends_at !== undefined) updatePayload.ends_at = patch.ends_at;
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;

    const { data, error } = await db
      .from('referral_campaigns')
      .update(updatePayload)
      .eq('id', campaignId)
      .eq('merchant_id', merchantId)
      .select('*')
      .maybeSingle();

    if (error) {
      throwFormattedReferralError('referralRepo.updateCampaign', error);
    }
    if (!data) {
      throw new ReferralNotFoundError('Campaña de referidos no encontrada');
    }

    return data;
  },

  async findActivePromoterByCode(
    client: SupabaseAdminClient,
    rawCode: string
  ): Promise<ActivePromoterLookup | null> {
    const normalizedCode = normalizeReferralCode(rawCode);
    if (!isValidReferralCode(normalizedCode)) {
      return null;
    }

    const db = asReferralDb(client);

    const { data: promoter, error: promoterErr } = await db
      .from('referral_promoters')
      .select('*')
      .ilike('code', normalizedCode)
      .eq('is_active', true)
      .maybeSingle();

    if (promoterErr) {
      throwFormattedReferralError('referralRepo.findActivePromoterByCode:promoter', promoterErr);
    }
    if (!promoter) return null;

    const [
      { data: campaign, error: campaignErr },
      { data: merchant, error: merchantErr },
    ] = await Promise.all([
      db
        .from('referral_campaigns')
        .select('id, name, is_active, starts_at, ends_at')
        .eq('id', promoter.campaign_id)
        .eq('merchant_id', promoter.merchant_id)
        .maybeSingle(),
      client
        .from('merchants')
        .select('id, slug, name, is_active')
        .eq('id', promoter.merchant_id)
        .maybeSingle(),
    ]);

    if (campaignErr) {
      throwFormattedReferralError('referralRepo.findActivePromoterByCode:campaign', campaignErr);
    }
    if (merchantErr) {
      throwFormattedReferralError('referralRepo.findActivePromoterByCode:merchant', merchantErr);
    }

    if (!campaign || !campaign.is_active || !merchant || !merchant.is_active) {
      return null;
    }

    return {
      promoter,
      campaign,
      merchant,
    };
  },

  async recordQrVisit(
    client: SupabaseAdminClient,
    params: RecordQrVisitParams
  ): Promise<ReferralQrVisit> {
    const db = asReferralDb(client);
    const now = new Date();
    const visitorHash = computeVisitorHash(params.ip, params.userAgent, now);
    const ipPrefix = extractIpPrefix(params.ip);
    const userAgent = params.userAgent?.trim().slice(0, 300) || null;
    const cutoffIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const { data: recentVisit, error: checkErr } = await db
      .from('referral_qr_visits')
      .select('id')
      .eq('promoter_id', params.promoterId)
      .eq('visitor_hash', visitorHash)
      .gte('created_at', cutoffIso)
      .limit(1)
      .maybeSingle();

    if (checkErr) {
      throwFormattedReferralError('referralRepo.recordQrVisit:check', checkErr);
    }

    const isUniqueDaily = !recentVisit;

    const { data: created, error: insertErr } = await db
      .from('referral_qr_visits')
      .insert({
        merchant_id: params.merchantId,
        campaign_id: params.campaignId,
        promoter_id: params.promoterId,
        visitor_hash: visitorHash,
        ip_prefix: ipPrefix,
        user_agent: userAgent,
        is_unique_daily: isUniqueDaily,
      })
      .select('*')
      .single();

    if (insertErr || !created) {
      throwFormattedReferralError(
        'referralRepo.recordQrVisit:insert',
        insertErr ?? new Error('Insert failed')
      );
    }

    return created;
  },

  async createPromoter(
    client: SupabaseAdminClient,
    merchantId: string,
    input: CreatePromoterInput,
    campaignId?: string
  ): Promise<ReferralPromoter> {
    const db = asReferralDb(client);
    const targetCampaignId =
      campaignId ?? (await this.getOrCreateActiveCampaign(client, merchantId)).id;

    const { data: existingRows, error: listErr } = await db
      .from('referral_promoters')
      .select('code')
      .eq('merchant_id', merchantId);

    if (listErr) {
      throwFormattedReferralError('referralRepo.createPromoter:existingCodes', listErr);
    }

    const takenCodes = new Set(
      (existingRows ?? []).map((r) => r.code.toUpperCase())
    );

    const hasExplicitCode = Boolean(input.code);
    let candidateCode = input.code
      ? normalizeReferralCode(input.code)
      : generateReferralCode(input.name, takenCodes);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data, error } = await db
        .from('referral_promoters')
        .insert({
          merchant_id: merchantId,
          campaign_id: targetCampaignId,
          name: input.name.trim(),
          phone: input.phone ?? null,
          alias: input.alias ?? null,
          code: candidateCode,
          notes: input.notes ?? null,
          is_active: input.is_active ?? true,
          prize_status: 'pending',
        })
        .select('*')
        .single();

      if (!error && data) {
        return data;
      }

      if (isUniqueViolationError(error)) {
        if (hasExplicitCode) {
          throw new ReferralConflictError(
            `El código "${candidateCode}" ya está en uso por otro embajador`
          );
        }
        takenCodes.add(candidateCode);
        candidateCode = generateReferralCode(input.name, takenCodes);
        continue;
      }

      throwFormattedReferralError(
        'referralRepo.createPromoter:insert',
        error ?? new Error('Insert failed')
      );
    }

    throw new ReferralConflictError(
      'No fue posible generar un código único para este embajador; intenta con un código personalizado'
    );
  },

  async batchCreatePromoters(
    client: SupabaseAdminClient,
    merchantId: string,
    inputs: CreatePromoterInput[],
    campaignId?: string
  ): Promise<BatchCreatePromotersResult> {
    const db = asReferralDb(client);
    const targetCampaignId =
      campaignId ?? (await this.getOrCreateActiveCampaign(client, merchantId)).id;

    const explicitCodes = inputs
      .map((item) => (item.code ? normalizeReferralCode(item.code) : null))
      .filter((c): c is string => Boolean(c));

    const [
      { data: merchantCodes, error: merchantCodesErr },
      { data: globalConflicts, error: globalConflictsErr },
    ] = await Promise.all([
      db.from('referral_promoters').select('code').eq('merchant_id', merchantId),
      explicitCodes.length > 0
        ? db.from('referral_promoters').select('code').in('code', explicitCodes)
        : Promise.resolve({ data: [] as Array<{ code: string }>, error: null }),
    ]);

    if (merchantCodesErr) {
      throwFormattedReferralError(
        'referralRepo.batchCreatePromoters:merchantCodes',
        merchantCodesErr
      );
    }
    if (globalConflictsErr) {
      throwFormattedReferralError(
        'referralRepo.batchCreatePromoters:globalConflicts',
        globalConflictsErr
      );
    }

    const takenCodes = new Set<string>();
    for (const row of merchantCodes ?? []) {
      takenCodes.add(row.code.toUpperCase());
    }
    for (const row of globalConflicts ?? []) {
      takenCodes.add(row.code.toUpperCase());
    }

    const created: ReferralPromoter[] = [];
    const skipped: BatchCreatePromotersResult['skipped'] = [];
    const rowsToInsert: Array<{
      merchant_id: string;
      campaign_id: string;
      name: string;
      phone: string | null;
      alias: string | null;
      code: string;
      notes: string | null;
      is_active: boolean;
      prize_status: 'pending';
    }> = [];

    for (const item of inputs) {
      const explicitCode = item.code ? normalizeReferralCode(item.code) : undefined;
      if (explicitCode) {
        if (!isValidReferralCode(explicitCode)) {
          skipped.push({
            name: item.name,
            code: explicitCode,
            reason: 'Código inválido',
          });
          continue;
        }
        if (takenCodes.has(explicitCode)) {
          skipped.push({
            name: item.name,
            code: explicitCode,
            reason: `El código "${explicitCode}" ya existe`,
          });
          continue;
        }
        takenCodes.add(explicitCode);
        rowsToInsert.push({
          merchant_id: merchantId,
          campaign_id: targetCampaignId,
          name: item.name.trim(),
          phone: item.phone ?? null,
          alias: item.alias ?? null,
          code: explicitCode,
          notes: item.notes ?? null,
          is_active: item.is_active ?? true,
          prize_status: 'pending',
        });
      } else {
        const autoCode = generateReferralCode(item.name, takenCodes);
        takenCodes.add(autoCode);
        rowsToInsert.push({
          merchant_id: merchantId,
          campaign_id: targetCampaignId,
          name: item.name.trim(),
          phone: item.phone ?? null,
          alias: item.alias ?? null,
          code: autoCode,
          notes: item.notes ?? null,
          is_active: item.is_active ?? true,
          prize_status: 'pending',
        });
      }
    }

    if (rowsToInsert.length === 0) {
      return { created, skipped };
    }

    const { data: insertedRows, error: batchErr } = await db
      .from('referral_promoters')
      .insert(rowsToInsert)
      .select('*');

    if (!batchErr && insertedRows) {
      created.push(...insertedRows);
      return { created, skipped };
    }

    // Fallback to row-by-row insertion if a concurrent global code collision happened
    if (isUniqueViolationError(batchErr)) {
      for (const row of rowsToInsert) {
        try {
          const single = await this.createPromoter(
            client,
            merchantId,
            {
              name: row.name,
              phone: row.phone,
              alias: row.alias,
              code: explicitCodes.includes(row.code) ? row.code : undefined,
              notes: row.notes,
              is_active: row.is_active,
            },
            targetCampaignId
          );
          created.push(single);
        } catch (singleErr) {
          if (singleErr instanceof ReferralConflictError) {
            skipped.push({
              name: row.name,
              code: row.code,
              reason: singleErr.message,
            });
          } else {
            throw singleErr;
          }
        }
      }
      return { created, skipped };
    }

    throwFormattedReferralError('referralRepo.batchCreatePromoters:insert', batchErr);
  },

  async updatePromoter(
    client: SupabaseAdminClient,
    merchantId: string,
    promoterId: string,
    patch: UpdatePromoterInput
  ): Promise<ReferralPromoter> {
    const db = asReferralDb(client);

    const updatePayload: Partial<ReferralPromoter> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.name !== undefined) updatePayload.name = patch.name.trim();
    if (patch.phone !== undefined) updatePayload.phone = patch.phone;
    if (patch.alias !== undefined) updatePayload.alias = patch.alias;
    if (patch.code !== undefined) updatePayload.code = normalizeReferralCode(patch.code);
    if (patch.is_active !== undefined) updatePayload.is_active = patch.is_active;
    if (patch.notes !== undefined) updatePayload.notes = patch.notes;
    if (patch.prize_status !== undefined) {
      updatePayload.prize_status = patch.prize_status;
      updatePayload.prize_awarded_at =
        patch.prize_status === 'awarded' ? new Date().toISOString() : null;
    }

    const { data, error } = await db
      .from('referral_promoters')
      .update(updatePayload)
      .eq('id', promoterId)
      .eq('merchant_id', merchantId)
      .select('*')
      .maybeSingle();

    if (error) {
      if (isUniqueViolationError(error)) {
        throw new ReferralConflictError(
          `El código "${updatePayload.code}" ya está en uso por otro embajador`
        );
      }
      throwFormattedReferralError('referralRepo.updatePromoter', error);
    }
    if (!data) {
      throw new ReferralNotFoundError('Embajador no encontrado');
    }

    return data;
  },

  async deletePromoter(
    client: SupabaseAdminClient,
    merchantId: string,
    promoterId: string
  ): Promise<{ deleted: boolean }> {
    const db = asReferralDb(client);

    const { data, error } = await db
      .from('referral_promoters')
      .delete()
      .eq('id', promoterId)
      .eq('merchant_id', merchantId)
      .select('id')
      .maybeSingle();

    if (error) {
      throwFormattedReferralError('referralRepo.deletePromoter', error);
    }
    if (!data) {
      throw new ReferralNotFoundError('Embajador no encontrado');
    }

    return { deleted: true };
  },

  async getCampaignOverview(
    client: SupabaseAdminClient,
    merchantId: string
  ): Promise<ReferralOverviewResponse> {
    const db = asReferralDb(client);
    const campaign = await this.getOrCreateActiveCampaign(client, merchantId);

    const [
      { data: merchantRow, error: merchantErr },
      { data: promoterRows, error: promotersErr },
      { data: visitRows, error: visitsErr },
      { data: referredCustomerRows, error: customersErr },
    ] = await Promise.all([
      client
        .from('merchants')
        .select('id, name, slug, brand_color, logo_url')
        .eq('id', merchantId)
        .maybeSingle(),
      db
        .from('referral_promoters')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('campaign_id', campaign.id)
        .order('created_at', { ascending: true }),
      db
        .from('referral_qr_visits')
        .select('promoter_id, ip_prefix, is_unique_daily, created_at')
        .eq('merchant_id', merchantId)
        .eq('campaign_id', campaign.id),
      db
        .from('customers')
        .select('id, created_at, referred_by_promoter_id, referred_at')
        .eq('merchant_id', merchantId)
        .not('referred_by_promoter_id', 'is', null),
    ]);

    if (merchantErr) {
      throwFormattedReferralError('referralRepo.getCampaignOverview:merchant', merchantErr);
    }
    if (promotersErr) {
      throwFormattedReferralError('referralRepo.getCampaignOverview:promoters', promotersErr);
    }
    if (visitsErr) {
      throwFormattedReferralError('referralRepo.getCampaignOverview:visits', visitsErr);
    }
    if (customersErr) {
      throwFormattedReferralError('referralRepo.getCampaignOverview:customers', customersErr);
    }

    const promoters = promoterRows ?? [];
    const visits = (visitRows ?? []) as RankingVisitInput[];
    const promoterIdSet = new Set(promoters.map((p) => p.id));

    const referredCustomers = (
      (referredCustomerRows ?? []) as unknown as RankingCustomerInput[]
    ).filter(
      (c) => c.referred_by_promoter_id && promoterIdSet.has(c.referred_by_promoter_id)
    );

    const customerTransactionCounts: Record<string, number> = {};
    const customerPassVisits: Record<string, number> = {};

    if (referredCustomers.length > 0) {
      const customerIds = referredCustomers.map((c) => c.id);
      const [
        { data: txRows, error: txErr },
        { data: passRows, error: passErr },
      ] = await Promise.all([
        client
          .from('transactions')
          .select('customer_id')
          .eq('merchant_id', merchantId)
          .in('customer_id', customerIds),
        client
          .from('wallet_passes')
          .select('customer_id, total_visits')
          .eq('merchant_id', merchantId)
          .in('customer_id', customerIds),
      ]);

      if (txErr) {
        throwFormattedReferralError('referralRepo.getCampaignOverview:transactions', txErr);
      }
      if (passErr) {
        throwFormattedReferralError('referralRepo.getCampaignOverview:passes', passErr);
      }

      for (const tx of txRows ?? []) {
        customerTransactionCounts[tx.customer_id] =
          (customerTransactionCounts[tx.customer_id] ?? 0) + 1;
      }

      for (const pass of passRows ?? []) {
        const currentMax = customerPassVisits[pass.customer_id] ?? 0;
        if (pass.total_visits > currentMax) {
          customerPassVisits[pass.customer_id] = pass.total_visits;
        }
      }
    }

    const rankedPromoters = computePromoterRankings({
      campaign,
      promoters,
      visits,
      customers: referredCustomers,
      customerTransactionCounts,
      customerPassVisits,
    });

    const summary = computeCampaignSummary(rankedPromoters);
    const merchant: ReferralOverviewMerchant | undefined = merchantRow
      ? {
          id: merchantRow.id,
          name: merchantRow.name,
          slug: merchantRow.slug,
          brand_color: merchantRow.brand_color,
          logo_url: merchantRow.logo_url,
        }
      : undefined;

    return {
      campaign,
      merchant,
      summary,
      promoters: rankedPromoters,
    };
  },

  async getPromoterDetail(
    client: SupabaseAdminClient,
    merchantId: string,
    promoterId: string
  ): Promise<PromoterDetailResponse> {
    const db = asReferralDb(client);
    const overview = await this.getCampaignOverview(client, merchantId);
    const metrics = overview.promoters.find((row) => row.promoter.id === promoterId);

    if (!metrics) {
      throw new ReferralNotFoundError('Embajador no encontrado en la campaña activa');
    }

    const [
      { data: customerRows, error: customersErr },
      { data: recentVisits, error: visitsErr },
    ] = await Promise.all([
      db
        .from('customers')
        .select('id, full_name, phone, loyalty_tier, created_at, referred_at')
        .eq('merchant_id', merchantId)
        .eq('referred_by_promoter_id', promoterId)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('referral_qr_visits')
        .select('*')
        .eq('merchant_id', merchantId)
        .eq('promoter_id', promoterId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (customersErr) {
      throwFormattedReferralError('referralRepo.getPromoterDetail:customers', customersErr);
    }
    if (visitsErr) {
      throwFormattedReferralError('referralRepo.getPromoterDetail:visits', visitsErr);
    }

    interface RawReferredCustomer {
      id: string;
      full_name: string;
      phone: string;
      loyalty_tier: string;
      created_at: string;
      referred_at: string | null;
    }

    const rawCustomers = (customerRows ?? []) as unknown as RawReferredCustomer[];
    const customerIds = rawCustomers.map((c) => c.id);

    const txCountByCustomer: Record<string, number> = {};
    const passInfoByCustomer: Record<
      string,
      { totalVisits: number; lastVisitAt: string | null }
    > = {};

    if (customerIds.length > 0) {
      const [
        { data: txRows, error: txErr },
        { data: passRows, error: passErr },
      ] = await Promise.all([
        client
          .from('transactions')
          .select('customer_id')
          .eq('merchant_id', merchantId)
          .in('customer_id', customerIds),
        client
          .from('wallet_passes')
          .select('customer_id, total_visits, last_visit_at')
          .eq('merchant_id', merchantId)
          .in('customer_id', customerIds),
      ]);

      if (txErr) {
        throwFormattedReferralError('referralRepo.getPromoterDetail:transactions', txErr);
      }
      if (passErr) {
        throwFormattedReferralError('referralRepo.getPromoterDetail:passes', passErr);
      }

      for (const tx of txRows ?? []) {
        txCountByCustomer[tx.customer_id] =
          (txCountByCustomer[tx.customer_id] ?? 0) + 1;
      }

      for (const pass of passRows ?? []) {
        const existing = passInfoByCustomer[pass.customer_id];
        if (!existing || pass.total_visits > existing.totalVisits) {
          passInfoByCustomer[pass.customer_id] = {
            totalVisits: pass.total_visits,
            lastVisitAt: pass.last_visit_at,
          };
        }
      }
    }

    const referredCustomers: ReferredCustomerDetail[] = rawCustomers.map((c) => {
      const transactionsCount = txCountByCustomer[c.id] ?? 0;
      const passInfo = passInfoByCustomer[c.id];
      const totalVisits = passInfo?.totalVisits ?? 0;
      return {
        id: c.id,
        full_name: c.full_name,
        phone: c.phone,
        referred_at: c.referred_at,
        created_at: c.created_at,
        loyalty_tier: c.loyalty_tier || 'bronze',
        transactionsCount,
        totalVisits,
        isPosVerified: transactionsCount >= 1 || totalVisits > 1,
        lastVisitAt: passInfo?.lastVisitAt ?? null,
      };
    });

    return {
      campaign: overview.campaign,
      metrics,
      referredCustomers,
      recentVisits: recentVisits ?? [],
    };
  },

  async attributeNewCustomer(
    client: SupabaseAdminClient,
    params: AttributeNewCustomerParams
  ): Promise<AttributeNewCustomerResult> {
    const normalizedCode = normalizeReferralCode(params.referralCode);
    if (!isValidReferralCode(normalizedCode)) {
      return { attributed: false, reason: 'invalid_code' };
    }

    const db = asReferralDb(client);

    try {
      const { data: promoter, error: promoterErr } = await db
        .from('referral_promoters')
        .select('*')
        .eq('merchant_id', params.merchantId)
        .ilike('code', normalizedCode)
        .eq('is_active', true)
        .maybeSingle();

      if (promoterErr) {
        if (isMigrationMissingError(promoterErr)) {
          return { attributed: false, reason: 'migration_required' };
        }
        throwFormattedReferralError(
          'referralRepo.attributeNewCustomer:promoter',
          promoterErr
        );
      }

      if (!promoter) {
        return { attributed: false, reason: 'promoter_not_found' };
      }

      // Ensure the promoter's campaign is still active before crediting a new customer
      const { data: campaign, error: campaignErr } = await db
        .from('referral_campaigns')
        .select('id, is_active')
        .eq('id', promoter.campaign_id)
        .eq('merchant_id', params.merchantId)
        .maybeSingle();

      if (campaignErr) {
        if (isMigrationMissingError(campaignErr)) {
          return { attributed: false, reason: 'migration_required' };
        }
        throwFormattedReferralError(
          'referralRepo.attributeNewCustomer:campaign',
          campaignErr
        );
      }

      if (!campaign || !campaign.is_active) {
        return { attributed: false, reason: 'promoter_not_found' };
      }

      // Block self-referral when customer's normalized phone matches promoter's phone
      if (promoter.phone && arePhonesEquivalent(promoter.phone, params.customerPhone)) {
        return { attributed: false, reason: 'self_referral_blocked' };
      }

      const updatedCustomer = await customerRepo.attachReferralForNewCustomer(
        client,
        params.merchantId,
        params.customerId,
        promoter.id
      );

      if (!updatedCustomer) {
        return { attributed: false, reason: 'already_attributed' };
      }

      // Best-effort: link the most recent unconverted QR visit to this new customer
      try {
        let visitIdToLink: string | null = null;

        if (params.ip || params.userAgent) {
          const visitorHash = computeVisitorHash(params.ip, params.userAgent);
          const { data: matchedVisit } = await db
            .from('referral_qr_visits')
            .select('id')
            .eq('promoter_id', promoter.id)
            .eq('visitor_hash', visitorHash)
            .is('converted_customer_id', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          visitIdToLink = matchedVisit?.id ?? null;
        }

        if (!visitIdToLink) {
          const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
          const { data: latestVisit } = await db
            .from('referral_qr_visits')
            .select('id')
            .eq('promoter_id', promoter.id)
            .is('converted_customer_id', null)
            .gte('created_at', cutoffIso)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          visitIdToLink = latestVisit?.id ?? null;
        }

        if (visitIdToLink) {
          await db
            .from('referral_qr_visits')
            .update({ converted_customer_id: params.customerId })
            .eq('id', visitIdToLink)
            .is('converted_customer_id', null);
        }
      } catch {
        // Non-fatal: customer is already attributed via customers.referred_by_promoter_id
      }

      return {
        attributed: true,
        promoterId: promoter.id,
        promoterCode: promoter.code,
        promoterName: promoter.name,
      };
    } catch (err) {
      if (isMigrationMissingError(err)) {
        return { attributed: false, reason: 'migration_required' };
      }
      throw err;
    }
  },
};
