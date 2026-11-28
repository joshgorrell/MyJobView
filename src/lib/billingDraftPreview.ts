import { previewAccountReminders, applyAccountReminderCadence, type AccountPreviewInvoice, type AccountReminderHistory } from './billingReminderPreview.ts';
import { validateBillingTemplates, renderBillingTemplatePreview, type BillingTemplate } from './billingReminderTemplates.ts';

export interface DraftPreviewSettings {
  organizationId: string;
  minimumDays: number;
  templates: readonly BillingTemplate[];
}

// In-memory preview only. Input must be read and authorized by a future server adapter.
export function composeBillingDraftPreview(settings: DraftPreviewSettings, invoices: readonly AccountPreviewInvoice[], history: readonly AccountReminderHistory[], asOf: string) {
  if (!settings.organizationId || invoices.some(i=>i.organizationId!==settings.organizationId) || history.some(h=>h.organizationId!==settings.organizationId)) throw new Error('Mixed dealer scope');
  validateBillingTemplates(settings.templates);
  const stages = new Map(settings.templates.map(t=>[t.offset,t]));
  const candidates = previewAccountReminders(invoices,asOf,[...stages.keys()]);
  return applyAccountReminderCadence(candidates,history,asOf,settings.minimumDays).map(candidate=>{
    const template=stages.get(candidate.stage);
    if(!template)throw new Error('Missing stage template');
    return {...candidate, messagePreview:renderBillingTemplatePreview(template,'Sample Customer',candidate.balanceCents), deliveryAuthorized:false as const};
  });
}
