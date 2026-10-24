-- ============================================================================
-- DYNAMIND WALLET & RETENTION SUITE - DATABASE SCHEMA MIGRATION
-- Target: PostgreSQL 16 / Supabase
-- Security: Row Level Security (RLS) habilitado en el 100% de tablas
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
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABLA: LOCATIONS (Sedes y Geocercas de Proximidad)
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

-- 5. TABLA: EMPLOYEES (Personal y Cajeros con PIN)
CREATE TABLE IF NOT EXISTS public.employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    location_id UUID REFERENCES public.locations(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    pin_hash VARCHAR(255) NOT NULL,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_merchant_customer_phone UNIQUE (merchant_id, phone)
);

-- 7. TABLA: WALLET_PASSES (Tarjetas Digitales Apple & Google)
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
    stamps_awarded INT NOT NULL DEFAULT 1 CHECK (stamps_awarded >= 1),
    balance_after INT NOT NULL,
    client_latitude DOUBLE PRECISION,
    client_longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_merchant_ticket_number UNIQUE (merchant_id, ticket_number)
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

-- 13. TABLA: FRAUD_ALERTS (Auditoría y Detección de Anomalías)
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

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON public.customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_rfm ON public.customers(merchant_id, rfm_segment);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_serial ON public.wallet_passes(pass_serial_number);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_customer ON public.wallet_passes(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_merchant_created ON public.transactions(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservations_merchant_date ON public.reservations(merchant_id, date_time);

-- FUNCIÓN RPC ATÓMICA DE ESCANEO POS
CREATE OR REPLACE FUNCTION public.process_pos_scan(
    p_merchant_id UUID,
    p_employee_id UUID,
    p_pass_serial_number VARCHAR(100),
    p_ticket_number VARCHAR(60),
    p_amount NUMERIC,
    p_scanner_lat DOUBLE PRECISION DEFAULT NULL,
    p_scanner_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_merchant RECORD;
    v_pass RECORD;
    v_customer RECORD;
    v_last_tx RECORD;
    v_new_stamps INT;
    v_new_visits INT;
    v_location RECORD;
    v_distance_meters DOUBLE PRECISION;
    v_reward_ready BOOLEAN := false;
    v_tx_id UUID;
    v_cooldown_interval INTERVAL;
BEGIN
    SELECT * INTO v_merchant FROM public.merchants WHERE id = p_merchant_id AND is_active = true;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MERCHANT_INACTIVE_OR_NOT_FOUND';
    END IF;

    SELECT * INTO v_pass FROM public.wallet_passes 
    WHERE pass_serial_number = p_pass_serial_number AND merchant_id = p_merchant_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'PASS_NOT_FOUND';
    END IF;

    IF v_pass.status <> 'active' THEN
        RAISE EXCEPTION 'PASS_SUSPENDED_OR_REVOKED';
    END IF;

    SELECT * INTO v_customer FROM public.customers WHERE id = v_pass.customer_id;

    -- Cooldown check
    v_cooldown_interval := (v_merchant.cooldown_hours || ' hours')::interval;
    SELECT * INTO v_last_tx FROM public.transactions 
    WHERE customer_id = v_customer.id AND merchant_id = p_merchant_id
    ORDER BY created_at DESC LIMIT 1;

    IF v_last_tx.id IS NOT NULL AND (now() - v_last_tx.created_at) < v_cooldown_interval THEN
        INSERT INTO public.fraud_alerts (merchant_id, employee_id, customer_id, alert_type, severity, details)
        VALUES (
            p_merchant_id,
            p_employee_id,
            v_customer.id,
            'cooldown_violation',
            'medium',
            jsonb_build_object(
                'ticket_number', p_ticket_number,
                'last_tx_time', v_last_tx.created_at,
                'attempt_time', now(),
                'required_cooldown_hours', v_merchant.cooldown_hours
            )
        );
        RAISE EXCEPTION 'COOLDOWN_ACTIVE: Espera % horas entre visitas', v_merchant.cooldown_hours;
    END IF;

    -- Ticket deduplication check
    IF EXISTS (
        SELECT 1 FROM public.transactions 
        WHERE merchant_id = p_merchant_id AND ticket_number = p_ticket_number
    ) THEN
        INSERT INTO public.fraud_alerts (merchant_id, employee_id, customer_id, alert_type, severity, details)
        VALUES (
            p_merchant_id,
            p_employee_id,
            v_customer.id,
            'ticket_reused',
            'high',
            jsonb_build_object('ticket_number', p_ticket_number, 'attempted_by_employee', p_employee_id)
        );
        RAISE EXCEPTION 'TICKET_ALREADY_USED: El ticket % ya fue canjeado previamente', p_ticket_number;
    END IF;

    -- Geofence check
    IF p_scanner_lat IS NOT NULL AND p_scanner_lng IS NOT NULL THEN
        SELECT * INTO v_location FROM public.locations 
        WHERE merchant_id = p_merchant_id AND is_active = true 
        ORDER BY (point(longitude, latitude) <-> point(p_scanner_lng, p_scanner_lat)) LIMIT 1;

        IF v_location.id IS NOT NULL THEN
            v_distance_meters := 6371000 * 2 * ASIN(SQRT(
                POWER(SIN(RADIANS(p_scanner_lat - v_location.latitude) / 2), 2) +
                COS(RADIANS(v_location.latitude)) * COS(RADIANS(p_scanner_lat)) *
                POWER(SIN(RADIANS(p_scanner_lng - v_location.longitude) / 2), 2)
            ));

            IF v_distance_meters > v_merchant.scanner_geofence_meters THEN
                INSERT INTO public.fraud_alerts (merchant_id, employee_id, customer_id, alert_type, severity, details)
                VALUES (
                    p_merchant_id,
                    p_employee_id,
                    v_customer.id,
                    'geofence_breach',
                    'high',
                    jsonb_build_object(
                        'distance_meters', v_distance_meters,
                        'allowed_meters', v_merchant.scanner_geofence_meters,
                        'scanner_lat', p_scanner_lat,
                        'scanner_lng', p_scanner_lng
                    )
                );
                RAISE EXCEPTION 'GEOFENCE_BREACH: El escáner está a %m del local (límite %m)', ROUND(v_distance_meters::numeric), v_merchant.scanner_geofence_meters;
            END IF;
        END IF;
    END IF;

    -- New balances
    v_new_stamps := v_pass.current_stamps + 1;
    v_new_visits := v_pass.total_visits + 1;

    IF v_new_stamps >= v_merchant.stamps_needed THEN
        v_reward_ready := true;
    END IF;

    -- Insert transaction
    INSERT INTO public.transactions (
        merchant_id,
        location_id,
        employee_id,
        customer_id,
        pass_id,
        ticket_number,
        amount,
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
        p_ticket_number,
        p_amount,
        1,
        v_new_stamps,
        p_scanner_lat,
        p_scanner_lng
    ) RETURNING id INTO v_tx_id;

    -- Update passes
    UPDATE public.wallet_passes
    SET 
        current_stamps = v_new_stamps,
        total_visits = v_new_visits,
        last_visit_at = now(),
        updated_at = now()
    WHERE customer_id = v_customer.id AND merchant_id = p_merchant_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_tx_id,
        'customer_name', v_customer.full_name,
        'stamps_current', v_new_stamps,
        'stamps_needed', v_merchant.stamps_needed,
        'reward_ready', v_reward_ready,
        'reward_description', v_merchant.reward_description,
        'ticket_number', p_ticket_number
    );
END;
$$;
