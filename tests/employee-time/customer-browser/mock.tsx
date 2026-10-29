import React from "react";
const state: any = ((window as any).__timeTest = {
  writes: [],
  calls: [],
  session: null,
  timerFailures: 0,
});
const customer = "randy",
  other = "empty";
const contacts = [
  { id: customer, full_name: "Randy Travis", company_name: "Travis Home" },
  { id: other, full_name: "No Open Jobs", company_name: null },
];
const projects = [
  {
    id: "project-a",
    contact_id: customer,
    name: "Whole Home Audio",
    project_number: "P-100",
    status: "active",
  },
  {
    id: "closed-project",
    contact_id: customer,
    name: "Old Project",
    project_number: "P-OLD",
    status: "completed",
  },
];
const workOrders = [
  {
    id: "project-wo",
    contact_id: customer,
    project_id: "project-a",
    type: "project",
    title: "Speaker Installation",
    work_order_number: "WO-100",
    status: "assigned",
    assigned_to: "employee",
  },
  {
    id: "service-wo",
    contact_id: customer,
    project_id: "project-a",
    type: "service",
    title: "TV Troubleshooting",
    work_order_number: "WO-200",
    status: "assigned",
    assigned_to: "employee",
  },
  {
    id: "legacy-service",
    contact_id: null,
    project_id: "closed-project",
    type: "service",
    title: "Legacy Project Repair",
    work_order_number: "WO-201",
    status: "pending",
    assigned_to: "other-employee",
  },
];
export const useAuth = () => ({
  profile: {
    id: "employee",
    organization_id: "org",
    role: "admin",
    is_active: true,
  },
});
export const useEmployeeTimePolicy = () => ({
  ready: true,
  loading: false,
  basis: "salary",
  dailyClock: false,
  clockAccess: "both",
  canManage: true,
});
export const getOrganizationTimezone = async () => "America/Chicago";
export const formatDateInTimezone = () => "2026-01-01";
export const createTimestampInTimezone = (day: string, time: string) =>
  `${day}T${time}:00.000Z`;
export const notify = () => {};
export const requestConfirmation = async () => true;
export const gpsTrackingService = {
  captureLocationForClockEvent: async () => ({
    latitude: 0,
    longitude: 0,
    method: "high_accuracy",
    accuracy: 5,
  }),
};
export const offlineSupabaseUpdate = async (
  table: string,
  values: any,
  id: string,
) => {
  state.writes.push({ table, values, id });
  return { error: null };
};
export const supabase = {
  from(table: string) {
    let filters: any[] = [],
      single = false,
      payload: any = null;
    const q: any = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve: any) => {
              if (table === "customer_time_sessions" && state.timerFailures > 0) {
                state.timerFailures--;
                resolve({ data: null, error: { message: "Temporary timer read failure" } });
                return;
              }
              if (payload) {
                state.writes.push({ table, payload });
                resolve({ data: null, error: null });
                return;
              }
              let data =
                table === "contacts"
                  ? contacts
                  : table === "projects"
                    ? projects
                    : table === "work_orders"
                      ? workOrders
                      : table === "customer_time_sessions"
                        ? state.session
                          ? [state.session]
                          : []
                        : [];
              data = data.map((row: any) => ({ ...row, organization_id: "org" }));
              for (const [kind, column, value] of filters) {
                if (kind === "eq")
                  data = data.filter((r: any) => r[column] === value);
                if (kind === "in")
                  data = data.filter((r: any) => value.includes(r[column]));
                if (kind === "is")
                  data = data.filter((r: any) => r[column] == value);
              }
              resolve({ data: single ? data[0] || null : data, error: null });
            };
          return (...args: any[]) => {
            if (["eq", "in", "is"].includes(key as string))
              filters.push([key, ...args]);
            if (key === "maybeSingle") single = true;
            if (key === "insert") payload = args[0];
            return q;
          };
        },
      },
    );
    return q;
  },
  async rpc(name: string, args: any) {
    state.calls.push({ name, args });
    if (name === "start_customer_job_time") {
      state.session = {
        id: args.p_session_id,
        technician_id: "employee",
        clock_out: null,
        clock_in: new Date(Date.now() - 60000).toISOString(),
        notes: args.p_notes,
        project_id: args.p_project_id,
        customer: { full_name: "Randy Travis" },
        project: args.p_project_id
          ? { name: "Whole Home Audio", project_number: "P-100" }
          : null,
      };
      return { data: args.p_session_id, error: null };
    }
    if (name === "stop_customer_job_time") {
      state.session = null;
      return { data: "request", error: null };
    }
    return { data: null, error: null };
  },
};
// Existing canonical WO control is separately tested. This fixture isolates target selection.
export const WorkOrderTimeControl = ({ workOrderId }: any) => (
  <button
    type="button"
    onClick={() =>
      state.calls.push({ name: "work-order-control", id: workOrderId })
    }
  >
    Start Job Time
  </button>
);
export const MobileClockRedirect = () => <p>Use the mobile app</p>;

export const offlineStorage = { addToSyncQueue: async (value: any) => { state.writes.push({ queue: value }); } };
