export type IntakeDetail = { id: string; subject: string | null; raw_body: string | null; source_address: string; status: string; service_request_id: string | null };
export function summarizeIntakeDetail(item: IntakeDetail) {
  return { title: item.subject?.trim() || '(No subject)', isBlank: !item.raw_body?.trim(), hasServiceRequest: Boolean(item.service_request_id), status: item.status };
}
