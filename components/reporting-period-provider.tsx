'use client';

import { ReportingPeriodProvider } from '@/lib/reporting-period';

export function ReportingPeriodRoot({ children }: { children: React.ReactNode }) {
  return <ReportingPeriodProvider>{children}</ReportingPeriodProvider>;
}
