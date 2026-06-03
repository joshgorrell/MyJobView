import { supabase } from './supabase';

export interface ValidationSection {
  name: 'details' | 'scope' | 'contract' | 'billing' | 'tax' | 'fees';
  label: string;
  isValid: boolean;
  isReviewed: boolean;
  issues: string[];
  summary: string;
}

export interface ProposalReadiness {
  isReady: boolean;
  sections: ValidationSection[];
  overallProgress: number;
}

export async function checkProposalReadiness(proposalId: string): Promise<ProposalReadiness> {
  try {
    const { data: proposal, error: proposalError } = await supabase
      .from('proposals')
      .select(`
        *,
        contacts:contacts!proposals_contact_id_fkey (*),
        proposal_settings (*),
        proposal_line_items (count)
      `)
      .eq('id', proposalId)
      .single();

    if (proposalError) throw proposalError;

    const settings = proposal.proposal_settings;
    const lineItemCount = proposal.proposal_line_items?.[0]?.count || 0;

    const sections: ValidationSection[] = [
      validateDetailsSection(proposal),
      validateScopeSection(proposal, settings, lineItemCount),
      validateContractSection(settings),
      validateBillingSection(settings),
      validateTaxSection(proposal),
      validateFeesSection(settings),
    ];

    const validSections = sections.filter(s => s.isValid).length;
    const overallProgress = Math.round((validSections / sections.length) * 100);
    const isReady = sections.every(s => s.isValid && s.isReviewed);

    return {
      isReady,
      sections,
      overallProgress,
    };
  } catch (error) {
    console.error('Error checking proposal readiness:', error);
    throw error;
  }
}

function validateDetailsSection(proposal: any): ValidationSection {
  const issues: string[] = [];

  if (!proposal.title || proposal.title.trim() === '') {
    issues.push('Proposal title is required');
  }

  if (!proposal.contact_id) {
    issues.push('Customer is required');
  }

  if (!proposal.contacts?.email) {
    issues.push('Customer email is required to send proposal');
  }

  const isValid = issues.length === 0;
  const summary = isValid
    ? `${proposal.title || 'Untitled'} for ${proposal.contacts?.full_name || 'Customer'}`
    : 'Missing required information';

  return {
    name: 'details',
    label: 'Details',
    isValid,
    isReviewed: !!proposal.proposal_settings?.details_reviewed_at,
    issues,
    summary,
  };
}

function validateScopeSection(proposal: any, settings: any, lineItemCount: number): ValidationSection {
  const issues: string[] = [];

  if (lineItemCount === 0) {
    issues.push('At least one line item is required');
  }

  if (!settings?.scope_of_work || settings.scope_of_work.trim() === '') {
    issues.push('Scope of work description is recommended');
  }

  const isValid = lineItemCount > 0;
  const summary = isValid
    ? `${lineItemCount} item${lineItemCount !== 1 ? 's' : ''} in proposal`
    : 'No items added';

  return {
    name: 'scope',
    label: 'Scope of Work',
    isValid,
    isReviewed: !!settings?.scope_reviewed_at,
    issues,
    summary,
  };
}

function validateContractSection(settings: any): ValidationSection {
  const issues: string[] = [];

  if (!settings?.contract_id) {
    issues.push('Contract template must be selected');
  }

  const isValid = !!settings?.contract_id;
  const summary = isValid ? 'Contract template selected' : 'No contract selected';

  return {
    name: 'contract',
    label: 'Contract',
    isValid,
    isReviewed: !!settings?.contract_reviewed_at,
    issues,
    summary,
  };
}

function validateBillingSection(settings: any): ValidationSection {
  const issues: string[] = [];

  if (settings?.require_deposit === null || settings?.require_deposit === undefined) {
    issues.push('Deposit requirement must be specified');
  }

  if (!settings?.deposit_type) {
    issues.push('Deposit type must be specified');
  }

  if (settings?.require_deposit && settings?.deposit_type === 'percentage' && (!settings?.deposit_percent || settings.deposit_percent <= 0)) {
    issues.push('Deposit percentage must be greater than 0');
  }

  if (settings?.require_deposit && settings?.deposit_type === 'amount' && (!settings?.deposit_amount || settings.deposit_amount <= 0)) {
    issues.push('Deposit amount must be greater than 0');
  }

  const isValid =
    settings?.require_deposit !== null &&
    settings?.require_deposit !== undefined &&
    settings?.deposit_type &&
    (!settings?.require_deposit ||
      (settings.deposit_type === 'percentage' && settings.deposit_percent > 0) ||
      (settings.deposit_type === 'amount' && settings.deposit_amount > 0) ||
      (settings.deposit_type === 'parts_total') ||
      (settings.deposit_type === 'none') ||
      (settings.deposit_type === 'custom'));

  let summary = 'Not configured';
  if (isValid) {
    if (settings.require_deposit) {
      if (settings.deposit_type === 'percentage') {
        summary = `${settings.deposit_percent}% deposit required`;
      } else if (settings.deposit_type === 'amount') {
        summary = `$${settings.deposit_amount} deposit required`;
      } else if (settings.deposit_type === 'parts_total') {
        summary = 'Parts total deposit required';
      } else if (settings.deposit_type === 'custom') {
        summary = 'Custom deposit required';
      } else if (settings.deposit_type === 'none') {
        summary = 'PO only - no deposit';
      } else {
        summary = 'Custom deposit required';
      }
    } else {
      summary = 'No deposit required';
    }
  }

  return {
    name: 'billing',
    label: 'Billing',
    isValid,
    isReviewed: !!settings?.billing_reviewed_at,
    issues,
    summary,
  };
}

function validateTaxSection(proposal: any): ValidationSection {
  const issues: string[] = [];

  if (!proposal.tax_environment) {
    issues.push('Tax environment must be specified');
  }

  if (!proposal.tax_project_type) {
    issues.push('Project type must be specified');
  }

  const isValid = !!proposal.tax_environment && !!proposal.tax_project_type;
  const summary = isValid
    ? `${proposal.tax_environment === 'taxable' ? 'Taxable' : 'Tax Exempt'} - ${proposal.tax_project_type}`
    : 'Not configured';

  return {
    name: 'tax',
    label: 'Tax',
    isValid,
    isReviewed: !!proposal.proposal_settings?.tax_reviewed_at,
    issues,
    summary,
  };
}

function validateFeesSection(settings: any): ValidationSection {
  const issues: string[] = [];

  const summary = buildFeesSummary(settings);
  const isValid = true;

  return {
    name: 'fees',
    label: 'Fees & Modifiers',
    isValid,
    isReviewed: !!settings?.fees_reviewed_at,
    issues,
    summary,
  };
}

function buildFeesSummary(settings: any): string {
  const modifiers: string[] = [];

  if (settings?.discount_percent && settings.discount_percent > 0) {
    modifiers.push(`${settings.discount_percent}% discount`);
  }

  if (settings?.project_management_percent && settings.project_management_percent > 0) {
    modifiers.push(`${settings.project_management_percent}% PM fee`);
  }

  if (settings?.project_design_percent && settings.project_design_percent > 0) {
    modifiers.push(`${settings.project_design_percent}% design fee`);
  }

  if (settings?.system_design_percent && settings.system_design_percent > 0) {
    modifiers.push(`${settings.system_design_percent}% system design`);
  }

  if (settings?.credit_card_fee_percent && settings.credit_card_fee_percent > 0) {
    modifiers.push(`${settings.credit_card_fee_percent}% CC fee`);
  }

  if (settings?.misc_parts_percent && settings.misc_parts_percent > 0) {
    modifiers.push(`${settings.misc_parts_percent}% misc parts`);
  }

  if (settings?.custom_modifier_1_label && settings?.custom_modifier_1_percent) {
    modifiers.push(`${settings.custom_modifier_1_percent}% ${settings.custom_modifier_1_label}`);
  }

  if (settings?.custom_modifier_2_label && settings?.custom_modifier_2_percent) {
    modifiers.push(`${settings.custom_modifier_2_percent}% ${settings.custom_modifier_2_label}`);
  }

  return modifiers.length > 0 ? modifiers.join(', ') : 'No modifiers applied';
}

export async function markSectionReviewed(proposalId: string, section: ValidationSection['name']): Promise<void> {
  try {
    await supabase.rpc('mark_settings_section_reviewed', {
      proposal_id_input: proposalId,
      section_name: section,
    });
  } catch (error) {
    console.error('Error marking section as reviewed:', error);
    throw error;
  }
}

export async function markAllSectionsReviewed(proposalId: string): Promise<void> {
  const sections: ValidationSection['name'][] = ['details', 'scope', 'contract', 'billing', 'tax', 'fees'];

  try {
    for (const section of sections) {
      await markSectionReviewed(proposalId, section);
    }
  } catch (error) {
    console.error('Error marking all sections as reviewed:', error);
    throw error;
  }
}
