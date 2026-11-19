import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/rbac';
import { addCircularDB, getCircularsDB, updateCircularDB } from '@/lib/circular-db';

export interface Circular {
  id: string;
  title: string;
  content: string;
  postedBy: string;
  postedByRole: string;
  postedAt: string;
  recipients: string[];
  priority: 'low' | 'medium' | 'high';
  meta?: {
    date?: string;
    time?: string;
    category?: string;
  };
}

export async function GET(request: NextRequest) {
  const auth = requireRole(request, [
    'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
  ]);
  if (auth instanceof NextResponse) return auth;
  try {
    return NextResponse.json({ success: true, circulars: getCircularsDB() });
  } catch (error) {
    console.error('Error loading circulars:', error);
    return NextResponse.json({ error: 'Unable to load circulars' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { title, content, priority = 'medium', meta } = body;

    if (typeof title !== 'string' || !title.trim() || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }
    if (!['low', 'medium', 'high'].includes(priority)) {
      return NextResponse.json({ error: 'Invalid priority' }, { status: 400 });
    }

    const circular: Circular = {
      id: `circular-${crypto.randomUUID()}`,
      title: title.trim(),
      content: content.trim(),
      postedBy: auth.username,
      postedByRole: auth.role,
      postedAt: new Date().toISOString(),
      recipients: ['all'], // Will be sent to all users
      priority,
      meta,
    };

    addCircularDB(circular);
    return NextResponse.json({ success: true, circular });
  } catch (error) {
    console.error('Error creating circular:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { id, updates } = body;

    if (!id || !updates) {
      return NextResponse.json(
        { error: 'Missing id or updates' },
        { status: 400 }
      );
    }

    const allowedFields = ['title', 'content', 'priority', 'meta'];
    if (
      typeof updates !== 'object' ||
      updates === null ||
      Object.keys(updates).some((key) => !allowedFields.includes(key)) ||
      (updates.title !== undefined && (typeof updates.title !== 'string' || !updates.title.trim())) ||
      (updates.content !== undefined && (typeof updates.content !== 'string' || !updates.content.trim())) ||
      (updates.priority !== undefined && !['low', 'medium', 'high'].includes(updates.priority))
    ) {
      return NextResponse.json({ error: 'Updates contain unsupported fields' }, { status: 400 });
    }

    const circular = updateCircularDB(id, updates);
    if (!circular) {
      return NextResponse.json({ error: 'Circular not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, circular });
  } catch (error) {
    console.error('Error updating circular:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
