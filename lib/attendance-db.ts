import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const DATA_DIRECTORY = path.join(process.cwd(), '.data', 'attendance');
const LEGACY_DB_FILE = path.join(process.cwd(), '.data', 'attendance.json');
let legacyAttendanceMigrated = false;

export interface AttendanceRecord {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  employeeId?: string;
  date: string;
  checkIn: string;
  checkOut?: string;
}

function readAttendanceFile(file: string): AttendanceRecord[] {
  const records: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(records)) throw new Error(`Attendance database has an invalid format: ${path.basename(file)}`);
  return records as AttendanceRecord[];
}

function getDateFile(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Attendance date must use YYYY-MM-DD format');
  return path.join(DATA_DIRECTORY, `attendance-${date}.json`);
}

function writeDateFile(date: string, records: AttendanceRecord[]) {
  fs.mkdirSync(DATA_DIRECTORY, { recursive: true });
  fs.writeFileSync(getDateFile(date), JSON.stringify(records, null, 2));
}

function readDB(): AttendanceRecord[] {
  const recordsById = new Map<string, AttendanceRecord>();
  if (fs.existsSync(LEGACY_DB_FILE)) {
    for (const record of readAttendanceFile(LEGACY_DB_FILE)) {
      recordsById.set(record.id, record);
    }
  }
  if (fs.existsSync(DATA_DIRECTORY)) {
    for (const fileName of fs.readdirSync(DATA_DIRECTORY)) {
      if (!/^attendance-\d{4}-\d{2}-\d{2}\.json$/.test(fileName)) continue;
      for (const record of readAttendanceFile(path.join(DATA_DIRECTORY, fileName))) {
        recordsById.set(record.id, record);
      }
    }
  }
  if (!legacyAttendanceMigrated && fs.existsSync(LEGACY_DB_FILE)) {
    const recordsByDate = new Map<string, AttendanceRecord[]>();
    for (const record of recordsById.values()) {
      const dateRecords = recordsByDate.get(record.date) || [];
      dateRecords.push(record);
      recordsByDate.set(record.date, dateRecords);
    }
    for (const [date, dateRecords] of recordsByDate) writeDateFile(date, dateRecords);
    legacyAttendanceMigrated = true;
  }
  return Array.from(recordsById.values());
}

export function getAttendanceForUser(userId: string): AttendanceRecord[] {
  return readDB()
    .filter((record) => record.userId === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function getAttendanceForDate(date: string): AttendanceRecord[] {
  return readDB()
    .filter((record) => record.date === date)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export function getAttendanceInRange(fromDate: string, toDate: string): AttendanceRecord[] {
  return readDB()
    .filter((record) => record.date >= fromDate && record.date <= toDate)
    .sort((a, b) => b.date.localeCompare(a.date) || a.fullName.localeCompare(b.fullName));
}

export function autoCheckOutForDate(date: string, checkedOutAt = new Date().toISOString()): AttendanceRecord[] {
  const dateRecords = readDB().filter((record) => record.date === date);
  const openRecords = dateRecords.filter((record) => !record.checkOut);
  if (openRecords.length === 0) return [];

  for (const record of openRecords) record.checkOut = checkedOutAt;
  writeDateFile(date, dateRecords);
  return openRecords;
}

export function recordAttendance(
  user: { id: string; username: string; fullName: string; employeeId?: string },
  date: string,
  action: 'check-in' | 'check-out'
): AttendanceRecord {
  const dateRecords = readDB().filter((record) => record.date === date);
  const existing = dateRecords.find((record) => record.userId === user.id);
  if (action === 'check-in') {
    if (existing) throw new Error('You have already checked in today');
    const record: AttendanceRecord = {
      id: randomUUID(),
      userId: user.id,
      username: user.username,
      fullName: user.fullName,
      employeeId: user.employeeId,
      date,
      checkIn: new Date().toISOString(),
    };
    dateRecords.push(record);
    writeDateFile(date, dateRecords);
    return record;
  }
  if (!existing) throw new Error('Check in before checking out');
  if (existing.checkOut) throw new Error('You have already checked out today');
  existing.checkOut = new Date().toISOString();
  writeDateFile(date, dateRecords);
  return existing;
}
