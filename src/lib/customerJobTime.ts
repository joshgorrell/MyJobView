export type CustomerTimeTarget = {
  kind: "project" | "work_order" | "customer_activity";
  id: string;
  label: string;
};
export type TimeProject = {
  id: string;
  contact_id: string;
  name: string;
  project_number: string;
  status: string;
};
export type TimeWorkOrder = {
  id: string;
  contact_id: string | null;
  project_id: string | null;
  title: string;
  work_order_number: string;
  status: string;
  type: string;
  assigned_to: string | null;
};
export function workTimeClassification(
  work: Pick<TimeWorkOrder, "type">,
): "project" | "service" {
  return work.type === "project" ? "project" : "service";
}
export const customerTimeActivities = [
  { value: "meeting", label: "Customer meeting" },
  { value: "site_survey", label: "Site survey" },
  { value: "troubleshooting", label: "Troubleshooting" },
  { value: "other", label: "Other customer activity" },
];
