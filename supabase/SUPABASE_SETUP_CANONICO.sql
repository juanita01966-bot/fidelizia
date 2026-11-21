-- ============================================================================
-- FIDELIZIA · NATIVE WALLET SUITE - SQL SETUP COMPLETO PARA SUPABASE
-- Base de Datos: PostgreSQL 15 / 16 (Supabase)
-- Seguridad: Row Level Security (RLS) + Antifraude Criptográfico + RPCs Atómicas
-- ============================================================================

-- 1. EXTENSIONES CRIPTOGRÁFICAS Y GEODÉSICAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. TIPOS ENUMERADOS
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employee_role') THEN
        CREATE TYPE employee_role AS ENUM ('cashier', 'manager', 'admin');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pass_type') THEN
        CREATE TYPE pass_type AS ENUM ('apple', 'google');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pass_status') THEN
        CREATE TYPE pass_status AS ENUM ('active', 'suspended', 'revoked');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reservation_status') THEN
        CREATE TYPE reservation_status AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_alert_type') THEN
        CREATE TYPE fraud_alert_type AS ENUM (
            'cooldown_violation',
            'ticket_reused',
            'outside_operating_hours',
            'geofence_breach',
            'employee_collusion',
            'abnormal_velocity'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fraud_severity') THEN
        CREATE TYPE fraud_severity AS ENUM ('low', 'medium', 'high', 'critical');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'rfm_segment') THEN
        CREATE TYPE rfm_segment AS ENUM ('champion', 'loyal', 'at_risk', 'hibernating', 'new');
    END IF;
END $$;

-- 3. TABLA: MERCHANTS (Comercios Suscritos)
CREATE TABLE IF NOT EXISTS public.merchants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    logo_url TEXT,
    brand_color VARCHAR(9) NOT NULL DEFAULT '#8b5cf6',
    secondary_color VARCHAR(9) NOT NULL DEFAULT '#09090b',
    google_place_id VARCHAR(255),
    stamps_needed INT NOT NULL DEFAULT 10 CHECK (stamps_needed > 0 AND stamps_needed <= 30),
    reward_description TEXT NOT NULL DEFAULT 'Bebida de cortesía o postre especial',
    cooldown_hours INT NOT NULL DEFAULT 3 CHECK (cooldown_hours >= 1 AND cooldown_hours <= 48),
    scanner_geofence_meters INT NOT NULL DEFAULT 150 CHECK (scanner_geofence_meters >= 20 AND scanner_geofence_meters <= 5000),
    opening_hours JSONB NOT NULL DEFAULT '{
        "monday": {"open": "08:00", "close": "22:00", "closed": false},
        "tuesday": {"open": "08:00", "close": "22:00", "closed": false},
        "wednesday": {"open": "08:00", "close": "22:00", "closed": false},
        "thursday": {"open": "08:00", "close": "22:00", "closed": false},
        "friday": {"open": "08:00", "close": "23:59", "closed": false},
        "saturday": {"open": "09:00", "close": "23:59", "closed": false},
        "sunday": {"open": "09:00", "close": "20:00", "closed": false}
    }'::jsonb,
    tier_config JSONB NOT NULL DEFAULT '{"bronzeMin":0,"silverMin":2,"goldMin":5,"championMin":10}'::jsonb,
    preconfigured_rewards JSONB NOT NULL DEFAULT '["Café Americano de Especialidad (Cortesía)","Galleta Artesanal de Avena & Canela","Doble Sello de Bonificación en Próxima Visita"]'::jsonb,
    card_pattern TEXT NOT NULL DEFAULT 'guilloche' CHECK (card_pattern IN ('guilloche','grid_matrix','brushed_titanium','luxury_filigree','carbon_fiber')),
    show_emv_chip BOOLEAN NOT NULL DEFAULT true,
    show_hologram BOOLEAN NOT NULL DEFAULT true,
    loyalty_program_mode TEXT NOT NULL DEFAULT 'multi_tier' CHECK (loyalty_program_mode IN ('multi_tier','single_card')),
    card_morphology TEXT NOT NULL DEFAULT 'orthogonal' CHECK (card_morphology IN ('rounded','orthogonal','chamfered','cutout')),
    card_gradient JSONB NOT NULL DEFAULT '{"preset":"roasted_gold","from":"#241407","via":"#140b04","to":"#080402","angle":180}'::jsonb,
    reward_milestones JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABLA: LOCATIONS (Sedes y Geocercas)
CREATE TABLE IF NOT EXISTS public.locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    address TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    radius_meters INT NOT NULL DEFAULT 100 CHECK (radius_meters >= 30 AND radius_meters <= 1000),
    relevant_text VARCHAR(160) NOT NULL DEFAULT '¡Estás cerca! Pasa por tu local favorito y suma tu sello de hoy',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. TABLA: EMPLOYEES (Personal y Cajeros con PIN/Contraseña Hasheados)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(80),
    email VARCHAR(160),
    pin_hash VARCHAR(255) NOT NULL,
    password_hash TEXT,
    dsb_password_hash TEXT,
    role employee_role NOT NULL DEFAULT 'cashier',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TABLA: CUSTOMERS (Clientes Finales)
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    birthdate DATE,
    terms_accepted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    rfm_segment rfm_segment NOT NULL DEFAULT 'new',
    custom_reward TEXT,
    discount_percentage NUMERIC(5,2) CHECK (discount_percentage IS NULL OR (discount_percentage >= 0 AND discount_percentage <= 100)),
    loyalty_tier TEXT NOT NULL DEFAULT 'bronze' CHECK (loyalty_tier IN ('bronze','silver','gold','champion')),
    total_rewards_redeemed INT NOT NULL DEFAULT 0 CHECK (total_rewards_redeemed >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_merchant_customer_phone UNIQUE (merchant_id, phone)
);

-- 7. TABLA: WALLET_PASSES (Pases de Apple & Google Wallet)
CREATE TABLE IF NOT EXISTS public.wallet_passes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    pass_type pass_type NOT NULL,
    pass_serial_number VARCHAR(100) NOT NULL UNIQUE,
    push_token TEXT,
    authentication_token VARCHAR(100) NOT NULL,
    current_stamps INT NOT NULL DEFAULT 0 CHECK (current_stamps >= 0),
    total_visits INT NOT NULL DEFAULT 0 CHECK (total_visits >= 0),
    total_rewards_redeemed INT NOT NULL DEFAULT 0 CHECK (total_rewards_redeemed >= 0),
    last_visit_at TIMESTAMPTZ,
    last_push_title TEXT,
    last_push_message TEXT,
    last_push_at TIMESTAMPTZ,
    push_count_24h INT NOT NULL DEFAULT 0 CHECK (push_count_24h >= 0),
    push_window_reset_at TIMESTAMPTZ,
    status pass_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_customer_pass_type UNIQUE (customer_id, pass_type)
);

-- 8. TABLA: APPLE_DEVICE_REGISTRATIONS (Protocolo REST Apple PassKit)
CREATE TABLE IF NOT EXISTS public.apple_device_registrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_library_identifier VARCHAR(150) NOT NULL,
    push_token VARCHAR(255) NOT NULL,
    pass_type_identifier VARCHAR(150) NOT NULL,
    serial_number VARCHAR(100) NOT NULL REFERENCES public.wallet_passes(pass_serial_number) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_device_pass UNIQUE (device_library_identifier, serial_number)
);

-- 9. TABLA: TRANSACTIONS (Registro de Visitas y Facturas)
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    employee_id UUID NOT NULL REFERENCES public.employees(id),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    pass_id UUID NOT NULL REFERENCES public.wallet_passes(id) ON DELETE CASCADE,
    ticket_number VARCHAR(60) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    original_amount NUMERIC(12, 2),
    discount_applied_percent NUMERIC(5, 2),
    stamps_awarded INT NOT NULL DEFAULT 1 CHECK (stamps_awarded >= 1),
    balance_after INT NOT NULL,
    client_latitude DOUBLE PRECISION,
    client_longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. TABLA: REDEMPTIONS (Canjes de Recompensas)
CREATE TABLE IF NOT EXISTS public.redemptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.employees(id),
    pass_id UUID NOT NULL REFERENCES public.wallet_passes(id) ON DELETE CASCADE,
    stamps_deducted INT NOT NULL,
    reward_name TEXT NOT NULL,
    authorized_by_manager_id UUID REFERENCES public.employees(id),
    redeemed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. TABLA: REVIEWS_FEEDBACK (Review Gate Inteligente)
CREATE TABLE IF NOT EXISTS public.reviews_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comments TEXT,
    is_public_redirect BOOLEAN NOT NULL DEFAULT false,
    manager_contacted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 12. TABLA: RESERVATIONS (Motor de Reservas Sincronizado)
CREATE TABLE IF NOT EXISTS public.reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    date_time TIMESTAMPTZ NOT NULL,
    guests_count INT NOT NULL DEFAULT 2 CHECK (guests_count >= 1 AND guests_count <= 50),
    status reservation_status NOT NULL DEFAULT 'confirmed',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 13. TABLA: FRAUD_ALERTS (Auditoría de Seguridad)
CREATE TABLE IF NOT EXISTS public.fraud_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    alert_type fraud_alert_type NOT NULL,
    severity fraud_severity NOT NULL DEFAULT 'medium',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- ÍNDICES DE RENDIMIENTO Y RESTRICCIONES ÚNICAS
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
CREATE INDEX IF NOT EXISTS idx_locations_merchant_active ON public.locations(merchant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_employees_merchant_active ON public.employees(merchant_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_merchant_username
    ON public.employees (merchant_id, LOWER(username)) WHERE username IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_merchant_email
    ON public.employees (merchant_id, LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON public.customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_rfm ON public.customers(merchant_id, rfm_segment);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_serial ON public.wallet_passes(pass_serial_number);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_customer ON public.wallet_passes(customer_id);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_merchant_status ON public.wallet_passes(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_apple_reg_device_pass_type
    ON public.apple_device_registrations (device_library_identifier, pass_type_identifier);
CREATE INDEX IF NOT EXISTS idx_apple_reg_serial ON public.apple_device_registrations(serial_number);
CREATE INDEX IF NOT EXISTS idx_apple_reg_push_token ON public.apple_device_registrations(push_token);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ticket ON public.transactions(ticket_number);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_created ON public.transactions(merchant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ticket_normalized
    ON public.transactions (merchant_id, LOWER(TRIM(ticket_number)));
CREATE INDEX IF NOT EXISTS idx_redemptions_merchant_date ON public.redemptions(merchant_id, redeemed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_merchant_date ON public.reviews_feedback(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_merchant_date ON public.reservations(merchant_id, date_time);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_merchant_resolved ON public.fraud_alerts(merchant_id, is_resolved, created_at DESC);

-- ============================================================================
-- HABILITACIÓN ESTRICTA DE ROW LEVEL SECURITY (100% DE TABLAS)
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

-- Catálogo público de solo lectura (sin PII): comercios activos y sedes activas
CREATE POLICY "public_select_active_merchants"
    ON public.merchants FOR SELECT TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "public_select_active_locations"
    ON public.locations FOR SELECT TO anon, authenticated
    USING (is_active = true);

CREATE POLICY "merchant_owner_manage_merchants"
    ON public.merchants FOR ALL TO authenticated
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- Políticas estrictas solo para service_role en todas las tablas sensibles/PII/auth/pases/auditoría
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
-- FUNCIONES RPC ATÓMICAS DE POS (ROW LOCKS + MULTISEDE + DESCUENTO VIP)
-- ============================================================================
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

    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = p_merchant_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE_OR_NOT_FOUND';
    END IF;

    SELECT * INTO v_employee
    FROM public.employees
    WHERE id = p_employee_id
      AND merchant_id = p_merchant_id
      AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EMPLOYEE_INACTIVE_OR_NOT_FOUND';
    END IF;

    -- Resolve pass owner without locking, then lock customer FIRST -> active passes ORDER BY id ASC -> target pass
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

    -- Fraud alerts are persisted by the API layer via fraudAlertRepo.create() upon catching PosRpcError
    IF EXISTS (
        SELECT 1 FROM public.transactions
        WHERE merchant_id = p_merchant_id
          AND LOWER(TRIM(ticket_number)) = v_ticket_lower
    ) THEN
        RAISE EXCEPTION 'TICKET_ALREADY_USED: El ticket % ya fue canjeado previamente', v_clean_ticket;
    END IF;

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

    v_discount_pct := COALESCE(v_customer.discount_percentage, 0);
    v_original_amount := ROUND(COALESCE(p_amount, 0)::numeric, 2);
    v_final_amount := CASE
        WHEN v_discount_pct > 0 THEN ROUND((v_original_amount * (1 - v_discount_pct / 100.0))::numeric, 2)
        ELSE v_original_amount
    END;

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
    SELECT * INTO v_merchant
    FROM public.merchants
    WHERE id = p_merchant_id AND is_active = true;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE_OR_NOT_FOUND';
    END IF;

    SELECT * INTO v_manager
    FROM public.employees
    WHERE id = p_manager_id
      AND merchant_id = p_merchant_id
      AND is_active = true
      AND role IN ('manager', 'admin');

    IF NOT FOUND THEN
        RAISE EXCEPTION 'MANAGER_UNAUTHORIZED: Se requiere autorización activa de gerente o administrador';
    END IF;

    -- Resolve pass owner without locking, then lock customer FIRST -> active passes ORDER BY id ASC -> target pass
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

    v_stamps_to_deduct := COALESCE(p_stamps_to_deduct, v_merchant.stamps_needed);
    IF v_stamps_to_deduct <= 0 THEN
        RAISE EXCEPTION 'INVALID_STAMPS_TO_DEDUCT';
    END IF;

    IF v_pass.current_stamps < v_stamps_to_deduct THEN
        RAISE EXCEPTION 'INSUFFICIENT_STAMPS: Se requieren % sellos (actuales: %)',
            v_stamps_to_deduct, v_pass.current_stamps;
    END IF;

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

    UPDATE public.wallet_passes
    SET
        current_stamps = v_new_stamps,
        total_rewards_redeemed = v_new_redeemed,
        updated_at = now()
    WHERE customer_id = v_customer.id
      AND merchant_id = p_merchant_id
      AND status = 'active';

    UPDATE public.customers
    SET
        total_rewards_redeemed = v_new_redeemed,
        loyalty_tier = v_new_tier,
        updated_at = now()
    WHERE id = v_customer.id;

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

-- ============================================================================
-- DATOS SEMILLA CANÓNICOS: CAFÉ CANELO & SPECIALTY ROASTERS (PINs bcrypt $2b$10$)
-- ============================================================================
INSERT INTO public.merchants (
    id, name, slug, logo_url, brand_color, secondary_color, stamps_needed, reward_description, cooldown_hours, scanner_geofence_meters
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Café Canelo & Specialty Roasters',
    'cafe-canelo',
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=500&auto=format&fit=crop&q=80',
    '#8b5cf6',
    '#09090b',
    10,
    'Café de Especialidad + Croissant de Almendras',
    3,
    250
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.locations (
    id, merchant_id, name, address, latitude, longitude, radius_meters, relevant_text
) VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Sede Chapinero Alto',
    'Calle 85 # 11-53, Bogotá, Colombia',
    4.6682,
    -74.0538,
    150,
    '¡Estás en Café Canelo! Pasa por la barra y suma tu sello del día.'
) ON CONFLICT (id) DO NOTHING;

-- Seed PINs hashed with bcrypt ($2b$10$): Santiago = '1234', Laura = '9999' (dev/demo seed only; rotate in production)
INSERT INTO public.employees (
    id, merchant_id, location_id, name, username, pin_hash, role, is_active
) VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Santiago Barista (Caja)', 'santiago', '$2b$10$8oKtt1z/cHkPaPjbi.L1p.QnYabL0414.JT5CQX3KIr/kkot/8u7G', 'cashier', true),
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Laura Gerente (Canjes)', 'laura', '$2b$10$ZHm.8VF9Tnl7F/qYOUMXouQx39/WMxBVgfTMfFdq2QQEBnNNO6Wea', 'manager', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers (
    id, merchant_id, phone, full_name, rfm_segment, loyalty_tier, total_rewards_redeemed
) VALUES (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '+573001234567',
    'Carlos Mendoza',
    'champion',
    'gold',
    2
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wallet_passes (
    id, customer_id, merchant_id, pass_type, pass_serial_number, authentication_token, current_stamps, total_visits, total_rewards_redeemed, status
) VALUES (
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'google',
    'PASS-CANELO-001',
    'auth-token-canelo-001',
    8,
    24,
    2,
    'active'
) ON CONFLICT (id) DO NOTHING;
