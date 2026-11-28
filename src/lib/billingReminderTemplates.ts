// Plain-text draft templates: never send from this module.
export const BILLING_TEMPLATE_DEFAULTS = [
  {offset:-5, subject:'Upcoming payment reminder', body:'Hello {{customer_name}},\n\nA payment of {{reminder_balance}} is coming due. Please review your invoices in your customer portal.'},
  {offset:0, subject:'Payment due today', body:'Hello {{customer_name}},\n\nYour scheduled payment of {{reminder_balance}} is due today. Please review your invoices in your customer portal.'},
  {offset:7, subject:'Friendly payment reminder', body:'Hello {{customer_name}},\n\nOur records show a balance of {{reminder_balance}} for the invoices listed below. Please review your customer portal.'},
  {offset:15, subject:'Outstanding payment reminder', body:'Hello {{customer_name}},\n\nOur records show an outstanding balance of {{reminder_balance}} for the invoices listed below. Please arrange payment or contact our billing team.'},
  {offset:30, subject:'Past-due account notice', body:'Hello {{customer_name}},\n\nPlease review the outstanding invoices totaling {{reminder_balance}} and arrange payment or contact our billing team.'},
  {offset:45, subject:'Important billing notice', body:'Hello {{customer_name}},\n\nYour outstanding invoices listed below require attention. Please arrange payment of {{reminder_balance}} or contact our billing team.'},
  {offset:60, subject:'Account requires attention', body:'Hello {{customer_name}},\n\nPlease contact our billing team regarding the outstanding invoices totaling {{reminder_balance}}.'},
] as const;

export interface BillingTemplate {
  offset: number;
  subject: string;
  body: string;
}

export function validateBillingTemplates(templates: readonly BillingTemplate[]): void {
  if (templates.length > 32) throw new Error('Too many reminder stages');
  let previous = -Infinity;
  for (const template of templates) {
    if (!Number.isSafeInteger(template.offset) || template.offset < -365 || template.offset > 365 || template.offset <= previous) throw new Error('Invalid stage order');
    if (!template.subject.trim() || template.subject.length > 160 || /[\r\n]/.test(template.subject) || !template.body.trim() || template.body.length > 10000) throw new Error('Invalid template text');
    for (const value of [template.subject, template.body]) {
      const remaining = value.replace(/\{\{(customer_name|reminder_balance)\}\}/g, '');
      if (remaining.includes('{{') || remaining.includes('}}')) throw new Error('Unknown template variable');
    }
    previous = template.offset;
  }
}

export function renderBillingTemplatePreview(template: BillingTemplate, customerName: string, balanceCents: number) {
  validateBillingTemplates([template]);
  if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0) throw new Error('Invalid reminder balance');
  if (!customerName.trim() || /[\r\n]/.test(customerName)) throw new Error('Invalid customer name');
  const values = {customer_name: customerName, reminder_balance: new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(balanceCents / 100)};
  const render = (value: string) => value.replace(/\{\{(customer_name|reminder_balance)\}\}/g, (_, key: keyof typeof values) => values[key]);
  return {subject: render(template.subject), body: render(template.body)};
}
