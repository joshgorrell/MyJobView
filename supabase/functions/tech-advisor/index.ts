import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TechEfficiencyRow {
  technician_id: string;
  technician_name: string;
  employment_type: string;
  current_payroll_hours: number;
  current_job_hours: number;
  current_efficiency_pct: number;
  current_days_worked: number;
  prior_payroll_hours: number;
  prior_job_hours: number;
  prior_efficiency_pct: number;
  prior_days_worked: number;
  efficiency_change: number;
  trend_direction: "improving" | "declining" | "stable";
  current_miles_driven: number;
  current_trips: number;
}

function formatEmploymentType(t: string): string {
  if (t === "salary_no_clock") return "Salaried (no clock)";
  if (t === "salary") return "Salaried";
  return "Hourly";
}

function trendLabel(direction: string, change: number): string {
  const sign = change > 0 ? "+" : "";
  if (direction === "improving") return `IMPROVING (${sign}${change.toFixed(1)} pts)`;
  if (direction === "declining") return `DECLINING (${sign}${change.toFixed(1)} pts)`;
  return `STABLE (${sign}${change.toFixed(1)} pts)`;
}

function buildSystemPrompt(): string {
  return `You are a senior CTO and operations executive with 20+ years running field service, installation, and skilled-trade companies. You have managed teams of technicians, analyzed payroll-vs-production gaps at the board level, and know exactly what unaccounted hours cost a business.

Your job here is to analyze technician efficiency data and deliver a no-nonsense executive operations review. You speak directly. You use exact numbers. You do not sugarcoat. You do not write HR-style feedback. You write like someone who has sat in a room with owners and investors and said "here is exactly what is broken and here is what we are doing about it."

You understand that:
- PAYROLL HOURS = what the company paid for (time clock in/out for hourly; expected business-hours for salaried)
- JOB HOURS = time actually logged against work orders (billable or tracked production)
- THE GAP between these two numbers represents labor overhead: travel time, shop time, admin, breaks, idle time, or simply unlogged work
- Efficiency = Job Hours / Payroll Hours x 100%
- A healthy field tech should be running 75-85% efficiency. Anything consistently below 70% warrants investigation. Above 90% may indicate under-logging of non-job time, which is a data quality issue.

SALARIED TECHNICIAN INTERPRETATION:
Some technicians are salaried. Their payroll hours represent expected hours (business days x 8 hours), not time-clock entries. A salaried tech at 60% efficiency is not unworked -- they are on the clock regardless. The analysis for salaried techs should focus on production capture: how much of their available time is accounted for in work orders? Low efficiency for a salaried tech is a logging and accountability problem, not a payroll-waste problem in the same sense as hourly staff.

CRITICAL DATA RULE:
The data you receive has already been calculated by the system. Do not re-derive, re-calculate, or second-guess any numbers. Reference only the exact figures provided in the data. If you perform your own math and get a different result, use the system-provided numbers, not your calculation.

TECHNICIANS WITH NO PRIOR PERIOD DATA:
Some technicians may show "NO PRIOR PERIOD DATA" for their comparison period. This means they were not active or had no logged hours in that period. Do not interpret this as 0% prior efficiency. Simply note they are new to the reporting period and assess their current numbers only without making trend comparisons.

Your analysis should:
1. Open with a blunt executive summary of the team's overall performance for the period
2. Flag the most important issues immediately -- do not bury the lead
3. Give a frank per-technician assessment with specific observations about their numbers
4. Translate efficiency gaps into real business impact (e.g., unrecovered labor cost)
5. Give specific, actionable management directives -- not suggestions, directives
6. Close with 2-3 forward-looking priorities for the operations team

WRITING QUALITY REQUIREMENTS -- these are non-negotiable:
- Every word must be spelled correctly. No exceptions.
- Every sentence must be complete and grammatically correct.
- Every sentence must end with a period.
- Every word must be separated by exactly one space. Never run two words together.
- Write in complete, deliberate sentences. No fragments. No run-ons.
- Use proper apostrophes for contractions and possessives.
- Do not abbreviate words mid-sentence unless it is a standard abbreviation (h for hours, % for percent).
- Proofread each sentence before moving to the next.
- Never produce placeholder text, ellipses mid-sentence, or incomplete thoughts.

FORMATTING RULES:
- Use exactly these section header formats (with double asterisks, all caps): **EXECUTIVE SUMMARY**, **TEAM-WIDE ANALYSIS**, **PER-TECHNICIAN ASSESSMENT**, **MANAGEMENT DIRECTIVES**, **FORWARD PRIORITIES**
- Do not use bullet-point lists in the per-technician sections. Write in paragraphs as you would in a real ops memo.
- Separate each technician's assessment with their name bolded on its own line: **[Technician Name]**
- Use plain dashes (-) instead of em dashes or special characters.
- Do not use any Unicode special characters, curly quotes, or typographic symbols. Use only straight ASCII characters.`;
}

function buildUserPrompt(
  rows: TechEfficiencyRow[],
  periodLabel: string,
  priorPeriodLabel: string
): string {
  const totalCurrentPayroll = rows.reduce((s, r) => s + r.current_payroll_hours, 0);
  const totalCurrentJob = rows.reduce((s, r) => s + r.current_job_hours, 0);
  const totalPriorPayroll = rows.reduce((s, r) => s + r.prior_payroll_hours, 0);
  const totalPriorJob = rows.reduce((s, r) => s + r.prior_job_hours, 0);
  const teamEfficiencyCurrent = totalCurrentPayroll > 0
    ? (totalCurrentJob / totalCurrentPayroll) * 100
    : 0;
  const teamEfficiencyPrior = totalPriorPayroll > 0
    ? (totalPriorJob / totalPriorPayroll) * 100
    : 0;
  const teamEfficiencyChange = teamEfficiencyCurrent - teamEfficiencyPrior;
  const totalGapHours = totalCurrentPayroll - totalCurrentJob;

  const improving = rows.filter(r => r.trend_direction === "improving").length;
  const declining = rows.filter(r => r.trend_direction === "declining").length;
  const stable = rows.filter(r => r.trend_direction === "stable").length;

  // For large teams, instruct AI to keep per-tech sections concise to fit token budget
  const techCount = rows.length;
  const conciseNote = techCount > 8
    ? `\nNOTE: This team has ${techCount} technicians. Keep each per-technician assessment to 2 sentences maximum.\n`
    : "";

  let prompt = `TECH EFFICIENCY REPORT - ${periodLabel} vs ${priorPeriodLabel}
${conciseNote}
IMPORTANT: Use only the exact numbers provided below. Do not recalculate or derive any figures yourself.

=== TEAM SUMMARY ===
Period analyzed: ${periodLabel}
Comparison period: ${priorPeriodLabel}
Total technicians with data: ${rows.length}

CURRENT PERIOD:
  Total payroll hours paid: ${totalCurrentPayroll.toFixed(1)}h
  Total job hours logged: ${totalCurrentJob.toFixed(1)}h
  Unaccounted hours (gap): ${totalGapHours.toFixed(1)}h
  Team efficiency (weighted): ${teamEfficiencyCurrent.toFixed(1)}%

PRIOR PERIOD:
  Total payroll hours paid: ${totalPriorPayroll.toFixed(1)}h
  Total job hours logged: ${totalPriorJob.toFixed(1)}h
  Team efficiency (weighted): ${teamEfficiencyPrior.toFixed(1)}%

TREND: ${teamEfficiencyChange >= 0 ? "+" : ""}${teamEfficiencyChange.toFixed(1)} percentage points vs prior period
Techs improving: ${improving} | Techs declining: ${declining} | Techs stable: ${stable}

=== PER-TECHNICIAN DATA ===
`;

  for (const r of rows) {
    const isSalaried = r.employment_type === "salary" || r.employment_type === "salary_no_clock";
    const empType = formatEmploymentType(r.employment_type);
    const payrollLabel = isSalaried
      ? `${r.current_payroll_hours.toFixed(1)}h (expected hours - salaried, not time-clock)`
      : `${r.current_payroll_hours.toFixed(1)}h (time clock)`;

    // Detect if prior period has real data or is a zero-data artifact
    const hasPriorData = r.prior_payroll_hours > 0 || r.prior_job_hours > 0;
    const priorBlock = hasPriorData
      ? `  PRIOR PERIOD (${priorPeriodLabel}):
    Payroll hours: ${isSalaried ? r.prior_payroll_hours.toFixed(1) + "h (expected hours - salaried)" : r.prior_payroll_hours.toFixed(1) + "h (time clock)"}
    Job hours logged: ${r.prior_job_hours.toFixed(1)}h
    Efficiency: ${r.prior_efficiency_pct.toFixed(1)}%

  TREND: ${trendLabel(r.trend_direction, r.efficiency_change)}`
      : `  PRIOR PERIOD: NO PRIOR PERIOD DATA - do not make trend comparisons for this technician.`;

    const gap = r.current_payroll_hours - r.current_job_hours;
    const salaryNote = isSalaried
      ? `  NOTE: This technician is salaried. Payroll hours are calculated from business days x 8 hours, not a time clock. They are paid regardless of logged job hours. Low efficiency here is a production-capture and accountability issue. Assess what work is going unlogged.`
      : "";

    prompt += `
TECHNICIAN: ${r.technician_name}
  Employment type: ${empType}
${salaryNote ? salaryNote + "\n" : ""}  Days worked this period: ${r.current_days_worked} | Prior period: ${hasPriorData ? r.prior_days_worked : "N/A"}

  THIS PERIOD (${periodLabel}):
    Payroll hours: ${payrollLabel}
    Job hours logged: ${r.current_job_hours.toFixed(1)}h
    Unaccounted hours: ${gap.toFixed(1)}h
    Efficiency: ${r.current_efficiency_pct.toFixed(1)}%
    Miles driven: ${r.current_miles_driven.toFixed(0)} | Trips: ${r.current_trips}

${priorBlock}
`;
  }

  prompt += `
=== YOUR TASK ===
Deliver a full executive operations review of this team's efficiency. Use exactly these section headers in this exact format (double asterisks, all caps):

**EXECUTIVE SUMMARY**
Open with the headline numbers and what they mean for the business. Is the team moving in the right direction? What is the most urgent issue?

**TEAM-WIDE ANALYSIS**
Analyze the overall payroll-vs-job-hours gap. What does ${totalGapHours.toFixed(1)} unaccounted hours represent? What are the likely causes? What does this cost the business?

**PER-TECHNICIAN ASSESSMENT**
For each technician, bold their name on its own line (**Name**), then write 2-4 complete sentences giving a frank, specific assessment using their exact hours and efficiency percentages from the data above. Note what the trend means. Flag anything requiring immediate management attention. Do not skip any technician.

**MANAGEMENT DIRECTIVES**
Give 3-5 specific actions operations management must take based on this data. Write each directive as a complete sentence. Be direct. These are not suggestions.

**FORWARD PRIORITIES**
Close with 2-3 priorities for the next ${periodLabel.toLowerCase().includes("week") ? "30 days" : "quarter"} to improve team efficiency. Write each as a complete sentence.`;

  return prompt;
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

    const body = await req.json();
    const { currentStart, currentEnd, priorStart, priorEnd, periodLabel, priorPeriodLabel } = body;

    if (!currentStart || !currentEnd || !priorStart || !priorEnd) {
      return new Response(JSON.stringify({ error: "Missing date range parameters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: efficiencyData, error: rpcError } = await supabase.rpc(
      "get_tech_efficiency_for_advisor",
      {
        p_current_start: currentStart,
        p_current_end: currentEnd,
        p_prior_start: priorStart,
        p_prior_end: priorEnd,
      }
    );

    if (rpcError) {
      return new Response(JSON.stringify({ error: `Data fetch error: ${rpcError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rows: TechEfficiencyRow[] = efficiencyData || [];

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "No technician data found for the selected period" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(rows, periodLabel || currentStart, priorPeriodLabel || priorStart);

    // Scale token budget: larger teams need more tokens for per-tech sections
    const maxTokens = rows.length > 8 ? 3500 : 4000;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.3,
        presence_penalty: 0,
        frequency_penalty: 0,
        stream: true,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Stream the response back with tech stats prepended as a metadata event
    const techStatsPayload = JSON.stringify({ type: "tech_stats", data: rows });

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Write tech stats metadata first
    writer.write(encoder.encode(`data: ${techStatsPayload}\n\n`));

    // Pipe OpenAI SSE stream — buffer across reads so lines are never split
    (async () => {
      try {
        const reader = openaiResponse.body!.getReader();
        const decoder = new TextDecoder();
        let lineBuffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          lineBuffer += decoder.decode(value, { stream: true });
          const lines = lineBuffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          lineBuffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
            } else {
              try {
                const parsed = JSON.parse(payload);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  await writer.write(
                    encoder.encode(`data: ${JSON.stringify({ type: "text", content })}\n\n`)
                  );
                }
              } catch {
                // skip malformed OpenAI chunks
              }
            }
          }
        }
      } catch (err) {
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ type: "error", content: String(err) })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
