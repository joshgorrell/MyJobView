import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { changeOrderIds, salesOrderId } = await req.json();

    if (!changeOrderIds || !Array.isArray(changeOrderIds) || changeOrderIds.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one change order ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data: changeOrders, error: coError } = await supabaseClient
      .from('change_orders')
      .select('*')
      .in('id', changeOrderIds)
      .order('created_at');

    if (coError || !changeOrders || changeOrders.length === 0) {
      return new Response(JSON.stringify({ error: 'Change orders not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const soId = salesOrderId || changeOrders[0].sales_order_id;

    const [salesOrderResult, lineItemsResult, orgResult, profilesResult, approvalsResult] = await Promise.all([
      supabaseClient
        .from('sales_orders')
        .select(`
          *,
          contact:contacts(id, full_name, company_name, email, phone, street_address, city, state, zip_code, tax_rate),
          proposal:proposals(id, proposal_number, title),
          project:projects(id, project_number)
        `)
        .eq('id', soId)
        .maybeSingle(),

      supabaseClient
        .from('change_order_line_items')
        .select('*')
        .in('change_order_id', changeOrderIds)
        .order('sort_order'),

      supabaseClient
        .from('organizations')
        .select('*')
        .limit(1)
        .maybeSingle(),

      supabaseClient
        .from('profiles')
        .select('id, full_name, role')
        .in('id', changeOrders.map((co: any) => co.requested_by).filter(Boolean)),

      supabaseClient
        .from('change_order_approvals')
        .select('*')
        .in('change_order_id', changeOrderIds)
        .order('approval_level'),
    ]);

    const salesOrder = salesOrderResult.data;
    const lineItems = lineItemsResult.data || [];
    const org = orgResult.data;
    const profiles = (profilesResult.data || []).reduce((acc: any, p: any) => {
      acc[p.id] = p;
      return acc;
    }, {});
    const approvals = approvalsResult.data || [];

    const lineItemsByCO: Record<string, any[]> = {};
    lineItems.forEach((item: any) => {
      if (!lineItemsByCO[item.change_order_id]) {
        lineItemsByCO[item.change_order_id] = [];
      }
      lineItemsByCO[item.change_order_id].push(item);
    });

    const approvalsByco: Record<string, any[]> = {};
    approvals.forEach((a: any) => {
      if (!approvalsByco[a.change_order_id]) {
        approvalsByco[a.change_order_id] = [];
      }
      approvalsByco[a.change_order_id].push(a);
    });

    const isSingleReport = changeOrders.length === 1;
    const html = generateChangeOrderReportHTML(
      changeOrders,
      lineItemsByCO,
      approvalsByco,
      salesOrder,
      org,
      profiles,
      isSingleReport
    );

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });

  } catch (error: any) {
    console.error('Change order report error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateChangeOrderReportHTML(
  changeOrders: any[],
  lineItemsByco: Record<string, any[]>,
  approvalsByco: Record<string, any[]>,
  salesOrder: any,
  org: any,
  profiles: Record<string, any>,
  isSingleReport: boolean
): string {
  const contact = salesOrder?.contact;
  const customerName = contact?.full_name || 'Customer';
  const companyName = org?.name || 'Company';
  const companyAddress = org?.address || '';
  const companyPhone = org?.phone || '';
  const companyEmail = org?.primary_contact_email || '';
  const companyLogoUrl = org?.logo_url || '';

  const formatCurrency = (amount: number) => {
    return '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; color: string; bg: string }> = {
      draft: { text: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
      pending_approval: { text: 'Pending Approval', color: '#d97706', bg: '#fef3c7' },
      approved: { text: 'Approved', color: '#059669', bg: '#d1fae5' },
      rejected: { text: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
      completed: { text: 'Completed', color: '#2563eb', bg: '#dbeafe' },
    };
    return labels[status] || { text: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      addition: 'Addition',
      deletion: 'Deletion',
      modification: 'Modification',
      credit: 'Credit',
    };
    return labels[type] || type;
  };

  const getActionLabel = (action: string) => {
    const labels: Record<string, string> = {
      add: 'New Item',
      remove: 'Remove',
      modify_quantity: 'Qty Change',
      modify_price: 'Price Change',
    };
    return labels[action] || action;
  };

  const getActionColor = (action: string) => {
    const colors: Record<string, string> = {
      add: '#059669',
      remove: '#dc2626',
      modify_quantity: '#d97706',
      modify_price: '#2563eb',
    };
    return colors[action] || '#6b7280';
  };

  const renderSingleCO = (co: any) => {
    const items = lineItemsByco[co.id] || [];
    const coApprovals = approvalsByco[co.id] || [];
    const status = getStatusLabel(co.status);
    const requester = co.requested_by ? profiles[co.requested_by] : null;

    const modifiers: { label: string; percent: number; amount: number }[] = [];
    if (co.apply_discount && co.discount_percent > 0) {
      modifiers.push({ label: 'Discount', percent: co.discount_percent, amount: -(co.discount_amount || 0) });
    }
    if (co.apply_project_management && co.project_management_percent > 0) {
      modifiers.push({ label: 'Project Management', percent: co.project_management_percent, amount: co.project_management_amount || 0 });
    }
    if (co.apply_project_design && co.project_design_percent > 0) {
      modifiers.push({ label: 'Project Design', percent: co.project_design_percent, amount: co.project_design_amount || 0 });
    }
    if (co.apply_system_design && co.system_design_percent > 0) {
      modifiers.push({ label: 'System Design', percent: co.system_design_percent, amount: co.system_design_amount || 0 });
    }
    if (co.apply_credit_card_fee && co.credit_card_fee_percent > 0) {
      modifiers.push({ label: 'Credit Card Fee', percent: co.credit_card_fee_percent, amount: co.credit_card_fee_amount || 0 });
    }
    if (co.apply_misc_parts && co.misc_parts_percent > 0) {
      modifiers.push({ label: 'Misc Parts', percent: co.misc_parts_percent, amount: co.misc_parts_amount || 0 });
    }
    if (co.apply_custom_modifier_1 && co.custom_modifier_1_percent > 0) {
      modifiers.push({ label: 'Custom Fee 1', percent: co.custom_modifier_1_percent, amount: co.custom_modifier_1_amount || 0 });
    }
    if (co.apply_custom_modifier_2 && co.custom_modifier_2_percent > 0) {
      modifiers.push({ label: 'Custom Fee 2', percent: co.custom_modifier_2_percent, amount: co.custom_modifier_2_amount || 0 });
    }

    const partsSubtotal = co.parts_subtotal || 0;
    const laborSubtotal = co.labor_subtotal || 0;
    const subtotal = partsSubtotal + laborSubtotal;
    const partsTax = co.parts_tax || 0;
    const laborTax = co.labor_tax || 0;
    const totalTax = co.tax_amount || 0;
    const changeAmount = co.change_amount || 0;

    return `
      <div class="co-section" style="page-break-inside: avoid; margin-bottom: 48px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 3px solid ${status.color};">
          <div>
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px;">Change Order</div>
            <div style="font-size: 28px; font-weight: 700; color: #111827; letter-spacing: -0.025em;">${co.change_order_number}</div>
            <div style="font-size: 18px; font-weight: 600; color: #374151; margin-top: 4px;">${co.title || 'Untitled Change Order'}</div>
          </div>
          <div style="text-align: right;">
            <div style="display: inline-block; padding: 6px 16px; background-color: ${status.bg}; border-radius: 6px; margin-bottom: 8px;">
              <span style="font-size: 13px; font-weight: 600; color: ${status.color}; text-transform: uppercase; letter-spacing: 0.5px;">${status.text}</span>
            </div>
            <div style="font-size: 13px; color: #6b7280;">
              <span style="padding: 4px 10px; background-color: #f3f4f6; border-radius: 4px; font-weight: 500;">${getTypeLabel(co.type)}</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px;">
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; border: 1px solid #e5e7eb;">
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">Details</div>
            <div style="font-size: 13px; line-height: 2; color: #374151;">
              <div><strong>Requested By:</strong> ${requester?.full_name || 'N/A'}</div>
              <div><strong>Requested Date:</strong> ${formatDate(co.requested_date || co.created_at)}</div>
              ${co.approval_date ? `<div><strong>Approval Date:</strong> ${formatDate(co.approval_date)}</div>` : ''}
              <div><strong>Original Contract:</strong> ${formatCurrency(co.original_contract_amount || 0)}</div>
              <div><strong>New Contract Total:</strong> ${formatCurrency(co.new_contract_total || 0)}</div>
            </div>
          </div>
          <div style="background: #f9fafb; border-radius: 8px; padding: 16px; border: 1px solid #e5e7eb;">
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 12px;">Financial Impact</div>
            <div style="text-align: center; padding: 12px 0;">
              <div style="font-size: 36px; font-weight: 700; color: ${changeAmount >= 0 ? '#059669' : '#dc2626'};">
                ${changeAmount >= 0 ? '+' : '-'}${formatCurrency(changeAmount)}
              </div>
              <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">Net Change Amount</div>
            </div>
          </div>
        </div>

        ${co.description ? `
          <div style="margin-bottom: 24px; padding: 16px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 0 8px 8px 0;">
            <div style="font-size: 11px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px;">Description</div>
            <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #1e3a8a; white-space: pre-wrap;">${co.description}</p>
          </div>
        ` : ''}

        ${co.notes && co.notes_public ? `
          <div style="margin-bottom: 24px; padding: 12px 16px; background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px;">
            <div style="font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Notes</div>
            <p style="margin: 0; font-size: 13px; line-height: 1.6; color: #374151; white-space: pre-wrap;">${co.notes}</p>
          </div>
        ` : ''}

        ${items.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px;">Line Items</div>
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);">
                  <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Action</th>
                  <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Item</th>
                  <th style="text-align: center; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; width: 60px;">Qty</th>
                  <th style="text-align: right; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; width: 90px;">Unit Price</th>
                  <th style="text-align: right; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; width: 80px;">Labor</th>
                  <th style="text-align: right; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; width: 100px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item: any, idx: number) => {
                  const actionColor = getActionColor(item.action_type);
                  const materialTotal = item.new_total || 0;
                  const laborTotal = item.labor_total || 0;
                  const lineTotal = materialTotal + laborTotal;
                  return `
                    <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
                      <td style="padding: 12px 14px;">
                        <span style="display: inline-block; padding: 3px 8px; background-color: ${actionColor}15; color: ${actionColor}; font-size: 10px; font-weight: 600; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">${getActionLabel(item.action_type)}</span>
                      </td>
                      <td style="padding: 12px 14px;">
                        <div style="font-size: 13px; font-weight: 600; color: #111827;">${item.product_name}</div>
                        ${item.product_description ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">${item.product_description}</div>` : ''}
                        ${item.install_location ? `<div style="font-size: 11px; color: #6b7280; margin-top: 2px;">Location: ${item.install_location}</div>` : ''}
                      </td>
                      <td style="text-align: center; padding: 12px 14px; font-size: 13px; color: #374151; font-weight: 600;">${item.new_quantity}</td>
                      <td style="text-align: right; padding: 12px 14px; font-size: 13px; color: #374151;">${formatCurrency(item.new_unit_price || 0)}</td>
                      <td style="text-align: right; padding: 12px 14px; font-size: 13px; color: #374151;">
                        ${laborTotal > 0 ? formatCurrency(laborTotal) : '-'}
                        ${item.labor_hours > 0 ? `<div style="font-size: 10px; color: #9ca3af;">${item.labor_hours}h</div>` : ''}
                      </td>
                      <td style="text-align: right; padding: 12px 14px; font-size: 13px; font-weight: 700; color: #111827;">${formatCurrency(lineTotal)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: flex-end;">
          <div style="width: 340px; background: #f9fafb; border-radius: 8px; padding: 20px; border: 1px solid #e5e7eb;">
            ${subtotal > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #374151;">
                <span>Parts Subtotal</span>
                <span style="font-weight: 500;">${formatCurrency(partsSubtotal)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #374151;">
                <span>Labor Subtotal</span>
                <span style="font-weight: 500;">${formatCurrency(laborSubtotal)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #374151; border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 12px;">
                <span style="font-weight: 600;">Subtotal</span>
                <span style="font-weight: 600;">${formatCurrency(subtotal)}</span>
              </div>
            ` : ''}

            ${modifiers.map(mod => `
              <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; color: ${mod.amount < 0 ? '#dc2626' : '#374151'};">
                <span>${mod.label} (${mod.percent}%)</span>
                <span style="font-weight: 500;">${mod.amount < 0 ? '-' : '+'}${formatCurrency(Math.abs(mod.amount))}</span>
              </div>
            `).join('')}

            ${totalTax > 0 ? `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; color: #374151; border-top: 1px solid #e5e7eb; margin-top: 4px; padding-top: 8px;">
                <span>Tax${co.tax_rate ? ` (${(co.tax_rate * 100).toFixed(2)}%)` : ''}</span>
                <span style="font-weight: 500;">${formatCurrency(totalTax)}</span>
              </div>
              ${partsTax > 0 ? `<div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 11px; color: #9ca3af;"><span>Parts Tax</span><span>${formatCurrency(partsTax)}</span></div>` : ''}
              ${laborTax > 0 ? `<div style="display: flex; justify-content: space-between; padding: 2px 0 2px 16px; font-size: 11px; color: #9ca3af;"><span>Labor Tax</span><span>${formatCurrency(laborTax)}</span></div>` : ''}
            ` : ''}

            <div style="display: flex; justify-content: space-between; padding: 14px 0 0 0; margin-top: 8px; border-top: 3px solid #2563eb; font-size: 18px; font-weight: 700;">
              <span style="color: #111827;">Change Total</span>
              <span style="color: ${changeAmount >= 0 ? '#059669' : '#dc2626'};">
                ${changeAmount >= 0 ? '+' : '-'}${formatCurrency(changeAmount)}
              </span>
            </div>
          </div>
        </div>

        ${coApprovals.length > 0 ? `
          <div style="margin-top: 24px;">
            <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 12px;">Approval History</div>
            <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="text-align: left; padding: 10px 14px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Level</th>
                  <th style="text-align: left; padding: 10px 14px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Role</th>
                  <th style="text-align: left; padding: 10px 14px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Status</th>
                  <th style="text-align: left; padding: 10px 14px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Date</th>
                  <th style="text-align: left; padding: 10px 14px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${coApprovals.map((a: any) => {
                  const aStatus = getStatusLabel(a.status);
                  return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                      <td style="padding: 10px 14px; font-size: 13px; color: #374151; font-weight: 600;">Level ${a.approval_level}</td>
                      <td style="padding: 10px 14px; font-size: 13px; color: #374151; text-transform: capitalize;">${a.approver_role?.replace(/_/g, ' ') || 'N/A'}</td>
                      <td style="padding: 10px 14px;">
                        <span style="display: inline-block; padding: 3px 8px; background-color: ${aStatus.bg}; color: ${aStatus.color}; font-size: 11px; font-weight: 600; border-radius: 4px;">${aStatus.text}</span>
                      </td>
                      <td style="padding: 10px 14px; font-size: 12px; color: #6b7280;">${a.approved_date ? formatDate(a.approved_date) : '-'}</td>
                      <td style="padding: 10px 14px; font-size: 12px; color: #6b7280;">${a.notes || a.rejection_reason || '-'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        ` : ''}
      </div>
    `;
  };

  const coPages = changeOrders.map((co, idx) => {
    const pageBreak = idx > 0 ? 'page-break-before: always;' : '';
    return `<div style="${pageBreak}">${renderSingleCO(co)}</div>`;
  }).join('');

  const totalChangeAmount = changeOrders.reduce((sum, co) => sum + (co.change_amount || 0), 0);
  const totalTaxAmount = changeOrders.reduce((sum, co) => sum + (co.tax_amount || 0), 0);

  const summarySection = !isSingleReport ? `
    <div style="margin-bottom: 48px; padding-bottom: 32px; border-bottom: 2px solid #e5e7eb;">
      <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700; color: #111827;">Change Order Summary</h2>
      <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
        <thead>
          <tr style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);">
            <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">CO #</th>
            <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Title</th>
            <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Type</th>
            <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Status</th>
            <th style="text-align: left; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Date</th>
            <th style="text-align: right; padding: 12px 14px; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${changeOrders.map((co, idx) => {
            const status = getStatusLabel(co.status);
            const amt = co.change_amount || 0;
            return `
              <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? 'background-color: #f9fafb;' : ''}">
                <td style="padding: 10px 14px; font-size: 13px; font-weight: 600; color: #111827; font-family: monospace;">${co.change_order_number}</td>
                <td style="padding: 10px 14px; font-size: 13px; color: #374151;">${co.title || 'Untitled'}</td>
                <td style="padding: 10px 14px; font-size: 12px; color: #6b7280; text-transform: capitalize;">${getTypeLabel(co.type)}</td>
                <td style="padding: 10px 14px;">
                  <span style="display: inline-block; padding: 3px 8px; background-color: ${status.bg}; color: ${status.color}; font-size: 10px; font-weight: 600; border-radius: 4px;">${status.text}</span>
                </td>
                <td style="padding: 10px 14px; font-size: 12px; color: #6b7280;">${formatDate(co.created_at)}</td>
                <td style="text-align: right; padding: 10px 14px; font-size: 14px; font-weight: 700; color: ${amt >= 0 ? '#059669' : '#dc2626'};">
                  ${amt >= 0 ? '+' : '-'}${formatCurrency(amt)}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
        <tfoot>
          <tr style="background-color: #f3f4f6; border-top: 2px solid #2563eb;">
            <td colspan="5" style="padding: 12px 14px; font-size: 15px; font-weight: 700; color: #111827;">
              Total (${changeOrders.length} Change Order${changeOrders.length !== 1 ? 's' : ''})
            </td>
            <td style="text-align: right; padding: 12px 14px; font-size: 18px; font-weight: 700; color: ${totalChangeAmount >= 0 ? '#059669' : '#dc2626'};">
              ${totalChangeAmount >= 0 ? '+' : '-'}${formatCurrency(totalChangeAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  ` : '';

  const reportTitle = isSingleReport
    ? `Change Order ${changeOrders[0].change_order_number}`
    : `Change Order Report (${changeOrders.length} Orders)`;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${reportTitle} - SO #${salesOrder?.order_number || 'N/A'}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        @page { margin: 0.5in; size: letter; }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1f2937;
          line-height: 1.65;
          font-size: 14px;
          background: white;
          -webkit-font-smoothing: antialiased;
          padding: 20px 0 0 0;
        }

        .print-actions {
          position: sticky;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
          padding: 16px 24px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          margin-bottom: 24px;
        }

        .print-actions h1 {
          color: white;
          font-size: 18px;
          font-weight: 600;
          margin: 0;
        }

        .print-actions .buttons { display: flex; gap: 12px; }

        .btn {
          padding: 10px 20px;
          font-size: 14px;
          font-weight: 600;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          font-family: inherit;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }

        .btn-print { background: white; color: #1e3a8a; }
        .btn-print:hover { background: #f0f4ff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }

        @media print {
          body { padding: 0; }
          .print-actions { display: none !important; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          table { box-shadow: none !important; }
          h1, h2, h3 { page-break-after: avoid; }
          table, figure { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <h1>${reportTitle} - SO #${salesOrder?.order_number || 'N/A'}</h1>
        <div class="buttons">
          <button class="btn btn-print" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print / Save PDF
          </button>
        </div>
      </div>

      <div style="max-width: 100%; margin: 0 auto; padding: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 24px; border-bottom: 3px solid #2563eb; margin-bottom: 32px;">
          <div style="flex: 1;">
            ${companyLogoUrl ? `<img src="${companyLogoUrl}" alt="${companyName}" style="max-height: 60px; max-width: 200px; object-fit: contain; margin-bottom: 16px;" />` : ''}
            <h1 style="margin: 0 0 4px 0; font-size: 28px; font-weight: 700; color: #111827;">${companyName}</h1>
            <div style="width: 60px; height: 3px; background-color: #2563eb; border-radius: 2px; margin: 8px 0 16px 0;"></div>
            <div style="font-size: 12px; color: #6b7280; line-height: 1.8;">
              ${companyAddress ? `<div>${companyAddress}</div>` : ''}
              ${companyPhone ? `<div>Phone: ${companyPhone}</div>` : ''}
              ${companyEmail ? `<div>Email: ${companyEmail}</div>` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px;">Change Order Report</div>
            <div style="font-size: 14px; color: #374151; line-height: 2; margin-top: 12px;">
              <div><strong>Sales Order:</strong> #${salesOrder?.order_number || 'N/A'}</div>
              ${salesOrder?.proposal?.proposal_number ? `<div><strong>Proposal:</strong> ${salesOrder.proposal.proposal_number}</div>` : ''}
              ${salesOrder?.project?.project_number ? `<div><strong>Project:</strong> #${salesOrder.project.project_number}</div>` : ''}
              <div><strong>Generated:</strong> ${formatDate(new Date().toISOString())}</div>
            </div>
          </div>
        </div>

        <div style="background: #eff6ff; border-radius: 8px; padding: 20px; margin-bottom: 32px; border: 1px solid #bfdbfe;">
          <div style="display: inline-block; padding: 4px 12px; background-color: #2563eb; color: white; font-size: 11px; font-weight: 600; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">Customer</div>
          <div style="font-size: 20px; font-weight: 700; color: #111827; margin-bottom: 8px;">${customerName}</div>
          <div style="font-size: 13px; color: #1e40af; line-height: 1.8;">
            ${contact?.company_name ? `<div>${contact.company_name}</div>` : ''}
            ${contact?.street_address ? `<div>${contact.street_address}, ${contact.city || ''} ${contact.state || ''} ${contact.zip_code || ''}</div>` : ''}
            ${contact?.email ? `<div>Email: ${contact.email}</div>` : ''}
            ${contact?.phone ? `<div>Phone: ${contact.phone}</div>` : ''}
          </div>
        </div>

        ${summarySection}

        ${coPages}

        <div style="margin-top: 48px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 11px; color: #9ca3af;">
              Generated on ${formatDate(new Date().toISOString())} | ${companyName}
            </div>
            <div style="font-size: 11px; color: #9ca3af;">
              ${isSingleReport ? `Change Order ${changeOrders[0].change_order_number}` : `${changeOrders.length} Change Orders`} | SO #${salesOrder?.order_number || 'N/A'}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
