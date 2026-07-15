-- ====================================================================
-- CHROME EXTENSION LICENSING & AUTH SYSTEM - POSTGRESQL MIGRATION SCRIPT
-- ====================================================================

-- Enable UUID extension if not present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_admin BOOLEAN DEFAULT FALSE,
  is_blocked BOOLEAN DEFAULT FALSE
);

-- 2. LICENSES TABLE
CREATE TABLE IF NOT EXISTS licenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key VARCHAR(100) UNIQUE NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('trial', 'monthly', 'lifetime')),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
  max_devices INT DEFAULT 1,
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. DEVICES TABLE
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  license_id UUID REFERENCES licenses(id) ON DELETE CASCADE,
  fingerprint VARCHAR(255) NOT NULL,
  device_name VARCHAR(100),
  last_heartbeat TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_online BOOLEAN DEFAULT FALSE,
  CONSTRAINT unique_license_device_fingerprint UNIQUE(license_id, fingerprint)
);

-- 4. ACTIVITY LOGS (AUDITING TELEMETRY)
CREATE TABLE IF NOT EXISTS activity_logs (
  id VARCHAR(100) PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  details TEXT NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45)
);

-- 5. UPLOADED FILES (EXTENSION FILES & ZIP RELEASES)
CREATE TABLE IF NOT EXISTS uploaded_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  url VARCHAR(512) NOT NULL,
  size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PUSH NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  target_license_id VARCHAR(100) NOT NULL DEFAULT 'all', -- 'all' or specific license UUID
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. EXTENSION RELEASES (VERSION CHECKS)
CREATE TABLE IF NOT EXISTS extension_releases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version VARCHAR(50) NOT NULL UNIQUE,
  notes TEXT,
  download_url VARCHAR(512) NOT NULL,
  min_chrome_version VARCHAR(50) DEFAULT '100',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ====================================================================
-- PERFORMANCE INDEXES
-- ====================================================================

-- Index for speedy logins and email uniqueness lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Index for license validation key searches
CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses (key);

-- Index for rapid user license listings
CREATE INDEX IF NOT EXISTS idx_licenses_user_id ON licenses (user_id);

-- Index for rapid heartbeat tracking and device fingerprint verifications
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint_license ON devices (license_id, fingerprint);

-- Index for sorting activity logs chronologically
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs (timestamp DESC);


-- ====================================================================
-- DEFAULT SEEDS (PASSWORD HASHES CORRESPOND TO "admin123" and "user123")
-- ====================================================================

-- Insert default admin user (email: admin@admin.com, pass: admin123)
INSERT INTO users (id, email, password_hash, is_admin, is_blocked)
VALUES (
  '11111111-1111-4111-a111-111111111111',
  'admin@admin.com',
  '$2a$10$f3rX6rshYfDlybYn.q1MKOiKjZit.A360oCOfHw/p0k16vMvjD6kS', -- Bcrypt for 'admin123'
  TRUE,
  FALSE
) ON CONFLICT (email) DO NOTHING;

-- Insert default customer user (email: user@user.com, pass: user123)
INSERT INTO users (id, email, password_hash, is_admin, is_blocked)
VALUES (
  '22222222-2222-4222-a222-222222222222',
  'user@user.com',
  '$2a$10$L.6IuG1o4z1oREyZ2b9rEeGv8PqC9XQ5eD37SOnYqgVp7Y0Wv0ZcO', -- Bcrypt for 'user123'
  FALSE,
  FALSE
) ON CONFLICT (email) DO NOTHING;

-- Insert a trial license key (Key: LIC-TRIAL-8888-8888)
INSERT INTO licenses (id, user_id, key, type, status, max_devices, expires_at)
VALUES (
  '11111111-0000-0000-0000-111111111111',
  '22222222-2222-4222-a222-222222222222',
  'LIC-TRIAL-8888-8888',
  'trial',
  'active',
  1,
  NOW() + INTERVAL '7 days'
) ON CONFLICT (key) DO NOTHING;

-- Insert a monthly premium license key (Key: LIC-MONT-9999-9999)
INSERT INTO licenses (id, user_id, key, type, status, max_devices, expires_at)
VALUES (
  '22222222-0000-0000-0000-222222222222',
  '22222222-2222-4222-a222-222222222222',
  'LIC-MONT-9999-9999',
  'monthly',
  'active',
  3,
  NOW() + INTERVAL '30 days'
) ON CONFLICT (key) DO NOTHING;
