export function validatePrefill(value: unknown): void {
  const fail = () => { throw new Error('AI returned an invalid design. Your notes are saved; please retry.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const prefill = value as Record<string, unknown>;
  if (!Array.isArray(prefill.rooms) || prefill.rooms.length === 0) return fail();
  for (const key of ['title', 'contactSearchName', 'notes']) {
    if (prefill[key] != null && typeof prefill[key] !== 'string') return fail();
  }
  if (prefill.taxEnvironment != null && !['residential','commercial'].includes(String(prefill.taxEnvironment))) return fail();
  const taxTypes = ['original_construction','remodel','general_installation_repair','exempt_project','design_services','maintenance_agreement','membership','security_monitoring'];
  if (prefill.taxProjectType != null && !taxTypes.includes(String(prefill.taxProjectType))) return fail();
  for (const room of prefill.rooms) {
    if (!room || typeof room.name !== 'string' || !room.name.trim() || !Array.isArray(room.lineItems)) return fail();
    if (room.description != null && typeof room.description !== 'string') return fail();
    for (const item of room.lineItems) {
      if (!item || typeof item.description !== 'string' || !item.description.trim() ||
        !['material','labor'].includes(item.itemType) || typeof item.quantity !== 'number' ||
        !Number.isFinite(item.quantity) || item.quantity <= 0 || typeof item.unit !== 'string' || !item.unit.trim()) return fail();
      if (item.laborHours != null && (typeof item.laborHours !== 'number' || !Number.isFinite(item.laborHours) || item.laborHours < 0)) return fail();
      // AI output cannot certify a catalog ID, price, packaging or reviewer decision.
      for (const key of ['matchedProductId','matchedProductName','matchConfidence','overridePrice','overrideQuantity']) delete item[key];
    }
  }
}
