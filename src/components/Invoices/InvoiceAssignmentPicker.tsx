import type { InvoiceAssignments, InvoiceKind, InvoiceRole } from '../../lib/invoiceAssignmentModel';
import { editableInvoiceRoles, invoiceRoleLabels, normalizeInvoiceAssignments } from '../../lib/invoiceAssignmentModel';

export interface AssignmentEmployee {
  id: string;
  name: string;
  eligible?: boolean;
}

interface InvoiceAssignmentPickerProps {
  kind: InvoiceKind;
  value: InvoiceAssignments;
  employees: AssignmentEmployee[];
  onChange?: (value: InvoiceAssignments) => void;
  disabled?: boolean;
  inheritedFrom?: string;
}

const assignmentKeys: InvoiceRole[] = ['salesRep', 'designer', 'manager'];

/**
 * Presentation-only picker. The parent must load eligible employees, inherit project
 * assignments, and persist through a permission-checked server operation.
 * Never treat a selected manager as the Service Department commission recipient.
 */
export function InvoiceAssignmentPicker({
  kind, value, employees, onChange, disabled = false, inheritedFrom = 'sales order',
}: InvoiceAssignmentPickerProps) {
  const normalized = normalizeInvoiceAssignments(kind, value);
  const editable = new Set(editableInvoiceRoles(kind));
  const readOnly = disabled || !onChange;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4" aria-label="Invoice assignments">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-900">Invoice Assignments</h3>
        <p className="mt-1 text-xs text-gray-600">
          {kind === 'project'
            ? `Inherited from the ${inheritedFrom}. Change project roles at the source.`
            : 'Assignments identify responsible employees; commission eligibility and rates are managed separately.'}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {assignmentKeys.filter(role => invoiceRoleLabels[kind][role]).map(role => {
          const selectedId = normalized[role];
          const isLocked = readOnly || !editable.has(role);
          const selectedEmployee = employees.find(employee => employee.id === selectedId);
          return (
            <label key={role} className="block text-sm font-medium text-gray-700">
              {invoiceRoleLabels[kind][role]}
              <select
                className="mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600"
                value={selectedId || ''}
                disabled={isLocked}
                onChange={event => {
                  if (isLocked || !onChange) return;
                  onChange(normalizeInvoiceAssignments(kind, { ...normalized, [role]: event.target.value || null }));
                }}
              >
                <option value="">Not assigned</option>
                {employees.filter(employee => employee.eligible !== false || employee.id === selectedId).map(employee => (
                  <option key={employee.id} value={employee.id}>{employee.name}</option>
                ))}
                {selectedId && !selectedEmployee && (
                  <option value={selectedId}>Assigned employee (unavailable)</option>
                )}
              </select>
            </label>
          );
        })}
      </div>
      {kind === 'service' && (
        <p className="mt-3 text-xs text-gray-500">
          The Service Manager assignment does not automatically award the Service Department allocation to that employee.
        </p>
      )}
    </section>
  );
}
