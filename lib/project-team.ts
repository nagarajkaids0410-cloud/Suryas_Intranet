export function isEligibleProjectTeamMember(user: {
  role: string;
  designation?: string;
}): boolean {
  return user.role !== 'guest';
}
