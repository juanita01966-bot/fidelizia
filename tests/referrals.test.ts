import { describe, expect, it } from 'vitest';
import {
  ReferralMigrationRequiredError,
  arePhonesEquivalent,
  computeCampaignSummary,
  computePromoterRankings,
  computeVisitorHash,
  detectPromoterSuspiciousActivity,
  extractIpPrefix,
  isMigrationMissingError,
  type RankingCustomerInput,
  type RankingVisitInput,
} from '@/lib/repositories/referralRepo';
import {
  BatchCreatePromotersSchema,
  CreatePromoterSchema,
  UpdateCampaignSchema,
  UpdatePromoterSchema,
  generateReferralCode,
  isValidReferralCode,
  normalizeReferralCode,
  type ReferralCampaign,
  type ReferralPromoter,
} from '@/types/referrals';

function makeCampaign(overrides: Partial<ReferralCampaign> = {}): ReferralCampaign {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    merchant_id: '22222222-2222-4222-8222-222222222222',
    name: 'Campaña Embajadores QR',
    prize_description: 'Cena VIP para 2 personas',
    metric_type: 'new_customers',
    win_mode: 'goal',
    goal_target: 10,
    top_n: 3,
    starts_at: '2026-11-01T00:00:00.000Z',
    ends_at: null,
    is_active: true,
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makePromoter(overrides: Partial<ReferralPromoter> = {}): ReferralPromoter {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    merchant_id: '22222222-2222-4222-8222-222222222222',
    campaign_id: '11111111-1111-4111-8111-111111111111',
    name: 'María López',
    phone: '+573001112233',
    alias: '@marialopez',
    code: 'MARIA01',
    is_active: true,
    prize_status: 'pending',
    prize_awarded_at: null,
    notes: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    ...overrides,
  };
}

function makeVisits(
  promoterId: string,
  count: number,
  options: {
    startMs?: number;
    stepMs?: number;
    ipPrefix?: string | null;
    uniqueCount?: number;
  } = {}
): RankingVisitInput[] {
  const startMs = options.startMs ?? Date.parse('2026-11-15T12:00:00.000Z');
  const stepMs = options.stepMs ?? 15 * 60 * 1000; // 15 min default (no burst)
  const uniqueCount = options.uniqueCount ?? count;

  return Array.from({ length: count }, (_, idx) => ({
    promoter_id: promoterId,
    ip_prefix:
      options.ipPrefix !== undefined
        ? options.ipPrefix
        : `181.50.${idx % 200}.0/24`,
    is_unique_daily: idx < uniqueCount,
    created_at: new Date(startMs + idx * stepMs).toISOString(),
  }));
}

function makeCustomers(
  promoterId: string,
  count: number,
  idPrefix: string
): RankingCustomerInput[] {
  const startMs = Date.parse('2026-11-15T13:00:00.000Z');
  return Array.from({ length: count }, (_, idx) => ({
    id: `${idPrefix}-cust-${idx + 1}`,
    referred_by_promoter_id: promoterId,
    created_at: new Date(startMs + idx * 60_000).toISOString(),
    referred_at: new Date(startMs + idx * 60_000).toISOString(),
  }));
}

describe('QR Referrals — Code Normalization & Zod Schemas', () => {
  it('normalizes accents, spaces, underscores, and invalid characters', () => {
    expect(normalizeReferralCode('  maría_pérez 01!  ')).toBe('MARIA-PEREZ-01');
    expect(normalizeReferralCode('---café---canelo---')).toBe('CAFE-CANELO');
    expect(normalizeReferralCode('ab')).toBe('AB');
    expect(isValidReferralCode('AB')).toBe(false);
    expect(isValidReferralCode('MARIA01')).toBe(true);
    expect(isValidReferralCode('PROMO-4F8A')).toBe(true);
    expect(isValidReferralCode('bad_code')).toBe(false);
  });

  it('generates readable collision-free codes from promoter names', () => {
    const taken = new Set<string>(['MARIA01', 'MARIA02']);
    const code = generateReferralCode('María José Gómez', taken);
    expect(code).toBe('MARIA03');
    expect(isValidReferralCode(code)).toBe(true);

    const fallback = generateReferralCode(undefined, new Set());
    expect(fallback).toMatch(/^PROMO-[A-Z0-9]{4}$/);
    expect(isValidReferralCode(fallback)).toBe(true);
  });

  it('validates CreatePromoterSchema, BatchCreatePromotersSchema, UpdatePromoterSchema and UpdateCampaignSchema', () => {
    const single = CreatePromoterSchema.parse({
      name: '  Sofía Ramírez ',
      phone: '+573001234567',
      code: 'sofia_vip',
    });
    expect(single.name).toBe('Sofía Ramírez');
    expect(single.code).toBe('SOFIA-VIP');
    expect(single.is_active).toBe(true);

    const noCode = CreatePromoterSchema.parse({ name: 'Carlos Ruiz', code: '' });
    expect(noCode.code).toBeUndefined();

    expect(() =>
      CreatePromoterSchema.parse({ name: 'Ana', code: 'X' })
    ).toThrow();

    const batch = BatchCreatePromotersSchema.parse({
      promoters: [{ name: 'Embajador 1' }, { name: 'Embajador 2', code: 'EMB-02' }],
    });
    expect(batch.promoters).toHaveLength(2);
    expect(batch.promoters[1].code).toBe('EMB-02');

    const patch = UpdatePromoterSchema.parse({ prize_status: 'awarded' });
    expect(patch.prize_status).toBe('awarded');
    expect(() => UpdatePromoterSchema.parse({})).toThrow();

    const validCampaign = UpdateCampaignSchema.parse({
      metric_type: 'pos_verified_visits',
      win_mode: 'top_n',
      top_n: 5,
      starts_at: '2026-11-01T00:00:00.000Z',
      ends_at: '2026-11-30T23:59:59.000Z',
    });
    expect(validCampaign.top_n).toBe(5);

    expect(() =>
      UpdateCampaignSchema.parse({
        starts_at: '2026-11-20T00:00:00.000Z',
        ends_at: '2026-11-01T00:00:00.000Z',
      })
    ).toThrow();
  });
});

describe('QR Referrals — Privacy Hashing, Phone Matching & Migration Detection', () => {
  it('anonymizes IPv4 to /24 and IPv6 to /64 prefixes', () => {
    expect(extractIpPrefix('190.24.112.87, 10.0.0.1')).toBe('190.24.112.0/24');
    expect(extractIpPrefix('::ffff:192.168.1.42')).toBe('192.168.1.0/24');
    expect(extractIpPrefix('2001:db8:85a3:1234:5678:8a2e:370:7334')).toBe(
      '2001:db8:85a3:1234::/64'
    );
    expect(extractIpPrefix(null)).toBeNull();
  });

  it('produces deterministic daily visitor hashes that rotate across UTC dates', () => {
    const day1a = computeVisitorHash(
      '190.24.112.87',
      'Mozilla/5.0 iPhone',
      new Date('2026-11-21T08:00:00Z')
    );
    const day1b = computeVisitorHash(
      '190.24.112.87',
      'Mozilla/5.0 iPhone',
      new Date('2026-11-21T22:30:00Z')
    );
    const day2 = computeVisitorHash(
      '190.24.112.87',
      'Mozilla/5.0 iPhone',
      new Date('2026-11-22T00:05:00Z')
    );

    expect(day1a).toBe(day1b);
    expect(day1a).not.toBe(day2);
    expect(day1a).toHaveLength(64);
  });

  it('detects equivalent phones for self-referral blocking', () => {
    expect(arePhonesEquivalent('+573001234567', '300 123 4567')).toBe(true);
    expect(arePhonesEquivalent('+57 300-123-4567', '+573001234567')).toBe(true);
    expect(arePhonesEquivalent('+573001234567', '+573009998877')).toBe(false);
    expect(arePhonesEquivalent('123', '123')).toBe(false);
  });

  it('detects missing migration errors across Postgres 42P01 and PostgREST PGRST205', () => {
    expect(isMigrationMissingError({ code: '42P01', message: 'relation "public.referral_campaigns" does not exist' })).toBe(true);
    expect(isMigrationMissingError({ code: 'PGRST205', message: "Could not find the table 'public.referral_campaigns'" })).toBe(true);
    expect(isMigrationMissingError({ code: '42703', message: 'column customers.referred_by_promoter_id does not exist' })).toBe(true);
    expect(isMigrationMissingError(new ReferralMigrationRequiredError())).toBe(true);
    expect(isMigrationMissingError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });
});

describe('QR Referrals — Scoring, Ranking, Status Computation & Anti-Fraud', () => {
  it('scores goal-based campaigns, computes statuses, tie-breakers, and conversion rates', () => {
    const campaign = makeCampaign({
      metric_type: 'new_customers',
      win_mode: 'goal',
      goal_target: 10,
    });

    const pAwarded = makePromoter({
      id: 'p-awarded',
      name: 'Camila',
      code: 'CAMILA01',
      prize_status: 'awarded',
      created_at: '2026-11-01T08:00:00Z',
    });
    const pQualified = makePromoter({
      id: 'p-qualified',
      name: 'Andrés',
      code: 'ANDRES01',
      created_at: '2026-11-01T09:00:00Z',
    });
    const pAlmost = makePromoter({
      id: 'p-almost',
      name: 'Lucía',
      code: 'LUCIA01',
      created_at: '2026-11-01T10:00:00Z',
    });
    const pProgress = makePromoter({
      id: 'p-progress',
      name: 'Diego',
      code: 'DIEGO01',
      created_at: '2026-11-01T11:00:00Z',
    });
    const pDisqualified = makePromoter({
      id: 'p-disq',
      name: 'Tramposo',
      code: 'BAD01',
      prize_status: 'disqualified',
      created_at: '2026-11-01T07:00:00Z',
    });

    const visits = [
      ...makeVisits('p-awarded', 20),
      ...makeVisits('p-qualified', 15),
      ...makeVisits('p-almost', 10),
      ...makeVisits('p-progress', 10),
      ...makeVisits('p-disq', 50),
    ];

    const customers = [
      ...makeCustomers('p-awarded', 10, 'aw'),
      ...makeCustomers('p-qualified', 10, 'qu'),
      ...makeCustomers('p-almost', 7, 'al'),
      ...makeCustomers('p-progress', 3, 'pr'),
      ...makeCustomers('p-disq', 25, 'dq'),
    ];

    // Tie-breaker test: pQualified has 5 POS-verified visits vs pAwarded's 2
    const txCounts: Record<string, number> = {
      'aw-cust-1': 1,
      'aw-cust-2': 2,
      'qu-cust-1': 1,
      'qu-cust-2': 1,
      'qu-cust-3': 1,
      'qu-cust-4': 1,
      'qu-cust-5': 1,
    };

    const ranked = computePromoterRankings({
      campaign,
      promoters: [pDisqualified, pProgress, pAwarded, pAlmost, pQualified],
      visits,
      customers,
      customerTransactionCounts: txCounts,
    });

    // Qualified beats Awarded on tie-breaker (posVerifiedVisits 5 vs 2); Disqualified sorted last
    expect(ranked.map((r) => r.promoter.id)).toEqual([
      'p-qualified',
      'p-awarded',
      'p-almost',
      'p-progress',
      'p-disq',
    ]);

    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].computedStatus).toBe('qualified');
    expect(ranked[0].isWinner).toBe(true);
    expect(ranked[0].progressPct).toBe(100);
    expect(ranked[0].conversionRate).toBe(66.7);

    expect(ranked[1].computedStatus).toBe('awarded');
    expect(ranked[1].isWinner).toBe(true);

    expect(ranked[2].computedStatus).toBe('almost');
    expect(ranked[2].progressPct).toBe(70);
    expect(ranked[2].isWinner).toBe(false);

    expect(ranked[3].computedStatus).toBe('in_progress');
    expect(ranked[3].progressPct).toBe(30);

    expect(ranked[4].computedStatus).toBe('disqualified');
    expect(ranked[4].isWinner).toBe(false);

    const summary = computeCampaignSummary(ranked);
    expect(summary.totalPromoters).toBe(5);
    expect(summary.qualifiedCount).toBe(2); // qualified + awarded
    expect(summary.awardedCount).toBe(1);
    expect(summary.almostCount).toBe(1);
    expect(summary.disqualifiedCount).toBe(1);
    expect(summary.topPromoter?.code).toBe('ANDRES01');
  });

  it('supports pos_verified_visits metric (via transactions or pass visits > 1) and top_n win mode', () => {
    const campaign = makeCampaign({
      metric_type: 'pos_verified_visits',
      win_mode: 'top_n',
      top_n: 2,
    });

    const p1 = makePromoter({ id: 'p1', name: 'Uno', code: 'UNO01' });
    const p2 = makePromoter({ id: 'p2', name: 'Dos', code: 'DOS02' });
    const p3 = makePromoter({ id: 'p3', name: 'Tres', code: 'TRES03' });
    const p4 = makePromoter({
      id: 'p4',
      name: 'Descalificado',
      code: 'DISQ04',
      prize_status: 'disqualified',
    });

    const customers = [
      ...makeCustomers('p1', 3, 'p1'),
      ...makeCustomers('p2', 2, 'p2'),
      ...makeCustomers('p3', 4, 'p3'),
      ...makeCustomers('p4', 5, 'p4'),
    ];

    // p1: 2 verified (1 via tx, 1 via pass total_visits > 1)
    // p2: 1 verified (via tx)
    // p3: 0 verified
    // p4: 5 verified but disqualified -> must NOT steal a top_n slot!
    const ranked = computePromoterRankings({
      campaign,
      promoters: [p3, p4, p2, p1],
      visits: [],
      customers,
      customerTransactionCounts: {
        'p1-cust-1': 1,
        'p2-cust-1': 2,
        'p4-cust-1': 1,
        'p4-cust-2': 1,
        'p4-cust-3': 1,
        'p4-cust-4': 1,
        'p4-cust-5': 1,
      },
      customerPassVisits: {
        'p1-cust-2': 2, // > 1 counts as POS-verified visit
        'p3-cust-1': 1, // initial registration visit = 1, NOT POS-verified
      },
    });

    expect(ranked.map((r) => r.promoter.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(ranked[0].score).toBe(2);
    expect(ranked[0].isWinner).toBe(true);
    expect(ranked[1].score).toBe(1);
    expect(ranked[1].isWinner).toBe(true);
    expect(ranked[2].score).toBe(0);
    expect(ranked[2].isWinner).toBe(false);
    expect(ranked[3].isWinner).toBe(false);
    expect(ranked[3].computedStatus).toBe('disqualified');
  });

  it('flags IP-prefix bursts (>=10 scans in 10 min) and high-velocity duplicate floods without false positives', () => {
    const startMs = Date.parse('2026-11-21T15:00:00.000Z');

    // Legitimate traffic: 12 scans from same office network spread across 6 hours
    const normalOfficeVisits = makeVisits('p-clean', 12, {
      startMs,
      stepMs: 30 * 60 * 1000,
      ipPrefix: '190.10.20.0/24',
      uniqueCount: 12,
    });
    expect(detectPromoterSuspiciousActivity(normalOfficeVisits).isSuspicious).toBe(false);

    // Attack 1: 10 scans from same /24 prefix inside 5 minutes
    const burstVisits = makeVisits('p-burst', 10, {
      startMs,
      stepMs: 30 * 1000, // every 30s
      ipPrefix: '190.10.20.0/24',
      uniqueCount: 10,
    });
    const burstResult = detectPromoterSuspiciousActivity(burstVisits);
    expect(burstResult.isSuspicious).toBe(true);
    expect(burstResult.suspiciousReasons[0]).toMatch(/Ráfaga detectada/);

    // Attack 2: 12 scans across different IPs, 8 are duplicates within 12 minutes (>=50% dup ratio + velocity)
    const dupFloodVisits = makeVisits('p-dup', 12, {
      startMs,
      stepMs: 60 * 1000,
      uniqueCount: 4, // 8 duplicates = 67%
    });
    const dupResult = detectPromoterSuspiciousActivity(dupFloodVisits);
    expect(dupResult.isSuspicious).toBe(true);
    expect(dupResult.suspiciousReasons[0]).toMatch(/escaneos repetidos/);

    // Verify 'flagged' overrides 'qualified' when metric is met via suspicious burst
    const campaign = makeCampaign({
      metric_type: 'unique_visits',
      win_mode: 'goal',
      goal_target: 8,
    });
    const promoter = makePromoter({ id: 'p-burst', code: 'BURST01' });
    const ranked = computePromoterRankings({
      campaign,
      promoters: [promoter],
      visits: burstVisits,
      customers: [],
      customerTransactionCounts: {},
    });

    expect(ranked[0].score).toBe(10);
    expect(ranked[0].isSuspicious).toBe(true);
    expect(ranked[0].computedStatus).toBe('flagged');
  });
});
