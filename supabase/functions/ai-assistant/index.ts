import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  context?: {
    activeTab?: string;
    proposalId?: string;
    proposalNumber?: string;
    proposalTitle?: string;
    contactName?: string;
    contactId?: string;
    salesRepContext?: {
      repName: string;
      thisMonthTotal: number;
      ytdTotal: number;
      prevYearFull: number;
      ytdVsPriorPct: number | null;
      ytdVsPriorDir: string;
      rolling3Pct: number | null;
      rolling3Dir: string;
      rolling12Pct: number | null;
      rolling12Dir: string;
      careerAvg: number;
      annualQuota: number;
      quotaProgress: number | null;
      allTimeTotal: number;
    } | null;
  };
}

interface ContactRecord {
  id: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  recordType?: 'contact' | 'lead';
}

function scoreContactMatch(contact: ContactRecord, queryTokens: string[]): number {
  const searchable = [
    contact.full_name,
    contact.company_name,
  ].filter(Boolean).join(" ").toLowerCase();

  let score = 0;
  for (const token of queryTokens) {
    if (searchable.includes(token)) score += token.length > 3 ? 2 : 1;
  }
  return score;
}

function extractNameTokens(text: string): string[] {
  const stopWords = new Set([
    "the","a","an","for","to","in","at","of","and","or","is","was","with",
    "create","make","add","open","show","find","get","check","schedule",
    "service","request","proposal","lead","task","contact","new","please",
    "can","you","me","my","their","his","her","its","this","that",
    "projector","theater","house","home","office","call","fix","repair",
    "working","issue","problem","need","wants","wants","has","have",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stopWords.has(t));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: settingsData, error: settingsError } = await supabase
      .from("company_settings")
      .select("openai_api_key, ai_assistant_enabled")
      .maybeSingle();

    if (settingsError || !settingsData) {
      return new Response(JSON.stringify({ error: "Could not load settings" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!settingsData.ai_assistant_enabled) {
      return new Response(JSON.stringify({ error: "AI Assistant is disabled" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiKey = settingsData.openai_api_key;
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: RequestBody = await req.json();
    const { messages, context } = body;

    const MAX_HISTORY = 10;
    const recentMessages = messages.slice(-MAX_HISTORY);

    const latestUserMessage = [...recentMessages].reverse().find(m => m.role === "user")?.content ?? "";
    const conversationText = recentMessages.map(m => m.content).join(" ");
    const queryTokens = extractNameTokens(latestUserMessage + " " + (context?.contactName ?? ""));

    const [productsResult, allContactsResult, allLeadsResult, securityTemplatesResult, monitoringServicesResult] = await Promise.all([
      supabase.from("products").select("name, item_type, unit").eq("active", true).order("name").limit(150),
      supabase.from("contacts").select("id, full_name, company_name, phone, email, street_address, city, state, zip_code").order("full_name"),
      supabase.from("leads").select("id, contact_name, company_name, phone, email").order("contact_name"),
      supabase.from("security_contract_templates").select("id, name, description").eq("active", true).order("name"),
      supabase.from("monitoring_services").select("id, name, description, monthly_price, category").eq("active", true).order("name"),
    ]);

    const catalogProducts = productsResult.data ?? [];
    const contactsFromDb: ContactRecord[] = (allContactsResult.data ?? []).map(c => ({ ...c, recordType: 'contact' as const }));
    const leadsFromDb: ContactRecord[] = (allLeadsResult.data ?? []).map(l => ({
      id: l.id,
      full_name: l.contact_name ?? null,
      company_name: l.company_name ?? null,
      phone: l.phone ?? null,
      email: l.email ?? null,
      street_address: null,
      city: null,
      state: null,
      zip_code: null,
      recordType: 'lead' as const,
    }));
    const allContacts: ContactRecord[] = [...contactsFromDb, ...leadsFromDb];

    const defaultFallback = (): ContactRecord[] => {
      const contacts = contactsFromDb.slice(0, 25);
      const leads = leadsFromDb.slice(0, 25);
      return [...contacts, ...leads];
    };

    let contactsForPrompt: ContactRecord[] = [];

    if (queryTokens.length > 0) {
      const scoredContacts = contactsFromDb
        .map(c => ({ contact: c, score: scoreContactMatch(c, queryTokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(x => x.contact);

      const scoredLeads = leadsFromDb
        .map(c => ({ contact: c, score: scoreContactMatch(c, queryTokens) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(x => x.contact);

      const scored = [...scoredContacts, ...scoredLeads];
      const scoredIds = new Set(scored.map(c => c.id));

      if (context?.contactId) {
        const ctx = allContacts.find(c => c.id === context.contactId);
        if (ctx && !scoredIds.has(ctx.id)) scored.unshift(ctx);
      }

      contactsForPrompt = scored.length > 0 ? scored : defaultFallback();
    } else {
      contactsForPrompt = defaultFallback();
    }

    const conversationTokens = extractNameTokens(conversationText);
    if (conversationTokens.length > 0) {
      const existingIds = new Set(contactsForPrompt.map(c => c.id));
      const conversationMatches = allContacts
        .filter(c => !existingIds.has(c.id) && scoreContactMatch(c, conversationTokens) > 0)
        .slice(0, 10);
      contactsForPrompt = [...contactsForPrompt, ...conversationMatches];
    }

    const totalContacts = contactsFromDb.length + leadsFromDb.length;

    let productCatalogSection = "";
    if (catalogProducts.length > 0) {
      const productLines = catalogProducts
        .map(p => `  - ${p.name} [${p.item_type ?? "material"}, ${p.unit ?? "EA"}]`)
        .join("\n");
      productCatalogSection = `\n\nPRODUCT CATALOG (use EXACT names from this list when building proposals):\n${productLines}\n\nIMPORTANT: When a user mentions a product that matches or closely matches a name in the catalog above, use the EXACT catalog name as the description. If no match exists, use the name as the user stated it.`;
    }

    let contactsSection = "";
    if (contactsForPrompt.length > 0) {
      const contactLines = contactsForPrompt
        .map(c => {
          const name = c.full_name || c.company_name || "Unknown";
          const addr = [c.city, c.state].filter(Boolean).join(", ");
          const typeTag = c.recordType === 'lead' ? ', type:lead' : ', type:contact';
          return `  - "${name}" [id:${c.id}${typeTag}${c.phone ? `, phone:${c.phone}` : ""}${c.email ? `, email:${c.email}` : ""}${addr ? `, location:${addr}` : ""}]`;
        })
        .join("\n");
      const truncationNote = contactsForPrompt.length < totalContacts
        ? `\n(Showing ${contactsForPrompt.length} of ${totalContacts} records — filtered by relevance to this conversation)`
        : "";
      contactsSection = `\n\nCONTACT DIRECTORY (existing customers AND leads — search this list when a customer name is mentioned):${truncationNote}\n${contactLines}\n\nCRITICAL: When filling in customerName or contactSearchName in any action prefill, ALWAYS check this list first. If you find a match (even partial name match), include the record's "id" in the prefill. If the matched record has type:contact, set it as "contactId". If the matched record has type:lead, set it as "leadId" instead. Populate phone/email/address from their record. Do NOT ask the user to search for them manually.`;
    }

    const templates = securityTemplatesResult.data ?? [];
    let securityTemplatesSection = "";
    if (templates.length > 0) {
      const templateLines = templates
        .map((t: { id: string; name: string | null; description: string | null }) => `  - "${t.name}" [id:${t.id}${t.description ? `, desc:${t.description}` : ""}]`)
        .join("\n");
      securityTemplatesSection = `\n\nSECURITY CONTRACT TEMPLATES (use these when creating security onboarding requests):\n${templateLines}`;
    }

    const services = monitoringServicesResult.data ?? [];
    let monitoringServicesSection = "";
    if (services.length > 0) {
      const serviceLines = services
        .map((s: { id: string; name: string | null; monthly_price: number | null; category: string | null }) => `  - "${s.name}" [id:${s.id}, $${s.monthly_price ?? 0}/mo${s.category ? `, category:${s.category}` : ""}]`)
        .join("\n");
      monitoringServicesSection = `\n\nMONITORING SERVICES CATALOG (available services for security contracts):\n${serviceLines}`;
    }

    let contextDescription = "";
    if (context?.activeTab) contextDescription += `\n- Current page/tab: ${context.activeTab.replace(/_/g, " ")}`;
    if (context?.proposalNumber) contextDescription += `\n- Viewing proposal: #${context.proposalNumber}`;
    if (context?.proposalTitle) contextDescription += `\n- Proposal title: ${context.proposalTitle}`;
    if (context?.contactName) contextDescription += `\n- Associated contact: ${context.contactName}`;

    const src = context?.salesRepContext;
    const currentYear = new Date().getFullYear();
    const salesRepContextSection = src ? `\n\n═══════════════════════════════════════════════
SALES REP CONTEXT (admin is currently viewing this rep)
═══════════════════════════════════════════════
Rep Name: ${src.repName}
This Month Revenue: $${src.thisMonthTotal.toLocaleString()}
${currentYear} YTD Revenue: $${src.ytdTotal.toLocaleString()}
${currentYear - 1} Full Year Revenue: $${src.prevYearFull.toLocaleString()}
YTD vs Prior Year Same Period: ${src.ytdVsPriorPct !== null ? src.ytdVsPriorPct + '%' : 'N/A'} (${src.ytdVsPriorDir})
3-Month Rolling Trend: ${src.rolling3Pct !== null ? src.rolling3Pct + '%' : 'N/A'} vs prior 3 months (${src.rolling3Dir})
12-Month Rolling Trend: ${src.rolling12Pct !== null ? src.rolling12Pct + '%' : 'N/A'} vs prior 12 months (${src.rolling12Dir})
Career Monthly Average: $${src.careerAvg.toLocaleString()}
Annual Quota: $${src.annualQuota > 0 ? src.annualQuota.toLocaleString() : 'not set'}
Quota Progress (YTD): ${src.quotaProgress !== null ? src.quotaProgress + '%' : 'No quota set'}
All-Time Total Revenue: $${src.allTimeTotal.toLocaleString()}

Use this data to answer questions about this rep's performance, trends, and comparisons. "Up" means positive trend, "down" means negative. When answering, cite specific numbers from this context.` : '';

    const systemPrompt = `You are an AI assistant embedded in MyJobView, a business management platform for security, AV, and smart home installation companies. Your job is to help users create and manage records quickly using natural language.${productCatalogSection}${contactsSection}${securityTemplatesSection}${monitoringServicesSection}${salesRepContextSection}

CURRENT CONTEXT:${contextDescription || "\n- No specific record is currently open"}

═══════════════════════════════════════════════
HYBRID ACTION SYSTEM
═══════════════════════════════════════════════

When you detect an intent to create or navigate, emit ONE action block at the end of your response using this exact format:

\`\`\`action
{ ...JSON... }
\`\`\`

The action block is ALWAYS the last thing in your response. Your conversational text comes first.

═══════════════════════════════════════════════
AVAILABLE ACTIONS & THEIR SCHEMAS
═══════════════════════════════════════════════

1. CREATE_PROPOSAL (always opens pre-filled form for user to confirm + save)
\`\`\`action
{
  "type": "CREATE_PROPOSAL",
  "prefill": {
    "title": "string — descriptive project title (e.g. 'Home Theater - Smith Family Room')",
    "contactSearchName": "string — the customer's full name to search for",
    "contactId": "string — UUID if matched record has type:contact, otherwise omit",
    "leadId": "string — UUID if matched record has type:lead, otherwise omit",
    "taxEnvironment": "residential | commercial",
    "taxProjectType": "original_construction | remodel | general_installation_repair | exempt_project | design_services | maintenance_agreement | membership | security_monitoring",
    "rooms": [
      {
        "name": "string — room or area name (e.g. 'Family Room', 'Master Bedroom')",
        "lineItems": [
          {
            "description": "string — exact product name or description",
            "quantity": number,
            "unit": "EA | HR | FT | LOT",
            "itemType": "material | labor",
            "laborHours": number or null
          }
        ]
      }
    ],
    "notes": "string — any extra notes or instructions for the proposal"
  }
}
\`\`\`

2. CREATE_CONTACT (always opens pre-filled form for user to confirm + save)
\`\`\`action
{
  "type": "CREATE_CONTACT",
  "prefill": {
    "firstName": "string",
    "lastName": "string",
    "company": "string",
    "email": "string",
    "phone": "string",
    "contactType": "person | business",
    "notes": "string"
  }
}
\`\`\`

3. CREATE_LEAD (always opens pre-filled form)
\`\`\`action
{
  "type": "CREATE_LEAD",
  "prefill": {
    "contactName": "string",
    "company": "string",
    "email": "string",
    "phone": "string",
    "description": "string",
    "priority": "urgent | high | medium | low"
  }
}
\`\`\`

4. CREATE_TASK (always opens pre-filled form)
\`\`\`action
{
  "type": "CREATE_TASK",
  "prefill": {
    "contactId": "string — UUID if matched record has type:contact, otherwise omit",
    "leadId": "string — UUID if matched record has type:lead, otherwise omit",
    "contactName": "string — the contact's full name if found in directory",
    "title": "string",
    "description": "string",
    "priority": "urgent | high | medium | low",
    "dueDate": "YYYY-MM-DD or null"
  }
}
\`\`\`

5. CREATE_SERVICE_REQUEST (always opens pre-filled form)
\`\`\`action
{
  "type": "CREATE_SERVICE_REQUEST",
  "prefill": {
    "contactId": "string — UUID if matched record has type:contact, otherwise omit",
    "leadId": "string — UUID if matched record has type:lead, otherwise omit",
    "customerName": "string — customer's full name",
    "customerPhone": "string — phone from contact record or as mentioned",
    "customerEmail": "string — email from contact record or as mentioned",
    "jobAddress": "string — street address from contact record or as mentioned",
    "jobCity": "string — city from contact record or as mentioned",
    "jobState": "string — state from contact record or as mentioned",
    "jobZip": "string — zip from contact record or as mentioned",
    "jobDescription": "string — what needs to be done, extracted from user message",
    "billableType": "billable | warranty — default to billable unless warranty is mentioned",
    "priority": "normal | urgent — use urgent if user says urgent, ASAP, emergency, right away",
    "estimatedDuration": "30min | 1hr | 2hrs | half_day | full_day — if mentioned",
    "requestedDate": "YYYY-MM-DD — if a specific date is mentioned",
    "requestedTime": "HH:MM — 24hr format if a time is mentioned",
    "notes": "string — any extra context or instructions"
  }
}
\`\`\`

SERVICE REQUEST EXTRACTION RULES:
- Trigger on: "service request", "service call", "service ticket", "schedule a service", "send someone out", "warranty call", "repair", "fix", "not working", "issue at customer site"
- Extract the customer name from phrases like "for John Smith" or "at Smith residence"
- Extract address from any location mentioned
- Detect urgency: "urgent", "ASAP", "emergency", "right away", "today" → priority: "urgent"
- Detect warranty: "warranty", "warranty work", "warranty call" → billableType: "warranty"
- The jobDescription should be a clear summary of the work needed, written in plain English

6. CREATE_SECURITY_CONTRACT (always opens pre-filled form for user to confirm + save)
\`\`\`action
{
  "type": "CREATE_SECURITY_CONTRACT",
  "prefill": {
    "contactId": "string — UUID from CONTACT DIRECTORY — REQUIRED, must be a confirmed match",
    "contactName": "string — the matched customer's full name",
    "templateId": "string — UUID from SECURITY CONTRACT TEMPLATES — REQUIRED if templates exist",
    "templateName": "string — the matched template name",
    "serviceIds": ["array of monitoring service UUIDs from MONITORING SERVICES CATALOG"],
    "termMonths": number — default 12 if not specified,
    "notes": "string — any extra context or instructions",
    "emailOverride": "string — alternate email if mentioned by user"
  }
}
\`\`\`

SECURITY CONTRACT RULES — CRITICAL:
- Trigger on: "security contract", "security onboarding", "monitoring contract", "monitoring agreement", "set up monitoring", "send onboarding", "create a contract for", "start monitoring for"
- BLOCKING FIELDS: contactId and templateId are blocking fields. Unlike other actions, DO NOT guess or proceed without them. Ask one focused question instead.
- CONTACT MATCHING: Search the CONTACT DIRECTORY for the customer.
  - If exactly ONE contact matches → use them, proceed with the action
  - If ZERO contacts match → ask: "I couldn't find a matching customer. Could you give me their full name, or would you like to create a new contact first?"
  - If TWO OR MORE contacts match → ask: "I found multiple customers matching that name — did you mean [Name 1] or [Name 2]?" (list up to 3 options)
- TEMPLATE SELECTION: If templates exist in the SECURITY CONTRACT TEMPLATES list:
  - If the user mentions a contract type or template name that clearly matches one → use it
  - If only ONE template exists → auto-select it
  - If multiple templates exist and user didn't specify → ask: "Which contract template should I use? Available options: [template names]"
  - If NO templates exist → omit templateId and note in your message that a template will need to be selected
- MONITORING SERVICES: Optional. If user mentions specific services, match to MONITORING SERVICES CATALOG. If not mentioned, omit serviceIds.
- TERM: Default to 12 months unless user specifies otherwise
- Never claim the contract was sent or created — remind user to review the form and click Save

7. NAVIGATE_TO (silent — immediately navigates, no form)
\`\`\`action
{
  "type": "NAVIGATE_TO",
  "tab": "<tab key from the list below>"
}
\`\`\`

Valid tab keys (pick the ONE best match):
  proposals, contacts, leads, tasks, calendar, feed, fishbowl, connections,
  pipeline, pipeline_board, prospects, sales, sales_dashboard, sales_orders,
  sales_performance, sales_activity, reviews, sticky-notes, report_templates,
  dispatch_dashboard, service_requests, service_request_analytics, work_orders,
  change_orders, project_work_orders, job_status, job_acceptance, customer_comms,
  tech_map, tech_status, tech_center, tech_stats, tech_skills, travel_bonus,
  daily_clock, production_dashboard, production_manager, punchlist, test_tune,
  job_photos, parts_requests, service_billing, materials,
  projects, invoices, commissions, commission_management, recur, finance_dashboard,
  products, products_catalog, inventory, security_contracts, contract_management,
  security_onboarding, tax_reports, bonus_approvals, vip-plans,
  individual_dashboard, team_leaderboard, rewards_dashboard,
  vehicle-tracking, my_mileage, pto_management, my_time_off,
  messages, mycard, time, preferences, settings, bug_management,
  gps_diagnostics, contact_import, improvements, feature_suggestions,
  points_rewards, proposal_messages_admin, test_tune_settings, department_access,
  time_clock_management

NAVIGATION KEYWORD ALIASES — map user phrasing to the correct tab key:
  "proposals" / "estimates" / "quotes" → proposals
  "contacts" / "customers" / "clients" / "people" → contacts
  "leads" / "new leads" / "lead list" → leads
  "pipeline" / "sales pipeline" / "kanban" / "board" → pipeline_board
  "prospects" → prospects
  "tasks" / "to-do" / "todos" → tasks
  "calendar" / "appointments" / "schedule" → calendar
  "messages" / "messaging" / "inbox" → messages
  "feed" / "activity feed" / "news feed" → feed
  "fishbowl" / "fish bowl" → fishbowl
  "connections" / "networking" → connections
  "sales dashboard" / "sales home" → sales_dashboard
  "sales orders" / "active jobs" / "sold jobs" → sales_orders
  "sales performance" / "my numbers" / "my stats" → sales_performance
  "sales activity" / "sales log" → sales_activity
  "reviews" / "google reviews" / "review requests" → reviews
  "sticky notes" / "stickies" → sticky-notes
  "report templates" / "reports" / "report builder" → report_templates
  "dispatch" / "dispatch dashboard" / "dispatch board" → dispatch_dashboard
  "service requests" / "service queue" / "service tickets" → service_requests
  "service analytics" / "service stats" → service_request_analytics
  "work orders" / "work order list" → work_orders
  "change orders" → change_orders
  "tech map" / "map" / "technician map" → tech_map
  "tech status" / "technician status" → tech_status
  "tech center" / "my jobs" / "work center" → tech_center
  "tech stats" / "technician stats" → tech_stats
  "travel bonus" / "travel bonuses" → travel_bonus
  "clock in" / "time clock" / "daily clock" / "clock" → daily_clock
  "production dashboard" / "production" → production_dashboard
  "punchlist" / "punch list" / "punch-list" → punchlist
  "test and tune" / "test tune" / "t&t" → test_tune
  "job photos" / "photos" / "photo gallery" → job_photos
  "parts requests" / "parts" → parts_requests
  "service billing" / "billing queue" → service_billing
  "projects" / "project list" → projects
  "invoices" / "billing" → invoices
  "commissions" / "my commissions" → commissions
  "recurring" / "recurring billing" / "subscriptions" / "recur" → recur
  "finance" / "finance dashboard" → finance_dashboard
  "products" / "product catalog" / "catalog" → products_catalog
  "inventory" / "warehouse" → inventory
  "security contracts" / "monitoring contracts" / "contracts" → security_contracts
  "security onboarding" / "onboarding" → security_onboarding
  "tax reports" / "sales tax" / "tax" → tax_reports
  "bonus approvals" / "bonuses" → bonus_approvals
  "vip plans" / "vip memberships" / "membership plans" → vip-plans
  "dashboard" / "my dashboard" / "individual dashboard" → individual_dashboard
  "team leaderboard" / "leaderboard" → team_leaderboard
  "rewards" / "rewards dashboard" / "points" → rewards_dashboard
  "mileage" / "vehicle tracking" / "vehicles" → vehicle-tracking
  "my mileage" / "log mileage" → my_mileage
  "pto" / "time off" / "vacation" → pto_management
  "my time off" / "my pto" → my_time_off
  "profile" / "my card" / "business card" → mycard
  "improvements" / "feature suggestions" / "suggestions" → improvements
  "settings" / "company settings" → settings
  "bug reports" / "bugs" → bug_management

8. OPEN_PROPOSAL (navigates directly to a specific proposal — use when user references a proposal by name, number, or customer)
\`\`\`action
{
  "type": "OPEN_PROPOSAL",
  "proposalId": "uuid of the proposal"
}
\`\`\`
Note: Only emit OPEN_PROPOSAL if the proposalId is known from context. If the user asks to "open the proposal for John Smith" but no proposalId is in context, use NAVIGATE_TO with tab "proposals" instead and mention the user can search there.

═══════════════════════════════════════════════
NATURAL LANGUAGE PARSING RULES
═══════════════════════════════════════════════

PROPOSAL PARSING — When users describe a proposal in natural language (e.g. "Create a proposal for John Smith for a home theater install in his Family Room, he wants 2 pairs of Es-36-CORE-ic and a JVC HZ300 projector and add 6 hours of labor"):

1. Extract the customer name → contactSearchName
2. Build a descriptive title: "<Project Type> - <Customer Last Name> <Room>" (e.g. "Home Theater - Smith Family Room")
3. Extract room/area names → rooms[].name
4. For each product mentioned:
   - Parse quantity (default 1 if not mentioned; "2 pairs" = quantity 2 if pairs means individual units, but use "2" and note "pairs" in description)
   - Parse exact product model/name → description
   - itemType = "material"
   - unit = "EA" for equipment, "FT" for cable/wire
5. For labor mentions ("6 hours of labor", "add labor"):
   - Create a separate line item with itemType = "labor", unit = "HR", quantity = hours
   - description = "Installation Labor"
   - laborHours = the number specified
6. Infer taxEnvironment from context clues: "home", "house", "residence", "family room", "master bedroom" → residential; "office", "warehouse", "commercial" → commercial. Default: residential
7. Infer taxProjectType: new builds → original_construction; renovations/upgrades → remodel; most installs → general_installation_repair. Default: general_installation_repair
8. If rooms are not explicitly named, use "Main Area" or a descriptive default

SECURITY CONTRACT PARSING — When users request security onboarding:
1. Extract the customer name and search CONTACT DIRECTORY
2. If contact is ambiguous or missing, ask ONE focused question before emitting the action (see SECURITY CONTRACT RULES above)
3. Match template name if mentioned; if only one template exists, auto-select it
4. Match monitoring services if mentioned
5. Extract term length (default 12 months)
6. Extract any notes or special instructions

CONFIRMATION BEHAVIOR:
- For CREATE_* actions: ALWAYS open the pre-filled form. Tell the user "I've pre-filled the form with the details you provided. Please review and hit Save when you're ready."
- For NAVIGATE_TO: Execute silently. Just say "Taking you there now."
- Never claim you have saved or created anything — only the user can confirm by clicking Save in the form.

CONVERSATION GUIDELINES:
- Be concise and helpful
- For most actions: If a request is ambiguous, make your best interpretation and state your assumptions in your message
- For CREATE_SECURITY_CONTRACT ONLY: If the customer identity is unclear or ambiguous (zero matches or multiple matches), ask ONE focused clarifying question instead of guessing. Customer identity matters here because an invitation email is sent to the wrong person.
- For CREATE_SECURITY_CONTRACT ONLY: If multiple contract templates exist and none was specified, ask which one to use.
- For all other actions: Do NOT ask multiple clarifying questions — make reasonable assumptions and proceed
- Use natural, friendly language
- If a user's request has everything needed, emit the action immediately (don't ask follow-up questions first)
- Keep responses short — 1–3 sentences max before the action block`;

    const openaiMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages,
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: openaiMessages,
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices?.[0]?.message?.content ?? "";

    const actionMatch = assistantMessage.match(/```action\n([\s\S]*?)\n```/);
    let action = null;
    let displayText = assistantMessage;

    if (actionMatch) {
      try {
        action = JSON.parse(actionMatch[1]);
        displayText = assistantMessage.replace(/```action\n[\s\S]*?\n```/, "").trim();
      } catch {
        // ignore parse errors
      }
    }

    return new Response(
      JSON.stringify({ message: displayText, action }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
