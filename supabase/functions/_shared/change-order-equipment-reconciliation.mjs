// Deterministic equipment-only financial reconciliation for committed CO additions.
// Pure calculator: not an SQL writer, approval handler, or Techsafe export authority.
// Non-add actions must be reconciled against the actual proposal line baseline in a DB transaction.
const integer = (n, name) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(name + ' must be a nonnegative safe integer');
  return n;
};
function additions(lines, label) {
  if (!Array.isArray(lines)) throw new TypeError(label + ' must be an array');
  const seen = new Set(), result = new Map();
  for (const line of lines) {
    if (!line || line.action !== 'add') throw new Error(label + ': only stable addition lines supported');
    const id = line.lineId;
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || seen.has(id))
      throw new Error(label + ': invalid or duplicate stable line ID');
    if (typeof line.productId !== 'string' || !line.productId.trim()) throw new Error(label + ': missing catalog product');
    seen.add(id);
    const qty = integer(line.quantity, label + ': quantity');
    const price = integer(line.unitPriceCents, label + ': unit price cents');
    result.set(id, { lineId:id, productId:line.productId, quantity:qty, unitPriceCents:price });
  }
  return result;
}
export function reconcileCommittedEquipmentAdditions({ committed, staged }) {
  const before = additions(committed, 'committed');
  const after = additions(staged, 'staged');
  const effects = [];
  let totalDelta = 0n;
  for (const id of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldLine = before.get(id), nextLine = after.get(id);
    if (oldLine && nextLine && oldLine.productId !== nextLine.productId)
      throw new Error('Product identity changed: reverse old line and create a new stable ID');
    const oldQty = oldLine?.quantity ?? 0, newQty = nextLine?.quantity ?? 0;
    const oldCents = oldLine?.unitPriceCents ?? 0, newCents = nextLine?.unitPriceCents ?? 0;
    const delta = BigInt(newQty) * BigInt(newCents) - BigInt(oldQty) * BigInt(oldCents);
    if (oldQty !== newQty || oldCents !== newCents || !oldLine || !nextLine) {
      effects.push({
        lineId:id, productId:(nextLine ?? oldLine).productId,
        oldQuantity:oldQty, newQuantity:newQty, quantityDelta:newQty-oldQty,
        oldUnitPriceCents:oldCents, newUnitPriceCents:newCents,
        valueDeltaCents:delta.toString(),
        operation:!oldLine?'add':!nextLine?'remove':'update'
      });
      totalDelta += delta;
    }
  }
  return { changed:effects.length>0, effects, totalDeltaCents:totalDelta.toString() };
}
