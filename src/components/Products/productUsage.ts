export type UsageType = 'proposal' | 'sales_order' | 'invoice' | 'work_order';
export interface ProductUsage {
  id: string;
  type: UsageType;
  reference: string;
  title: string;
  customer: string;
  date: string;
  status: string;
  quantity: number;
  source: string;
}
const customer = (doc: any) => doc.customer?.business_name || doc.customer?.full_name || 'No customer assigned';
const one = (value: any) => Array.isArray(value) ? value[0] : value;
// Page every source: PostgREST's default result limit must not silently hide older usage.
async function readAll(client: any, table: string, select: string, productId: string) {
  const rows: any[] = [];
  for (let start = 0; ; start += 500) {
    const result = await client.from(table).select(select).eq('product_id', productId)
      .order('id').range(start, start + 499);
    if (result.error) throw result.error;
    const batch = result.data || [];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
export async function loadProductUsage(client: any, productId: string) {
  const contact = 'full_name,business_name';
  const sources = [
    { table: 'proposal_line_items', label: 'Proposals and sales orders', select: `id,quantity,proposal:proposals!inner(id,proposal_number,sales_order_id,title,status,created_at,customer:contacts!proposals_contact_id_fkey(${contact}),orders:sales_orders!sales_orders_proposal_id_fkey(id,order_number,status,created_at,customer:contacts!sales_orders_contact_id_fkey(${contact})))` },
    { table: 'invoice_line_items', label: 'Invoices', select: `id,quantity,invoice:invoices!inner(id,invoice_number,invoice_title,status,created_at,customer:contacts!invoices_contact_id_fkey(${contact}))` },
    { table: 'work_order_materials', label: 'Work orders', select: `id,quantity,work_order:work_orders!inner(id,work_order_number,title,status,created_at,customer:contacts!work_orders_contact_id_fkey(${contact}))` },
    { table: 'change_order_line_items', label: 'Sales order change orders', select: `id,new_quantity,original_quantity,change_order:change_orders!inner(id,change_order_number,status,created_at,order:sales_orders!inner(id,order_number,status,created_at,customer:contacts!sales_orders_contact_id_fkey(${contact})))` },
  ];
  const results = await Promise.allSettled(sources.map(s => readAll(client, s.table, s.select, productId)));
  const items = new Map<string, ProductUsage>();
  const errors: string[] = [];
  const add = (type: UsageType, doc: any, reference: string, quantity: any, title = '', source = '', sourceId = '') => {
    if (!doc) return;
    const key = `${type}:${doc.id}:${sourceId}`;
    const previous = items.get(key);
    if (previous) { previous.quantity += Number(quantity || 0); return; }
    items.set(key, { id: key, type, reference: reference || doc.id, title, customer: customer(doc), date: doc.created_at, status: doc.status || '', quantity: Number(quantity || 0), source });
  };
  results.forEach((result, index) => {
    if (result.status === 'rejected') { errors.push(`${sources[index].label} could not be loaded.`); return; }
    for (const row of result.value) {
      if (index === 0) {
        const p = one(row.proposal);
        if (!p) continue;
        const orders = Array.isArray(p.orders) ? p.orders : p.orders ? [p.orders] : [];
        if (!p.sales_order_id && !orders.length) add('proposal', p, p.proposal_number, row.quantity, p.title);
        for (const order of orders) add('sales_order', order, order.order_number, row.quantity, p.title, `Proposal ${p.proposal_number}`);
      } else if (index === 1) {
        const invoice = one(row.invoice);
        if (invoice) add('invoice', invoice, invoice.invoice_number, row.quantity, invoice.invoice_title);
      } else if (index === 2) {
        const wo = one(row.work_order);
        if (wo) add('work_order', wo, wo.work_order_number, row.quantity, wo.title);
      } else {
        const co = one(row.change_order), order = one(co?.order);
        if (order) add('sales_order', { ...order, created_at: co.created_at }, order.order_number, row.new_quantity ?? row.original_quantity, '', `Change order ${co.change_order_number} · ${co.status}`, co.id);
      }
    }
  });
  return { items: [...items.values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date) || a.reference.localeCompare(b.reference)), errors };
}
