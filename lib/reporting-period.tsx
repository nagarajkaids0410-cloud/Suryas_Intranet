'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type ReportingPeriod = 'this-month' | 'previous-month' | 'last-three-months';

interface ReportingPeriodContextValue {
  period: ReportingPeriod;
  setPeriod: (period: ReportingPeriod) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

const STORAGE_KEY = 'suryas-reporting-period';
const DATE_STORAGE_KEY = 'suryas-reporting-date';
const ReportingPeriodContext = createContext<ReportingPeriodContextValue | null>(null);

export function ReportingPeriodProvider({ children }: { children: React.ReactNode }) {
  const [period, setPeriodState] = useState<ReportingPeriod>('this-month');
  const [selectedDate, setSelectedDateState] = useState('');

  useEffect(() => {
    const savedPeriod = window.localStorage.getItem(STORAGE_KEY);
    if (savedPeriod === 'this-month' || savedPeriod === 'previous-month' || savedPeriod === 'last-three-months') {
      setPeriodState(savedPeriod);
    }
    const savedDate = window.localStorage.getItem(DATE_STORAGE_KEY) || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(savedDate)) setSelectedDateState(savedDate);
  }, []);

  const setPeriod = (nextPeriod: ReportingPeriod) => {
    setPeriodState(nextPeriod);
    window.localStorage.setItem(STORAGE_KEY, nextPeriod);
  };

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);
    if (date) window.localStorage.setItem(DATE_STORAGE_KEY, date);
    else window.localStorage.removeItem(DATE_STORAGE_KEY);
  };

  return (
    <ReportingPeriodContext.Provider value={{ period, setPeriod, selectedDate, setSelectedDate }}>
      {children}
    </ReportingPeriodContext.Provider>
  );
}

export function useReportingPeriod() {
  const context = useContext(ReportingPeriodContext);
  if (!context) throw new Error('useReportingPeriod must be used within ReportingPeriodProvider');
  return context;
}

function indiaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function getReportingPeriodRange(period: ReportingPeriod, now = new Date()) {
  const today = indiaDate(now);
  const todayDate = new Date(`${today}T00:00:00Z`);
  const year = todayDate.getUTCFullYear();
  const month = todayDate.getUTCMonth();

  if (period === 'previous-month') {
    return {
      fromDate: new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10),
      toDate: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
    };
  }

  const monthOffset = period === 'last-three-months' ? 2 : 0;
  return {
    fromDate: new Date(Date.UTC(year, month - monthOffset, 1)).toISOString().slice(0, 10),
    toDate: today,
  };
}

export function isInReportingPeriod(value: unknown, period: ReportingPeriod, selectedDate = '') {
  if (typeof value !== 'string' || !value) return false;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : Number.isNaN(new Date(value).getTime())
      ? ''
      : indiaDate(new Date(value));
  if (!date) return false;
  if (selectedDate) return date === selectedDate;
  const { fromDate, toDate } = getReportingPeriodRange(period);
  return date >= fromDate && date <= toDate;
}

export function requestIsInReportingPeriod(request: any, period: ReportingPeriod, selectedDate = '') {
  if (isInReportingPeriod(request.createdAt, period, selectedDate) || isInReportingPeriod(request.updatedAt, period, selectedDate)) return true;
  return Array.isArray(request.payload?.comments) &&
    request.payload.comments.some((comment: any) => isInReportingPeriod(comment.at, period, selectedDate));
}
