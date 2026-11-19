import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'This legacy endpoint is disabled. Use the secure one-time account setup workflow.' },
    { status: 410 }
  );
}