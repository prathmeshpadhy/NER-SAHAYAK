-- =============================================================================
-- NER-Sahayak: Supabase PostgreSQL Database Schema
-- Multi-Modal Logistics & Accessibility Intelligence Platform for North East India
-- =============================================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. PROFILES (Users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('driver', 'field', 'logistics', 'official')),
  organisation TEXT,
  vehicle_number TEXT,
  state TEXT,
  district TEXT,
  language TEXT DEFAULT 'en',
  hub TEXT,
  department TEXT,
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. DRIVERS (10 Roster Drivers)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  vehicle_number TEXT NOT NULL,
  cargo_type TEXT,
  experience_years INTEGER DEFAULT 5,
  status TEXT DEFAULT 'available' CHECK(status IN ('available', 'active', 'on_leave', 'offline')),
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. LOGISTICS OPERATORS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS logistics_operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  organisation TEXT NOT NULL,
  hub TEXT NOT NULL,
  state TEXT,
  district TEXT,
  designation TEXT DEFAULT 'Logistics Manager',
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. FIELD OFFICERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS field_officers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  designation TEXT DEFAULT 'Field Inspector',
  department TEXT DEFAULT 'PWD / Disaster Management',
  state TEXT,
  district TEXT,
  assigned_area TEXT,
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. VEHICLES (Fleet tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  vehicle_number TEXT NOT NULL,
  vehicle_type TEXT DEFAULT 'Medium Truck' CHECK(vehicle_type IN ('Heavy Truck', 'Medium Truck', 'Refrigerated Truck', 'Container Truck', 'Tanker', 'Mini Truck')),
  cargo_type TEXT DEFAULT 'General cargo',
  capacity_tonnes NUMERIC DEFAULT 10.0,
  origin_node TEXT,
  destination_node TEXT,
  status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle', 'in_transit', 'loading', 'delayed', 'maintenance', 'completed')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. SHIPMENTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE CASCADE,
  origin_node TEXT NOT NULL,
  destination_node TEXT NOT NULL,
  cargo_type TEXT DEFAULT 'General cargo' CHECK(cargo_type IN ('General', 'Perishable', 'Pharmaceutical', 'Emergency Supplies', 'High Value', 'Heavy Cargo', 'General cargo', 'Medical supplies', 'Essential Grains & Ration', 'Oil & Petroleum Distillates', 'Agricultural Freight', 'Cold Storage Vaccines', 'Heavy Infrastructure Materials', 'Tea Export Cargo', 'Emergency Disaster Relief Supplies', 'Hardware & Machinery Parts', 'Border Security & Ration Freight')),
  weight NUMERIC DEFAULT 100,
  priority TEXT DEFAULT 'normal' CHECK(priority IN ('normal', 'high', 'urgent', 'emergency', 'Normal', 'High', 'Urgent', 'Emergency')),
  temperature_requirement TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned', 'assigned', 'loading', 'in_transit', 'delayed', 'delivered', 'cancelled')),
  route_json JSONB,
  eta_minutes INTEGER,
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. INCIDENTS (Field Reports & Driver Incidents)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reporter_role TEXT NOT NULL CHECK(reporter_role IN ('driver', 'field', 'logistics', 'official', 'system')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK(category IN ('road_blockage', 'landslide', 'flood', 'bridge_damage', 'accident', 'vehicle_breakdown', 'traffic', 'poor_road_condition', 'weather_hazard', 'visibility_problem', 'infrastructure_damage', 'fuel_problem', 'cargo_delay', 'road_block', 'other')),
  severity TEXT NOT NULL DEFAULT 'minor' CHECK(severity IN ('minor', 'moderate', 'major', 'critical', 'low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'reported' CHECK(status IN ('reported', 'under_review', 'verified', 'active', 'resolved', 'open', 'in_progress')),
  state TEXT,
  district TEXT,
  node_id TEXT,
  road TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  affected_modes TEXT[] DEFAULT ARRAY['road'],
  estimated_delay_minutes INTEGER DEFAULT 0,
  photo_url TEXT,
  gps_accuracy DOUBLE PRECISION,
  source TEXT DEFAULT 'manual',
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT
);

-- -----------------------------------------------------------------------------
-- 8. INCIDENT UPDATES (Operational Lifecycle Tracking)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. ALERTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  tone TEXT DEFAULT 'amber',
  icon TEXT DEFAULT 'bell',
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  node_id TEXT,
  road TEXT,
  severity TEXT DEFAULT 'minor',
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_demo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 10. ROUTE REQUESTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  origin_node TEXT NOT NULL,
  destination_node TEXT NOT NULL,
  mode TEXT DEFAULT 'all',
  cargo_type TEXT DEFAULT 'General cargo',
  priority TEXT DEFAULT 'normal',
  requested_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 11. ROUTE RESULTS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS route_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID REFERENCES route_requests(id) ON DELETE CASCADE,
  route_json JSONB NOT NULL,
  total_km NUMERIC,
  eta_minutes INTEGER,
  safety_index INTEGER,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 12. ACTIVITY LOGS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_state ON incidents(state);
CREATE INDEX IF NOT EXISTS idx_incidents_district ON incidents(district);
CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_status ON vehicles(status);
CREATE INDEX IF NOT EXISTS idx_vehicles_owner ON vehicles(owner_id);
CREATE INDEX IF NOT EXISTS idx_shipments_status ON shipments(status);
CREATE INDEX IF NOT EXISTS idx_shipments_driver ON shipments(driver_id);
CREATE INDEX IF NOT EXISTS idx_shipments_created_by ON shipments(created_by);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Note: The Express backend operates with the Supabase Service Role key which
-- automatically bypasses RLS for controlled, authenticated server-side execution.
-- The policies below enable standard authenticated access where appropriate.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_role_all_profiles') THEN
    CREATE POLICY service_role_all_profiles ON profiles FOR ALL USING (true);
    CREATE POLICY service_role_all_drivers ON drivers FOR ALL USING (true);
    CREATE POLICY service_role_all_logistics ON logistics_operators FOR ALL USING (true);
    CREATE POLICY service_role_all_field ON field_officers FOR ALL USING (true);
    CREATE POLICY service_role_all_vehicles ON vehicles FOR ALL USING (true);
    CREATE POLICY service_role_all_shipments ON shipments FOR ALL USING (true);
    CREATE POLICY service_role_all_incidents ON incidents FOR ALL USING (true);
    CREATE POLICY service_role_all_incident_updates ON incident_updates FOR ALL USING (true);
    CREATE POLICY service_role_all_alerts ON alerts FOR ALL USING (true);
    CREATE POLICY service_role_all_route_requests ON route_requests FOR ALL USING (true);
    CREATE POLICY service_role_all_route_results ON route_results FOR ALL USING (true);
    CREATE POLICY service_role_all_activity_logs ON activity_logs FOR ALL USING (true);
  END IF;
END $$;

-- =============================================================================
-- STORAGE BUCKET SETUP SCRIPT (Run in Supabase SQL editor if bucket not present)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('incident-photos', 'incident-photos', true)
ON CONFLICT (id) DO NOTHING;
