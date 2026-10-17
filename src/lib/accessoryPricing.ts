export function accessoryPricing(link: any, parentQuantity = 1) {
  const product = link.accessory || {};
  const quantity = Number(link.quantity ?? 1) * parentQuantity;
  const price = Number(link.unit_price_override ?? product.our_price ?? product.retail_price ?? 0);
  const hours = Number(link.labor_hours_override ?? product.default_labor_hours ?? 0);
  const rate = Number(link.labor_rate_override ?? product.labor_phases?.default_price ?? product.labor_rate ?? 0);
  const material = quantity * price;
  const labor = quantity * hours * rate;
  return { quantity, price, hours, rate, material, labor, total: material + labor };
}
