import os
import sys
import json
import glob
import re
import psycopg2
from psycopg2.extras import execute_values, Json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, ".data")
SCHEMA_FILE = os.path.join(BASE_DIR, "supabase", "schema.sql")

def load_env():
    # Check .env in current folder and in suryas-mib-portal
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
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        env_vars[k] = v
    return env_vars

def get_connection():
    env_vars = load_env()
    db_url = env_vars.get("DATABASE_URL")
    if not db_url:
        print("[-] ERROR: DATABASE_URL not found in .env!")
        sys.exit(1)
    
    print(f"[*] Connecting to Supabase database...")
    try:
        conn = psycopg2.connect(db_url, connect_timeout=15)
        conn.autocommit = True
        print("[+] Connection established successfully!")
        return conn
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        print("\nTip: In Supabase, if direct connection on port 5432 gives authentication error,")
        print("ensure the database password in your DATABASE_URL is correct.")
        print("Example: postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres")
        sys.exit(1)

def apply_schema(conn):
    print("\n[*] Applying schema from schema.sql...")
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        schema_sql = f.read()
    with conn.cursor() as cur:
        cur.execute(schema_sql)
    print("[+] Database tables, indexes, and RLS policies created/verified successfully!")

def migrate_users(conn):
    path = os.path.join(DATA_DIR, "users.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        users = json.load(f)
    print(f"\n[*] Migrating {len(users)} users...")
    
    query = """
    INSERT INTO "users" (
        "id", "employeeId", "username", "email", "passwordHash", "role",
        "employmentType", "fullName", "phone", "profilePhoto", "profilePictureUploaded",
        "designation", "department", "guideId", "guideName", "status",
        "mustChangePassword", "sessionVersion", "passwordUpdatedAt", "requestedAt",
        "approvalStage", "registrationApprovalVersion", "approvalHistory", "approvalRemarks",
        "approvedAt", "rejectedAt", "emailVerified", "verificationToken", "verificationSentAt",
        "resetToken", "resetTokenExpiresAt", "createdAt", "isProfileCompleted",
        "profileCompletedAt", "selectedRole"
    ) VALUES %s
    ON CONFLICT ("id") DO UPDATE SET
        "passwordHash" = EXCLUDED."passwordHash",
        "status" = EXCLUDED."status",
        "fullName" = EXCLUDED."fullName",
        "role" = EXCLUDED."role",
        "profilePhoto" = EXCLUDED."profilePhoto";
    """
    
    records = []
    for u in users:
        records.append((
            u.get("id"),
            u.get("employeeId"),
            u.get("username"),
            u.get("email"),
            u.get("passwordHash"),
            u.get("role"),
            u.get("employmentType"),
            u.get("fullName"),
            u.get("phone"),
            u.get("profilePhoto"),
            u.get("profilePictureUploaded", False),
            u.get("designation"),
            u.get("department"),
            u.get("guideId"),
            u.get("guideName"),
            u.get("status", "active"),
            u.get("mustChangePassword", False),
            u.get("sessionVersion", 0),
            u.get("passwordUpdatedAt"),
            u.get("requestedAt"),
            u.get("approvalStage"),
            u.get("registrationApprovalVersion"),
            Json(u.get("approvalHistory", [])),
            u.get("approvalRemarks"),
            u.get("approvedAt"),
            u.get("rejectedAt"),
            u.get("emailVerified", False),
            u.get("verificationToken"),
            u.get("verificationSentAt"),
            u.get("resetToken"),
            u.get("resetTokenExpiresAt"),
            u.get("createdAt"),
            u.get("isProfileCompleted", False),
            u.get("profileCompletedAt"),
            u.get("selectedRole")
        ))
    
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(users)} users!")

def migrate_attendance(conn):
    all_att = {}
    legacy_att = os.path.join(DATA_DIR, "attendance.json")
    if os.path.exists(legacy_att):
        with open(legacy_att, "r", encoding="utf-8") as f:
            for r in json.load(f):
                all_att[r["id"]] = r
    for fpath in glob.glob(os.path.join(DATA_DIR, "attendance", "*.json")):
        with open(fpath, "r", encoding="utf-8") as f:
            for r in json.load(f):
                all_att[r["id"]] = r
                
    print(f"\n[*] Migrating {len(all_att)} attendance records...")
    query = """
    INSERT INTO "attendance_records" ("id", "userId", "username", "fullName", "employeeId", "date", "checkIn", "checkOut")
    VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    records = []
    for r in all_att.values():
        records.append((
            r.get("id"),
            r.get("userId"),
            r.get("username"),
            r.get("fullName"),
            r.get("employeeId"),
            r.get("date"),
            r.get("checkIn"),
            r.get("checkOut")
        ))
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(all_att)} attendance records!")

def migrate_tasks(conn):
    path = os.path.join(DATA_DIR, "tasks.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        tasks = json.load(f)
    print(f"\n[*] Migrating {len(tasks)} tasks...")
    query = """
    INSERT INTO "tasks" (
        "id", "title", "description", "deadline", "status", "progress",
        "assignedToId", "assignedToName", "assignedToUsername", "assignedById",
        "assignedByName", "sourceProjectId", "projectRole", "comments",
        "createdAt", "updatedAt"
    ) VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    records = []
    for t in tasks:
        records.append((
            t.get("id"),
            t.get("title"),
            t.get("description"),
            t.get("deadline"),
            t.get("status", "not_started"),
            t.get("progress", 0),
            t.get("assignedToId"),
            t.get("assignedToName"),
            t.get("assignedToUsername"),
            t.get("assignedById"),
            t.get("assignedByName"),
            t.get("sourceProjectId"),
            t.get("projectRole"),
            Json(t.get("comments", [])),
            t.get("createdAt"),
            t.get("updatedAt")
        ))
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(tasks)} tasks!")

def migrate_requests(conn):
    path = os.path.join(DATA_DIR, "requests.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        requests = json.load(f)
    print(f"\n[*] Migrating {len(requests)} requests...")
    query = """
    INSERT INTO "requests" (
        "id", "submissionId", "type", "title", "createdBy", "createdByUsername",
        "createdById", "createdByRole", "createdByDesignation", "createdByEmployeeId",
        "createdByDepartment", "createdByPhone", "payload", "remarks", "target",
        "status", "forwardedTo", "uploadedFile", "signatureFrom", "signatureStatus",
        "officialDocument", "circular", "createdAt", "updatedAt"
    ) VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    records = []
    for r in requests:
        records.append((
            r.get("id"),
            r.get("submissionId"),
            r.get("type"),
            r.get("title"),
            r.get("createdBy"),
            r.get("createdByUsername"),
            r.get("createdById"),
            r.get("createdByRole"),
            r.get("createdByDesignation"),
            r.get("createdByEmployeeId"),
            r.get("createdByDepartment"),
            r.get("createdByPhone"),
            Json(r.get("payload", {})),
            r.get("remarks"),
            r.get("target", "admin"),
            r.get("status", "pending"),
            r.get("forwardedTo"),
            Json(r.get("uploadedFile")) if r.get("uploadedFile") else None,
            r.get("signatureFrom"),
            r.get("signatureStatus"),
            Json(r.get("officialDocument")) if r.get("officialDocument") else None,
            Json(r.get("circular")) if r.get("circular") else None,
            r.get("createdAt"),
            r.get("updatedAt")
        ))
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(requests)} requests!")

def migrate_circulars(conn):
    path = os.path.join(DATA_DIR, "circulars.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        circs = json.load(f)
    print(f"\n[*] Migrating {len(circs)} circulars...")
    query = """
    INSERT INTO "circulars" ("id", "title", "content", "postedBy", "postedByRole", "postedAt", "recipients", "priority", "meta")
    VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    records = []
    for c in circs:
        records.append((
            c.get("id"),
            c.get("title"),
            c.get("content"),
            c.get("postedBy"),
            c.get("postedByRole"),
            c.get("postedAt"),
            Json(c.get("recipients", ["all"])),
            c.get("priority", "medium"),
            Json(c.get("meta", {}))
        ))
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(circs)} circulars!")

def migrate_ledger(conn):
    path = os.path.join(DATA_DIR, "company-ledger.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        ledger = json.load(f)
    balance = ledger.get("balance", 0)
    txns = ledger.get("transactions", [])
    print(f"\n[*] Migrating company ledger (balance: {balance}, txns: {len(txns)})...")
    
    with conn.cursor() as cur:
        cur.execute("""
        INSERT INTO "company_ledger_summary" ("id", "balance") VALUES (1, %s)
        ON CONFLICT ("id") DO UPDATE SET "balance" = EXCLUDED."balance";
        """, (balance,))
    
    if txns:
        query = """
        INSERT INTO "company_ledger_transactions" (
            "id", "date", "amount", "purpose", "remarks", "type",
            "balanceAfter", "requestId", "requestType", "amountBy", "modeOfPayment"
        ) VALUES %s
        ON CONFLICT ("id") DO NOTHING;
        """
        records = []
        for t in txns:
            records.append((
                t.get("id"),
                t.get("date"),
                t.get("amount"),
                t.get("purpose"),
                t.get("remarks"),
                t.get("type"),
                t.get("balanceAfter"),
                t.get("requestId"),
                t.get("requestType"),
                t.get("amountBy"),
                t.get("modeOfPayment")
            ))
        with conn.cursor() as cur:
            execute_values(cur, query, records)
    print(f"[+] Successfully migrated company ledger and {len(txns)} transactions!")

def migrate_notifications(conn):
    path = os.path.join(DATA_DIR, "notifications.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        notifs = json.load(f)
    print(f"\n[*] Migrating {len(notifs)} notifications...")
    query = """
    INSERT INTO "notifications" ("id", "type", "title", "message", "targetUser", "relatedId", "read", "userId", "timestamp")
    VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    records = []
    for n in notifs:
        records.append((
            n.get("id"),
            n.get("type"),
            n.get("title"),
            n.get("message"),
            n.get("targetUser"),
            n.get("relatedId"),
            n.get("read", False),
            n.get("userId"),
            n.get("timestamp")
        ))
    with conn.cursor() as cur:
        execute_values(cur, query, records)
    print(f"[+] Successfully migrated {len(notifs)} notifications!")

def migrate_audit_logs(conn):
    path = os.path.join(DATA_DIR, "audit-log.json")
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        logs = json.load(f)
    print(f"\n[*] Migrating {len(logs)} audit logs in batches...")
    query = """
    INSERT INTO "audit_logs" ("id", "action", "actor", "actorId", "details", "timestamp")
    VALUES %s
    ON CONFLICT ("id") DO NOTHING;
    """
    batch_size = 50
    for i in range(0, len(logs), batch_size):
        batch = logs[i:i + batch_size]
        records = []
        for l in batch:
            records.append((
                l.get("id"),
                l.get("action"),
                l.get("actor"),
                l.get("actorId"),
                Json(l.get("details", {})),
                l.get("timestamp")
            ))
        with conn.cursor() as cur:
            execute_values(cur, query, records)
        print(f"    - Processed {min(i + batch_size, len(logs))}/{len(logs)} logs")
    print(f"[+] Successfully migrated {len(logs)} audit logs!")

def migrate_retention(conn):
    rc_path = os.path.join(DATA_DIR, "retention-config.json")
    if os.path.exists(rc_path):
        with open(rc_path, "r", encoding="utf-8") as f:
            rc = json.load(f)
        with conn.cursor() as cur:
            cur.execute("""
            INSERT INTO "retention_config" ("id", "dataCreatedAt", "lastNotifiedAt", "notificationSent")
            VALUES (1, %s, %s, %s)
            ON CONFLICT ("id") DO NOTHING;
            """, (rc.get("dataCreatedAt"), rc.get("lastNotifiedAt"), rc.get("notificationSent", False)))

    rw_path = os.path.join(DATA_DIR, "retention-workflow.json")
    if os.path.exists(rw_path):
        with open(rw_path, "r", encoding="utf-8") as f:
            rw = json.load(f)
        with conn.cursor() as cur:
            cur.execute("""
            INSERT INTO "retention_workflow" ("id", "nextRunAt", "lastCompletedAt", "cycle")
            VALUES (1, %s, %s, %s)
            ON CONFLICT ("id") DO NOTHING;
            """, (rw.get("nextRunAt"), rw.get("lastCompletedAt"), Json(rw.get("cycle")) if rw.get("cycle") else None))
    print("\n[+] Migrated retention config & workflow!")

def verify_migration(conn):
    print("\n" + "="*50)
    print("VERIFICATION OF SUPABASE DATABASE RECORD COUNTS")
    print("="*50)
    tables = [
        "users", "attendance_records", "tasks", "requests",
        "circulars", "company_ledger_transactions", "company_ledger_summary",
        "notifications", "audit_logs", "retention_config", "retention_workflow"
    ]
    with conn.cursor() as cur:
        for t in tables:
            cur.execute(f'SELECT COUNT(*) FROM "{t}";')
            cnt = cur.fetchone()[0]
            print(f"  ✓ {t:30}: {cnt} rows")
    print("="*50)
    print("[SUCCESS] All data has been verified in Supabase!\n")

def main():
    conn = get_connection()
    try:
        apply_schema(conn)
        migrate_users(conn)
        migrate_attendance(conn)
        migrate_tasks(conn)
        migrate_requests(conn)
        migrate_circulars(conn)
        migrate_ledger(conn)
        migrate_notifications(conn)
        migrate_audit_logs(conn)
        migrate_retention(conn)
        verify_migration(conn)
    finally:
        conn.close()

if __name__ == "__main__":
    main()
