-- Add geolocation and security flag columns to user_sessions\nALTER TABLE user_sessions\n  ADD COLUMN IF NOT EXISTS ip_city TEXT,\n  ADD COLUMN IF NOT EXISTS ip_region TEXT,\n  ADD COLUMN IF NOT EXISTS ip_country TEXT,\n  ADD COLUMN IF NOT EXISTS ip_country_code TEXT,\n  ADD COLUMN IF NOT EXISTS ip_isp TEXT,\n  ADD COLUMN IF NOT EXISTS ip_timezone TEXT,\n  ADD COLUMN IF NOT EXISTS ip_is_proxy BOOLEAN,\n  ADD COLUMN IF NOT EXISTS ip_is_hosting BOOLEAN,\n  ADD COLUMN IF NOT EXISTS ip_is_mobile BOOLEAN,\n  ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,\n  ADD COLUMN IF NOT EXISTS flag_reasons TEXT[],\n  ADD COLUMN IF NOT EXISTS flag_severity TEXT,\n  ADD COLUMN IF NOT EXISTS flag_reviewed_at TIMESTAMPTZ,\n  ADD COLUMN IF NOT EXISTS flag_reviewed_by UUID REFERENCES profiles(id)

\n\n-- Index for efficient security dashboard queries\nCREATE INDEX IF NOT EXISTS idx_user_sessions_flagged\n  ON user_sessions (organization_id, is_flagged, session_start)

\n
