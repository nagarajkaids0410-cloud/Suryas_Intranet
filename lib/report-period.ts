export type ReportFrequency = 'weekly' | 'monthly';
export type ReportPeriodMode = 'period' | 'range';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekday = (jan4.getUTCDay() + 6) % 7;
  jan4.setUTCDate(jan4.getUTCDate() - weekday + (week - 1) * 7);
  return jan4;
}

export function getIsoWeekParts(date = new Date()): { year: number; week: number } {
  const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const weekday = (thursday.getUTCDay() + 6) % 7;
  thursday.setUTCDate(thursday.getUTCDate() - weekday + 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstWeekday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstWeekday + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / WEEK_MS);
  return { year, week };
}

export function getIsoWeeksInYear(year: number): number {
  return Math.round((isoWeekMonday(year + 1, 1).getTime() - isoWeekMonday(year, 1).getTime()) / WEEK_MS);
}

export function resolveReportPeriod(input: {
  frequency: ReportFrequency;
  mode: ReportPeriodMode;
  year: number;
  month?: number;
  week?: number;
  fromDate?: string;
  toDate?: string;
}): { fromDate: string; toDate: string; label: string } | null {
  if (input.mode === 'range') {
    const fromDate = input.fromDate || '';
    const toDate = input.toDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate) || fromDate > toDate) return null;
    return { fromDate, toDate, label: `${fromDate} to ${toDate}` };
  }

  if (!Number.isInteger(input.year) || input.year < 2000 || input.year > 2100) return null;
  if (input.frequency === 'monthly') {
    if (!Number.isInteger(input.month) || !input.month || input.month < 1 || input.month > 12) return null;
    const start = new Date(Date.UTC(input.year, input.month - 1, 1));
    const end = new Date(Date.UTC(input.year, input.month, 0));
    const label = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(start);
    return { fromDate: isoDate(start), toDate: isoDate(end), label };
  }

  const maxWeek = getIsoWeeksInYear(input.year);
  if (!Number.isInteger(input.week) || !input.week || input.week < 1 || input.week > maxWeek) return null;
  const start = isoWeekMonday(input.year, input.week);
  const end = new Date(start.getTime() + 6 * DAY_MS);
  return {
    fromDate: isoDate(start),
    toDate: isoDate(end),
    label: `Week ${input.week}, ${input.year}`,
  };
}
