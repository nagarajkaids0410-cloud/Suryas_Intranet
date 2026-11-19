export function getNextEmployeeId(existingIds: Array<string | undefined>): string {
  const usedIds = new Set(existingIds.filter((id): id is string => typeof id === 'string'));
  for (let number = 1; number <= 99; number += 1) {
    const employeeId = `MIB${String(number).padStart(2, '0')}`;
    if (!usedIds.has(employeeId)) return employeeId;
  }
  throw new Error('No available five-character MIB employee IDs remain');
}
