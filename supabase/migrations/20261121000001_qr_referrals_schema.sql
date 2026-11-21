-- ============================================================================
-- FIDELIZIA · QR AMBASSADORS / REFERRAL TRACKING & PRIZE METRICS SCHEMA
-- Target: PostgreSQL 15 / 16 (Supabase)
-- Idempotent migration: safe to re-run without data loss
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- 1.1 REFERRAL CAMPAIGNS (Prize rules & winning metrics per merchant)
CREATE TABLE IF NOT EXISTS public.referral_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Campaña Embajadores QR',
  prize_description TEXT NOT NULL DEFAULT 'Premio especial al cumplir la meta de referidos',
  metric_type TEXT NOT NULL DEFAULT 'new_customers',
  win_mode TEXT NOT NULL DEFAULT 'goal',
  goal_target INT NOT NULL DEFAULT 10,
  top_n INT NOT NULL DEFAULT 3,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_campaigns_metric_type'
  ) THEN
    ALTER TABLE public.referral_campaigns
      ADD CONSTRAINT chk_referral_campaigns_metric_type
      CHECK (metric_type IN ('unique_visits', 'new_customers', 'pos_verified_visits'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_campaigns_win_mode'
  ) THEN
    ALTER TABLE public.referral_campaigns
      ADD CONSTRAINT chk_referral_campaigns_win_mode
      CHECK (win_mode IN ('goal', 'top_n'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_campaigns_goal_target'
  ) THEN
    ALTER TABLE public.referral_campaigns
      ADD CONSTRAINT chk_referral_campaigns_goal_target
      CHECK (goal_target >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_campaigns_top_n'
  ) THEN
    ALTER TABLE public.referral_campaigns
      ADD CONSTRAINT chk_referral_campaigns_top_n
      CHECK (top_n >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_campaigns_date_range'
  ) THEN
    ALTER TABLE public.referral_campaigns
      ADD CONSTRAINT chk_referral_campaigns_date_range
      CHECK (ends_at IS NULL OR ends_at >= starts_at);
  END IF;
END $$;

-- 1.2 REFERRAL PROMOTERS (~20 ambassadors with globally unique short QR codes)
CREATE TABLE IF NOT EXISTS public.referral_promoters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.referral_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  alias TEXT,
  code VARCHAR(32) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  prize_status TEXT NOT NULL DEFAULT 'pending',
  prize_awarded_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_promoters_prize_status'
  ) THEN
    ALTER TABLE public.referral_promoters
      ADD CONSTRAINT chk_referral_promoters_prize_status
      CHECK (prize_status IN ('pending', 'qualified', 'awarded', 'disqualified'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_referral_promoters_code_length'
  ) THEN
    ALTER TABLE public.referral_promoters
      ADD CONSTRAINT chk_referral_promoters_code_length
      CHECK (LENGTH(TRIM(code)) >= 3);
  END IF;
END $$;

-- Globally unique case-insensitive code so /r/[code] resolves unambiguously without merchantSlug
CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_promoters_code_upper
  ON public.referral_promoters (UPPER(code));

-- 1.3 REFERRAL QR VISITS (Scan telemetry, daily unique deduplication & anti-fraud burst signals)
CREATE TABLE IF NOT EXISTS public.referral_qr_visits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.referral_campaigns(id) ON DELETE CASCADE,
  promoter_id UUID NOT NULL REFERENCES public.referral_promoters(id) ON DELETE CASCADE,
  visitor_hash TEXT NOT NULL,
  ip_prefix TEXT,
  user_agent TEXT,
  is_unique_daily BOOLEAN NOT NULL DEFAULT true,
  converted_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.4 CUSTOMERS: First-touch referral attribution columns
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS referred_by_promoter_id UUID REFERENCES public.referral_promoters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ;

-- ============================================================================
-- 2. PERFORMANCE INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_referral_campaigns_merchant_active
  ON public.referral_campaigns (merchant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_promoters_merchant
  ON public.referral_promoters (merchant_id);

CREATE INDEX IF NOT EXISTS idx_referral_promoters_campaign
  ON public.referral_promoters (campaign_id);

CREATE INDEX IF NOT EXISTS idx_referral_promoters_merchant_campaign_active
  ON public.referral_promoters (merchant_id, campaign_id, is_active);

CREATE INDEX IF NOT EXISTS idx_referral_qr_visits_merchant
  ON public.referral_qr_visits (merchant_id);

CREATE INDEX IF NOT EXISTS idx_referral_qr_visits_campaign_created
  ON public.referral_qr_visits (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_qr_visits_promoter_created
  ON public.referral_qr_visits (promoter_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_qr_visits_promoter_visitor_created
  ON public.referral_qr_visits (promoter_id, visitor_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referral_qr_visits_converted_customer
  ON public.referral_qr_visits (converted_customer_id)
  WHERE converted_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_merchant_referred_promoter
  ON public.customers (merchant_id, referred_by_promoter_id)
  WHERE referred_by_promoter_id IS NOT NULL;

-- ============================================================================
-- 3. STRICT ROW LEVEL SECURITY (SERVICE_ROLE ONLY — MATCHES PRODUCTION RLS)
-- ============================================================================

ALTER TABLE public.referral_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_promoters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_qr_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all_referral_campaigns" ON public.referral_campaigns;
DROP POLICY IF EXISTS "service_role_all_referral_promoters" ON public.referral_promoters;
DROP POLICY IF EXISTS "service_role_all_referral_qr_visits" ON public.referral_qr_visits;

CREATE POLICY "service_role_all_referral_campaigns"
  ON public.referral_campaigns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_referral_promoters"
  ON public.referral_promoters FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_referral_qr_visits"
  ON public.referral_qr_visits FOR ALL TO service_role
  USING (true) WITH CHECK (true);
