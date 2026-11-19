# Data Retention Policy

## 90-day archive and reset

The first cycle is scheduled from **1 October 2026**. Because that date has passed, the next scheduled cron run starts the overdue cycle. At the end of each approved reset, the next cycle is scheduled 90 days after final approval.

When a cycle is due, the application creates an Excel workbook in `.data/archives/` containing each top-level operational JSON data file in `.data/`. It excludes the user database, retention configuration/workflow files, and the backups directory. The archive is available to administrators and the three named approvers through the authenticated download endpoint and the Approval page.

The application then creates an approval item on the Approval page, routed in this order:

1. Hareesh V (`hareeshv`)
2. Santhana Kumar V (`santhanakumarv`)
3. G. K. Bharath (`gkbharath`)

Each approver must provide remarks and approve before the application clears operational data. A rejection prevents the reset and schedules a new cycle 90 days later. If final approval takes time, the application creates a fresh final workbook immediately before clearing, so data created while approval was pending is included in the retained archive.

After final approval, operational JSON datasets are reset to empty values while preserving their expected data shapes. Only retention workflow notifications are kept in the notification file; a completion notification and audit entry are then recorded.

## Protected data

- `.data/users.json` is never archived, modified, or deleted by this workflow.
- `.data/retention-config.json` and `.data/retention-workflow.json` are retained to preserve application settings and cycle status.
- The existing `.data/backups/` directory is not modified.
- Excel archive files in `.data/archives/` are permanent retained copies for this workflow. They are not reset or deleted by later 90-day cycles.
- The archive folder is outside the public web directory. Archive downloads require an authenticated administrator or named approver.

## Scheduler setup

The workflow is checked by `POST /api/cron/check-reminders`. Configure an external scheduler to call this endpoint daily at or after **5:00 PM India time** with the `x-cron-token` header set to the server's `CRON_TOKEN`. In addition to reminders and retention checks, this closes any open attendance entries for that date at the time the job runs. The initial retention cycle will start on the first successful scheduled call because the 1 October 2026 baseline is overdue. Without a running scheduler, due cycles and automatic attendance checkout will not happen automatically.
