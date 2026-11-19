import fs from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import {
  getRetentionArchivePath,
  getRetentionWorkflow,
  RETENTION_APPROVERS,
} from '@/lib/retention-workflow';

export async function GET(request: NextRequest) {
  const auth = requireRole(request, ['admin', 'founder', 'managing-partner']);
  if (auth instanceof NextResponse) return auth;
  const isApprover = RETENTION_APPROVERS.some((approver) =>
    approver.id === auth.id &&
    approver.role === auth.role &&
    approver.username === auth.username.toLowerCase()
  );
  if (!isApprover && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const cycle = getRetentionWorkflow().cycle;
    if (!cycle) {
      return NextResponse.json({ error: 'No retention archive is available' }, { status: 404 });
    }
    const archivePath = getRetentionArchivePath(cycle.archiveFile);
    const archive = new Uint8Array(fs.readFileSync(archivePath));
    return new NextResponse(archive, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${cycle.archiveFile}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Retention archive download error:', error);
    return NextResponse.json({ error: 'Unable to download the retention archive' }, { status: 500 });
  }
}
