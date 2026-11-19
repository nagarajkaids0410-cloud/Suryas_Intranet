export function collectDecisionRemarks(action: string): string | null {
  const value = window.prompt(`Enter optional remarks to ${action} this request.`);
  return value === null ? null : value.trim();
}