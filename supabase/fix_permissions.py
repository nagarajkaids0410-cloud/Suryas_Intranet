import psycopg2
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def load_env():
    candidates = [
        os.path.join(BASE_DIR, ".env"),
        os.path.join(BASE_DIR, "suryas-mib-portal", ".env")
    ]
    env_vars = {}
    for c in candidates:
        if os.path.exists(c):
            with open(c, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        env_vars[k.strip()] = v.strip().strip('"').strip("'")
    return env_vars

env = load_env()
db_url = env.get("DATABASE_URL")

print("[*] Connecting to Supabase...")
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
-- 1. Grant schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 4. Recreate RLS policies with explicit TO public
DO $$ 
DECLARE
    tbl text;
    tables text[] := ARRAY[
        'users', 'attendance_records', 'tasks', 'requests', 'circulars',
        'company_ledger_transactions', 'company_ledger_summary', 'notifications',
        'audit_logs', 'guest_inquiries', 'guest_activities', 'events',
        'retention_config', 'retention_workflow'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all operations for %I" ON %I;', tbl, tbl);
        EXECUTE format('CREATE POLICY "Allow all operations for %I" ON %I FOR ALL TO public USING (true) WITH CHECK (true);', tbl, tbl);
    END LOOP;
END $$;
"""

print("[*] Applying permissions and RLS policies...")
cur.execute(sql)
print("[+] Permissions and policies successfully updated!")
conn.close()
