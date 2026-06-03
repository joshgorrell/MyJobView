import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

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
    const { proposalId, templateId, displayOptions, coverPageImage } = await req.json();

    if (!proposalId) {
      return new Response(JSON.stringify({ error: 'Proposal ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Generating PDF for proposal:', proposalId);
    console.log('Template ID:', templateId);

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Load template settings if templateId is provided
    let templateOptions: any = {};
    if (templateId) {
      const { data: template } = await supabaseClient
        .from('proposal_report_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();

      if (template) {
        console.log('Loaded template:', template.name);
        // Map template settings to display options
        templateOptions = {
          showRoomScope: template.show_area_descriptions,
          showProposalNotes: template.show_notes,
          showDeposit: template.show_deposit_amount,
          showModifiers: template.show_discount || template.show_project_management_fee,
          showUnitPrice: template.show_unit_price,
          showLinePrice: template.show_line_item_total,
          showSKU: template.show_sku,
          showManufacturer: template.show_manufacturer,
          showColor: false, // Not explicitly in template
          showAreaTotals: template.show_area_subtotals,
          showInstalledPrice: true, // Calculated from parts + labor
          showLaborPerLine: template.show_labor_total,
          separatePartsLabor: template.show_labor_separate_from_parts,
          showSalesTax: template.show_tax_breakdown,
          showAccessories: true, // Not in template
          showPackageItems: true, // Not in template
          hideAllPrices: false,
          showDescription: template.show_line_item_description,
          showScopeOfWorkPage: template.show_scope_of_work,
          showContractPage: template.show_contract_terms,
          showDepositPage: template.show_payment_schedule,
          classDisplayMode: 'none'
        };
      }
    }

    // Default display options (all true)
    const options = {
      showRoomScope: true,
      showProposalNotes: true,
      showDeposit: true,
      showModifiers: true,
      showUnitPrice: true,
      showLinePrice: true,
      showSKU: true,
      showManufacturer: true,
      showColor: true,
      showAreaTotals: true,
      showInstalledPrice: true,
      showLaborPerLine: true,
      separatePartsLabor: false,
      showSalesTax: true,
      showAccessories: true,
      showPackageItems: true,
      hideAllPrices: false,
      showDescription: true,
      showScopeOfWorkPage: true,
      showContractPage: true,
      showDepositPage: true,
      classDisplayMode: 'none',
      ...templateOptions, // Apply template settings first
      ...displayOptions // Then apply any custom overrides
    };

    // Fetch proposal first
    const { data: proposal, error: proposalError } = await supabaseClient
      .from('proposals')
      .select('*')
      .eq('id', proposalId)
      .maybeSingle();

    if (proposalError || !proposal) {
      console.error('Proposal fetch error:', proposalError);
      console.error('Proposal data:', proposal);
      return new Response(JSON.stringify({
        error: 'Proposal not found',
        details: proposalError?.message || 'No proposal data returned',
        code: proposalError?.code
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Proposal fetched successfully:', proposal.proposal_number);

    // Fetch contact info separately
    let contact = null;
    if (proposal.contact_id) {
      const { data: contactData } = await supabaseClient
        .from('contacts')
        .select('contact_name, first_name, last_name, full_name, email, phone, street_address, city, state, zip_code')
        .eq('id', proposal.contact_id)
        .maybeSingle();
      contact = contactData;
    }

    // Fetch bill-to contact if set
    let billToContact = null;
    if (proposal.bill_to_contact_id) {
      const { data: billToData } = await supabaseClient
        .from('contacts')
        .select('contact_name, first_name, last_name, full_name, company_name, email, phone, street_address, city, state, zip_code')
        .eq('id', proposal.bill_to_contact_id)
        .maybeSingle();
      billToContact = billToData;
    }

    // Add contact to proposal object
    proposal.contacts = contact;
    proposal.bill_to_contact = billToContact;

    // Fetch rooms with their line items
    const { data: rooms, error: roomsError } = await supabaseClient
      .from('proposal_rooms')
      .select(`
        id,
        name,
        description,
        show_scope,
        sort_order
      `)
      .eq('proposal_id', proposalId)
      .order('sort_order');

    // Fetch line items with task notes and product details
    const { data: lineItems, error: itemsError } = await supabaseClient
      .from('proposal_line_items')
      .select(`
        id,
        room_id,
        class_id,
        description,
        quantity,
        unit_price,
        line_total,
        labor_hours,
        labor_rate,
        labor_total,
        task_notes,
        show_task_notes,
        sort_order,
        item_type,
        product_id,
        products (
          sku,
          manufacturer,
          item_color
        )
      `)
      .eq('proposal_id', proposalId)
      .order('sort_order');

    // Flatten product data into line items
    const flattenedLineItems = (lineItems || []).map(item => ({
      ...item,
      sku: item.products?.sku,
      manufacturer: item.products?.manufacturer,
      color: item.products?.item_color
    }));

    console.log('Rooms fetched:', rooms?.length || 0);
    console.log('Line items fetched:', flattenedLineItems?.length || 0);
    if (roomsError) console.error('Rooms error:', roomsError);
    if (itemsError) console.error('Items error:', itemsError);

    // Fetch proposal settings
    const { data: proposalSettings } = await supabaseClient
      .from('proposal_settings')
      .select('*')
      .eq('proposal_id', proposalId)
      .maybeSingle();

    // Fetch billing phases if deposit type is custom
    let billingPhases: any[] = [];
    if (proposalSettings?.deposit_type === 'custom') {
      const { data: phasesData } = await supabaseClient
        .from('proposal_billing_phases')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('phase_order');
      billingPhases = phasesData || [];
    }

    // Fetch contract if configured
    let contract = null;
    if (proposalSettings?.contract_id) {
      const { data: contractData } = await supabaseClient
        .from('contracts')
        .select('*')
        .eq('id', proposalSettings.contract_id)
        .maybeSingle();
      contract = contractData;
    }

    // Fetch organization settings (replaces deprecated company_settings)
    const { data: org } = await supabaseClient
      .from('organizations')
      .select('*')
      .limit(1)
      .maybeSingle();

    const companySettings = org ? {
      company_name: org.name,
      company_email: org.primary_contact_email,
      company_phone: org.phone,
      company_address: org.address,
      company_logo_url: org.logo_url
    } : null;

    // Fetch sales rep profile
    let salesRep = null;
    if (proposal.created_by) {
      const { data: repData } = await supabaseClient
        .from('profiles')
        .select('id, full_name, first_name, last_name, email, username')
        .eq('id', proposal.created_by)
        .maybeSingle();
      salesRep = repData;
    }

    // Fetch proposal classes
    const { data: proposalClasses } = await supabaseClient
      .from('proposal_classes')
      .select('id, name, color')
      .eq('is_active', true)
      .order('sort_order');

    console.log('Generating HTML...');
    const html = generateProposalHTML(
      proposal,
      rooms || [],
      flattenedLineItems || [],
      proposalSettings,
      companySettings,
      options,
      contract,
      proposalClasses || [],
      coverPageImage || null,
      salesRep,
      billingPhases
    );

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html',
      },
    });

  } catch (error: any) {
    console.error('PDF generation error:', error);
    console.error('Error stack:', error.stack);
    return new Response(
      JSON.stringify({
        error: error.message || 'Unknown error occurred',
        details: error.stack,
        timestamp: new Date().toISOString()
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateProposalHTML(
  proposal: any,
  rooms: any[],
  lineItems: any[],
  proposalSettings: any,
  companySettings: any,
  options: any,
  contract: any = null,
  proposalClasses: any[] = [],
  coverPageImage: string | null = null,
  salesRep: any = null,
  billingPhases: any[] = []
): string {
  const contact = proposal.contacts;
  const billToContact = proposal.bill_to_contact || null;

  const customerName = contact?.contact_name ||
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
    'Valued Customer';

  const customerAddress = contact?.street_address ?
    `${contact.street_address}<br>${contact.city}, ${contact.state} ${contact.zip_code}` :
    '';

  const billToName = billToContact
    ? (billToContact.company_name || billToContact.full_name ||
       `${billToContact.first_name || ''} ${billToContact.last_name || ''}`.trim())
    : null;

  const billToAddress = billToContact?.street_address
    ? `${billToContact.street_address}<br>${billToContact.city}, ${billToContact.state} ${billToContact.zip_code}`
    : '';

  const salesRepName = salesRep?.full_name ||
    `${salesRep?.first_name || ''} ${salesRep?.last_name || ''}`.trim() ||
    proposal.created_by_name || '';
  const salesRepEmail = salesRep?.email || '';

  // Filter line items based on display options
  let filteredLineItems = lineItems;

  console.log('Line items before filtering:', filteredLineItems.length);

  if (!options.showAccessories) {
    filteredLineItems = filteredLineItems.filter((item: any) => item.item_type !== 'accessory');
  }

  if (!options.showPackageItems) {
    filteredLineItems = filteredLineItems.filter((item: any) => item.item_type !== 'package_item');
  }

  console.log('Line items after filtering:', filteredLineItems.length);
  console.log('Items by type:', filteredLineItems.map((i: any) => i.item_type));

  // Group line items by room
  const itemsByRoom: { [roomId: string]: any[] } = {};
  filteredLineItems.forEach((item: any) => {
    const roomId = item.room_id || 'no-room';
    if (!itemsByRoom[roomId]) {
      itemsByRoom[roomId] = [];
    }
    itemsByRoom[roomId].push(item);
  });

  // Helper function to build table headers
  const buildTableHeaders = () => {
    const headers: string[] = [];
    if (options.showDescription) headers.push('<th style="text-align: left; padding: 14px 16px;">Description</th>');
    if (options.showManufacturer) headers.push('<th style="text-align: left; padding: 14px 16px; width: 120px;">Manufacturer</th>');
    if (options.showSKU) headers.push('<th style="text-align: left; padding: 14px 16px; width: 100px;">SKU</th>');
    if (options.showColor) headers.push('<th style="text-align: left; padding: 14px 16px; width: 100px;">Color</th>');
    headers.push('<th style="text-align: center; padding: 14px 16px; width: 60px;">Qty</th>');
    if (!options.hideAllPrices) {
      if (options.showUnitPrice) headers.push('<th style="text-align: right; padding: 14px 16px; width: 90px;">Unit Price</th>');
      if (options.showLaborPerLine) headers.push('<th style="text-align: right; padding: 14px 16px; width: 80px;">Labor</th>');
      if (options.showInstalledPrice) headers.push('<th style="text-align: right; padding: 14px 16px; width: 100px;">Installed</th>');
      if (options.showLinePrice) headers.push('<th style="text-align: right; padding: 14px 16px; width: 100px;">Total</th>');
    }
    return headers.join('');
  };

  // Helper function to build table row
  const buildTableRow = (item: any) => {
    const cells: string[] = [];
    if (options.showDescription) {
      cells.push(`
        <td style="padding: 14px 16px; font-size: 13px; color: #2d3748;">
          <div style="font-weight: 600; margin-bottom: 2px; color: #1a202c;">
            ${item.description}${item.is_optional ? ' <span style="color: #d97706; font-style: italic; font-size: 11px; font-weight: 500;">(Optional)</span>' : ''}
          </div>
          ${item.show_task_notes && item.task_notes ? `
            <div style="margin-top: 10px; padding: 10px; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 3px solid #f59e0b; border-radius: 4px;">
              <div style="font-size: 10px; color: #78350f; font-weight: 700; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Installation Instructions</div>
              <div style="font-size: 12px; color: #92400e; line-height: 1.6; white-space: pre-wrap;">${item.task_notes}</div>
            </div>
          ` : ''}
        </td>
      `);
    }
    if (options.showManufacturer) cells.push(`<td style="padding: 14px 16px; font-size: 12px; color: #718096;">${item.manufacturer || '-'}</td>`);
    if (options.showSKU) cells.push(`<td style="padding: 14px 16px; font-size: 12px; color: #718096;">${item.sku || '-'}</td>`);
    if (options.showColor) cells.push(`<td style="padding: 14px 16px; font-size: 12px; color: #718096;">${item.color || '-'}</td>`);
    cells.push(`<td style="text-align: center; padding: 14px 16px; font-size: 13px; color: #2d3748; font-weight: 600;">${item.quantity}</td>`);
    if (!options.hideAllPrices) {
      if (options.showUnitPrice) cells.push(`<td style="text-align: right; padding: 14px 16px; font-size: 13px; color: #2d3748;">$${item.unit_price.toFixed(2)}</td>`);
      if (options.showLaborPerLine) {
        const laborCost = (item.labor_hours || 0) * (item.labor_rate || 0);
        cells.push(`<td style="text-align: right; padding: 14px 16px; font-size: 13px; color: #2d3748;">$${laborCost.toFixed(2)}</td>`);
      }
      if (options.showInstalledPrice) {
        const laborCost = item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0));
        const installedPrice = (item.line_total || 0) + laborCost;
        cells.push(`<td style="text-align: right; padding: 14px 16px; font-size: 13px; color: #1a202c; font-weight: 700;">$${installedPrice.toFixed(2)}</td>`);
      }
      if (options.showLinePrice) cells.push(`<td style="text-align: right; padding: 14px 16px; font-size: 13px; color: #1a202c; font-weight: 700;">$${(item.line_total || 0).toFixed(2)}</td>`);
    }
    return `<tr style="border-bottom: 1px solid #e2e8f0; transition: background-color 0.15s ease;">${cells.join('')}</tr>`;
  };

  // Helper function to group items by class
  const groupItemsByClass = (items: any[]) => {
    const grouped = new Map<string, any[]>();
    items.forEach(item => {
      const classKey = item.class_id || 'no-class';
      if (!grouped.has(classKey)) {
        grouped.set(classKey, []);
      }
      grouped.get(classKey)!.push(item);
    });
    return grouped;
  };

  const getClassName = (classId: string | null): { name: string; color: string } => {
    if (!classId) return { name: 'Uncategorized', color: '#6B7280' };
    const cls = proposalClasses.find((c: any) => c.id === classId);
    return cls ? { name: cls.name, color: cls.color } : { name: 'Uncategorized', color: '#6B7280' };
  };

  // Generate rooms HTML
  const shouldShowClassesInline = options.classDisplayMode === 'inline' || options.classDisplayMode === 'both';

  // Filter rooms to only show those with items
  const roomsWithItems = rooms.filter((room: any) => {
    const roomItems = itemsByRoom[room.id] || [];
    return roomItems.length > 0;
  });

  const roomsHTML = roomsWithItems.map((room: any) => {
    const roomItems = itemsByRoom[room.id] || [];
    let roomPartsTotal = 0;
    let roomLaborTotal = 0;
    roomItems.forEach((item: any) => {
      roomPartsTotal += item.line_total || 0;
      roomLaborTotal += item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0));
    });
    const roomGrandTotal = roomPartsTotal + roomLaborTotal;

    // Generate table body based on class display mode
    let tableBody = '';
    if (shouldShowClassesInline && roomItems.length > 0) {
      // Group items by class
      const groupedItems = groupItemsByClass(roomItems);
      Array.from(groupedItems).forEach(([classId, items]) => {
        const classInfo = getClassName(classId === 'no-class' ? null : classId);
        // Add class header row
        tableBody += `
          <tr style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-top: 3px solid ${classInfo.color};">
            <td colspan="100%" style="padding: 12px 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 14px; height: 14px; border-radius: 3px; background-color: ${classInfo.color}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                <span style="font-weight: 700; color: #1a202c; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${classInfo.name}</span>
              </div>
            </td>
          </tr>
        `;
        // Add items under this class
        items.forEach((item: any) => {
          tableBody += buildTableRow(item);
        });
      });
    } else {
      // Regular flat list
      tableBody = roomItems.map(buildTableRow).join('');
    }

    return `
      <div style="margin-bottom: 48px; page-break-inside: avoid;">
        <div style="margin-bottom: 20px;">
          <h3 style="margin: 0; color: #111827;">${room.name}</h3>
          <div class="accent-bar" style="width: 60px;"></div>
        </div>

        ${options.showRoomScope && room.show_scope && room.description ? `
          <div class="info-box blue" style="margin-bottom: 20px;">
            <div style="font-size: 11px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px;">Area Scope</div>
            <p style="margin: 0; font-size: 14px; line-height: 1.75; white-space: pre-wrap;">${room.description}</p>
          </div>
        ` : ''}

        <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb;">
          <thead>
            <tr>
              ${buildTableHeaders()}
            </tr>
          </thead>
          <tbody>
            ${tableBody}
          </tbody>
        </table>

        ${options.showAreaTotals && !options.hideAllPrices ? `
          <div style="margin-top: 20px; padding: 20px; background-color: #f3f4f6; border-radius: 6px; border-left: 4px solid #2563eb;">
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 32px;">
              ${options.separatePartsLabor ? `
                <div style="color: #6b7280; font-size: 14px; font-weight: 600;">Parts: <span style="font-size: 16px; color: #111827; font-weight: 700;">$${roomPartsTotal.toFixed(2)}</span></div>
                <div style="color: #6b7280; font-size: 14px; font-weight: 600;">Labor: <span style="font-size: 16px; color: #111827; font-weight: 700;">$${roomLaborTotal.toFixed(2)}</span></div>
              ` : ''}
              <div style="font-size: 15px; font-weight: 600; color: #6b7280;">Area Total: <span style="font-size: 20px; font-weight: 700; color: #2563eb;">$${roomGrandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // Generate HTML for unassigned items (no room_id)
  const unassignedPdfItems = itemsByRoom['no-room'] || [];
  let unassignedHTML = '';
  if (unassignedPdfItems.length > 0) {
    const hasRooms = roomsWithItems.length > 0;
    let unassignedPartsTotal = 0;
    let unassignedLaborTotal = 0;
    unassignedPdfItems.forEach((item: any) => {
      unassignedPartsTotal += item.line_total || 0;
      unassignedLaborTotal += item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0));
    });
    const unassignedGrandTotal = unassignedPartsTotal + unassignedLaborTotal;

    let unassignedTableBody = '';
    if (shouldShowClassesInline && unassignedPdfItems.length > 0) {
      const groupedItems = groupItemsByClass(unassignedPdfItems);
      Array.from(groupedItems).forEach(([classId, items]) => {
        const classInfo = getClassName(classId === 'no-class' ? null : classId);
        unassignedTableBody += `
          <tr style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-top: 3px solid ${classInfo.color};">
            <td colspan="100%" style="padding: 12px 16px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 14px; height: 14px; border-radius: 3px; background-color: ${classInfo.color}; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>
                <span style="font-weight: 700; color: #1a202c; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">${classInfo.name}</span>
              </div>
            </td>
          </tr>
        `;
        items.forEach((item: any) => {
          unassignedTableBody += buildTableRow(item);
        });
      });
    } else {
      unassignedTableBody = unassignedPdfItems.map(buildTableRow).join('');
    }

    unassignedHTML = `
      <div style="margin-bottom: 48px; page-break-inside: avoid;">
        ${hasRooms ? `
          <div style="margin-bottom: 20px;">
            <h3 style="margin: 0; color: #92400e;">Unassigned Items</h3>
            <div class="accent-bar" style="width: 60px; background: #d97706;"></div>
          </div>
        ` : ''}

        <table style="width: 100%; border-collapse: separate; border-spacing: 0; margin-bottom: 20px; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.06); border-radius: 6px; overflow: hidden; border: 1px solid #e5e7eb;">
          <thead>
            <tr>
              ${buildTableHeaders()}
            </tr>
          </thead>
          <tbody>
            ${unassignedTableBody}
          </tbody>
        </table>

        ${options.showAreaTotals && !options.hideAllPrices && hasRooms ? `
          <div style="margin-top: 20px; padding: 20px; background-color: #f3f4f6; border-radius: 6px; border-left: 4px solid #d97706;">
            <div style="display: flex; justify-content: flex-end; align-items: center; gap: 32px;">
              ${options.separatePartsLabor ? `
                <div style="color: #6b7280; font-size: 14px; font-weight: 600;">Parts: <span style="font-size: 16px; color: #111827; font-weight: 700;">$${unassignedPartsTotal.toFixed(2)}</span></div>
                <div style="color: #6b7280; font-size: 14px; font-weight: 600;">Labor: <span style="font-size: 16px; color: #111827; font-weight: 700;">$${unassignedLaborTotal.toFixed(2)}</span></div>
              ` : ''}
              <div style="font-size: 15px; font-weight: 600; color: #6b7280;">Subtotal: <span style="font-size: 20px; font-weight: 700; color: #d97706;">$${unassignedGrandTotal.toFixed(2)}</span></div>
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Calculate class totals for summary page
  const calculateClassTotals = () => {
    const classTotals = new Map<string, number>();
    lineItems.forEach((item: any) => {
      const classKey = item.class_id || 'no-class';
      const itemTotal = (item.line_total || 0) + (item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0)));
      classTotals.set(classKey, (classTotals.get(classKey) || 0) + itemTotal);
    });
    return classTotals;
  };

  const classTotals = calculateClassTotals();

  // Calculate totals with modifiers
  const subtotal = proposal.subtotal || 0;
  let runningTotal = subtotal;
  const modifiers: { label: string; percent: number; amount: number }[] = [];

  if (options.showModifiers) {
    // Check both proposal and proposalSettings for modifiers (proposal takes precedence)
    const discountPercent = proposal.discount_percent || proposalSettings?.discount_percent || 0;
    const projectMgmtPercent = proposal.project_management_percent || proposalSettings?.project_management_percent || 0;
    const projectDesignPercent = proposal.project_design_percent || proposalSettings?.project_design_percent || 0;
    const systemDesignPercent = proposalSettings?.system_design_percent || 0;
    const creditCardFeePercent = proposalSettings?.credit_card_fee_percent || 0;
    const miscPartsPercent = proposalSettings?.misc_parts_percent || 0;
    const customMod1Label = proposal.custom_modifier_1_label || proposalSettings?.custom_modifier_1_label;
    const customMod1Percent = proposal.custom_modifier_1_percent || proposalSettings?.custom_modifier_1_percent || 0;
    const customMod2Label = proposal.custom_modifier_2_label || proposalSettings?.custom_modifier_2_label;
    const customMod2Percent = proposal.custom_modifier_2_percent || proposalSettings?.custom_modifier_2_percent || 0;

    // Add modifiers if they exist
    if (discountPercent > 0) {
      const amount = subtotal * (discountPercent / 100);
      modifiers.push({ label: 'Discount', percent: discountPercent, amount: -amount });
      runningTotal -= amount;
    }
    if (projectMgmtPercent > 0) {
      const amount = subtotal * (projectMgmtPercent / 100);
      modifiers.push({ label: 'Project Management', percent: projectMgmtPercent, amount });
      runningTotal += amount;
    }
    if (projectDesignPercent > 0) {
      const amount = subtotal * (projectDesignPercent / 100);
      modifiers.push({ label: 'Project Design', percent: projectDesignPercent, amount });
      runningTotal += amount;
    }
    if (systemDesignPercent > 0) {
      const amount = subtotal * (systemDesignPercent / 100);
      modifiers.push({ label: 'System Design', percent: systemDesignPercent, amount });
      runningTotal += amount;
    }
    if (creditCardFeePercent > 0) {
      const amount = subtotal * (creditCardFeePercent / 100);
      modifiers.push({ label: 'Credit Card Fee', percent: creditCardFeePercent, amount });
      runningTotal += amount;
    }
    if (miscPartsPercent > 0) {
      const amount = subtotal * (miscPartsPercent / 100);
      modifiers.push({ label: 'Misc Parts', percent: miscPartsPercent, amount });
      runningTotal += amount;
    }
    if (customMod1Percent > 0 && customMod1Label) {
      const amount = subtotal * (customMod1Percent / 100);
      modifiers.push({ label: customMod1Label, percent: customMod1Percent, amount });
      runningTotal += amount;
    }
    if (customMod2Percent > 0 && customMod2Label) {
      const amount = subtotal * (customMod2Percent / 100);
      modifiers.push({ label: customMod2Label, percent: customMod2Percent, amount });
      runningTotal += amount;
    }
  }

  const taxAmount = proposal.tax_amount || 0;
  const taxPercent = proposal.tax_rate || 0;
  const finalTotal = runningTotal + taxAmount;

  // Generate deposit information
  let depositHTML = '';
  const showDeposit = options.showDeposit;

  if (showDeposit && proposalSettings && proposalSettings.deposit_type) {
    let depositAmount = 0;
    let depositLabel = 'Deposit Required';

    if (proposalSettings.deposit_type === 'percentage') {
      depositAmount = finalTotal * (proposalSettings.deposit_percent / 100);
      depositLabel = `Deposit Required (${proposalSettings.deposit_percent}%)`;
    } else if (proposalSettings.deposit_type === 'custom') {
      depositAmount = proposalSettings.deposit_amount || 0;
      depositLabel = 'Deposit Required';
    } else if (proposalSettings.deposit_type === 'parts_total') {
      // Calculate parts total (items without labor)
      const partsTotal = filteredLineItems.reduce((sum, item) => sum + ((item.line_total || 0) - (item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0)))), 0);
      depositAmount = partsTotal;
      depositLabel = 'Deposit Required (Parts Total)';
    }

    if (depositAmount > 0) {
      depositHTML = `
        <div style="margin-top: 28px; padding: 24px; background-color: #eff6ff; border: 2px solid #2563eb; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 11px; font-weight: 600; color: #1e40af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">Deposit Required</div>
              <div style="font-size: 14px; color: #1e40af; font-weight: 500;">${depositLabel}</div>
            </div>
            <span style="font-size: 32px; font-weight: 700; color: #2563eb;">$${depositAmount.toFixed(2)}</span>
          </div>
        </div>
      `;
    }
  }

  const companyName = companySettings?.company_name || 'Your Company';
  const companyAddress = companySettings?.company_address || '';
  const companyPhone = companySettings?.company_phone || '';
  const companyEmail = companySettings?.company_email || '';
  const companyLogoUrl = companySettings?.company_logo_url || '';

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Proposal ${proposal.proposal_number}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        @page {
          margin: 0.5in;
          size: letter;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: #1f2937;
          line-height: 1.65;
          font-size: 14px;
          background: white;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
          padding: 20px 0 0 0;
        }

        .page-break {
          page-break-before: always;
          break-before: page;
        }

        /* Print action buttons - visible only on screen */
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

        .print-actions .buttons {
          display: flex;
          gap: 12px;
        }

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

        .btn-print {
          background: white;
          color: #1e3a8a;
        }

        .btn-print:hover {
          background: #f0f4ff;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .btn-save {
          background: #10b981;
          color: white;
        }

        .btn-save:hover {
          background: #059669;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        /* Print-specific optimizations */
        @media print {
          body {
            padding: 0;
          }

          .print-actions {
            display: none !important;
          }

          .page-break {
            page-break-before: always;
            break-before: page;
          }

          /* Optimize spacing for print */
          .container {
            margin: 0;
            padding: 0;
          }

          /* Reduce excessive margins */
          h1, h2, h3, h4, h5, h6 {
            page-break-after: avoid;
          }

          table, figure, img {
            page-break-inside: avoid;
          }

          /* Ensure backgrounds and colors print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Cover page print handling */
          .cover-page {
            min-height: 100vh !important;
            margin: -0.5in;
            padding: 0;
            width: calc(100% + 1in);
          }

          /* Remove shadows for cleaner print */
          .card {
            box-shadow: none !important;
            border: 1px solid #e5e7eb;
          }

          table {
            box-shadow: none !important;
          }

          /* Optimize table headers for print */
          thead {
            display: table-row-group;
          }
        }

        .container {
          max-width: 100%;
          margin: 0 auto;
        }

        /* Modern accent colors */
        .accent-blue {
          color: #2563eb;
        }

        .accent-bg-blue {
          background-color: #2563eb;
        }

        /* Professional card styling */
        .card {
          background: white;
          border-radius: 8px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }

        .card-header {
          padding: 20px 24px;
          background-color: #2563eb;
          color: white;
          font-weight: 600;
          font-size: 17px;
          letter-spacing: 0.2px;
        }

        .card-body {
          padding: 24px;
        }

        /* Modern table styling */
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          margin: 20px 0;
        }

        table thead {
          background-color: #1e40af;
        }

        table thead th {
          color: white;
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 16px 18px;
          text-align: left;
        }

        table thead th:first-child {
          border-top-left-radius: 6px;
        }

        table thead th:last-child {
          border-top-right-radius: 6px;
        }

        table tbody tr {
          border-bottom: 1px solid #e5e7eb;
        }

        table tbody tr:last-child {
          border-bottom: none;
        }

        table tbody td {
          padding: 16px 18px;
          font-size: 13px;
          color: #374151;
        }

        /* Enhanced typography */
        h1 {
          font-size: 36px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.025em;
          margin-bottom: 8px;
        }

        h2 {
          font-size: 24px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.015em;
          margin-bottom: 16px;
        }

        h3 {
          font-size: 18px;
          font-weight: 600;
          color: #111827;
          margin-bottom: 12px;
        }

        /* Accent elements */
        .accent-bar {
          height: 3px;
          background-color: #2563eb;
          border-radius: 2px;
          margin: 8px 0 20px 0;
        }

        .badge {
          display: inline-block;
          padding: 6px 14px;
          background-color: #2563eb;
          color: white;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
        }

        /* Info boxes */
        .info-box {
          padding: 24px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid;
        }

        .info-box.blue {
          background-color: #eff6ff;
          border-color: #2563eb;
          color: #1e40af;
        }

        .info-box.green {
          background-color: #f0fdf4;
          border-color: #10b981;
          color: #047857;
        }

        .info-box.amber {
          background-color: #fefce8;
          border-color: #eab308;
          color: #854d0e;
        }

        /* Price displays */
        .price-display {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
        }

        .price-large {
          font-size: 32px;
          font-weight: 700;
          color: #2563eb;
        }

        /* Professional header */
        .header-section {
          padding: 40px 0 32px 0;
          border-bottom: 3px solid #2563eb;
          margin-bottom: 32px;
        }

        /* Totals section */
        .totals-section {
          background-color: #f9fafb;
          border-radius: 8px;
          padding: 32px;
          margin: 32px 0;
          border: 2px solid #e5e7eb;
        }

        .total-row {
          display: flex;
          justify-content: space-between;
          padding: 14px 0;
          border-bottom: 1px solid #d1d5db;
        }

        .total-row:last-child {
          border-bottom: none;
          padding-top: 20px;
          border-top: 3px solid #2563eb;
          margin-top: 16px;
        }

        .total-label {
          font-size: 15px;
          color: #6b7280;
          font-weight: 500;
        }

        .total-amount {
          font-size: 16px;
          font-weight: 700;
          color: #111827;
        }

        .grand-total-label {
          font-size: 18px;
          font-weight: 700;
          color: #111827;
        }

        .grand-total-amount {
          font-size: 28px;
          font-weight: 700;
          color: #2563eb;
        }
      </style>
    </head>
    <body>
      <!-- Print/Save Action Buttons -->
      <div class="print-actions">
        <h1>Proposal ${proposal.proposal_number} - ${customerName}</h1>
        <div class="buttons">
          <button class="btn btn-print" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 6 2 18 2 18 9"></polyline>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
              <rect x="6" y="14" width="12" height="8"></rect>
            </svg>
            Print PDF
          </button>
          <button class="btn btn-save" onclick="window.print()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            Save as PDF
          </button>
        </div>
      </div>

      ${coverPageImage ? `
      <!-- Cover Page -->
      <div class="cover-page" style="position: relative; width: 100%; min-height: 100vh; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; break-after: page;">
        <img src="${coverPageImage}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;" />
        <div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.15) 35%, rgba(0,0,0,0.15) 55%, rgba(0,0,0,0.75) 100%);"></div>

        <!-- Top: Company Logo & Info -->
        <div style="position: relative; z-index: 1; padding: 48px 48px 0 48px;">
          ${companyLogoUrl ? `
            <div style="background: rgba(255,255,255,0.95); display: inline-block; padding: 12px 20px; border-radius: 8px; margin-bottom: 16px;">
              <img src="${companyLogoUrl}" alt="${companyName}" style="max-height: 52px; max-width: 200px; object-fit: contain; display: block;" />
            </div>
          ` : `
            <div style="font-size: 24px; font-weight: 700; color: white; margin-bottom: 8px; text-shadow: 0 2px 8px rgba(0,0,0,0.4);">${companyName}</div>
          `}
          <div style="font-size: 13px; color: rgba(255,255,255,0.85); line-height: 1.7; text-shadow: 0 1px 4px rgba(0,0,0,0.5);">
            ${companyAddress ? `<div>${companyAddress}</div>` : ''}
            ${companyPhone ? `<div>${companyPhone}</div>` : ''}
            ${companyEmail ? `<div>${companyEmail}</div>` : ''}
          </div>
        </div>

        <!-- Center: Proposal Title -->
        <div style="position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 0 48px;">
          <div style="text-align: center;">
            <div style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 3px; margin-bottom: 16px; text-shadow: 0 1px 4px rgba(0,0,0,0.5);">Proposal</div>
            <div style="font-size: 48px; font-weight: 800; color: white; letter-spacing: -0.03em; line-height: 1.1; text-shadow: 0 2px 12px rgba(0,0,0,0.4);">${proposal.proposal_number}</div>
            ${proposal.title ? `
              <div style="width: 60px; height: 3px; background: #2563eb; border-radius: 2px; margin: 20px auto;"></div>
              <div style="font-size: 22px; font-weight: 400; color: rgba(255,255,255,0.9); text-shadow: 0 1px 6px rgba(0,0,0,0.4);">${proposal.title}</div>
            ` : ''}
          </div>
        </div>

        <!-- Bottom: Customer & Sales Rep Info -->
        <div style="position: relative; z-index: 1; padding: 0 48px 48px 48px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 32px;">
            <!-- Customer Info -->
            <div style="flex: 1;">
              <div style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Prepared For</div>
              <div style="font-size: 20px; font-weight: 700; color: white; margin-bottom: 6px; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">${customerName}</div>
              <div style="font-size: 13px; color: rgba(255,255,255,0.75); line-height: 1.6;">
                ${contact?.street_address ? `<div>${contact.street_address}</div>` : ''}
                ${contact?.city ? `<div>${contact.city}, ${contact.state || ''} ${contact.zip_code || ''}</div>` : ''}
                ${contact?.email ? `<div>${contact.email}</div>` : ''}
                ${contact?.phone ? `<div>${contact.phone}</div>` : ''}
              </div>
            </div>
            <!-- Sales Rep & Date -->
            <div style="text-align: right;">
              ${salesRepName ? `
                <div style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 8px;">Your Representative</div>
                <div style="font-size: 16px; font-weight: 600; color: white; margin-bottom: 4px; text-shadow: 0 1px 4px rgba(0,0,0,0.4);">${salesRepName}</div>
                ${salesRepEmail ? `<div style="font-size: 13px; color: rgba(255,255,255,0.75); margin-bottom: 8px;">${salesRepEmail}</div>` : ''}
              ` : ''}
              <div style="font-size: 13px; color: rgba(255,255,255,0.6);">${new Date(proposal.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="container" style="padding: 32px;">
        <!-- Header -->
        <div class="header-section" style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div style="flex: 1;">
            ${companyLogoUrl ? `
              <img src="${companyLogoUrl}" alt="${companyName}" style="max-height: 70px; max-width: 220px; object-fit: contain; margin-bottom: 20px;" />
            ` : ''}
            <h1 style="margin: 0 0 4px 0;">${companyName}</h1>
            <div class="accent-bar" style="width: 80px;"></div>
            <div style="font-size: 13px; color: #6b7280; line-height: 1.9;">
              ${companyAddress ? `<div style="margin-bottom: 6px;">${companyAddress}</div>` : ''}
              ${companyPhone ? `<div style="margin-bottom: 6px;"><strong style="font-weight: 600;">Phone:</strong> ${companyPhone}</div>` : ''}
              ${companyEmail ? `<div><strong style="font-weight: 600;">Email:</strong> ${companyEmail}</div>` : ''}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 1.2px; margin-bottom: 8px;">Proposal</div>
            <div style="font-size: 38px; font-weight: 700; color: #2563eb; margin-bottom: 8px;">${proposal.proposal_number}</div>
            <div style="font-size: 13px; color: #718096; line-height: 1.6;">
              <div style="margin-bottom: 4px;"><strong style="color: #4a5568;">Date:</strong> ${new Date(proposal.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
              ${proposal.valid_until ? `<div><strong style="color: #4a5568;">Valid Until:</strong> ${new Date(proposal.valid_until).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>` : ''}
            </div>
          </div>
        </div>

        <!-- Customer Info -->
        ${billToName ? `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px;">
          <div class="info-box blue" style="margin-bottom: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <span class="badge">Bill To</span>
            </div>
            <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 10px;">${billToName}</div>
            <div style="font-size: 13px; line-height: 1.8; color: #374151;">
              ${billToAddress ? `<div style="margin-bottom: 6px;">${billToAddress}</div>` : ''}
              ${billToContact?.email ? `<div style="margin-bottom: 6px;"><strong style="font-weight: 600; color: #111827;">Email:</strong> ${billToContact.email}</div>` : ''}
              ${billToContact?.phone ? `<div><strong style="font-weight: 600; color: #111827;">Phone:</strong> ${billToContact.phone}</div>` : ''}
            </div>
          </div>
          <div class="info-box" style="margin-bottom: 0; background: #f8fafc; border: 1px solid #e2e8f0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              <span class="badge" style="background-color: #64748b;">Job Site Owner</span>
            </div>
            <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 10px;">${customerName}</div>
            <div style="font-size: 13px; line-height: 1.8; color: #374151;">
              ${customerAddress ? `<div style="margin-bottom: 6px;">${customerAddress}</div>` : ''}
              ${contact?.email ? `<div style="margin-bottom: 6px;"><strong style="font-weight: 600; color: #111827;">Email:</strong> ${contact.email}</div>` : ''}
              ${contact?.phone ? `<div><strong style="font-weight: 600; color: #111827;">Phone:</strong> ${contact.phone}</div>` : ''}
            </div>
          </div>
        </div>
        ` : `
        <div class="info-box blue" style="margin-bottom: 32px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
            <span class="badge">Prepared For</span>
          </div>
          <div style="font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 16px;">${customerName}</div>
          <div style="font-size: 14px; line-height: 2; color: #374151;">
            ${customerAddress ? `<div style="margin-bottom: 8px;">${customerAddress}</div>` : ''}
            ${contact?.email ? `<div style="margin-bottom: 8px;"><strong style="font-weight: 600; color: #111827;">Email:</strong> ${contact.email}</div>` : ''}
            ${contact?.phone ? `<div><strong style="font-weight: 600; color: #111827;">Phone:</strong> ${contact.phone}</div>` : ''}
          </div>
        </div>
        `}

        ${proposal.title ? `
          <div style="margin-bottom: 32px;">
            <h2 style="margin: 0; color: #111827;">${proposal.title}</h2>
            <div class="accent-bar" style="width: 100px;"></div>
          </div>
        ` : ''}

        ${proposalSettings?.scope_of_work && !options.showScopeOfWorkPage ? `
          <div class="info-box green" style="margin-bottom: 32px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span class="badge" style="background-color: #10b981;">Project Overview</span>
            </div>
            <p style="margin: 0; font-size: 14px; line-height: 1.8; white-space: pre-wrap;">${proposalSettings.scope_of_work}</p>
          </div>
        ` : ''}

        <!-- Rooms / Areas -->
        <div style="margin-bottom: 40px;">
          <h2 style="margin: 0 0 24px 0;">Proposal Details</h2>
          <div class="accent-bar" style="width: 100px; margin-bottom: 24px;"></div>
          ${roomsHTML}
          ${unassignedHTML}
        </div>

        <!-- Investment Summary - Separate Page -->
        ${!options.hideAllPrices ? `
          <div class="page-break" style="margin-top: 40px;">
            <h2 style="font-size: 28px; font-weight: 700; color: #1e3a8a; margin: 0 0 32px 0; text-align: center;">Investment Summary</h2>
            <div class="accent-bar" style="width: 120px; margin: 0 auto 40px auto;"></div>

            <div class="totals-section" style="max-width: 600px; margin: 0 auto;">
              <div class="total-row">
                <span class="total-label">Subtotal</span>
                <span class="total-amount">$${subtotal.toFixed(2)}</span>
              </div>

              ${modifiers.length > 0 ? modifiers.map(mod => `
                <div class="total-row">
                  <span class="total-label">${mod.label} (${mod.percent > 0 ? '+' : ''}${mod.percent}%)</span>
                  <span class="total-amount" style="color: ${mod.amount < 0 ? '#dc2626' : '#111827'};">${mod.amount < 0 ? '-' : ''}$${Math.abs(mod.amount).toFixed(2)}</span>
                </div>
              `).join('') : ''}

              ${options.showSalesTax && taxAmount > 0 ? `
                <div class="total-row">
                  <span class="total-label">Sales Tax (${taxPercent.toFixed(2)}%)</span>
                  <span class="total-amount">$${taxAmount.toFixed(2)}</span>
                </div>
              ` : ''}

              <div class="total-row">
                <span class="grand-total-label">Total Investment</span>
                <span class="grand-total-amount">$${finalTotal.toFixed(2)}</span>
              </div>

              ${depositHTML}
            </div>
          </div>
        ` : ''}

        ${options.showProposalNotes && proposal.customer_notes ? `
          <div class="info-box amber" style="margin-top: 32px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
              <span class="badge" style="background-color: #eab308;">Additional Notes</span>
            </div>
            <p style="margin: 0; font-size: 14px; line-height: 1.8; white-space: pre-wrap;">${proposal.customer_notes}</p>
          </div>
        ` : ''}

        ${options.showContractPage && contract ? `
          <div class="page-break" style="margin-top: 40px;">
            <h2 style="font-size: 24px; font-weight: 700; color: #1e3a8a; margin: 0 0 24px 0;">Terms & Conditions</h2>
            <div style="font-size: 14px; line-height: 1.8; color: #374151; white-space: pre-wrap;">${contract.content}</div>
          </div>
        ` : ''}

        ${options.showScopeOfWorkPage && proposalSettings?.scope_of_work ? `
          <div class="page-break" style="margin-top: 40px;">
            <h2 style="font-size: 24px; font-weight: 700; color: #1e3a8a; margin: 0 0 24px 0;">Detailed Scope of Work</h2>
            <div style="font-size: 15px; line-height: 1.8; color: #374151; white-space: pre-wrap;">${proposalSettings.scope_of_work}</div>
          </div>
        ` : ''}

        ${options.showDepositPage && showDeposit && proposalSettings && proposalSettings.deposit_type ? `
          <div class="page-break" style="margin-top: 40px;">
            <h2 style="font-size: 24px; font-weight: 700; color: #1e3a8a; margin: 0 0 24px 0;">Payment Schedule</h2>
            ${(() => {
              let depositAmount = 0;
              let depositDescription = '';
              let balanceAmount = 0;

              if (proposalSettings.deposit_type === 'percentage') {
                depositAmount = finalTotal * (proposalSettings.deposit_percent / 100);
                balanceAmount = finalTotal - depositAmount;
                depositDescription = `${proposalSettings.deposit_percent}% of total project cost`;
              } else if (proposalSettings.deposit_type === 'custom') {
                depositAmount = 0;
                balanceAmount = 0;
                depositDescription = 'Custom payment schedule';
              } else if (proposalSettings.deposit_type === 'parts_total') {
                const partsTotal = filteredLineItems.reduce((sum, item) => sum + ((item.line_total || 0) - (item.labor_total || ((item.labor_hours || 0) * (item.labor_rate || 0)))), 0);
                depositAmount = partsTotal;
                balanceAmount = finalTotal - depositAmount;
                depositDescription = 'Full parts and materials cost';
              }

              // Get payment terms configuration
              const progressInvoiceTerms = proposalSettings.progress_invoice_terms || 'monthly';
              const balancePaymentTerms = proposalSettings.balance_payment_terms || 'upon_completion';

              // Format progress invoice terms for display
              const formatProgressTerms = (terms) => {
                const termsMap = {
                  'monthly': 'Monthly',
                  'milestone_based': 'Milestone-based',
                  'weekly': 'Weekly',
                  'bi_weekly': 'Bi-weekly'
                };
                return termsMap[terms] || 'Monthly';
              };

              // Format balance payment terms for display
              const formatBalanceTerms = (terms) => {
                const termsMap = {
                  'upon_completion': 'Upon project completion',
                  'net_10': 'Net 10 days after completion',
                  'net_30': 'Net 30 days after completion',
                  'due_on_receipt': 'Due upon receipt of final invoice'
                };
                return termsMap[terms] || 'Upon project completion';
              };

              // Custom multi-phase billing schedule
              if (proposalSettings.deposit_type === 'custom' && billingPhases.length > 0) {
                const phaseColors = [
                  { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af', dark: '#1e3a8a', divider: '#93c5fd' },
                  { bg: '#fef3c7', border: '#f59e0b', text: '#92400e', dark: '#78350f', divider: '#fcd34d' },
                  { bg: '#dcfce7', border: '#22c55e', text: '#166534', dark: '#14532d', divider: '#86efac' },
                  { bg: '#fce7f3', border: '#ec4899', text: '#9d174d', dark: '#831843', divider: '#f9a8d4' },
                  { bg: '#e0f2fe', border: '#0ea5e9', text: '#0c4a6e', dark: '#082f49', divider: '#7dd3fc' },
                  { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8', dark: '#581c87', divider: '#d8b4fe' },
                ];

                const sortedPhases = [...billingPhases].sort((a, b) => a.phase_order - b.phase_order);

                const phasesHtml = sortedPhases.map((phase, idx) => {
                  const color = phaseColors[idx % phaseColors.length];
                  let amountDisplay = '';
                  let amountValue = 0;
                  if (phase.amount_type === 'percentage') {
                    amountValue = finalTotal * (phase.amount / 100);
                    amountDisplay = `${phase.amount}% (${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amountValue)})`;
                  } else {
                    amountValue = phase.amount;
                    amountDisplay = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amountValue);
                  }
                  return `
                    <div style="padding: 24px; background-color: ${color.bg}; border: 2px solid ${color.border}; border-radius: 12px; margin-bottom: 16px;">
                      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <div>
                          <div style="font-size: 14px; color: ${color.text}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Payment ${idx + 1} — ${phase.title || `Phase ${idx + 1}`}</div>
                          ${phase.notes ? `<div style="font-size: 13px; color: ${color.text};">${phase.notes}</div>` : ''}
                        </div>
                        <span style="font-size: 32px; font-weight: 700; color: ${color.dark};">${amountDisplay}</span>
                      </div>
                    </div>
                  `;
                }).join('');

                return `
                  ${phasesHtml}
                  <!-- Total -->
                  <div style="margin-top: 20px; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <span style="font-size: 18px; font-weight: 700; color: #1e3a8a;">Total Project Investment:</span>
                      <span style="font-size: 24px; font-weight: 700; color: #1e3a8a;">$${finalTotal.toFixed(2)}</span>
                    </div>
                  </div>
                `;
              }

              return `
                <!-- Deposit Payment -->
                <div style="padding: 24px; background-color: #dbeafe; border: 2px solid #3b82f6; border-radius: 12px; margin-bottom: 16px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div>
                      <div style="font-size: 14px; color: #1e40af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Payment 1 - Deposit</div>
                      <div style="font-size: 13px; color: #1e40af;">${depositDescription}</div>
                    </div>
                    <span style="font-size: 32px; font-weight: 700; color: #1e3a8a;">$${depositAmount.toFixed(2)}</span>
                  </div>
                  <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #93c5fd; font-size: 14px; color: #1e40af; line-height: 1.6;">
                    <strong>Due:</strong> Upon proposal acceptance
                  </p>
                </div>

                ${balanceAmount > 0 ? `
                  <!-- Progress Billing Section -->
                  <div style="padding: 24px; background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 12px; margin-bottom: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                      <div>
                        <div style="font-size: 14px; color: #92400e; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Payment 2 - Progress Invoices</div>
                        <div style="font-size: 13px; color: #92400e;">Remaining project balance</div>
                      </div>
                      <span style="font-size: 32px; font-weight: 700; color: #92400e;">$${balanceAmount.toFixed(2)}</span>
                    </div>
                    <p style="margin: 12px 0 0 0; padding-top: 12px; border-top: 1px solid #fcd34d; font-size: 14px; color: #92400e; line-height: 1.6;">
                      <strong>Billing Schedule:</strong> ${formatProgressTerms(progressInvoiceTerms)} as work progresses<br>
                      <strong>Payment Terms:</strong> ${formatBalanceTerms(balancePaymentTerms)}
                    </p>
                  </div>
                ` : ''}

                <!-- Total -->
                <div style="margin-top: 20px; padding: 20px; background-color: #f8fafc; border-radius: 8px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 18px; font-weight: 700; color: #1e3a8a;">Total Project Investment:</span>
                    <span style="font-size: 24px; font-weight: 700; color: #1e3a8a;">$${finalTotal.toFixed(2)}</span>
                  </div>
                </div>
              `;
            })()}
            </div>
            
            ${proposalSettings.acceptance_methods && proposalSettings.acceptance_methods.length > 0 ? `
              <div style="margin-top: 24px; padding: 20px; background-color: #f0fdf4; border: 2px solid #10b981; border-radius: 12px;">
                <h3 style="margin: 0 0 12px 0; font-size: 18px; color: #047857; font-weight: 600;">Acceptance Methods</h3>
                <ul style="margin: 0; padding-left: 20px; color: #065f46; font-size: 15px; line-height: 2;">
                  ${proposalSettings.acceptance_methods.map((method: string) => {
                    const methodLabels: { [key: string]: string } = {
                      'signature': 'Written Signature',
                      'digital_signature': 'Digital Signature',
                      'purchase_order': 'Purchase Order',
                      'verbal_agreement': 'Verbal Agreement'
                    };
                    return `<li>${methodLabels[method] || method}</li>`;
                  }).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${(options.classDisplayMode === 'summary' || options.classDisplayMode === 'both') && classTotals.size > 0 ? `
          <div class="page-break" style="margin-top: 40px;">
            <h2 style="font-size: 24px; font-weight: 700; color: #1e3a8a; margin: 0 0 24px 0;">Class Summary</h2>
            <p style="font-size: 15px; color: #6b7280; margin: 0 0 24px 0;">Summary of project costs organized by class</p>

            <table style="width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;">
              <thead style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white;">
                <tr>
                  <th style="text-align: left; padding: 16px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Class</th>
                  <th style="text-align: right; padding: 16px; font-size: 14px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${Array.from(classTotals).map(([classId, total]) => {
                  const classInfo = getClassName(classId === 'no-class' ? null : classId);
                  return `
                    <tr style="border-bottom: 1px solid #e5e7eb;">
                      <td style="padding: 16px;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                          <div style="width: 16px; height: 16px; border-radius: 4px; background-color: ${classInfo.color}; flex-shrink: 0;"></div>
                          <span style="font-size: 16px; font-weight: 600; color: #374151;">${classInfo.name}</span>
                        </div>
                      </td>
                      <td style="text-align: right; padding: 16px; font-size: 18px; font-weight: 700; color: #1f2937;">
                        $${total.toFixed(2)}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
              <tfoot style="background-color: #f3f4f6; border-top: 2px solid #3b82f6;">
                <tr>
                  <td style="padding: 16px; font-size: 18px; font-weight: 700; color: #1e3a8a;">
                    Total
                  </td>
                  <td style="text-align: right; padding: 16px; font-size: 20px; font-weight: 700; color: #1e3a8a;">
                    $${Array.from(classTotals.values()).reduce((sum, val) => sum + val, 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ` : ''}
      </div>
    </body>
    </html>
  `;
}
