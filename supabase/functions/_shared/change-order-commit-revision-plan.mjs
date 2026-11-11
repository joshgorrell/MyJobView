// Pure, fail-closed preview for a committed change-order revision.
// This is NOT a database writer or an authorization to export to Techsafe.
// Inputs are previously committed and newly staged *effects*, keyed by stable CO line ID.
function assertLines(lines, label) {
  if (!Array.isArray(lines)) throw new TypeError(label + ' must be an array');
  const ids = new Set();
  return lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line)) throw new TypeError('Invalid ' + label + ' line');
    const { lineId, action, targetLineId, productId, quantity, unitPriceCents } = line;
    if (typeof lineId !== 'string' || !/^[0-9a-f-]{36}$/i.test(lineId) || ids.has(lineId))
      throw new Error(label + ': missing or duplicate stable lineId');
    ids.add(lineId);
    if (!['add', 'remove', 'modify_quantity', 'modify_price'].includes(action))
      throw new Error(label + ': unsupported action');
    if (action === 'add' && (typeof productId !== 'string' || !productId.trim()))
      throw new Error(label + ': add requires catalog productId');
    if (action !== 'add' && (typeof targetLineId !== 'string' || !targetLineId.trim()))
      throw new Error(label + ': mutation requires stable targetLineId');
    if (['add', 'modify_quantity'].includes(action) &&
        (!Number.isSafeInteger(quantity) || quantity < 0))
      throw new Error(label + ': invalid quantity');
    if (['add', 'modify_price'].includes(action) &&
        (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0))
      throw new Error(label + ': invalid price');
    return Object.freeze({ ...line });
  });
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sort = (a, b) => a.lineId.localeCompare(b.lineId);
export function planCommittedChangeOrderRevision({ committed, staged, approved, expectedRevision }) {
  if (approved !== true) throw new Error('Customer approval required before commit');
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
    throw new Error('Expected committed revision required');
  const oldLines = assertLines(committed, 'committed').sort(sort);
  const newLines = assertLines(staged, 'staged').sort(sort);
  const oldById = new Map(oldLines.map(line => [line.lineId, line]));
  const newById = new Map(newLines.map(line => [line.lineId, line]));
  const changes = [];
  for (const oldLine of oldLines) {
    const next = newById.get(oldLine.lineId);
    if (!next) changes.push({ type: 'reverse', before: oldLine });
    else if (!same(oldLine, next)) {
      if (oldLine.action !== next.action ||
          oldLine.targetLineId !== next.targetLineId ||
          oldLine.productId !== next.productId)
        throw new Error('Changed identity or action requires explicit reversal and new stable line');
      changes.push({ type: 'replace', before: oldLine, after: next });
    }
  }
  for (const next of newLines) if (!oldById.has(next.lineId))
    changes.push({ type: 'apply', after: next });
  return Object.freeze({
    expectedRevision,
    nextRevision: changes.length ? expectedRevision + 1 : expectedRevision,
    changed: changes.length > 0,
    changes,
    committedLines: newLines
  });
}
