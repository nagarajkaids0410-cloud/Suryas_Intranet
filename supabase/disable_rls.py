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

tables = [
    'users', 'attendance_records', 'tasks', 'requests', 'circulars',
    'company_ledger_transactions', 'company_ledger_summary', 'notifications',
    'audit_logs', 'guest_inquiries', 'guest_activities', 'events',
    'retention_config', 'retention_workflow'
]

print("[*] Disabling RLS and granting permissions on all tables...")
for t in tables:
    cur.execute(f'ALTER TABLE "{t}" DISABLE ROW LEVEL SECURITY;')
    cur.execute(f'GRANT ALL ON TABLE "{t}" TO anon, authenticated, service_role;')

cur.execute('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;')
cur.execute('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;')

print("[+] All tables now accessible directly via Supabase API!")
conn.close()
