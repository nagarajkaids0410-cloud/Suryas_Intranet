import fs from 'fs';
import path from 'path';
import { addAuditEntry } from './audit-log';
import { getSupabaseAdmin } from './supabase';

export type LedgerTransactionType = 'credited' | 'debited';

export interface LedgerTransaction {
  id: string;
  date: string;
  amount: number;
  purpose: string;
  remarks?: string;
  type: LedgerTransactionType;
  balanceAfter: number;
  requestId?: string;
  requestType?: string;
  amountBy?: string;
  modeOfPayment?: string;
}

export interface CompanyLedger {
  balance: number;
  transactions: LedgerTransaction[];
}

const LEDGER_FILE = path.join(process.cwd(), '.data', 'company-ledger.json');

function ensureLedgerFile(): void {
  const dir = path.dirname(LEDGER_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LEDGER_FILE)) {
    const initial: CompanyLedger = { balance: 0, transactions: [] };
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(initial, null, 2));
  }
}

function readLedger(): CompanyLedger {
  try {
    ensureLedgerFile();
    const raw = fs.readFileSync(LEDGER_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as CompanyLedger;
    return {
      balance: typeof parsed.balance === 'number' ? parsed.balance : 0,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch (error) {
    console.error('Error reading company ledger:', error);
    return { balance: 0, transactions: [] };
  }
}

let cachedLedger: CompanyLedger | undefined;

function writeLedger(ledger: CompanyLedger): void {
  cachedLedger = ledger;
  try {
    ensureLedgerFile();
    fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2));
  } catch (error) {
    console.error('Error writing company ledger:', error);
  }
}

export function getCompanyLedger(): CompanyLedger {
  return cachedLedger || readLedger();
}

export async function fetchLedgerFromSupabase(): Promise<CompanyLedger> {
  try {
    const supabase = getSupabaseAdmin();
    const { data: summary } = await supabase.from('company_ledger_summary').select('balance').eq('id', 1).maybeSingle();
    const { data: txns } = await supabase.from('company_ledger_transactions').select('*').order('date', { ascending: false });
    if (summary !== null || (txns && txns.length > 0)) {
      cachedLedger = {
        balance: summary?.balance ? Number(summary.balance) : 0,
        transactions: (txns || []) as LedgerTransaction[],
      };
      return cachedLedger;
    }
  } catch (err) {
    console.warn('[Supabase fetchLedgerFromSupabase error]:', err);
  }
  return cachedLedger || readLedger();
}

export function addLedgerTransaction(input: {
  amount: number;
  purpose: string;
  remarks?: string;
  type: LedgerTransactionType;
  requestId?: string;
  requestType?: string;
  amountBy?: string;
  modeOfPayment?: string;
  date?: string;
}): CompanyLedger {
  const ledger = cachedLedger || readLedger();
  const normalizedAmount = Number(input.amount);
  const delta = input.type === 'credited' ? normalizedAmount : -normalizedAmount;
  const nextBalance = Number((ledger.balance + delta).toFixed(2));

  const transaction: LedgerTransaction = {
    id: `txn-${Date.now()}`,
    date: input.date || new Date().toISOString(),
    amount: normalizedAmount,
    purpose: input.purpose,
    remarks: input.remarks,
    type: input.type,
    balanceAfter: nextBalance,
    requestId: input.requestId,
    requestType: input.requestType,
    amountBy: input.amountBy,
    modeOfPayment: input.modeOfPayment,
  };

  const nextLedger: CompanyLedger = {
    balance: nextBalance,
    transactions: [transaction, ...ledger.transactions],
  };

  writeLedger(nextLedger);
  try {
    addAuditEntry({ action: `financial:${input.type}`, actor: input.amountBy || 'system', details: { amount: input.amount, purpose: input.purpose, modeOfPayment: input.modeOfPayment, balanceAfter: nextBalance } });
  } catch (e) {
    console.error('Audit log failed for ledger transaction', e);
  }

  // Background sync to Supabase
  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(supabase.from('company_ledger_transactions').upsert(transaction)).catch(() => {});
    Promise.resolve(supabase.from('company_ledger_summary').upsert({ id: 1, balance: nextBalance, updatedAt: new Date().toISOString() })).catch(() => {});
  } catch {}

  return nextLedger;
}

export async function addLedgerTransactionAndSync(input: {
  amount: number;
  purpose: string;
  remarks?: string;
  type: LedgerTransactionType;
  requestId?: string;
  requestType?: string;
  amountBy?: string;
  modeOfPayment?: string;
  date?: string;
}): Promise<CompanyLedger> {
  const supabase = getSupabaseAdmin();
  const currentLedger = await fetchLedgerFromSupabase();
  const normalizedAmount = Number(input.amount);
  const delta = input.type === 'credited' ? normalizedAmount : -normalizedAmount;
  const nextBalance = Number((currentLedger.balance + delta).toFixed(2));

  const transaction: LedgerTransaction = {
    id: `txn-${Date.now()}`,
    date: input.date || new Date().toISOString(),
    amount: normalizedAmount,
    purpose: input.purpose,
    remarks: input.remarks,
    type: input.type,
    balanceAfter: nextBalance,
    requestId: input.requestId,
    requestType: input.requestType,
    amountBy: input.amountBy,
    modeOfPayment: input.modeOfPayment,
  };

  const nextLedger: CompanyLedger = {
    balance: nextBalance,
    transactions: [transaction, ...currentLedger.transactions],
  };

  writeLedger(nextLedger);

  const { error: txnError } = await supabase.from('company_ledger_transactions').upsert(transaction);
  if (txnError) {
    console.error('[Supabase addLedgerTransactionAndSync txn error]:', txnError);
    throw new Error(txnError.message || 'Failed to record ledger transaction');
  }

  const { error: summaryError } = await supabase
    .from('company_ledger_summary')
    .upsert({ id: 1, balance: nextBalance, updatedAt: new Date().toISOString() });
  if (summaryError) {
    console.error('[Supabase addLedgerTransactionAndSync summary error]:', summaryError);
    throw new Error(summaryError.message || 'Failed to update ledger balance');
  }

  try {
    const { addAuditEntryAndSync } = await import('./audit-log');
    await addAuditEntryAndSync({
      action: `financial:${input.type}`,
      actor: input.amountBy || 'system',
      details: { amount: input.amount, purpose: input.purpose, modeOfPayment: input.modeOfPayment, balanceAfter: nextBalance },
    });
  } catch (e) {
    console.error('Audit log failed for ledger transaction', e);
  }

  return nextLedger;
}