-- ==============================================================================
-- SURYA'S MiB ENTERPRISES - INTRANET PORTAL DATABASE SCHEMA
-- Target Database: PostgreSQL / Supabase
-- ==============================================================================

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS "users" (
    "id" TEXT PRIMARY KEY,
    "employeeId" TEXT UNIQUE,
    "username" TEXT UNIQUE NOT NULL,
    "email" TEXT UNIQUE NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "employmentType" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "profilePhoto" TEXT,
    "profilePictureUploaded" BOOLEAN DEFAULT false,
    "designation" TEXT,
    "department" TEXT,
    "guideId" TEXT,
    "guideName" TEXT,
    "status" TEXT DEFAULT 'pending_approval',
    "mustChangePassword" BOOLEAN DEFAULT false,
    "sessionVersion" INTEGER DEFAULT 0,
    "passwordUpdatedAt" TIMESTAMPTZ,
    "requestedAt" TIMESTAMPTZ,
    "approvalStage" INTEGER,
    "registrationApprovalVersion" INTEGER,
    "approvalHistory" JSONB DEFAULT '[]'::jsonb,
    "approvalRemarks" TEXT,
    "approvedAt" TIMESTAMPTZ,
    "rejectedAt" TIMESTAMPTZ,
    "emailVerified" BOOLEAN DEFAULT false,
    "verificationToken" TEXT,
    "verificationSentAt" TIMESTAMPTZ,
    "resetToken" TEXT,
    "resetTokenExpiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "isProfileCompleted" BOOLEAN DEFAULT false,
    "profileCompletedAt" TIMESTAMPTZ,
    "selectedRole" TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON "users"("username");
CREATE INDEX IF NOT EXISTS idx_users_email ON "users"("email");
CREATE INDEX IF NOT EXISTS idx_users_employeeId ON "users"("employeeId");
CREATE INDEX IF NOT EXISTS idx_users_status ON "users"("status");
CREATE INDEX IF NOT EXISTS idx_users_role ON "users"("role");

-- 2. ATTENDANCE RECORDS TABLE
CREATE TABLE IF NOT EXISTS "attendance_records" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeId" TEXT,
    "date" VARCHAR(10) NOT NULL, -- Format: YYYY-MM-DD
    "checkIn" TIMESTAMPTZ NOT NULL,
    "checkOut" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_userId ON "attendance_records"("userId");
CREATE INDEX IF NOT EXISTS idx_attendance_date ON "attendance_records"("date");
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON "attendance_records"("userId", "date");

-- 3. TASKS TABLE
CREATE TABLE IF NOT EXISTS "tasks" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deadline" VARCHAR(10) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "assignedToId" TEXT NOT NULL,
    "assignedToName" TEXT NOT NULL,
    "assignedToUsername" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedByName" TEXT NOT NULL,
    "sourceProjectId" TEXT,
    "projectRole" TEXT,
    "comments" JSONB DEFAULT '[]'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assignedToId ON "tasks"("assignedToId");
CREATE INDEX IF NOT EXISTS idx_tasks_status ON "tasks"("status");
CREATE INDEX IF NOT EXISTS idx_tasks_sourceProjectId ON "tasks"("sourceProjectId");

-- 4. REQUESTS TABLE (Leave, TA, Attendance Reports, Proposals, Certificates, etc.)
CREATE TABLE IF NOT EXISTS "requests" (
    "id" TEXT PRIMARY KEY,
    "submissionId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdByUsername" TEXT,
    "createdById" TEXT,
    "createdByRole" TEXT,
    "createdByDesignation" TEXT,
    "createdByEmployeeId" TEXT,
    "createdByDepartment" TEXT,
    "createdByPhone" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "remarks" TEXT,
    "target" TEXT NOT NULL DEFAULT 'admin',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "forwardedTo" TEXT,
    "uploadedFile" JSONB,
    "signatureFrom" TEXT,
    "signatureStatus" TEXT,
    "officialDocument" JSONB,
    "circular" JSONB,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_requests_type ON "requests"("type");
CREATE INDEX IF NOT EXISTS idx_requests_status ON "requests"("status");
CREATE INDEX IF NOT EXISTS idx_requests_target ON "requests"("target");
CREATE INDEX IF NOT EXISTS idx_requests_createdById ON "requests"("createdById");
CREATE INDEX IF NOT EXISTS idx_requests_createdByUsername ON "requests"("createdByUsername");

-- 5. CIRCULARS TABLE
CREATE TABLE IF NOT EXISTS "circulars" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "postedBy" TEXT NOT NULL,
    "postedByRole" TEXT NOT NULL,
    "postedAt" TIMESTAMPTZ DEFAULT now(),
    "recipients" JSONB DEFAULT '["all"]'::jsonb,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "meta" JSONB DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 6. COMPANY LEDGER TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS "company_ledger_transactions" (
    "id" TEXT PRIMARY KEY,
    "date" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "amount" NUMERIC(14, 2) NOT NULL,
    "purpose" TEXT NOT NULL,
    "remarks" TEXT,
    "type" TEXT NOT NULL, -- 'credited' | 'debited'
    "balanceAfter" NUMERIC(14, 2) NOT NULL,
    "requestId" TEXT,
    "requestType" TEXT,
    "amountBy" TEXT,
    "modeOfPayment" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ledger_date ON "company_ledger_transactions"("date");

-- 7. COMPANY LEDGER SUMMARY TABLE
CREATE TABLE IF NOT EXISTS "company_ledger_summary" (
    "id" INTEGER PRIMARY KEY DEFAULT 1,
    "balance" NUMERIC(14, 2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_summary_row CHECK ("id" = 1)
);

-- 8. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT PRIMARY KEY,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "targetUser" TEXT NOT NULL, -- 'all' or userId / username
    "relatedId" TEXT,
    "read" BOOLEAN DEFAULT false,
    "userId" TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_targetUser ON "notifications"("targetUser");
CREATE INDEX IF NOT EXISTS idx_notifications_read ON "notifications"("read");
CREATE INDEX IF NOT EXISTS idx_notifications_relatedId ON "notifications"("relatedId");

-- 9. AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "actorId" TEXT,
    "details" JSONB DEFAULT '{}'::jsonb,
    "timestamp" TIMESTAMPTZ DEFAULT now(),
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON "audit_logs"("action");
CREATE INDEX IF NOT EXISTS idx_audit_logs_actorId ON "audit_logs"("actorId");
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON "audit_logs"("timestamp");

-- 10. GUEST INQUIRIES TABLE
CREATE TABLE IF NOT EXISTS "guest_inquiries" (
    "id" TEXT PRIMARY KEY,
    "guestName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "designation" TEXT,
    "company" TEXT,
    "phone" TEXT,
    "details" JSONB DEFAULT '{}'::jsonb,
    "date" TEXT,
    "time" TEXT,
    "status" TEXT DEFAULT 'new',
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 11. GUEST ACTIVITIES TABLE
CREATE TABLE IF NOT EXISTS "guest_activities" (
    "id" TEXT PRIMARY KEY,
    "guestName" TEXT NOT NULL,
    "email" TEXT DEFAULT 'Not provided',
    "phone" TEXT DEFAULT 'Not provided',
    "loginTime" TIMESTAMPTZ,
    "logoutTime" TIMESTAMPTZ,
    "sessionDuration" TEXT,
    "pagesVisited" JSONB DEFAULT '[]'::jsonb,
    "status" TEXT DEFAULT 'active',
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 12. EVENTS TABLE
CREATE TABLE IF NOT EXISTS "events" (
    "id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TIMESTAMPTZ,
    "location" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ DEFAULT now()
);

-- 13. RETENTION CONFIG TABLE
CREATE TABLE IF NOT EXISTS "retention_config" (
    "id" INTEGER PRIMARY KEY DEFAULT 1,
    "dataCreatedAt" TIMESTAMPTZ NOT NULL,
    "lastNotifiedAt" TIMESTAMPTZ,
    "notificationSent" BOOLEAN DEFAULT false,
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_retention_config_row CHECK ("id" = 1)
);

-- 14. RETENTION WORKFLOW TABLE
CREATE TABLE IF NOT EXISTS "retention_workflow" (
    "id" INTEGER PRIMARY KEY DEFAULT 1,
    "nextRunAt" TIMESTAMPTZ NOT NULL,
    "lastCompletedAt" TIMESTAMPTZ,
    "cycle" JSONB,
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT single_retention_workflow_row CHECK ("id" = 1)
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Enabling RLS and providing permissive policies for backend service roles & authenticated clients
-- ==============================================================================
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circulars" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_ledger_transactions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_ledger_summary" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_inquiries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guest_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retention_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "retention_workflow" ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    EXECUTE 'CREATE POLICY "Allow all operations for users" ON "users" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for attendance_records" ON "attendance_records" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for tasks" ON "tasks" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for requests" ON "requests" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for circulars" ON "circulars" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for company_ledger_transactions" ON "company_ledger_transactions" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for company_ledger_summary" ON "company_ledger_summary" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for notifications" ON "notifications" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for audit_logs" ON "audit_logs" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for guest_inquiries" ON "guest_inquiries" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for guest_activities" ON "guest_activities" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for events" ON "events" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for retention_config" ON "retention_config" FOR ALL USING (true) WITH CHECK (true)';
    EXECUTE 'CREATE POLICY "Allow all operations for retention_workflow" ON "retention_workflow" FOR ALL USING (true) WITH CHECK (true)';
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;
