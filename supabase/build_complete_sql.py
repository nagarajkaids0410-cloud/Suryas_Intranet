import json
import os
import glob
import copy

BASE_DIR = r"c:\Users\HP\Downloads\Intranet\Intranet\intranet_suryas-main"
DATA_DIR = os.path.join(BASE_DIR, ".data")
OUT_DIR = os.path.join(BASE_DIR, "supabase")
OUT_FILE = os.path.join(OUT_DIR, "complete_database_setup.sql")

def sql_quote(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    if isinstance(val, (dict, list)):
        s = json.dumps(val).replace("'", "''")
        return f"'{s}'::jsonb"
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    s = s.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\r")
    return f"E'{s}'"

lines = []

# --- Header ---
lines.append("-- ==============================================================================\n")
lines.append("-- SURYA'S MiB ENTERPRISES - COMPLETE DATABASE SETUP & SEED SCRIPT\n")
lines.append("-- Run this entire script in Supabase SQL Editor in ONE single execution.\n")
lines.append("-- It creates all 14 tables, indexes, RLS policies, and seeds all core data.\n")
lines.append("-- ==============================================================================\n\n")

# --- Step 1: Schema ---
schema_file = os.path.join(OUT_DIR, "schema.sql")
with open(schema_file, "r", encoding="utf-8") as f:
    schema_content = f.read()

lines.append("-- ==============================================================================\n")
lines.append("-- PART 1: TABLES, INDEXES & RLS POLICIES (14 TABLES)\n")
lines.append("-- ==============================================================================\n\n")
lines.append(schema_content)
lines.append("\n\n")

lines.append("-- ==============================================================================\n")
lines.append("-- PART 2: CORE SEED DATA (USERS, ATTENDANCE, TASKS, CIRCULARS, LEDGER, NOTIFICATIONS)\n")
lines.append("-- ==============================================================================\n\n")

# --- Step 2: Users ---
with open(os.path.join(DATA_DIR, "users.json"), "r", encoding="utf-8") as f:
    users = json.load(f)

lines.append(f"-- 1. USERS ({len(users)} accounts)\n")
for u in users:
    cols = [
        '"id"', '"employeeId"', '"username"', '"email"', '"passwordHash"', '"role"',
        '"employmentType"', '"fullName"', '"phone"', '"profilePictureUploaded"',
        '"designation"', '"department"', '"guideId"', '"guideName"', '"status"',
        '"mustChangePassword"', '"sessionVersion"', '"passwordUpdatedAt"', '"requestedAt"',
        '"approvalStage"', '"registrationApprovalVersion"', '"approvalHistory"', '"approvalRemarks"',
        '"approvedAt"', '"rejectedAt"', '"emailVerified"', '"verificationToken"', '"verificationSentAt"',
        '"resetToken"', '"resetTokenExpiresAt"', '"createdAt"', '"isProfileCompleted"',
        '"profileCompletedAt"', '"selectedRole"'
    ]
    vals = [
        sql_quote(u.get("id")), sql_quote(u.get("employeeId")), sql_quote(u.get("username")),
        sql_quote(u.get("email")), sql_quote(u.get("passwordHash")), sql_quote(u.get("role")),
        sql_quote(u.get("employmentType")), sql_quote(u.get("fullName")), sql_quote(u.get("phone")),
        sql_quote(u.get("profilePictureUploaded", False)), sql_quote(u.get("designation")),
        sql_quote(u.get("department")), sql_quote(u.get("guideId")), sql_quote(u.get("guideName")),
        sql_quote(u.get("status", "active")), sql_quote(u.get("mustChangePassword", False)),
        sql_quote(u.get("sessionVersion", 0)), sql_quote(u.get("passwordUpdatedAt")),
        sql_quote(u.get("requestedAt")), sql_quote(u.get("approvalStage")),
        sql_quote(u.get("registrationApprovalVersion")), sql_quote(u.get("approvalHistory", [])),
        sql_quote(u.get("approvalRemarks")), sql_quote(u.get("approvedAt")), sql_quote(u.get("rejectedAt")),
        sql_quote(u.get("emailVerified", False)), sql_quote(u.get("verificationToken")),
        sql_quote(u.get("verificationSentAt")), sql_quote(u.get("resetToken")),
        sql_quote(u.get("resetTokenExpiresAt")), sql_quote(u.get("createdAt")),
        sql_quote(u.get("isProfileCompleted", False)), sql_quote(u.get("profileCompletedAt")),
        sql_quote(u.get("selectedRole"))
    ]
    stmt = f"INSERT INTO \"users\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO UPDATE SET \"passwordHash\" = EXCLUDED.\"passwordHash\", \"status\" = EXCLUDED.\"status\";\n"
    lines.append(stmt)

# --- Step 3: Attendance ---
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

lines.append(f"\n-- 2. ATTENDANCE RECORDS ({len(all_att)} rows)\n")
for r in all_att.values():
    cols = ['"id"', '"userId"', '"username"', '"fullName"', '"employeeId"', '"date"', '"checkIn"', '"checkOut"']
    vals = [
        sql_quote(r.get("id")), sql_quote(r.get("userId")), sql_quote(r.get("username")),
        sql_quote(r.get("fullName")), sql_quote(r.get("employeeId")), sql_quote(r.get("date")),
        sql_quote(r.get("checkIn")), sql_quote(r.get("checkOut"))
    ]
    stmt = f"INSERT INTO \"attendance_records\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

# --- Step 4: Tasks ---
with open(os.path.join(DATA_DIR, "tasks.json"), "r", encoding="utf-8") as f:
    tasks = json.load(f)
lines.append(f"\n-- 3. TASKS ({len(tasks)} rows)\n")
for t in tasks:
    cols = [
        '"id"', '"title"', '"description"', '"deadline"', '"status"', '"progress"',
        '"assignedToId"', '"assignedToName"', '"assignedToUsername"', '"assignedById"',
        '"assignedByName"', '"sourceProjectId"', '"projectRole"', '"comments"',
        '"createdAt"', '"updatedAt"'
    ]
    vals = [
        sql_quote(t.get("id")), sql_quote(t.get("title")), sql_quote(t.get("description")),
        sql_quote(t.get("deadline")), sql_quote(t.get("status", "not_started")),
        sql_quote(t.get("progress", 0)), sql_quote(t.get("assignedToId")),
        sql_quote(t.get("assignedToName")), sql_quote(t.get("assignedToUsername")),
        sql_quote(t.get("assignedById")), sql_quote(t.get("assignedByName")),
        sql_quote(t.get("sourceProjectId")), sql_quote(t.get("projectRole")),
        sql_quote(t.get("comments", [])), sql_quote(t.get("createdAt")),
        sql_quote(t.get("updatedAt"))
    ]
    stmt = f"INSERT INTO \"tasks\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

# --- Step 5: Circulars ---
with open(os.path.join(DATA_DIR, "circulars.json"), "r", encoding="utf-8") as f:
    circs = json.load(f)
lines.append(f"\n-- 4. CIRCULARS ({len(circs)} rows)\n")
for c in circs:
    cols = ['"id"', '"title"', '"content"', '"postedBy"', '"postedByRole"', '"postedAt"', '"recipients"', '"priority"', '"meta"']
    vals = [
        sql_quote(c.get("id")), sql_quote(c.get("title")), sql_quote(c.get("content")),
        sql_quote(c.get("postedBy")), sql_quote(c.get("postedByRole")), sql_quote(c.get("postedAt")),
        sql_quote(c.get("recipients", ["all"])), sql_quote(c.get("priority", "medium")),
        sql_quote(c.get("meta", {}))
    ]
    stmt = f"INSERT INTO \"circulars\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

# --- Step 6: Ledger ---
with open(os.path.join(DATA_DIR, "company-ledger.json"), "r", encoding="utf-8") as f:
    ledger = json.load(f)
lines.append("\n-- 5. COMPANY LEDGER\n")
lines.append(f"INSERT INTO \"company_ledger_summary\" (\"id\", \"balance\") VALUES (1, {ledger.get('balance', 0)}) ON CONFLICT (\"id\") DO UPDATE SET \"balance\" = EXCLUDED.\"balance\";\n")
for txn in ledger.get("transactions", []):
    cols = [
        '"id"', '"date"', '"amount"', '"purpose"', '"remarks"', '"type"',
        '"balanceAfter"', '"requestId"', '"requestType"', '"amountBy"', '"modeOfPayment"'
    ]
    vals = [
        sql_quote(txn.get("id")), sql_quote(txn.get("date")), sql_quote(txn.get("amount")),
        sql_quote(txn.get("purpose")), sql_quote(txn.get("remarks")), sql_quote(txn.get("type")),
        sql_quote(txn.get("balanceAfter")), sql_quote(txn.get("requestId")),
        sql_quote(txn.get("requestType")), sql_quote(txn.get("amountBy")),
        sql_quote(txn.get("modeOfPayment"))
    ]
    stmt = f"INSERT INTO \"company_ledger_transactions\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

# --- Step 7: Notifications ---
with open(os.path.join(DATA_DIR, "notifications.json"), "r", encoding="utf-8") as f:
    notifs = json.load(f)
lines.append(f"\n-- 6. NOTIFICATIONS ({len(notifs)} rows)\n")
for n in notifs:
    cols = ['"id"', '"type"', '"title"', '"message"', '"targetUser"', '"relatedId"', '"read"', '"userId"', '"timestamp"']
    vals = [
        sql_quote(n.get("id")), sql_quote(n.get("type")), sql_quote(n.get("title")),
        sql_quote(n.get("message")), sql_quote(n.get("targetUser")), sql_quote(n.get("relatedId")),
        sql_quote(n.get("read", False)), sql_quote(n.get("userId")), sql_quote(n.get("timestamp"))
    ]
    stmt = f"INSERT INTO \"notifications\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

# --- Step 8: Retention ---
with open(os.path.join(DATA_DIR, "retention-config.json"), "r", encoding="utf-8") as f:
    rc = json.load(f)
lines.append(f"\nINSERT INTO \"retention_config\" (\"id\", \"dataCreatedAt\", \"lastNotifiedAt\", \"notificationSent\") VALUES (1, {sql_quote(rc.get('dataCreatedAt'))}, {sql_quote(rc.get('lastNotifiedAt'))}, {sql_quote(rc.get('notificationSent', False))}) ON CONFLICT (\"id\") DO NOTHING;\n")
with open(os.path.join(DATA_DIR, "retention-workflow.json"), "r", encoding="utf-8") as f:
    rw = json.load(f)
lines.append(f"INSERT INTO \"retention_workflow\" (\"id\", \"nextRunAt\", \"lastCompletedAt\", \"cycle\") VALUES (1, {sql_quote(rw.get('nextRunAt'))}, {sql_quote(rw.get('lastCompletedAt'))}, {sql_quote(rw.get('cycle'))}) ON CONFLICT (\"id\") DO NOTHING;\n")

# --- Step 9: Requests ---
with open(os.path.join(DATA_DIR, "requests.json"), "r", encoding="utf-8") as f:
    requests = json.load(f)

lines.append("\n-- ==============================================================================\n")
lines.append(f"-- PART 3: REQUESTS ({len(requests)} rows - Leave, TA, Proposals, Reports, etc.)\n")
lines.append("-- ==============================================================================\n\n")

req_cols = [
    '"id"', '"submissionId"', '"type"', '"title"', '"createdBy"', '"createdByUsername"',
    '"createdById"', '"createdByRole"', '"createdByDesignation"', '"createdByEmployeeId"',
    '"createdByDepartment"', '"createdByPhone"', '"payload"', '"remarks"', '"target"',
    '"status"', '"forwardedTo"', '"uploadedFile"', '"signatureFrom"', '"signatureStatus"',
    '"officialDocument"', '"circular"', '"createdAt"', '"updatedAt"'
]

def clean_large_attachments(obj):
    if isinstance(obj, dict):
        for k, v in list(obj.items()):
            if k == "base64" and isinstance(v, str) and len(v) > 5000:
                obj[k] = ""
            elif isinstance(v, (dict, list)):
                clean_large_attachments(v)
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                clean_large_attachments(item)

for req in requests:
    r = copy.deepcopy(req)
    # Recursively strip huge base64 strings so file remains lightweight for browser pasting
    clean_large_attachments(r)

    vals = [
        sql_quote(r.get("id")), sql_quote(r.get("submissionId")), sql_quote(r.get("type")),
        sql_quote(r.get("title")), sql_quote(r.get("createdBy")), sql_quote(r.get("createdByUsername")),
        sql_quote(r.get("createdById")), sql_quote(r.get("createdByRole")),
        sql_quote(r.get("createdByDesignation")), sql_quote(r.get("createdByEmployeeId")),
        sql_quote(r.get("createdByDepartment")), sql_quote(r.get("createdByPhone")),
        sql_quote(r.get("payload", {})), sql_quote(r.get("remarks")),
        sql_quote(r.get("target", "admin")), sql_quote(r.get("status", "pending")),
        sql_quote(r.get("forwardedTo")), sql_quote(r.get("uploadedFile")),
        sql_quote(r.get("signatureFrom")), sql_quote(r.get("signatureStatus")),
        sql_quote(r.get("officialDocument")), sql_quote(r.get("circular")),
        sql_quote(r.get("createdAt")), sql_quote(r.get("updatedAt")),
    ]
    stmt = f"INSERT INTO \"requests\" ({', '.join(req_cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
    lines.append(stmt)

with open(OUT_FILE, "w", encoding="utf-8") as f:
    f.writelines(lines)

size_kb = os.path.getsize(OUT_FILE) / 1024
print(f"SUCCESS: Generated {OUT_FILE}")
print(f"Total lines: {len(lines)}")
print(f"Total file size: {size_kb:.2f} KB ({size_kb/1024:.2f} MB)")
