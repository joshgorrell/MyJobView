import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get today's date
    const today = new Date().toISOString().split('T')[0];

    // Find all sales orders reaching Day 90 today
    const { data: salesOrders, error: fetchError } = await supabase
      .from('sales_orders')
      .select(`
        id,
        order_number,
        contact_id,
        test_tune_end_date,
        total_estimated_labor_hours,
        field_labor_target_hours,
        labor_burden_rate,
        lead_technician_id,
        projects!inner(project_manager_id)
      `)
      .eq('test_tune_status', 'active')
      .eq('test_tune_end_date', today);

    if (fetchError) {
      throw new Error(`Error fetching sales orders: ${fetchError.message}`);
    }

    if (!salesOrders || salesOrders.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No projects reaching Day 90 today', count: 0 }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get test & tune settings
    const { data: settings } = await supabase
      .from('test_tune_settings')
      .select('*')
      .single();

    if (!settings) {
      throw new Error('Test & Tune settings not found');
    }

    const results = [];

    for (const order of salesOrders) {
      try {
        // Get labor totals for this order
        const { data: laborData } = await supabase.rpc('get_test_tune_labor_totals', {
          p_sales_order_id: order.id
        });

        if (!laborData || laborData.length === 0) continue;

        const labor = laborData[0];
        const fieldHours = labor.field_hours || 0;
        const fieldTarget = order.field_labor_target_hours || 0;
        const laborSavingsHours = fieldTarget - fieldHours;

        // Determine bonus tier and calculate bonus
        let bonusTier = 'over_target';
        let bonusPercentage = 0;
        let totalBonusAmount = 0;

        if (laborSavingsHours < 0) {
          // Over target - no bonus
          bonusTier = 'over_target';
        } else if (laborSavingsHours === 0) {
          // Exactly on target - flat bonus
          bonusTier = 'on_target';
          totalBonusAmount = settings.on_target_bonus_amount;
        } else if (laborSavingsHours >= settings.tier_1_min_hours && laborSavingsHours <= settings.tier_1_max_hours) {
          // Tier 1 savings
          bonusTier = 'tier_1';
          bonusPercentage = settings.tier_1_percentage;
        } else if (laborSavingsHours >= settings.tier_2_min_hours && laborSavingsHours <= settings.tier_2_max_hours) {
          // Tier 2 savings
          bonusTier = 'tier_2';
          bonusPercentage = settings.tier_2_percentage;
        } else if (laborSavingsHours >= settings.tier_3_min_hours) {
          // Tier 3 savings
          bonusTier = 'tier_3';
          bonusPercentage = settings.tier_3_percentage;
        }

        // Calculate bonus amount for percentage-based tiers
        if (bonusPercentage > 0) {
          const laborBurdenRate = order.labor_burden_rate || settings.default_labor_burden_rate;
          const savingsAmount = laborSavingsHours * laborBurdenRate;
          totalBonusAmount = savingsAmount * (bonusPercentage / 100);
        }

        // Split bonus between tech and PM
        const techPercentage = settings.tech_bonus_percentage / 100;
        const pmPercentage = settings.pm_bonus_percentage / 100;
        const techBonusAmount = totalBonusAmount * techPercentage;
        const pmBonusAmount = totalBonusAmount * pmPercentage;

        // Create bonus calculation record
        const { data: calculation, error: calcError } = await supabase
          .from('test_tune_bonus_calculations')
          .insert({
            sales_order_id: order.id,
            evaluation_date: today,
            total_estimated_labor: order.total_estimated_labor_hours,
            field_labor_target: fieldTarget,
            total_field_hours: fieldHours,
            labor_savings_hours: laborSavingsHours,
            labor_burden_rate: order.labor_burden_rate || settings.default_labor_burden_rate,
            total_savings_amount: laborSavingsHours * (order.labor_burden_rate || settings.default_labor_burden_rate),
            bonus_tier: bonusTier,
            bonus_percentage: bonusPercentage,
            total_bonus_amount: totalBonusAmount,
            tech_bonus_amount: techBonusAmount,
            pm_bonus_amount: pmBonusAmount,
            lead_technician_id: order.lead_technician_id,
            project_manager_id: order.projects?.[0]?.project_manager_id,
            status: 'provisional',
            notes: 'Automatically calculated at Day 90'
          })
          .select()
          .single();

        if (calcError) {
          console.error(`Error creating calculation for order ${order.order_number}:`, calcError);
          continue;
        }

        // Update sales order status to pending approval
        await supabase
          .from('sales_orders')
          .update({ test_tune_status: 'pending_approval' })
          .eq('id', order.id);

        // Create final snapshot
        await supabase
          .from('test_tune_performance_snapshots')
          .insert({
            sales_order_id: order.id,
            snapshot_date: today,
            total_field_hours: fieldHours,
            total_pm_hours: labor.pm_hours || 0,
            total_non_performance_hours: labor.non_performance_hours || 0,
            field_labor_target: fieldTarget,
            percentage_of_target: fieldTarget > 0 ? (fieldHours / fieldTarget) * 100 : 0
          });

        // Send notifications to finance and admin
        const notificationRoles = settings.notification_roles || ['admin', 'finance'];

        const { data: admins } = await supabase
          .from('profiles')
          .select('id')
          .in('role', notificationRoles);

        if (admins && admins.length > 0) {
          const notifications = admins.map(admin => ({
            user_id: admin.id,
            type: 'test_tune_evaluation',
            title: 'Test & Tune Evaluation Ready',
            message: `Day 90 evaluation for Order #${order.order_number} is ready for review. Bonus: $${totalBonusAmount.toFixed(2)}`,
            related_id: calculation.id
          }));

          await supabase.from('notifications').insert(notifications);
        }

        results.push({
          order_number: order.order_number,
          bonus_tier: bonusTier,
          total_bonus_amount: totalBonusAmount,
          calculation_id: calculation.id
        });

      } catch (orderError) {
        console.error(`Error processing order ${order.order_number}:`, orderError);
        results.push({
          order_number: order.order_number,
          error: orderError.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${salesOrders.length} Day 90 evaluations`,
        count: salesOrders.length,
        results
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in test-tune-day-90-evaluation:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Supabase client helper
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    from: (table: string) => ({
      select: (columns: string = '*') => ({
        eq: (column: string, value: any) => ({
          select: async () => {
            const response = await fetch(
              `${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                },
              }
            );
            const data = await response.json();
            return { data, error: null };
          },
          single: async () => {
            const response = await fetch(
              `${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}&select=${columns}`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Accept': 'application/vnd.pgrst.object+json',
                },
              }
            );
            const data = await response.json();
            return { data, error: null };
          }
        }),
        in: (column: string, values: any[]) => ({
          select: async () => {
            const response = await fetch(
              `${supabaseUrl}/rest/v1/${table}?${column}=in.(${values.join(',')})&select=${columns}`,
              {
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                },
              }
            );
            const data = await response.json();
            return { data, error: null };
          }
        }),
        single: async () => {
          const response = await fetch(
            `${supabaseUrl}/rest/v1/${table}?select=${columns}&limit=1`,
            {
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Accept': 'application/vnd.pgrst.object+json',
              },
            }
          );
          const data = await response.json();
          return { data, error: null };
        }
      }),
      insert: (values: any) => ({
        select: () => ({
          single: async () => {
            const response = await fetch(
              `${supabaseUrl}/rest/v1/${table}`,
              {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation',
                },
                body: JSON.stringify(values),
              }
            );
            const data = await response.json();
            return { data: Array.isArray(data) ? data[0] : data, error: null };
          }
        }),
        execute: async () => {
          const response = await fetch(
            `${supabaseUrl}/rest/v1/${table}`,
            {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(values),
            }
          );
          return { error: null };
        }
      }),
      update: (values: any) => ({
        eq: (column: string, value: any) => ({
          execute: async () => {
            const response = await fetch(
              `${supabaseUrl}/rest/v1/${table}?${column}=eq.${value}`,
              {
                method: 'PATCH',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(values),
              }
            );
            return { error: null };
          }
        })
      })
    }),
    rpc: async (functionName: string, params: any = {}) => {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/rpc/${functionName}`,
        {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(params),
        }
      );
      const data = await response.json();
      return { data, error: null };
    }
  };
}
