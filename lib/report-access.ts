const restrictedReportSubmitters = new Set([
  'hareeshv',
  'santhanakumarv',
  'gkbharath',
]);

export function isReportSubmissionRestricted(username?: string) {
  return Boolean(username && restrictedReportSubmitters.has(username.toLowerCase()));
}
