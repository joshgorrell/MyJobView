import { supabase } from './supabase';

export interface COLineItemRecord {
  id: string;
  action_type: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | 'modify_labor' | 'modify_modifiers';
  proposal_line_item_id: string | null;
  original_quantity: number | null;
  original_unit_price: number | null;
  original_total: number | null;
  original_labor_total: number | null;
  new_quantity: number;
  new_unit_price: number;
  new_total: number;
  new_labor_total: number;
  change_amount: number;
  product_name: string;
  room_name: string | null;
  item_type: string | null;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_phase_id: string | null;
  remove_scope: 'parts_only' | 'parts_and_labor' | null;
  modifier_adjustments: ModifierAdjustment[] | null;
}

export interface ModifierAdjustment {
  label: string;
  field: string;
  old_value: number;
  new_value: number;
}

export interface COAuditItemData {
  description?: string;
  quantity?: number;
  unit_price?: number;
  line_total?: number;
  labor_total?: number;
  labor_hours?: number;
  labor_rate?: number;
  labor_phase_id?: string | null;
  item_type?: string;
  is_taxable?: boolean;
  remove_scope?: 'parts_only' | 'parts_and_labor';
  original_quantity?: number;
  original_unit_price?: number;
  original_line_total?: number;
  original_labor_total?: number;
}

export interface COModifierSnapshot {
  discount_percent: number;
  project_management_percent: number;
  project_design_percent: number;
  system_design_percent: number;
  credit_card_fee_percent: number;
  misc_parts_percent: number;
  custom_modifier_1_percent: number;
  custom_modifier_2_percent: number;
  custom_modifier_1_label: string | null;
  custom_modifier_2_label: string | null;
  apply_discount: boolean;
  apply_project_management: boolean;
  apply_project_design: boolean;
  apply_system_design: boolean;
  apply_credit_card_fee: boolean;
  apply_misc_parts: boolean;
  apply_custom_modifier_1: boolean;
  apply_custom_modifier_2: boolean;
}

const MODIFIER_LABELS: Record<string, string> = {
  discount_percent: 'Discount',
  project_management_percent: 'Project Management',
  project_design_percent: 'Project Design',
  system_design_percent: 'System Design',
  credit_card_fee_percent: 'Credit Card Fee',
  misc_parts_percent: 'Misc Parts',
};

export async function recordCOAction(
  changeOrderId: string,
  itemId: string,
  actionType: 'add' | 'remove' | 'modify_quantity' | 'modify_price' | 'modify_labor',
  itemData: COAuditItemData,
  roomName: string,
  existingRecords: COLineItemRecord[],
): Promise<void> {
  const existing = existingRecords.find(c => c.proposal_line_item_id === itemId);

  const materialTotal = (itemData.quantity ?? 0) * (itemData.unit_price ?? 0);
  const laborTotal = itemData.labor_total ?? 0;
  const newTotal = materialTotal + laborTotal;

  const payload: Record<string, unknown> = {
    change_order_id: changeOrderId,
    action_type: actionType,
    proposal_line_item_id: itemId,
    product_name: itemData.description || '',
    room_name: roomName,
    new_quantity: itemData.quantity ?? 0,
    new_unit_price: itemData.unit_price ?? 0,
    new_total: newTotal,
    new_labor_total: laborTotal,
    change_amount: 0,
    is_taxable: itemData.is_taxable ?? true,
    item_type: itemData.item_type || 'material',
    labor_hours: itemData.labor_hours ?? null,
    labor_rate: itemData.labor_rate ?? null,
    labor_phase_id: itemData.labor_phase_id ?? null,
    remove_scope: null,
  };

  if (actionType === 'remove') {
    const origMaterialTotal = itemData.line_total ?? 0;
    const origLaborTotal = itemData.labor_total ?? 0;
    const scope = itemData.remove_scope ?? 'parts_and_labor';
    payload.remove_scope = scope;
    payload.original_quantity = itemData.quantity;
    payload.original_unit_price = itemData.unit_price;
    payload.original_total = origMaterialTotal;
    payload.original_labor_total = origLaborTotal;
    payload.new_quantity = 0;
    payload.new_unit_price = 0;

    if (scope === 'parts_only') {
      payload.new_total = 0;
      payload.new_labor_total = origLaborTotal;
      payload.change_amount = -origMaterialTotal;
    } else {
      payload.new_total = 0;
      payload.new_labor_total = 0;
      payload.change_amount = -(origMaterialTotal + origLaborTotal);
    }
  } else if (actionType === 'add') {
    payload.change_amount = newTotal;
  } else if (actionType === 'modify_quantity' || actionType === 'modify_price') {
    if (!existing) {
      payload.original_quantity = itemData.original_quantity ?? itemData.quantity;
      payload.original_unit_price = itemData.original_unit_price ?? itemData.unit_price;
      payload.original_total = itemData.original_line_total ?? itemData.line_total;
      payload.original_labor_total = itemData.original_labor_total ?? itemData.labor_total ?? 0;
    } else {
      payload.original_quantity = existing.original_quantity;
      payload.original_unit_price = existing.original_unit_price;
      payload.original_total = existing.original_total;
      payload.original_labor_total = existing.original_labor_total;
    }
    const origMaterial = (payload.original_total as number) ?? 0;
    const origLabor = (payload.original_labor_total as number) ?? 0;
    const origTotal = origMaterial + origLabor;
    payload.change_amount = newTotal - origTotal;

    if (Math.abs(payload.change_amount as number) < 0.001 &&
        Math.abs(((payload.new_quantity as number) ?? 0) - ((payload.original_quantity as number) ?? 0)) < 0.001 &&
        Math.abs(((payload.new_unit_price as number) ?? 0) - ((payload.original_unit_price as number) ?? 0)) < 0.001 &&
        Math.abs(((payload.new_labor_total as number) ?? 0) - ((origLabor) ?? 0)) < 0.001) {
      if (existing) {
        await supabase.from('change_order_line_items').delete().eq('id', existing.id);
      }
      return;
    }
  } else if (actionType === 'modify_labor') {
    if (!existing) {
      payload.original_quantity = itemData.original_quantity ?? itemData.quantity;
      payload.original_unit_price = itemData.original_unit_price ?? itemData.unit_price;
      payload.original_total = itemData.original_line_total ?? itemData.line_total;
      payload.original_labor_total = itemData.original_labor_total ?? itemData.labor_total ?? 0;
    } else {
      payload.original_quantity = existing.original_quantity;
      payload.original_unit_price = existing.original_unit_price;
      payload.original_total = existing.original_total;
      payload.original_labor_total = existing.original_labor_total;
    }
    const origMaterial = (payload.original_total as number) ?? 0;
    const origLabor = (payload.original_labor_total as number) ?? 0;
    const origTotal = origMaterial + origLabor;
    payload.change_amount = newTotal - origTotal;

    if (Math.abs(payload.change_amount as number) < 0.001 &&
        Math.abs(((payload.new_labor_total as number) ?? 0) - (origLabor ?? 0)) < 0.001) {
      if (existing) {
        await supabase.from('change_order_line_items').delete().eq('id', existing.id);
      }
      return;
    }
  }

  if (existing) {
    const { error } = await supabase.from('change_order_line_items').update(payload).eq('id', existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { data: coRow } = await supabase
      .from('change_orders')
      .select('organization_id')
      .eq('id', changeOrderId)
      .maybeSingle();
    if (coRow?.organization_id) {
      payload.organization_id = coRow.organization_id;
    }
    const { error } = await supabase.from('change_order_line_items').insert(payload);
    if (error) throw new Error(error.message);
  }
}

export async function recordCOModifierChange(
  changeOrderId: string,
  oldSnapshot: COModifierSnapshot,
  newSnapshot: COModifierSnapshot,
  existingRecords: COLineItemRecord[],
): Promise<void> {
  const adjustments: ModifierAdjustment[] = [];

  const fields: Array<keyof COModifierSnapshot> = [
    'discount_percent',
    'project_management_percent',
    'project_design_percent',
    'system_design_percent',
    'credit_card_fee_percent',
    'misc_parts_percent',
    'custom_modifier_1_percent',
    'custom_modifier_2_percent',
  ];

  for (const field of fields) {
    const oldVal = (oldSnapshot[field] as number) ?? 0;
    const newVal = (newSnapshot[field] as number) ?? 0;

    const oldApplyField = field.replace('_percent', '').replace('custom_modifier_1', 'custom_modifier_1').replace('custom_modifier_2', 'custom_modifier_2') as keyof COModifierSnapshot;
    const applyField = ('apply_' + field.replace('_percent', '')) as keyof COModifierSnapshot;
    const oldApply = (oldSnapshot[applyField] as boolean) ?? false;
    const newApply = (newSnapshot[applyField] as boolean) ?? false;

    if (oldVal === newVal && oldApply === newApply) continue;

    let label = MODIFIER_LABELS[field] ?? field;
    if (field === 'custom_modifier_1_percent') {
      label = newSnapshot.custom_modifier_1_label || oldSnapshot.custom_modifier_1_label || 'Custom Modifier 1';
    } else if (field === 'custom_modifier_2_percent') {
      label = newSnapshot.custom_modifier_2_label || oldSnapshot.custom_modifier_2_label || 'Custom Modifier 2';
    }

    adjustments.push({
      label,
      field,
      old_value: oldApply ? oldVal : 0,
      new_value: newApply ? newVal : 0,
    });
  }

  if (adjustments.length === 0) return;

  const existing = existingRecords.find(r => r.action_type === 'modify_modifiers');

  const payload: Record<string, unknown> = {
    change_order_id: changeOrderId,
    action_type: 'modify_modifiers',
    proposal_line_item_id: null,
    product_name: 'Modifier Adjustments',
    room_name: null,
    new_quantity: 0,
    new_unit_price: 0,
    new_total: 0,
    new_labor_total: 0,
    change_amount: 0,
    modifier_adjustments: adjustments,
  };

  if (existing) {
    const mergedAdjustments = mergeModifierAdjustments(existing.modifier_adjustments ?? [], adjustments);
    payload.modifier_adjustments = mergedAdjustments;
    await supabase.from('change_order_line_items').update(payload).eq('id', existing.id);
  } else {
    const { data: coRow } = await supabase
      .from('change_orders')
      .select('organization_id')
      .eq('id', changeOrderId)
      .maybeSingle();
    if (coRow?.organization_id) {
      payload.organization_id = coRow.organization_id;
    }
    await supabase.from('change_order_line_items').insert(payload);
  }
}

function mergeModifierAdjustments(
  existing: ModifierAdjustment[],
  incoming: ModifierAdjustment[],
): ModifierAdjustment[] {
  const map = new Map<string, ModifierAdjustment>();
  for (const adj of existing) {
    map.set(adj.field, adj);
  }
  for (const adj of incoming) {
    const prev = map.get(adj.field);
    if (prev) {
      map.set(adj.field, { ...adj, old_value: prev.old_value });
    } else {
      map.set(adj.field, adj);
    }
  }
  return Array.from(map.values()).filter(a => a.old_value !== a.new_value);
}

export async function updateCOTotals(
  changeOrderId: string,
  onRefresh?: () => void,
): Promise<void> {
  const { error } = await supabase.rpc('calculate_change_order_totals', {
    p_change_order_id: changeOrderId,
  });

  if (error) {
    const { data: items } = await supabase
      .from('change_order_line_items')
      .select('change_amount')
      .eq('change_order_id', changeOrderId)
      .neq('action_type', 'modify_modifiers');

    if (!items) return;

    const changeAmount = items.reduce((sum, i) => sum + (i.change_amount || 0), 0);

    const { data: coData } = await supabase
      .from('change_orders')
      .select('original_contract_amount')
      .eq('id', changeOrderId)
      .maybeSingle();

    const origAmount = coData?.original_contract_amount ?? 0;

    await supabase
      .from('change_orders')
      .update({
        change_amount: changeAmount,
        new_contract_total: origAmount + changeAmount,
      })
      .eq('id', changeOrderId);
  }

  onRefresh?.();
}

export async function loadCOLineItems(changeOrderId: string): Promise<COLineItemRecord[]> {
  const { data } = await supabase
    .from('change_order_line_items')
    .select('*')
    .eq('change_order_id', changeOrderId)
    .order('sort_order');
  return data || [];
}

export async function restoreCOLineItem(
  changeOrderId: string,
  coLineItemId: string,
  proposalLineItemId: string,
  onRefresh?: () => void,
): Promise<void> {
  const { data: coRecord } = await supabase
    .from('change_order_line_items')
    .select('remove_scope')
    .eq('id', coLineItemId)
    .maybeSingle();

  await supabase.from('change_order_line_items').delete().eq('id', coLineItemId);

  if (coRecord?.remove_scope === 'parts_only') {
    await supabase.from('proposal_line_items').update({ is_hidden: false }).eq('id', proposalLineItemId);
  } else {
    await supabase.from('proposal_line_items').update({ is_hidden: false }).eq('id', proposalLineItemId);
  }

  await updateCOTotals(changeOrderId, onRefresh);
}
