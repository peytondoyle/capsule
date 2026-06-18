-- Grant API access to capsule schema
-- Required for PostgREST to access the schema

-- Grant usage on schema to API roles
GRANT USAGE ON SCHEMA capsule TO anon, authenticated, service_role;

-- Grant access to all tables in capsule schema
GRANT ALL ON ALL TABLES IN SCHEMA capsule TO anon, authenticated, service_role;

-- Grant access to all sequences (for auto-increment if any)
GRANT ALL ON ALL SEQUENCES IN SCHEMA capsule TO anon, authenticated, service_role;

-- Grant execute on all functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA capsule TO anon, authenticated, service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA capsule
GRANT ALL ON TABLES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA capsule
GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA capsule
GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
