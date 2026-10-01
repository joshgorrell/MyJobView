const review = { request_id: 'request-1', organization_id: 'org-1', opportunity_name: 'Home theater', delivery_status: 'sent', responded_at: '2026-10-01T15:00:00Z', reviewed_at: null, recovery_outcome: 'unreviewed' };
export const useAuth = () => ({ profile: { id: 'employee-1', organization_id: 'org-1', can_send_lost_opportunity_reviews: false, can_view_lost_opportunity_submissions: true }, companySettings: { company_name: 'Electronic Life' } });
(window as any).reviewCalls = 0;
(window as any).failReview = false;
export const supabase = {
  from(table: string) {
    const query: any = { select: () => query, eq: () => query, order: () => query, in: () => query,
      then(resolve: any) {
        const data = table === 'lost_review_details' ? [review, { ...review, request_id: 'request-2', opportunity_name: 'Awaiting customer', responded_at: null }]
          : table === 'lost_review_responses' ? [{ request_id: 'request-1', reasons: ['price'], message: 'Here is the competing bid', recoverable: 'maybe', recovery_message: '', attachments: [{ name: 'John Valley.pdf', path: 'private/bid' }] }]
          : table === 'review_requests' ? [{ id: 'request-1', recipient_name: 'John Valley' }, { id: 'request-2', recipient_name: 'Other customer' }] : [];
        return Promise.resolve({ data, error: null }).then(resolve);
      } };
    return query;
  },
  functions: { async invoke(_name: string, { body }: any) {
    if (body.action === 'load') return { data: { title: 'Tell us why', opportunity_name: 'Home theater', company_name: 'Electronic Life', completed: false } };
    if (body.action === 'submit') { (window as any).submittedFiles = body.files; return { data: { success: true } }; }
    if (body.action === 'review') {
      (window as any).reviewCalls++;
      if ((window as any).failReview) return { data: { error: 'Simulated review save failure' } };
      review.reviewed_at = '2026-10-01T16:00:00Z' as any;
      return { data: { success: true, reviewed_at: review.reviewed_at } };
    }
    return { data: { url: 'https://private.example/bid.pdf' } };
  } },
};
