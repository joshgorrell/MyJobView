/** Shared invoice assignment rules. No database writes or commission accrual here. */
export type InvoiceKind = 'project' | 'service' | 'retail';
export type InvoiceRole = 'salesRep' | 'designer' | 'manager';
export interface InvoiceAssignments {
  salesRep: string | null;
  designer: string | null;
  manager: string | null;
}
export interface InvoiceSource {
  salesOrderId?: string | null;
  projectId?: string | null;
  workOrderId?: string | null;
  kind?: InvoiceKind | null;
}
export const invoiceRoleLabels: Record<InvoiceKind, Partial<Record<InvoiceRole, string>>> = {
  project: { salesRep: 'Sales Rep', designer: 'Designer', manager: 'Project Manager' },
  service: { salesRep: 'Sales Rep', manager: 'Service Manager' },
  retail: { salesRep: 'Sales Rep' },
};
export function resolveInvoiceKind(source: InvoiceSource): InvoiceKind {
  if (source.salesOrderId) {
    if (source.kind && source.kind !== 'project') throw new Error('Sales order invoice must be a project invoice');
    return 'project';
  }
  if (source.projectId) throw new Error('Project commission attribution requires a sales order');
  if (source.workOrderId) {
    if (source.kind && source.kind !== 'service') throw new Error('Work order invoice must be a service invoice');
    return 'service';
  }
  if (!source.kind || source.kind === 'project') {
    throw new Error('Standalone invoices require explicit service or retail classification');
  }
  return source.kind;
}
export function normalizeInvoiceAssignments(kind: InvoiceKind, value: InvoiceAssignments): InvoiceAssignments {
  return {
    salesRep: value.salesRep,
    designer: kind === 'project' ? value.designer : null,
    manager: kind === 'retail' ? null : value.manager,
  };
}
export function editableInvoiceRoles(kind: InvoiceKind): InvoiceRole[] {
  return kind === 'project' ? [] : kind === 'service' ? ['salesRep', 'manager'] : ['salesRep'];
}
