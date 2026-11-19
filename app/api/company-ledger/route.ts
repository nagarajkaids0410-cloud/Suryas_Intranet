import { NextRequest, NextResponse } from 'next/server';
import { getCompanyLedger, addLedgerTransaction } from '@/lib/company-ledger';
import { requireRole } from '@/lib/rbac';

export async function GET() {
  try {
    const ledger = getCompanyLedger();
    return NextResponse.json({ success: true, ledger });
  } catch (error) {
    console.error('Company ledger fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch company ledger' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const check = requireRole(req, ['admin']);
    if ((check as any)?.status === 403) return check as NextResponse;

    const body = await req.json();
    const { amount, purpose, remarks, type, amountBy, modeOfPayment } = body as any;
    if (!amount || !purpose || !type) {
      return NextResponse.json({ error: 'amount, purpose and type are required' }, { status: 400 });
    }

    const ledger = addLedgerTransaction({
      amount: Number(amount),
      purpose,
      remarks,
      type: type === 'credited' ? 'credited' : 'debited',
      amountBy,
      modeOfPayment,
    });

    return NextResponse.json({ success: true, ledger });
  } catch (error) {
    console.error('Company ledger POST error:', error);
    return NextResponse.json({ error: 'Failed to update ledger' }, { status: 500 });
  }
}