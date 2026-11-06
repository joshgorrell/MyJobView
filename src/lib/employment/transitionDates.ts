export function validateEmploymentTransition(lastEmployeeDay: string, contractorStartDay: string): boolean {
  const last = new Date(`${lastEmployeeDay}T00:00:00Z`);
  const start = new Date(`${contractorStartDay}T00:00:00Z`);
  return Number.isFinite(last.getTime()) && Number.isFinite(start.getTime()) && start.getTime() === last.getTime() + 86400000;
}
