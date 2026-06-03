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
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { salesOrderId } = await req.json();
    if (!salesOrderId) {
      return new Response(JSON.stringify({ error: 'Sales Order ID is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data: salesOrder, error: soError } = await supabase
      .from('sales_orders')
      .select(`
        *,
        contact:contacts(id, full_name, company_name, email, phone, street_address, city, state, zip_code, tax_rate, is_tax_exempt),
        proposal:proposals(id, proposal_number, title, status, subtotal, tax_amount, tax_rate, total, tax_environment, tax_project_type, customer_notes, created_at, valid_until, discount_percent, project_management_percent, custom_modifier_1_label, custom_modifier_1_percent, custom_modifier_2_label, custom_modifier_2_percent, jobsite_address),
        project:projects(id, project_number, name, status)
      `)
      .eq('id', salesOrderId)
      .maybeSingle();

    if (soError || !salesOrder) {
      return new Response(JSON.stringify({ error: 'Sales order not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const proposalId = salesOrder.proposal_id;

    const [
      roomsResult, lineItemsResult, settingsResult,
      changeOrdersResult, orgResult
    ] = await Promise.all([
      proposalId ? supabase
        .from('proposal_rooms')
        .select('id, name, description, show_scope, sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order') : { data: [] },

      proposalId ? supabase
        .from('proposal_line_items')
        .select(`
          id, room_id, description, quantity, unit_price, line_total,
          labor_hours, labor_rate, labor_total, item_type, sort_order,
          products(sku, manufacturer, item_color)
        `)
        .eq('proposal_id', proposalId)
        .order('sort_order') : { data: [] },

      proposalId ? supabase
        .from('proposal_settings')
        .select('*')
        .eq('proposal_id', proposalId)
        .maybeSingle() : { data: null },

      supabase
        .from('change_orders')
        .select('*')
        .eq('sales_order_id', salesOrderId)
        .eq('status', 'approved')
        .order('created_at'),

      supabase
        .from('organizations')
        .select('*')
        .limit(1)
        .maybeSingle(),
    ]);

    const rooms = roomsResult.data || [];
    const lineItems = (lineItemsResult.data || []).map((item: any) => ({
      ...item,
      sku: item.products?.sku,
      manufacturer: item.products?.manufacturer,
      color: item.products?.item_color,
    }));
    const proposalSettings = settingsResult.data;
    const approvedCOs = changeOrdersResult.data || [];
    const org = orgResult.data;

    let coLineItems: Record<string, any[]> = {};
    if (approvedCOs.length > 0) {
      const { data: coItems } = await supabase
        .from('change_order_line_items')
        .select('*')
        .in('change_order_id', approvedCOs.map((co: any) => co.id))
        .order('sort_order');

      (coItems || []).forEach((item: any) => {
        if (!coLineItems[item.change_order_id]) coLineItems[item.change_order_id] = [];
        coLineItems[item.change_order_id].push(item);
      });
    }

    const html = generateSalesOrderReportHTML(
      salesOrder, rooms, lineItems, proposalSettings, approvedCOs, coLineItems, org
    );

    return new Response(html, {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });

  } catch (error: any) {
    console.error('Sales order report error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function fmt(amount: number): string {
  return '$' + Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function generateSalesOrderReportHTML(
  salesOrder: any,
  rooms: any[],
  lineItems: any[],
  proposalSettings: any,
  approvedCOs: any[],
  coLineItems: Record<string, any[]>,
  org: any
): string {
  const contact = salesOrder.contact;
  const proposal = salesOrder.proposal;
  const project = salesOrder.project;
  const customerName = contact?.full_name || 'Customer';
  const companyName = org?.name || 'Company';
  const companyPhone = org?.phone || '';
  const companyEmail = org?.primary_contact_email || '';
  const companyAddress = org?.address || '';
  const companyLogoUrl = org?.logo_url || '';

  const proposalSubtotal = proposal?.subtotal || 0;
  const proposalTax = proposal?.tax_amount || 0;
  const proposalTotal = proposal?.total || salesOrder.contract_total || 0;

  const totalCOAmount = approvedCOs.reduce((s: number, co: any) => s + (co.change_amount || 0), 0);
  const totalCOTax = approvedCOs.reduce((s: number, co: any) => s + (co.tax_amount || 0), 0);
  const grandTotal = proposalTotal + totalCOAmount;

  const itemsByRoom: Record<string, any[]> = {};
  lineItems.forEach((item: any) => {
    const roomId = item.room_id || 'no-room';
    if (!itemsByRoom[roomId]) itemsByRoom[roomId] = [];
    itemsByRoom[roomId].push(item);
  });

  const roomsWithItems = rooms.filter((r: any) => (itemsByRoom[r.id] || []).length > 0);

  const proposalRoomsHTML = roomsWithItems.map((room: any) => {
    const items = itemsByRoom[room.id] || [];
    let roomParts = 0, roomLabor = 0;
    items.forEach((i: any) => {
      roomParts += i.line_total || 0;
      roomLabor += i.labor_total || ((i.labor_hours || 0) * (i.labor_rate || 0));
    });
    const roomTotal = roomParts + roomLabor;

    return `
      <div style="margin-bottom: 32px; page-break-inside: avoid;">
        <div style="margin-bottom: 12px;">
          <h4 style="margin: 0 0 4px 0; font-size: 15px; font-weight: 600; color: #111827;">${room.name}</h4>
          <div style="width: 40px; height: 2px; background-color: #2563eb; border-radius: 1px;"></div>
        </div>
        ${room.show_scope && room.description ? `
          <div style="margin-bottom: 12px; padding: 12px; background: #eff6ff; border-left: 3px solid #2563eb; border-radius: 0 6px 6px 0; font-size: 13px; color: #1e40af; line-height: 1.6; white-space: pre-wrap;">${room.description}</div>
        ` : ''}
        <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; font-size: 13px;">
          <thead>
            <tr style="background: #f3f4f6;">
              <th style="text-align: left; padding: 10px 12px; font-size: 11px; color: #6b7280; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Description</th>
              <th style="text-align: center; padding: 10px 12px; font-size: 11px; color: #6b7280; font-weight: 600; width: 50px;">Qty</th>
              <th style="text-align: right; padding: 10px 12px; font-size: 11px; color: #6b7280; font-weight: 600; width: 80px;">Unit</th>
              <th style="text-align: right; padding: 10px 12px; font-size: 11px; color: #6b7280; font-weight: 600; width: 80px;">Labor</th>
              <th style="text-align: right; padding: 10px 12px; font-size: 11px; color: #6b7280; font-weight: 600; width: 90px;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item: any, idx: number) => {
              const laborCost = item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0));
              const installed = (item.line_total || 0) + laborCost;
              return `
                <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? 'background: #f9fafb;' : ''}">
                  <td style="padding: 10px 12px; font-weight: 500; color: #111827;">${item.description}</td>
                  <td style="text-align: center; padding: 10px 12px; color: #374151; font-weight: 600;">${item.quantity}</td>
                  <td style="text-align: right; padding: 10px 12px; color: #374151;">${fmt(item.unit_price || 0)}</td>
                  <td style="text-align: right; padding: 10px 12px; color: #374151;">${laborCost > 0 ? fmt(laborCost) : '-'}</td>
                  <td style="text-align: right; padding: 10px 12px; font-weight: 700; color: #111827;">${fmt(installed)}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f3f4f6; border-top: 2px solid #d1d5db;">
              <td colspan="4" style="padding: 10px 12px; font-weight: 600; color: #374151;">Area Total</td>
              <td style="text-align: right; padding: 10px 12px; font-weight: 700; color: #2563eb; font-size: 14px;">${fmt(roomTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `;
  }).join('');

  const modifiers: { label: string; percent: number; amount: number }[] = [];
  let modifiedSubtotal = proposalSubtotal;

  const dp = proposal?.discount_percent || proposalSettings?.discount_percent || 0;
  const pmp = proposal?.project_management_percent || proposalSettings?.project_management_percent || 0;
  const sdp = proposalSettings?.system_design_percent || 0;
  const pdp = proposalSettings?.project_design_percent || 0;
  const ccfp = proposalSettings?.credit_card_fee_percent || 0;
  const mpp = proposalSettings?.misc_parts_percent || 0;
  const cm1l = proposal?.custom_modifier_1_label || proposalSettings?.custom_modifier_1_label;
  const cm1p = proposal?.custom_modifier_1_percent || proposalSettings?.custom_modifier_1_percent || 0;
  const cm2l = proposal?.custom_modifier_2_label || proposalSettings?.custom_modifier_2_label;
  const cm2p = proposal?.custom_modifier_2_percent || proposalSettings?.custom_modifier_2_percent || 0;

  if (dp > 0) { const a = proposalSubtotal * (dp / 100); modifiers.push({ label: 'Discount', percent: dp, amount: -a }); modifiedSubtotal -= a; }
  if (pmp > 0) { const a = proposalSubtotal * (pmp / 100); modifiers.push({ label: 'Project Management', percent: pmp, amount: a }); modifiedSubtotal += a; }
  if (pdp > 0) { const a = proposalSubtotal * (pdp / 100); modifiers.push({ label: 'Project Design', percent: pdp, amount: a }); modifiedSubtotal += a; }
  if (sdp > 0) { const a = proposalSubtotal * (sdp / 100); modifiers.push({ label: 'System Design', percent: sdp, amount: a }); modifiedSubtotal += a; }
  if (ccfp > 0) { const a = proposalSubtotal * (ccfp / 100); modifiers.push({ label: 'Credit Card Fee', percent: ccfp, amount: a }); modifiedSubtotal += a; }
  if (mpp > 0) { const a = proposalSubtotal * (mpp / 100); modifiers.push({ label: 'Misc Parts', percent: mpp, amount: a }); modifiedSubtotal += a; }
  if (cm1p > 0 && cm1l) { const a = proposalSubtotal * (cm1p / 100); modifiers.push({ label: cm1l, percent: cm1p, amount: a }); modifiedSubtotal += a; }
  if (cm2p > 0 && cm2l) { const a = proposalSubtotal * (cm2p / 100); modifiers.push({ label: cm2l, percent: cm2p, amount: a }); modifiedSubtotal += a; }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { text: string; color: string; bg: string }> = {
      draft: { text: 'Draft', color: '#6b7280', bg: '#f3f4f6' },
      pending_approval: { text: 'Pending', color: '#d97706', bg: '#fef3c7' },
      approved: { text: 'Approved', color: '#059669', bg: '#d1fae5' },
      rejected: { text: 'Rejected', color: '#dc2626', bg: '#fee2e2' },
      completed: { text: 'Completed', color: '#2563eb', bg: '#dbeafe' },
    };
    return map[status] || { text: status, color: '#6b7280', bg: '#f3f4f6' };
  };

  const getActionLabel = (a: string) => ({ add: 'Add', remove: 'Remove', modify_quantity: 'Qty Change', modify_price: 'Price Change' }[a] || a);
  const getActionColor = (a: string) => ({ add: '#059669', remove: '#dc2626', modify_quantity: '#d97706', modify_price: '#2563eb' }[a] || '#6b7280');

  const changeOrdersHTML = approvedCOs.length === 0 ? '' : `
    <div style="page-break-before: always; margin-top: 48px;">
      <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827;">Approved Change Orders</h2>
      <div style="width: 80px; height: 3px; background: #2563eb; border-radius: 2px; margin-bottom: 24px;"></div>
      <p style="font-size: 13px; color: #6b7280; margin: 0 0 20px 0;">${approvedCOs.length} approved change order${approvedCOs.length !== 1 ? 's' : ''} totaling ${totalCOAmount >= 0 ? '+' : '-'}${fmt(totalCOAmount)}</p>

      ${approvedCOs.map((co: any, coIdx: number) => {
        const items = coLineItems[co.id] || [];
        const changeAmt = co.change_amount || 0;
        return `
          <div style="margin-bottom: 36px; ${coIdx > 0 ? 'page-break-inside: avoid;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px 8px 0 0; border-bottom: 3px solid #059669;">
              <div>
                <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px;">Change Order ${co.change_order_number}</div>
                <div style="font-size: 16px; font-weight: 600; color: #111827;">${co.title || 'Untitled'}</div>
                <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                  Approved ${fmtDate(co.approval_date || co.updated_at)}
                  <span style="margin-left: 12px; padding: 2px 8px; background: #f3f4f6; border-radius: 4px; text-transform: capitalize;">${co.type}</span>
                </div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 24px; font-weight: 700; color: ${changeAmt >= 0 ? '#059669' : '#dc2626'};">
                  ${changeAmt >= 0 ? '+' : '-'}${fmt(changeAmt)}
                </div>
              </div>
            </div>

            ${co.description ? `
              <div style="padding: 12px 16px; background: #eff6ff; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; font-size: 13px; color: #1e40af; line-height: 1.6; white-space: pre-wrap;">${co.description}</div>
            ` : ''}

            ${items.length > 0 ? `
              <table style="width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px; overflow: hidden; font-size: 13px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="text-align: left; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; width: 70px;">Action</th>
                    <th style="text-align: left; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase;">Item</th>
                    <th style="text-align: center; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; width: 45px;">Qty</th>
                    <th style="text-align: right; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; width: 75px;">Unit</th>
                    <th style="text-align: right; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; width: 70px;">Labor</th>
                    <th style="text-align: right; padding: 8px 12px; font-size: 10px; color: #9ca3af; font-weight: 600; text-transform: uppercase; width: 85px;">Total</th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item: any, idx: number) => {
                    const actionColor = getActionColor(item.action_type);
                    const matTotal = item.new_total || 0;
                    const labTotal = item.labor_total || 0;
                    const lineTotal = matTotal + labTotal;
                    return `
                      <tr style="border-bottom: 1px solid #e5e7eb; ${idx % 2 === 1 ? 'background: #fafafa;' : ''}">
                        <td style="padding: 8px 12px;">
                          <span style="display: inline-block; padding: 2px 6px; background: ${actionColor}12; color: ${actionColor}; font-size: 9px; font-weight: 600; border-radius: 3px; text-transform: uppercase;">${getActionLabel(item.action_type)}</span>
                        </td>
                        <td style="padding: 8px 12px; font-weight: 500; color: #111827;">${item.product_name}</td>
                        <td style="text-align: center; padding: 8px 12px; color: #374151; font-weight: 600;">${item.new_quantity}</td>
                        <td style="text-align: right; padding: 8px 12px; color: #374151;">${fmt(item.new_unit_price || 0)}</td>
                        <td style="text-align: right; padding: 8px 12px; color: #374151;">${labTotal > 0 ? fmt(labTotal) : '-'}</td>
                        <td style="text-align: right; padding: 8px 12px; font-weight: 700; color: #111827;">${fmt(lineTotal)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            ` : `
              <div style="border: 1px solid #e5e7eb; border-top: 0; border-radius: 0 0 8px 8px; padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;">No line items</div>
            `}
          </div>
        `;
      }).join('')}
    </div>
  `;

  const financialSummaryHTML = `
    <div style="${approvedCOs.length > 0 ? 'page-break-before: always;' : ''} margin-top: 48px;">
      <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827;">Financial Summary</h2>
      <div style="width: 80px; height: 3px; background: #2563eb; border-radius: 2px; margin-bottom: 24px;"></div>

      <div style="background: #f9fafb; border: 2px solid #e5e7eb; border-radius: 12px; padding: 28px; margin-bottom: 24px;">
        <div style="font-size: 13px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 16px;">Original Contract</div>

        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e5e7eb; font-size: 14px;">
          <span style="color: #6b7280;">Subtotal (Parts + Labor)</span>
          <span style="font-weight: 600; color: #111827;">${fmt(proposalSubtotal)}</span>
        </div>

        ${modifiers.map(mod => `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px;">
            <span style="color: ${mod.amount < 0 ? '#dc2626' : '#6b7280'};">${mod.label} (${mod.percent}%)</span>
            <span style="font-weight: 500; color: ${mod.amount < 0 ? '#dc2626' : '#111827'};">${mod.amount < 0 ? '-' : '+'}${fmt(Math.abs(mod.amount))}</span>
          </div>
        `).join('')}

        ${proposalTax > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 1px solid #e5e7eb; font-size: 14px;">
            <span style="color: #6b7280;">Sales Tax${proposal?.tax_rate ? ` (${(proposal.tax_rate * 100).toFixed(2)}%)` : ''}</span>
            <span style="font-weight: 500; color: #111827;">${fmt(proposalTax)}</span>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; padding: 14px 0 0; margin-top: 8px; border-top: 3px solid #2563eb; font-size: 16px;">
          <span style="font-weight: 700; color: #111827;">Original Contract Total</span>
          <span style="font-weight: 700; color: #2563eb; font-size: 20px;">${fmt(proposalTotal)}</span>
        </div>
      </div>

      ${approvedCOs.length > 0 ? `
        <div style="background: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 12px; padding: 28px; margin-bottom: 24px;">
          <div style="font-size: 13px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 16px;">Approved Change Orders</div>

          ${approvedCOs.map((co: any) => {
            const amt = co.change_amount || 0;
            return `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #d1fae5; font-size: 13px;">
                <span style="color: #374151;">
                  <span style="font-family: monospace; color: #6b7280; margin-right: 8px;">${co.change_order_number}</span>
                  ${co.title || 'Change Order'}
                </span>
                <span style="font-weight: 600; color: ${amt >= 0 ? '#059669' : '#dc2626'};">
                  ${amt >= 0 ? '+' : '-'}${fmt(amt)}
                </span>
              </div>
            `;
          }).join('')}

          <div style="display: flex; justify-content: space-between; padding: 14px 0 0; margin-top: 8px; border-top: 2px solid #059669; font-size: 15px;">
            <span style="font-weight: 700; color: #047857;">Total Change Orders (${approvedCOs.length})</span>
            <span style="font-weight: 700; color: ${totalCOAmount >= 0 ? '#059669' : '#dc2626'}; font-size: 18px;">
              ${totalCOAmount >= 0 ? '+' : '-'}${fmt(totalCOAmount)}
            </span>
          </div>
        </div>
      ` : ''}

      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); border-radius: 12px; padding: 32px; color: white;">
        <div style="font-size: 13px; font-weight: 600; color: #93c5fd; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 20px;">Total Contract Value</div>

        <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.15);">
          <span style="color: #bfdbfe;">Original Contract</span>
          <span style="font-weight: 500;">${fmt(proposalTotal)}</span>
        </div>

        ${approvedCOs.length > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 14px; border-bottom: 1px solid rgba(255,255,255,0.15);">
            <span style="color: #bfdbfe;">Change Orders (${approvedCOs.length})</span>
            <span style="font-weight: 500; color: ${totalCOAmount >= 0 ? '#86efac' : '#fca5a5'};">
              ${totalCOAmount >= 0 ? '+' : '-'}${fmt(totalCOAmount)}
            </span>
          </div>
        ` : ''}

        <div style="display: flex; justify-content: space-between; padding: 20px 0 0; margin-top: 12px; border-top: 3px solid rgba(255,255,255,0.3);">
          <span style="font-size: 20px; font-weight: 700;">Current Contract Total</span>
          <span style="font-size: 32px; font-weight: 800;">${fmt(grandTotal)}</span>
        </div>
      </div>
    </div>
  `;

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sales Order Report - SO #${salesOrder.order_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        @page { margin: 0.5in; size: letter; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1f2937; line-height: 1.65; font-size: 14px; background: white;
          -webkit-font-smoothing: antialiased; padding: 20px 0 0 0;
        }
        .print-actions {
          position: sticky; top: 0; left: 0; right: 0;
          background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
          padding: 16px 24px; display: flex; justify-content: space-between;
          align-items: center; box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 1000; margin-bottom: 24px;
        }
        .print-actions h1 { color: white; font-size: 18px; font-weight: 600; margin: 0; }
        .print-actions .buttons { display: flex; gap: 12px; }
        .btn {
          padding: 10px 20px; font-size: 14px; font-weight: 600; border: none;
          border-radius: 6px; cursor: pointer; transition: all 0.2s;
          font-family: inherit; display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-print { background: white; color: #1e3a8a; }
        .btn-print:hover { background: #f0f4ff; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        @media print {
          body { padding: 0; }
          .print-actions { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
          table { box-shadow: none !important; }
          h1, h2, h3 { page-break-after: avoid; }
          table, figure { page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="print-actions">
        <h1>Sales Order Report - SO #${salesOrder.order_number} - ${customerName}</h1>
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
        <!-- Header -->
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
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 4px;">Sales Order Report</div>
            <div style="font-size: 32px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">SO #${salesOrder.order_number}</div>
            <div style="font-size: 13px; color: #6b7280; line-height: 1.8;">
              ${proposal?.proposal_number ? `<div><strong>Proposal:</strong> ${proposal.proposal_number}</div>` : ''}
              ${project?.project_number ? `<div><strong>Project:</strong> #${project.project_number}</div>` : ''}
              <div><strong>Date:</strong> ${fmtDate(salesOrder.created_at)}</div>
            </div>
          </div>
        </div>

        <!-- Customer -->
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

        <!-- Quick Stats -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px;">
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Original Contract</div>
            <div style="font-size: 22px; font-weight: 700; color: #111827;">${fmt(proposalTotal)}</div>
          </div>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Change Orders</div>
            <div style="font-size: 22px; font-weight: 700; color: ${totalCOAmount >= 0 ? '#059669' : '#dc2626'};">
              ${approvedCOs.length > 0 ? `${totalCOAmount >= 0 ? '+' : '-'}${fmt(totalCOAmount)}` : '$0.00'}
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 2px;">${approvedCOs.length} approved</div>
          </div>
          <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; text-align: center;">
            <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Total Tax</div>
            <div style="font-size: 22px; font-weight: 700; color: #111827;">${fmt(proposalTax + totalCOTax)}</div>
          </div>
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); border-radius: 8px; padding: 16px; text-align: center; color: white;">
            <div style="font-size: 11px; color: #93c5fd; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Current Total</div>
            <div style="font-size: 22px; font-weight: 800;">${fmt(grandTotal)}</div>
          </div>
        </div>

        <!-- Proposal Title -->
        ${proposal?.title ? `
          <div style="margin-bottom: 32px;">
            <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827;">${proposal.title}</h2>
            <div style="width: 80px; height: 3px; background: #2563eb; border-radius: 2px;"></div>
          </div>
        ` : ''}

        <!-- Original Proposal Line Items -->
        ${roomsWithItems.length > 0 ? `
          <div style="margin-bottom: 32px;">
            <h2 style="margin: 0 0 8px 0; font-size: 22px; font-weight: 700; color: #111827;">Original Contract Items</h2>
            <div style="width: 80px; height: 3px; background: #2563eb; border-radius: 2px; margin-bottom: 24px;"></div>
            ${proposalRoomsHTML}
          </div>
        ` : ''}

        <!-- Change Orders Section -->
        ${changeOrdersHTML}

        <!-- Financial Summary -->
        ${financialSummaryHTML}

        <!-- Footer -->
        <div style="margin-top: 48px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="font-size: 11px; color: #9ca3af;">
              Generated on ${fmtDate(new Date().toISOString())} | ${companyName}
            </div>
            <div style="font-size: 11px; color: #9ca3af;">
              SO #${salesOrder.order_number} | ${proposal?.proposal_number || ''} | ${approvedCOs.length} Change Order${approvedCOs.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
