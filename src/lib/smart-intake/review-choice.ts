export type ReviewChoice = 'discard' | 'customer_media' | 'work_order' | 'both';

export function reviewChoice(saveToCustomer: boolean, workOrderIds: string[]): ReviewChoice {
  if (workOrderIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) throw new Error('Invalid work order');
  if (saveToCustomer && workOrderIds.length) return 'both';
  if (saveToCustomer) return 'customer_media';
  if (workOrderIds.length) return 'work_order';
  return 'discard';
}
