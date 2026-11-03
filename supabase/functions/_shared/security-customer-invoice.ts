// Customer copies expose the account price; accounting retains the source lines.
export function customerSecurityInvoiceLines(invoice:any, lines:any[]):any[] {
  if(!invoice.security_billing_cycle_id) return lines;
  const amount=Number(invoice.subtotal||0);
  return [{id:`security-total-${invoice.id||''}`,description:'Security monitoring and related services',quantity:1,unit_price:amount,amount,is_taxable:true,notes:null,notes_visible_on_invoice:false}];
}
