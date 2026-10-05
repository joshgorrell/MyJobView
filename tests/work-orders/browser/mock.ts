export const useAuth = () => ({
  profile: { id: "tech", organization_id: "org", role: "admin" },
});
export const AvailabilityBrowserModal = () => null;
const tasks = [
  {
    id: "assigned",
    title: "Assigned install",
    project_id: "p",
    labor_phase_id: "rough",
    status: "open",
    progress_status: "pending",
    estimated_hours: 2,
    room_name: "Bedroom",
    description: "Wire and program speakers",
  },
  {
    id: "reference",
    title: "Other rough work",
    project_id: "p",
    labor_phase_id: "rough",
    status: "open",
    progress_status: "blocked",
    estimated_hours: 1,
    room_name: "Bedroom",
  },
  {
    id: "trim-task",
    title: "Trim work",
    project_id: "p",
    labor_phase_id: "trim",
    status: "open",
    progress_status: "pending",
    estimated_hours: 1,
    room_name: "Kitchen",
  },
  {
    id: "finished",
    title: "Finished work",
    project_id: "p",
    status: "completed",
    progress_status: "completed",
    estimated_hours: 1,
    room_name: "Bedroom",
  },
];
const handoff = {
  captured_at: "2026-10-01",
  overall_scope: "Original house installation",
  rooms: [
    {
      id: "bed",
      name: "Bedroom",
      description: "Original bedroom speakers and controls",
    },
  ],
  equipment: [
    {
      id: "item",
      room_id: "bed",
      description: "Speakers",
      quantity: 2,
      unit: "each",
      task_notes: "Test every connection",
      phase_notes:[{name:"Rough-in",notes:"Label both ends"}],
    },
    {id:"rack",room_id:null,description:"Rack programming",quantity:1,unit:"each",task_notes:"Keep rack ventilated",programming_notes:"Back up the processor",phase_notes:[{name:"Trim",notes:"Record firmware versions"}]},
  ],
};
const packet = {
  id: "p",
  name: "Whole house",
  sold_handoff: handoff,
  approved_scopes: [
    {
      id: "change",
      created_at: "2026-10-05",
      scope: {
        ...handoff,
        overall_scope: "Approved house installation with extra programming",
      },
    },
  ],
  tasks: tasks.map((t) => ({
    ...t,
    phase_name: t.labor_phase_id === "rough" ? "Rough-in" : "Trim",
  })),
  history: [
    {
      id: "history",
      project_task_id: "assigned",
      work_order_task_id: "wo-task",
      work_order_id: "old-visit",
      disposition: "partial",
      notes: "Wiring done; trim remains",
      created_at: "2026-10-01",
      technician_name: "Another technician",
    },
  ],
};
const fixtures: Record<string, any[]> = {
  labor_phases: [
    { id: "rough", name: "Rough-in", is_active: true },
    { id: "trim", name: "Trim", is_active: true },
  ],
  profiles: [
    { id: "tech", full_name: "Test Technician", role: "tech", is_active: true },
    {
      id: "tech2",
      full_name: "Second Technician",
      role: "tech",
      is_active: true,
    },
  ],
  contacts: [
    {
      id: "c",
      full_name: "Customer",
      company_name: null,
      email: "customer@example.test",
      street_address: "123 Main",
      city: "Topeka",
      state: "KS",
      zip_code: "66601",
    },
  ],
  projects: [
    {
      id: "p",
      contact_id: "c",
      project_number: "P1",
      name: "Whole house",
      status: "active",
      job_site_address: {
        address: "987 Job Site",
        city: "Topeka",
        state: "KS",
        zip: "66601",
      },
    },
  ],
  project_tasks: tasks,
  work_order_options: [
    {
      id: "type-project",
      organization_id: "org",
      kind: "type",
      label: "Project",
      behavior: "project",
      system_key: "project",
      is_active: true,
      sort_order: 0,
      color: "#2563eb",
    },
    {
      id: "type-service",
      organization_id: "org",
      kind: "type",
      label: "Service",
      behavior: "service",
      system_key: "service",
      is_active: true,
      sort_order: 1,
      color: "#2563eb",
    },
  ],
  work_order_tasks: [
    {
      id: "wo-task",
      work_order_id: "wo",
      project_task_id: "assigned",
      title: "Assigned install",
      description: "Wire and program speakers",
      estimated_hours: 2,
      status: "pending",
      progress_version: 0,
      visit_instructions: "Rough-in only",
    },
  ],
  project_task_activity: packet.history,
};
export const supabase = {
  auth: {
    async getSession() {
      return { data: { session: { user: { id: "tech" } } } };
    },
  },
  functions: {
    async invoke() {
      return { data: null, error: null };
    },
  },
  async rpc(name: string, args: any) {
    if (name === "get_work_order_project_context")
      return { data: packet, error: null };
    if (name === "create_work_order_assignments") {
      (window as any).__created = args;
      return { data: [{ id: "new-wo" }], error: null };
    }
    if (name === "record_visit_task_progress") {
      (window as any).__progress = args;
      return { data: args.p_event_id, error: null };
    }
    return { data: null, error: null };
  },
  from(table: string) {
    const predicates: Array<(r: any) => boolean> = [];
    let single = false;
    const q: any = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve: any, reject: any) =>
              Promise.resolve({
                data: single
                  ? (fixtures[table] || []).find((r) =>
                      predicates.every((p) => p(r)),
                    ) || null
                  : (fixtures[table] || []).filter((r) =>
                      predicates.every((p) => p(r)),
                    ),
                error: null,
              }).then(resolve, reject);
          return (...args: any[]) => {
            if (key === "eq") predicates.push((r) => r[args[0]] === args[1]);
            if (key === "in")
              predicates.push((r) => args[1].includes(r[args[0]]));
            if (key === "single" || key === "maybeSingle") single = true;
            return q;
          };
        },
      },
    );
    return q;
  },
  channel() {
    const channel: any = {
      on() {
        return channel;
      },
      subscribe() {
        return channel;
      },
      unsubscribe() {},
    };
    return channel;
  },
};
