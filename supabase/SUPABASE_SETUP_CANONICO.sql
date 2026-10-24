-- ============================================================================
-- FIDELIZIA · NATIVE WALLET SUITE - SQL SETUP COMPLETO PARA SUPABASE
-- Base de Datos: PostgreSQL 15 / 16 (Supabase)
-- Seguridad: Row Level Security (RLS) + Antifraude Criptográfico
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
    user_id UUID,
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
-- ÍNDICES DE RENDIMIENTO
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_merchants_slug ON public.merchants(slug);
CREATE INDEX IF NOT EXISTS idx_customers_merchant ON public.customers(merchant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_serial ON public.wallet_passes(pass_serial_number);
CREATE INDEX IF NOT EXISTS idx_wallet_passes_customer ON public.wallet_passes(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON public.transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_ticket ON public.transactions(ticket_number);

-- ============================================================================
-- HABILITACIÓN DE ROW LEVEL SECURITY (RLS)
-- ============================================================================
ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_alerts ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS DE ACCESO PÚBLICO (ANON) PARA REGISTRO Y CONSULTA DE TARJETAS
CREATE POLICY "Permitir lectura publica de comercios activos" 
ON public.merchants FOR SELECT USING (is_active = true);

CREATE POLICY "Permitir lectura publica de ubicaciones activas" 
ON public.locations FOR SELECT USING (is_active = true);

CREATE POLICY "Permitir registro publico de clientes" 
ON public.customers FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir consulta publica de clientes por telefono" 
ON public.customers FOR SELECT USING (true);

CREATE POLICY "Permitir registro publico de pases" 
ON public.wallet_passes FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura publica de pases activos" 
ON public.wallet_passes FOR SELECT USING (status = 'active');

CREATE POLICY "Permitir actualizacion de pases por backend o servicio" 
ON public.wallet_passes FOR UPDATE USING (true);

CREATE POLICY "Permitir insercion de transacciones" 
ON public.transactions FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir lectura de transacciones" 
ON public.transactions FOR SELECT USING (true);

CREATE POLICY "Permitir lectura de empleados activos" 
ON public.employees FOR SELECT USING (is_active = true);

CREATE POLICY "Permitir alertas de fraude" 
ON public.fraud_alerts FOR INSERT WITH CHECK (true);

-- ============================================================================
-- DATOS SEMILLA CANÓNICOS: CAFÉ CANELO & SPECIALTY ROASTERS
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

INSERT INTO public.employees (
    id, merchant_id, location_id, name, pin_hash, role, is_active
) VALUES 
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Santiago Barista (Caja)', '1234', 'cashier', true),
    ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'Laura Gerente (Canjes)', '9999', 'manager', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.customers (
    id, merchant_id, phone, full_name, rfm_segment
) VALUES (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    '+573001234567',
    'Carlos Mendoza',
    'champion'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.wallet_passes (
    id, customer_id, merchant_id, pass_type, pass_serial_number, authentication_token, current_stamps, total_visits, status
) VALUES (
    '00000000-0000-0000-0000-000000000006',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'google',
    'PASS-CANELO-001',
    'auth-token-canelo-001',
    8,
    24,
    'active'
) ON CONFLICT (id) DO NOTHING;
