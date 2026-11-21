-- ============================================================================
-- FIDELIZIA · PRODUCTION SCHEMA DRIFT, STRICT RLS & ATOMIC RPCs MIGRATION
-- Target: PostgreSQL 15 / 16 (Supabase)
-- ============================================================================

-- Ensure required extensions exist
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SCHEMA DRIFT RESOLUTION
-- ============================================================================

-- 1.1 MERCHANTS: Loyalty Program & Card Design Columns
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS tier_config JSONB NOT NULL DEFAULT '{"bronzeMin":0,"silverMin":2,"goldMin":5,"championMin":10}'::jsonb,
  ADD COLUMN IF NOT EXISTS preconfigured_rewards JSONB NOT NULL DEFAULT '["Café Americano de Especialidad (Cortesía)","Galleta Artesanal de Avena & Canela","Doble Sello de Bonificación en Próxima Visita"]'::jsonb,
  ADD COLUMN IF NOT EXISTS card_pattern TEXT NOT NULL DEFAULT 'guilloche',
  ADD COLUMN IF NOT EXISTS show_emv_chip BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS show_hologram BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS loyalty_program_mode TEXT NOT NULL DEFAULT 'multi_tier',
  ADD COLUMN IF NOT EXISTS card_morphology TEXT NOT NULL DEFAULT 'orthogonal',
  ADD COLUMN IF NOT EXISTS card_gradient JSONB NOT NULL DEFAULT '{"preset":"roasted_gold","from":"#241407","via":"#140b04","to":"#080402","angle":180}'::jsonb,
  ADD COLUMN IF NOT EXISTS reward_milestones JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_merchants_card_pattern'
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT chk_merchants_card_pattern
      CHECK (card_pattern IN ('guilloche','grid_matrix','brushed_titanium','luxury_filigree','carbon_fiber'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_merchants_loyalty_program_mode'
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT chk_merchants_loyalty_program_mode
      CHECK (loyalty_program_mode IN ('multi_tier','single_card'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_merchants_card_morphology'
  ) THEN
    ALTER TABLE public.merchants
      ADD CONSTRAINT chk_merchants_card_morphology
      CHECK (card_morphology IN ('rounded','orthogonal','chamfered','cutout'));
  END IF;
END $$;

-- 1.2 CUSTOMERS: VIP Benefits, Loyalty Tier & Cumulative Redemptions
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS custom_reward TEXT,
  ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS loyalty_tier TEXT NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS total_rewards_redeemed INT NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_discount_pct'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT chk_customers_discount_pct
      CHECK (discount_percentage IS NULL OR (discount_percentage >= 0 AND discount_percentage <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_loyalty_tier'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT chk_customers_loyalty_tier
      CHECK (loyalty_tier IN ('bronze','silver','gold','champion'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_total_rewards_redeemed'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT chk_customers_total_rewards_redeemed
      CHECK (total_rewards_redeemed >= 0);
  END IF;
END $$;

-- Backfill customers.total_rewards_redeemed from existing wallet_passes if needed
UPDATE public.customers c
SET total_rewards_redeemed = COALESCE((
  SELECT MAX(wp.total_rewards_redeemed) FROM public.wallet_passes wp WHERE wp.customer_id = c.id
), 0)
WHERE c.total_rewards_redeemed = 0;

-- 1.3 EMPLOYEES: Auth Identifiers & Hashed Secrets (never plaintext)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS username VARCHAR(80),
  ADD COLUMN IF NOT EXISTS email VARCHAR(160),
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS dsb_password_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_merchant_username
  ON public.employees (merchant_id, LOWER(username))
  WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_merchant_email
  ON public.employees (merchant_id, LOWER(email))
  WHERE email IS NOT NULL;

-- Upgrade any legacy plaintext 4-digit PINs in existing databases to bcrypt
UPDATE public.employees
SET pin_hash = crypt(pin_hash, gen_salt('bf', 10))
WHERE pin_hash ~ '^\d{4}$';

-- 1.4 TRANSACTIONS: VIP Discount Audit & Case-Insensitive Ticket Deduplication
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS discount_applied_percent NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2);

ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS uq_merchant_ticket_number;
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ticket_normalized
  ON public.transactions (merchant_id, LOWER(TRIM(ticket_number)));

-- 1.5 WALLET_PASSES: Push Tracking & 24h Quota Control
ALTER TABLE public.wallet_passes
  ADD COLUMN IF NOT EXISTS last_push_title TEXT,
  ADD COLUMN IF NOT EXISTS last_push_message TEXT,
  ADD COLUMN IF NOT EXISTS last_push_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_count_24h INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_window_reset_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wallet_passes_push_count_24h'
  ) THEN
    ALTER TABLE public.wallet_passes
      ADD CONSTRAINT chk_wallet_passes_push_count_24h
      CHECK (push_count_24h >= 0);
  END IF;
END $$;

-- 1.6 APPLE_DEVICE_REGISTRATIONS: Update Tracking & Indexes
ALTER TABLE public.apple_device_registrations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

CREATE INDEX IF NOT EXISTS idx_apple_reg_device_pass_type
  ON public.apple_device_registrations (device_library_identifier, pass_type_identifier);
CREATE INDEX IF NOT EXISTS idx_apple_reg_serial
  ON public.apple_device_registrations (serial_number);
CREATE INDEX IF NOT EXISTS idx_apple_reg_push_token
  ON public.apple_device_registrations (push_token);

-- 1.7 Multi-tenant performance indexes
CREATE INDEX IF NOT EXISTS idx_locations_merchant_active ON public.locations (merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employees_merchant_active ON public.employees (merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_customers_rfm ON public.customers (merchant_id, rfm_segment);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_merchant_status ON public.wallet_passes (merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_created ON public.transactions (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_redemptions_merchant_date ON public.redemptions (merchant_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_merchant_date ON public.reviews_feedback (merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_merchant_date ON public.reservations (merchant_id, date_time);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_merchant_resolved ON public.fraud_alerts (merchant_id, is_resolved, created_at DESC);

-- ============================================================================
-- 2. STRICT ROW LEVEL SECURITY (100% OF TABLES)
-- ============================================================================

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apple_device_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- Drop all legacy wide-open anon policies
DROP POLICY IF EXISTS "Permitir lectura publica de comercios activos" ON public.merchants;
DROP POLICY IF EXISTS "Permitir lectura publica de ubicaciones activas" ON public.locations;
DROP POLICY IF EXISTS "Permitir registro publico de clientes" ON public.customers;
DROP POLICY IF EXISTS "Permitir consulta publica de clientes por telefono" ON public.customers;
DROP POLICY IF EXISTS "Permitir registro publico de pases" ON public.wallet_passes;
DROP POLICY IF EXISTS "Permitir lectura publica de pases activos" ON public.wallet_passes;
DROP POLICY IF EXISTS "Permitir actualizacion de pases por backend o servicio" ON public.wallet_passes;
DROP POLICY IF EXISTS "Permitir insercion de transacciones" ON public.transactions;
DROP POLICY IF EXISTS "Permitir lectura de transacciones" ON public.transactions;
DROP POLICY IF EXISTS "Permitir lectura de empleados activos" ON public.employees;
DROP POLICY IF EXISTS "Permitir alertas de fraude" ON public.fraud_alerts;

-- Clean up idempotent target policies before recreating
DROP POLICY IF EXISTS "public_select_active_merchants" ON public.merchants;
DROP POLICY IF EXISTS "public_select_active_locations" ON public.locations;
DROP POLICY IF EXISTS "merchant_owner_manage_merchants" ON public.merchants;
DROP POLICY IF EXISTS "service_role_all_merchants" ON public.merchants;
DROP POLICY IF EXISTS "service_role_all_locations" ON public.locations;
DROP POLICY IF EXISTS "service_role_all_employees" ON public.employees;
DROP POLICY IF EXISTS "service_role_all_customers" ON public.customers;
DROP POLICY IF EXISTS "service_role_all_wallet_passes" ON public.wallet_passes;
DROP POLICY IF EXISTS "service_role_all_apple_registrations" ON public.apple_device_registrations;
DROP POLICY IF EXISTS "service_role_all_transactions" ON public.transactions;
DROP POLICY IF EXISTS "service_role_all_redemptions" ON public.redemptions;
DROP POLICY IF EXISTS "service_role_all_reviews_feedback" ON public.reviews_feedback;
DROP POLICY IF EXISTS "service_role_all_reservations" ON public.reservations;
DROP POLICY IF EXISTS "service_role_all_fraud_alerts" ON public.fraud_alerts;

-- Public read-only catalog (non-PII): active merchants & active locations
CREATE POLICY "public_select_active_merchants"
  ON public.merchants FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "public_select_active_locations"
  ON public.locations FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- Merchant owner policy when Supabase Auth JWT is present
CREATE POLICY "merchant_owner_manage_merchants"
  ON public.merchants FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Strict service_role-only policies on all tables (anon & authenticated blocked on PII/auth/passes/audit)
CREATE POLICY "service_role_all_merchants" ON public.merchants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_locations" ON public.locations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_employees" ON public.employees FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_customers" ON public.customers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_wallet_passes" ON public.wallet_passes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_apple_registrations" ON public.apple_device_registrations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_transactions" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_redemptions" ON public.redemptions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_reviews_feedback" ON public.reviews_feedback FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_reservations" ON public.reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_fraud_alerts" ON public.fraud_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- 3. ATOMIC POS RPCs (ROW-LOCKED, MULTI-LOCATION, VIP DISCOUNT, SERVICE_ROLE ONLY)
-- ============================================================================

-- Drop legacy 7-arg overload so there is only one unambiguous signature
DROP FUNCTION IF EXISTS public.process_pos_scan(UUID, UUID, VARCHAR, VARCHAR, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION);

CREATE OR REPLACE FUNCTION public.process_pos_scan(
    p_merchant_id UUID,
    p_employee_id UUID,
    p_pass_serial_number VARCHAR(100),
    p_ticket_number VARCHAR(60),
    p_amount NUMERIC,
    p_scanner_lat DOUBLE PRECISION DEFAULT NULL,
    p_scanner_lng DOUBLE PRECISION DEFAULT NULL,
    p_location_id UUID DEFAULT NULL,
    p_stamps_to_add INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant RECORD;
    v_employee RECORD;
    v_customer_id UUID;
    v_pass RECORD;
    v_customer RECORD;
    v_last_tx RECORD;
    v_location RECORD;
    v_clean_ticket VARCHAR(60);
    v_ticket_lower TEXT;
    v_cooldown_interval INTERVAL;
    v_distance_meters DOUBLE PRECISION;
    v_discount_pct NUMERIC(5,2);
    v_original_amount NUMERIC(12,2);
    v_final_amount NUMERIC(12,2);
    v_new_stamps INT;
    v_new_visits INT;
    v_reward_ready BOOLEAN := false;
    v_tx_id UUID;
BEGIN
    v_clean_ticket := UPPER(TRIM(COALESCE(p_ticket_number, '')));
    v_ticket_lower := LOWER(v_clean_ticket);

    IF LENGTH(v_clean_ticket) < 2 THEN
        RAISE EXCEPTION 'INVALID_TICKET_NUMBER: El número de ticket es obligatorio';
    END IF;

    IF p_stamps_to_add IS NULL OR p_stamps_to_add < 1 OR p_stamps_to_add > 10 THEN
        RAISE EXCEPTION 'INVALID_STAMPS_AMOUNT: La cantidad de sellos debe estar entre 1 y 10';
    END IF;

    IF p_amount IS NULL OR p_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: El monto no puede ser negativo';
    END IF;

    -- 1. Validate active merchant
    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = p_merchant_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE_OR_NOT_FOUND';
    END IF;

    -- 2. Validate active employee belonging to merchant
    SELECT * INTO v_employee
    FROM public.employees
    WHERE id = p_employee_id
      AND merchant_id = p_merchant_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EMPLOYEE_INACTIVE_OR_NOT_FOUND';
    END IF;

    -- 3. Resolve pass owner without locking, then lock customer FIRST -> active passes ORDER BY id ASC -> target pass
    --    This strict lock ordering eliminates multi-pass (Apple + Google) deadlocks.
    SELECT customer_id INTO v_customer_id
    FROM public.wallet_passes
    WHERE pass_serial_number = p_pass_serial_number
      AND merchant_id = p_merchant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PASS_NOT_FOUND';
    END IF;

    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = v_customer_id
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
    END IF;

    -- Deterministically lock all active passes for this customer before reading/updating balances
    PERFORM 1
    FROM public.wallet_passes
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
      AND status = 'active'
    ORDER BY id ASC
    FOR UPDATE;

    SELECT * INTO v_pass
    FROM public.wallet_passes
    WHERE pass_serial_number = p_pass_serial_number
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PASS_NOT_FOUND';
    END IF;

    IF v_pass.status <> 'active' THEN
        RAISE EXCEPTION 'PASS_SUSPENDED_OR_REVOKED';
    END IF;

    -- 5. Case-insensitive, trimmed ticket deduplication BEFORE mutating state
    --    Note: Fraud alerts are persisted by the API layer via fraudAlertRepo.create() upon catching PosRpcError
    --    because PL/pgSQL rolls back DML executed prior to RAISE EXCEPTION.
    IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE merchant_id = p_merchant_id
          AND LOWER(TRIM(ticket_number)) = v_ticket_lower
    ) THEN
        RAISE EXCEPTION 'TICKET_ALREADY_USED: El ticket % ya fue canjeado previamente', v_clean_ticket;
    END IF;

    -- 6. Cooldown check
    v_cooldown_interval := make_interval(hours => v_merchant.cooldown_hours);
    SELECT * INTO v_last_tx
    FROM public.transactions
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_tx.id IS NOT NULL AND (now() - v_last_tx.created_at) < v_cooldown_interval THEN
        RAISE EXCEPTION 'COOLDOWN_ACTIVE: Espera % horas entre visitas', v_merchant.cooldown_hours;
    END IF;

    -- 7. Multi-location resolution & Geofence check
    IF p_location_id IS NOT NULL THEN
        SELECT * INTO v_location
        FROM public.locations
        WHERE id = p_location_id
          AND merchant_id = p_merchant_id
          AND is_active = true;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'LOCATION_NOT_FOUND: Sucursal inválida o inactiva';
        END IF;
    ELSIF p_scanner_lat IS NOT NULL AND p_scanner_lng IS NOT NULL THEN
        SELECT * INTO v_location
        FROM public.locations
        WHERE merchant_id = p_merchant_id
          AND is_active = true
        ORDER BY (point(longitude, latitude) <-> point(p_scanner_lng, p_scanner_lat))
        LIMIT 1;
    ELSE
        SELECT * INTO v_location
        FROM public.locations
        WHERE merchant_id = p_merchant_id
          AND is_active = true
        ORDER BY created_at ASC
        LIMIT 1;
    END IF;

    IF v_location.id IS NOT NULL AND p_scanner_lat IS NOT NULL AND p_scanner_lng IS NOT NULL THEN
        v_distance_meters := 6371000 * 2 * ASIN(LEAST(1.0, SQRT(
            POWER(SIN(RADIANS(p_scanner_lat - v_location.latitude) / 2), 2) +
            COS(RADIANS(v_location.latitude)) * COS(RADIANS(p_scanner_lat)) *
            POWER(SIN(RADIANS(p_scanner_lng - v_location.longitude) / 2), 2)
        )));

        IF v_distance_meters > v_merchant.scanner_geofence_meters THEN
            RAISE EXCEPTION 'GEOFENCE_BREACH: El escáner está a %m del local (límite %m)',
                ROUND(v_distance_meters::numeric), v_merchant.scanner_geofence_meters;
        END IF;
    END IF;

    -- 8. VIP discount computation
    v_discount_pct := COALESCE(v_customer.discount_percentage, 0);
    v_original_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
    v_final_amount := CASE
        WHEN v_discount_pct > 0 THEN ROUND((v_original_amount * (1 - v_discount_pct / 100.0))::numeric, 2)
        ELSE v_original_amount
    END;

    -- 9. Atomic balances, RFM update & persistence
    v_new_stamps := v_pass.current_stamps + p_stamps_to_add;
    v_new_visits := v_pass.total_visits + 1;
    v_reward_ready := v_new_stamps >= v_merchant.stamps_needed;

    INSERT INTO public.transactions (
        merchant_id,
        location_id,
        employee_id,
        customer_id,
        pass_id,
        ticket_number,
        amount,
        original_amount,
        discount_applied_percent,
        stamps_awarded,
        balance_after,
        client_latitude,
        client_longitude
    ) VALUES (
        p_merchant_id,
        v_location.id,
        p_employee_id,
        v_customer.id,
        v_pass.id,
        v_clean_ticket,
        v_final_amount,
        v_original_amount,
        NULLIF(v_discount_pct, 0),
        p_stamps_to_add,
        v_new_stamps,
        p_scanner_lat,
        p_scanner_lng
    ) RETURNING id INTO v_tx_id;

    UPDATE public.wallet_passes
    SET
        current_stamps = v_new_stamps,
        total_visits = v_new_visits,
        last_visit_at = now(),
        updated_at = now()
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
      AND status = 'active';

    UPDATE public.customers
    SET
        rfm_segment = CASE
            WHEN v_new_visits >= 8 THEN 'champion'::rfm_segment
            WHEN v_new_visits >= 4 THEN 'loyal'::rfm_segment
            ELSE rfm_segment
        END,
        updated_at = now()
    WHERE id = v_customer.id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'customer_id', v_customer.id,
        'customer_name', v_customer.full_name,
        'pass_id', v_pass.id,
        'pass_serial_number', v_pass.pass_serial_number,
        'pass_type', v_pass.pass_type,
        'location_id', v_location.id,
        'stamps_current', v_new_stamps,
        'stamps_needed', v_merchant.stamps_needed,
        'reward_ready', v_reward_ready,
        'reward_description', COALESCE(NULLIF(TRIM(v_customer.custom_reward), ''), v_merchant.reward_description),
        'custom_reward', v_customer.custom_reward,
        'loyalty_tier', v_customer.loyalty_tier,
        'ticket_number', v_clean_ticket,
        'original_amount', v_original_amount,
        'discount_applied_percent', v_discount_pct,
        'final_amount', v_final_amount
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_pos_scan(UUID, UUID, VARCHAR, VARCHAR, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_pos_scan(UUID, UUID, VARCHAR, VARCHAR, NUMERIC, DOUBLE PRECISION, DOUBLE PRECISION, UUID, INT) TO service_role;

-- Atomic Reward Redemption RPC
CREATE OR REPLACE FUNCTION public.redeem_reward(
    p_merchant_id UUID,
    p_pass_serial_number VARCHAR(100),
    p_manager_id UUID,
    p_stamps_to_deduct INT DEFAULT NULL,
    p_reward_name TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant RECORD;
    v_manager RECORD;
    v_customer_id UUID;
    v_pass RECORD;
    v_customer RECORD;
    v_stamps_to_deduct INT;
    v_new_stamps INT;
    v_new_redeemed INT;
    v_reward_name TEXT;
    v_new_tier TEXT;
    v_silver_min INT;
    v_gold_min INT;
    v_champion_min INT;
    v_redemption_id UUID;
BEGIN
    -- 1. Validate active merchant
    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = p_merchant_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE_OR_NOT_FOUND';
    END IF;

    -- 2. Validate active manager or admin belonging to merchant
    SELECT * INTO v_manager
    FROM public.employees
    WHERE id = p_manager_id
      AND merchant_id = p_merchant_id
      AND is_active = true
      AND role IN ('manager', 'admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_UNAUTHORIZED: Se requiere autorización activa de gerente o administrador';
    END IF;

    -- 3. Resolve pass owner without locking, then lock customer FIRST -> active passes ORDER BY id ASC -> target pass
    SELECT customer_id INTO v_customer_id
    FROM public.wallet_passes
    WHERE pass_serial_number = p_pass_serial_number
      AND merchant_id = p_merchant_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PASS_NOT_FOUND';
    END IF;

    SELECT * INTO v_customer
    FROM public.customers
    WHERE id = v_customer_id
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
    END IF;

    PERFORM 1
    FROM public.wallet_passes
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
      AND status = 'active'
    ORDER BY id ASC
    FOR UPDATE;

    SELECT * INTO v_pass
    FROM public.wallet_passes
    WHERE pass_serial_number = p_pass_serial_number
      AND merchant_id = p_merchant_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PASS_NOT_FOUND';
    END IF;

    IF v_pass.status <> 'active' THEN
        RAISE EXCEPTION 'PASS_SUSPENDED_OR_REVOKED';
    END IF;

    -- 5. Resolve stamps to deduct (default to merchant.stamps_needed)
    v_stamps_to_deduct := COALESCE(p_stamps_to_deduct, v_merchant.stamps_needed);
    IF v_stamps_to_deduct <= 0 THEN
        RAISE EXCEPTION 'INVALID_STAMPS_TO_DEDUCT';
    END IF;

    IF v_pass.current_stamps < v_stamps_to_deduct THEN
        RAISE EXCEPTION 'INSUFFICIENT_STAMPS: Se requieren % sellos (actuales: %)',
            v_stamps_to_deduct, v_pass.current_stamps;
    END IF;

    -- 6. Compute new balances and loyalty tier
    v_new_stamps := v_pass.current_stamps - v_stamps_to_deduct;
    v_new_redeemed := GREATEST(COALESCE(v_customer.total_rewards_redeemed, 0), COALESCE(v_pass.total_rewards_redeemed, 0)) + 1;
    v_reward_name := COALESCE(
        NULLIF(TRIM(p_reward_name), ''),
        NULLIF(TRIM(v_customer.custom_reward), ''),
        v_merchant.reward_description
    );

    v_silver_min := COALESCE((v_merchant.tier_config->>'silverMin')::int, 2);
    v_gold_min := COALESCE((v_merchant.tier_config->>'goldMin')::int, 5);
    v_champion_min := COALESCE((v_merchant.tier_config->>'championMin')::int, 10);

    v_new_tier := CASE
        WHEN v_new_redeemed >= v_champion_min THEN 'champion'
        WHEN v_new_redeemed >= v_gold_min THEN 'gold'
        WHEN v_new_redeemed >= v_silver_min THEN 'silver'
        ELSE 'bronze'
    END;

    -- 7. Update all active passes for customer
    UPDATE public.wallet_passes
    SET
        current_stamps = v_new_stamps,
        total_rewards_redeemed = v_new_redeemed,
        updated_at = now()
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
      AND status = 'active';

    -- 8. Update customer cumulative redemptions and tier
    UPDATE public.customers
    SET
        total_rewards_redeemed = v_new_redeemed,
        loyalty_tier = v_new_tier,
        updated_at = now()
    WHERE id = v_customer.id;

    -- 9. Record redemption audit row
    INSERT INTO public.redemptions (
        merchant_id,
        customer_id,
        employee_id,
        pass_id,
        stamps_deducted,
        reward_name,
        authorized_by_manager_id
    ) VALUES (
        p_merchant_id,
        v_customer.id,
        p_manager_id,
        v_pass.id,
        v_stamps_to_deduct,
        v_reward_name,
        p_manager_id
    ) RETURNING id INTO v_redemption_id;

    RETURN jsonb_build_object(
        'success', true,
        'redemption_id', v_redemption_id,
        'customer_id', v_customer.id,
        'customer_name', v_customer.full_name,
        'pass_id', v_pass.id,
        'pass_serial_number', v_pass.pass_serial_number,
        'pass_type', v_pass.pass_type,
        'reward_name', v_reward_name,
        'stamps_deducted', v_stamps_to_deduct,
        'stamps_remaining', v_new_stamps,
        'total_rewards_redeemed', v_new_redeemed,
        'loyalty_tier', v_new_tier
    );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_reward(UUID, VARCHAR, UUID, INT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_reward(UUID, VARCHAR, UUID, INT, TEXT) TO service_role;
