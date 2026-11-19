import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireRole } from '@/lib/rbac';

const DB_FILE = path.join(process.cwd(), '.data', 'guest-inquiries.json');

function ensureDBDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readDB() {
  try {
    ensureDBDir();
    if (!fs.existsSync(DB_FILE)) return [];
    const d = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(d) || [];
  } catch (e) {
    console.error('Failed reading guest inquiries DB', e);
    return [];
  }
}

function writeDB(items: any[]) {
  try {
    ensureDBDir();
    fs.writeFileSync(DB_FILE, JSON.stringify(items, null, 2));
  } catch (e) {
    console.error('Failed writing guest inquiries DB', e);
  }
}

export async function GET(request: NextRequest) {
  // Only admin/founder may read full guest registrations
  const roleCheck = requireRole(request, ['admin', 'founder']);
  if ((roleCheck as any).status === 403) {
    return roleCheck as any;
  }

  const inquiries = readDB();
  return NextResponse.json({ success: true, inquiries });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { guestName, email, subject, message, designation, company, phone, details } = body as any;

    if (!guestName || !email || !subject || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const now = new Date();
    const inquiry = {
      id: `inquiry-${Date.now()}`,
      guestName,
      email,
      subject,
      message,
      designation: designation || '',
      company: company || '',
      phone: phone || '',
      details: details || {},
      date: now.toLocaleDateString('en-IN'),
      time: now.toLocaleTimeString('en-IN'),
      status: 'new',
      createdAt: now.toISOString(),
    };

    const all = readDB();
    all.unshift(inquiry);
    writeDB(all);

    return NextResponse.json({ success: true, inquiry });
  } catch (error) {
    console.error('Error creating inquiry:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
