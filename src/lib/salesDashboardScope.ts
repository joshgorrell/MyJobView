export function salesDashboardScope(profile: { id: string; role?: string; is_sales_rep?: boolean } | null | undefined, selectedRepId: string | null | undefined) {
  const canSelectRep = !!profile && ['admin', 'manager', 'sales_manager'].includes(profile.role || '');
  const repId = !profile ? null : canSelectRep
    ? (selectedRepId === undefined ? (profile.is_sales_rep ? profile.id : null) : selectedRepId)
    : (profile.is_sales_rep ? profile.id : null);
  return { repId, canSelectRep, allSales: !!profile && canSelectRep && repId === null };
}
