import type { ProductDetailPanelData } from '../Products/ProductDetailPanel';

export function proposalItemChanges(before: ProductDetailPanelData, after: ProductDetailPanelData) {
  const fields = {
    description: 'description', quantity: 'quantity', unit: 'unit', unitPrice: 'unit_price',
    cost: 'cost', laborHours: 'labor_hours', laborRate: 'labor_rate', laborPhaseId: 'labor_phase_id',
    classId: 'class_id', taskNotes: 'task_notes', showTaskNotes: 'show_task_notes',
    isTaxable: 'is_taxable', isHidden: 'is_hidden', isCustomerSupplied: 'is_customer_supplied',
  } as const;
  const changes: Record<string, any> = {};
  for (const [field, column] of Object.entries(fields)) {
    const key = field as keyof typeof fields;
    if (before[key] !== after[key]) changes[column] = after[key];
  }
  return changes;
}

// Preserve each matching row's unedited values and calculate totals using its own quantity.
export function proposalItemUpdate(item: Record<string, any>, changes: Record<string, any>, isSelectedItem = false) {
  const { room_id, ...sharedChanges } = changes;
  const applicableChanges = isSelectedItem && 'room_id' in changes ? { ...sharedChanges, room_id } : sharedChanges;
  const result = { ...item, ...applicableChanges };
  return {
    ...applicableChanges,
    ...(result.is_customer_supplied ? { unit_price: 0, cost: 0 } : {}),
    line_total: result.is_customer_supplied ? 0 : Number(result.quantity) * Number(result.unit_price || 0),
    labor_total: Number(result.quantity) * Number(result.labor_hours || 0) * Number(result.labor_rate || 0),
  };
}

export function proposalSubstitutionUpdate(item: Record<string, any>, product: Record<string, any>) {
  return proposalItemUpdate(item, {
    product_id: product.id,
    description: product.name || product.description,
    manufacturer: product.manufacturers?.name || null,
    model: product.manufacturer_model_number ?? product.model ?? null,
    sku: product.sku,
    unit_price: product.unit_price ?? item.unit_price,
    cost: product.cost ?? item.cost,
    labor_hours: product.default_labor_hours ?? item.labor_hours,
    labor_rate: product.labor_rate ?? item.labor_rate,
    labor_phase_id: product.labor_phase_id ?? item.labor_phase_id,
  });
}
