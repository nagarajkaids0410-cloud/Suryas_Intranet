import json
import os
import glob

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, ".data")
OUT_DIR = os.path.join(BASE_DIR, "supabase")

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
    # String handling with PostgreSQL E'...' escape syntax
    s = str(val).replace("\\", "\\\\").replace("'", "''")
    s = s.replace("\r\n", "\\n").replace("\n", "\\n").replace("\r", "\\r")
    return f"E'{s}'"

def generate_clean_core():
    with open(os.path.join(DATA_DIR, "users.json"), "r", encoding="utf-8") as f:
        users = json.load(f)

    lines = []
    lines.append("-- ==============================================================================\n")
    lines.append("-- 02_SEED_CORE.SQL: Users, Attendance, Tasks, Circulars, Ledger, Notifications\n")
    lines.append("-- ==============================================================================\n\n")

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

    # 2. Attendance
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

    # 3. Tasks
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

    # 4. Circulars
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

    # 5. Ledger
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

    # 6. Notifications
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

    # 7. Retention
    with open(os.path.join(DATA_DIR, "retention-config.json"), "r", encoding="utf-8") as f:
        rc = json.load(f)
    lines.append(f"\nINSERT INTO \"retention_config\" (\"id\", \"dataCreatedAt\", \"lastNotifiedAt\", \"notificationSent\") VALUES (1, {sql_quote(rc.get('dataCreatedAt'))}, {sql_quote(rc.get('lastNotifiedAt'))}, {sql_quote(rc.get('notificationSent', False))}) ON CONFLICT (\"id\") DO NOTHING;\n")
    with open(os.path.join(DATA_DIR, "retention-workflow.json"), "r", encoding="utf-8") as f:
        rw = json.load(f)
    lines.append(f"INSERT INTO \"retention_workflow\" (\"id\", \"nextRunAt\", \"lastCompletedAt\", \"cycle\") VALUES (1, {sql_quote(rw.get('nextRunAt'))}, {sql_quote(rw.get('lastCompletedAt'))}, {sql_quote(rw.get('cycle'))}) ON CONFLICT (\"id\") DO NOTHING;\n")

    clean_path = os.path.join(OUT_DIR, "02_seed_core.sql")
    with open(clean_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Generated clean {clean_path} -> Size: {os.path.getsize(clean_path)/1024:.2f} KB")

def generate_clean_requests():
    with open(os.path.join(DATA_DIR, "requests.json"), "r", encoding="utf-8") as f:
        requests = json.load(f)

    cols = [
        '"id"', '"submissionId"', '"type"', '"title"', '"createdBy"', '"createdByUsername"',
        '"createdById"', '"createdByRole"', '"createdByDesignation"', '"createdByEmployeeId"',
        '"createdByDepartment"', '"createdByPhone"', '"payload"', '"remarks"', '"target"',
        '"status"', '"forwardedTo"', '"uploadedFile"', '"signatureFrom"', '"signatureStatus"',
        '"officialDocument"', '"circular"', '"createdAt"', '"updatedAt"'
    ]

    standard_lines = []
    heavy_lines = []

    standard_lines.append("-- ==============================================================================\n")
    standard_lines.append("-- 03_SEED_REQUESTS.SQL (Standard Requests - Lightweight, safe for Web Editor)\n")
    standard_lines.append("-- ==============================================================================\n\n")

    for req in requests:
        sz = len(json.dumps(req).encode("utf-8")) / 1024
        vals = [
            sql_quote(req.get("id")), sql_quote(req.get("submissionId")), sql_quote(req.get("type")),
            sql_quote(req.get("title")), sql_quote(req.get("createdBy")), sql_quote(req.get("createdByUsername")),
            sql_quote(req.get("createdById")), sql_quote(req.get("createdByRole")),
            sql_quote(req.get("createdByDesignation")), sql_quote(req.get("createdByEmployeeId")),
            sql_quote(req.get("createdByDepartment")), sql_quote(req.get("createdByPhone")),
            sql_quote(req.get("payload", {})), sql_quote(req.get("remarks")),
            sql_quote(req.get("target", "admin")), sql_quote(req.get("status", "pending")),
            sql_quote(req.get("forwardedTo")), sql_quote(req.get("uploadedFile")),
            sql_quote(req.get("signatureFrom")), sql_quote(req.get("signatureStatus")),
            sql_quote(req.get("officialDocument")), sql_quote(req.get("circular")),
            sql_quote(req.get("createdAt")), sql_quote(req.get("updatedAt")),
        ]
        stmt = f"INSERT INTO \"requests\" ({', '.join(cols)}) VALUES ({', '.join(vals)}) ON CONFLICT (\"id\") DO NOTHING;\n"
        if sz > 500: # 3 requests with huge PDFs
            heavy_lines.append(f"-- Heavy Request ID: {req.get('id')} ({sz:.1f} KB)\n" + stmt + "\n")
        else:
            standard_lines.append(stmt)

    p1 = os.path.join(OUT_DIR, "03_seed_requests.sql")
    with open(p1, "w", encoding="utf-8") as f:
        f.writelines(standard_lines)
    print(f"Generated clean {p1} -> Size: {os.path.getsize(p1)/1024:.2f} KB (61 requests)")

    p2 = os.path.join(OUT_DIR, "03_heavy_requests.sql")
    with open(p2, "w", encoding="utf-8") as f:
        f.writelines(heavy_lines)
    print(f"Generated {p2} -> Size: {os.path.getsize(p2)/(1024*1024):.2f} MB (3 requests with large attachments)")

def generate_user_photos():
    with open(os.path.join(DATA_DIR, "users.json"), "r", encoding="utf-8") as f:
        users = json.load(f)
    lines = []
    lines.append("-- 05_SEED_USER_PHOTOS.SQL (Updates profile photos user by user)\n\n")
    for u in users:
        if u.get("profilePhoto"):
            photo = sql_quote(u.get("profilePhoto"))
            uid = sql_quote(u.get("id"))
            lines.append(f"UPDATE \"users\" SET \"profilePhoto\" = {photo} WHERE \"id\" = {uid};\n\n")
    p = os.path.join(OUT_DIR, "05_seed_user_photos.sql")
    with open(p, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Generated {p} -> Size: {os.path.getsize(p)/(1024*1024):.2f} MB")

if __name__ == "__main__":
    generate_clean_core()
    generate_clean_requests()
    generate_user_photos()
