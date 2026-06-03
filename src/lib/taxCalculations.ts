import { supabase } from './supabase';

export type TaxEnvironment = 'residential' | 'commercial';
export type TaxProjectType =
  | 'original_construction'
  | 'remodel'
  | 'general_installation_repair'
  | 'exempt_project'
  | 'design_services'
  | 'maintenance_agreement'
  | 'membership'
  | 'security_monitoring';

export type ItemType = 'labor' | 'material';

export type ExemptionCategory =
  | 'non_profit'
  | 'government'
  | 'resale'
  | 'agricultural'
  | 'manufacturer'
  | 'medical'
  | 'other';

export interface TaxJurisdiction {
  id: string;
  zip_code?: string;
  city?: string;
  county?: string;
  state: string;
  combined_rate: number;
  state_rate: number;
  county_rate: number;
  city_rate: number;
  special_rate: number;
  jurisdiction_name: string;
  is_default: boolean;
  ks_jurisdiction_code?: string;
  mo_jurisdiction_code?: string;
  state_filing_codes?: Record<string, string>;
}

export interface TaxExemptionCertificate {
  id: string;
  contact_id: string;
  certificate_number: string;
  certificate_type: string;
  exemption_category?: ExemptionCategory;
  issuing_authority: string;
  issuing_state: string;
  issue_date: string;
  expiration_date?: string;
  is_active: boolean;
  certificate_file_path?: string;
  certificate_file_name?: string;
  state_form_number?: string;
  buyer_name?: string;
  buyer_address?: string;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE RULES REGISTRY
// Adding a new state: add one entry to STATE_TAX_RULES below.
// ─────────────────────────────────────────────────────────────────────────────

export interface StateTaxRule {
  /** Human-readable state name */
  stateName: string;
  /** Primary monthly filing form number */
  filingFormNumber: string;
  /** URL to state revenue authority */
  revenueAuthorityUrl: string;
  /** Standard exemption certificate form number */
  exemptionFormNumber: string;
  /** Determine parts/labor taxability for the given project scenario */
  getApplicability: (
    environment: TaxEnvironment,
    projectType: TaxProjectType
  ) => { partsTaxable: boolean; laborTaxable: boolean; explanation: string };
}

const KS_RULES: StateTaxRule = {
  stateName: 'Kansas',
  filingFormNumber: 'ST-36',
  revenueAuthorityUrl: 'https://www.ksrevenue.gov',
  exemptionFormNumber: 'ST-28',
  getApplicability(environment, projectType) {
    if (projectType === 'exempt_project') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Exempt projects are not taxed (parts or labor). K.S.A. 79-3606.' };
    }
    if (projectType === 'design_services') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Design services are non-taxable under Kansas law.' };
    }
    if (projectType === 'security_monitoring') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Security monitoring is non-taxable (taxed only on recurring invoices).' };
    }
    if (projectType === 'maintenance_agreement' || projectType === 'membership') {
      return { partsTaxable: true, laborTaxable: true, explanation: 'Both parts and labor are taxable for maintenance agreements and memberships. K.S.A. 79-3603.' };
    }
    if (environment === 'residential' && projectType === 'original_construction') {
      return { partsTaxable: true, laborTaxable: false, explanation: 'Parts taxable, labor exempt — residential original construction. K.S.A. 79-3603(p).' };
    }
    if (environment === 'residential' && projectType === 'remodel') {
      return { partsTaxable: true, laborTaxable: false, explanation: 'Parts taxable, labor exempt — residential remodel. K.S.A. 79-3603.' };
    }
    if (environment === 'commercial' && projectType === 'original_construction') {
      return { partsTaxable: true, laborTaxable: false, explanation: 'Parts taxable, labor exempt — commercial original construction. K.S.A. 79-3603(p).' };
    }
    if (environment === 'commercial' && projectType === 'remodel') {
      return { partsTaxable: true, laborTaxable: true, explanation: 'Both parts and labor taxable — commercial remodel. K.S.A. 79-3603.' };
    }
    if (projectType === 'general_installation_repair') {
      return { partsTaxable: true, laborTaxable: true, explanation: 'Both parts and labor taxable — general installation/repair/retail. K.S.A. 79-3603.' };
    }
    return { partsTaxable: true, laborTaxable: true, explanation: 'Both parts and labor taxable by default (Kansas).' };
  },
};

const MO_RULES: StateTaxRule = {
  stateName: 'Missouri',
  filingFormNumber: '53-1',
  revenueAuthorityUrl: 'https://dor.mo.gov',
  exemptionFormNumber: 'Form 149',
  getApplicability(environment, projectType) {
    // Missouri: contractors are the end consumer of materials they purchase and install.
    // Materials are taxable at purchase (contractor pays tax). When billing customers,
    // separately-stated labor is generally NOT taxable. Lump-sum contracts: both taxable.
    if (projectType === 'exempt_project') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Exempt projects — no tax. Mo. Rev. Stat. § 144.030.' };
    }
    if (projectType === 'design_services') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Design services are non-taxable in Missouri. Mo. Rev. Stat. § 144.020.' };
    }
    if (projectType === 'security_monitoring') {
      return { partsTaxable: false, laborTaxable: false, explanation: 'Security monitoring services are not taxable in Missouri.' };
    }
    if (projectType === 'maintenance_agreement' || projectType === 'membership') {
      return { partsTaxable: true, laborTaxable: true, explanation: 'Maintenance agreements and memberships are taxable in Missouri. Mo. Rev. Stat. § 144.020.' };
    }
    if (projectType === 'original_construction') {
      // Missouri: new construction — materials taxable when billed; labor separately stated is exempt
      return { partsTaxable: true, laborTaxable: false, explanation: `Parts taxable, separately-stated labor exempt — ${environment} original construction. Mo. Rev. Stat. § 144.062.` };
    }
    if (projectType === 'remodel') {
      // Missouri remodel: materials taxable, labor separately stated is exempt
      return { partsTaxable: true, laborTaxable: false, explanation: `Parts taxable, separately-stated labor exempt — ${environment} remodel. Mo. Rev. Stat. § 144.062.` };
    }
    if (projectType === 'general_installation_repair') {
      // Missouri lump-sum retail sale: both taxable
      return { partsTaxable: true, laborTaxable: true, explanation: 'Both parts and labor taxable — general installation/repair (lump-sum retail). Mo. Rev. Stat. § 144.020.' };
    }
    return { partsTaxable: true, laborTaxable: false, explanation: 'Parts taxable, separately-stated labor exempt by default (Missouri). Mo. Rev. Stat. § 144.062.' };
  },
};

// Registry — add new states here
export const STATE_TAX_RULES: Record<string, StateTaxRule> = {
  KS: KS_RULES,
  MO: MO_RULES,
};

/** Display labels for exemption categories */
export const EXEMPTION_CATEGORY_LABELS: Record<ExemptionCategory, string> = {
  non_profit: 'Non-Profit Organization',
  government: 'Government Entity',
  resale: 'Resale / Wholesale',
  agricultural: 'Agricultural',
  manufacturer: 'Manufacturer / Industrial',
  medical: 'Medical / Healthcare',
  other: 'Other Exemption',
};

/** State-specific exemption form numbers */
export const STATE_EXEMPTION_FORMS: Record<string, string> = {
  KS: 'ST-28',
  MO: 'Form 149',
  OK: 'Form STS-13110',
  NE: 'Form 13',
  CO: 'DR 0563',
  TX: '01-339',
  AR: 'ST 391',
};

/** Returns the filing codes object for a jurisdiction, supporting legacy ks_jurisdiction_code */
export function getFilingCode(jurisdiction: TaxJurisdiction, state: string): string | undefined {
  if (jurisdiction.state_filing_codes && jurisdiction.state_filing_codes[state]) {
    return jurisdiction.state_filing_codes[state];
  }
  if (state === 'KS' && jurisdiction.ks_jurisdiction_code) return jurisdiction.ks_jurisdiction_code;
  if (state === 'MO' && jurisdiction.mo_jurisdiction_code) return jurisdiction.mo_jurisdiction_code;
  return undefined;
}

export interface LineItemTaxCalculation {
  amount: number;
  taxAmount: number;
  isTaxable: boolean;
}

/**
 * Look up tax rate from TaxJar API
 */
export async function lookupTaxRateByZip(zipCode: string): Promise<TaxJurisdiction | null> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/taxjar-lookup`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'rates', zipCode }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to lookup tax rate:', data.error || response.statusText);
      throw new Error(data.error || 'Failed to lookup tax rate');
    }

    if (data.error) {
      throw new Error(data.error);
    }

    return {
      id: '',
      zip_code: data.zipCode,
      city: data.city,
      county: data.county,
      state: data.state,
      combined_rate: data.combinedRate,
      state_rate: data.stateRate,
      county_rate: data.countyRate,
      city_rate: data.cityRate,
      special_rate: data.specialRate,
      jurisdiction_name: data.jurisdictionName,
      is_default: false,
    };
  } catch (error) {
    console.error('Error looking up tax rate:', error);
    throw error;
  }
}

/**
 * Get applicable tax rate for a contact and zip code
 */
export async function getApplicableTaxRate(
  contactId: string,
  zipCode?: string
): Promise<number> {
  try {
    // First check if contact is tax exempt with valid certificate
    const { data: contact } = await supabase
      .from('contacts')
      .select('is_tax_exempt')
      .eq('id', contactId)
      .maybeSingle();

    if (contact?.is_tax_exempt) {
      // Verify valid certificate exists
      const { data: certificate } = await supabase
        .from('tax_exemption_certificates')
        .select('*')
        .eq('contact_id', contactId)
        .eq('is_active', true)
        .maybeSingle();

      if (certificate) {
        // Check expiration
        if (!certificate.expiration_date || new Date(certificate.expiration_date) > new Date()) {
          return 0; // Tax exempt
        }
      }
    }

    // Look up tax rate by zip code
    if (zipCode) {
      const { data: jurisdiction } = await supabase
        .from('tax_jurisdictions')
        .select('combined_rate')
        .eq('zip_code', zipCode)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (jurisdiction) {
        return jurisdiction.combined_rate;
      }
    }

    // Fall back to default company rate
    const { data: defaultJurisdiction } = await supabase
      .from('tax_jurisdictions')
      .select('combined_rate')
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    return defaultJurisdiction?.combined_rate || 0;
  } catch (error) {
    console.error('Error getting applicable tax rate:', error);
    return 0;
  }
}

/**
 * Calculate tax for a line item based on project type, item type, and state.
 * Pass `state` (two-letter code) to use that state's rules; defaults to 'KS'.
 */
export function calculateLineItemTax(
  environment: TaxEnvironment,
  projectType: TaxProjectType,
  itemType: ItemType,
  amount: number,
  taxRate: number,
  state = 'KS'
): LineItemTaxCalculation {
  const rules = STATE_TAX_RULES[state] || STATE_TAX_RULES['KS'];
  const { partsTaxable, laborTaxable } = rules.getApplicability(environment, projectType);
  const isTaxable = itemType === 'labor' ? laborTaxable : partsTaxable;
  return { amount, taxAmount: isTaxable ? amount * taxRate : 0, isTaxable };
}

/**
 * Calculate total tax for multiple line items
 */
export function calculateTotalTax(
  lineItems: Array<{
    amount: number;
    itemType: ItemType;
  }>,
  environment: TaxEnvironment,
  projectType: TaxProjectType,
  taxRate: number
): { subtotal: number; taxAmount: number; total: number } {
  let subtotal = 0;
  let taxAmount = 0;

  for (const item of lineItems) {
    const calculation = calculateLineItemTax(
      environment,
      projectType,
      item.itemType,
      item.amount,
      taxRate
    );
    subtotal += calculation.amount;
    taxAmount += calculation.taxAmount;
  }

  return {
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  };
}

/**
 * Get tax jurisdiction by zip code
 */
export async function getTaxJurisdictionByZip(zipCode: string): Promise<TaxJurisdiction | null> {
  try {
    const { data } = await supabase
      .from('tax_jurisdictions')
      .select('*')
      .eq('zip_code', zipCode)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    return data;
  } catch (error) {
    console.error('Error getting tax jurisdiction:', error);
    return null;
  }
}

/**
 * Get default tax jurisdiction
 */
export async function getDefaultTaxJurisdiction(): Promise<TaxJurisdiction | null> {
  try {
    const { data } = await supabase
      .from('tax_jurisdictions')
      .select('*')
      .eq('is_default', true)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    return data;
  } catch (error) {
    console.error('Error getting default tax jurisdiction:', error);
    return null;
  }
}

/**
 * Format tax rate for display (e.g., 0.0825 -> "8.25%")
 */
export function formatTaxRate(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/**
 * Validate tax exemption certificate
 */
export function isValidCertificate(certificate: TaxExemptionCertificate): boolean {
  if (!certificate.is_active) return false;
  if (!certificate.expiration_date) return true; // No expiration
  return new Date(certificate.expiration_date) > new Date();
}

/**
 * Get project type display name
 */
export function getProjectTypeDisplayName(projectType: TaxProjectType): string {
  const names: Record<TaxProjectType, string> = {
    original_construction: 'Original Construction',
    remodel: 'Remodel',
    general_installation_repair: 'General Installation/Repair or Retail',
    exempt_project: 'Exempt Project',
    design_services: 'Design Services',
    maintenance_agreement: 'Maintenance Agreement',
    membership: 'Membership',
    security_monitoring: 'Security Monitoring',
  };
  return names[projectType];
}

/**
 * Get environment display name
 */
export function getEnvironmentDisplayName(environment: TaxEnvironment): string {
  return environment === 'residential' ? 'Residential' : 'Commercial';
}

// ─────────────────────────────────────────────────────────────────────────────
// HIGH-LEVEL HELPERS – single entry point for every document type
// ─────────────────────────────────────────────────────────────────────────────

export interface TaxLineInput {
  /** Dollar amount of the material/parts portion of this line item */
  partsAmount: number;
  /** Dollar amount of the labor portion of this line item */
  laborAmount: number;
}

export interface TaxTotalsResult {
  /** Sum of all part amounts after modifiers */
  modifiedParts: number;
  /** Sum of all labor amounts after modifiers */
  modifiedLabor: number;
  /** Whether parts are taxable under the current rules */
  partsTaxable: boolean;
  /** Whether labor is taxable under the current rules */
  laborTaxable: boolean;
  /** Tax owed on parts */
  partsTax: number;
  /** Tax owed on labor */
  laborTax: number;
  /** Total tax amount */
  taxAmount: number;
  /** Subtotal after modifiers (before tax) */
  subtotalAfterModifiers: number;
  /** Grand total (subtotal + tax) */
  total: number;
}

/**
 * Authoritative tax calculator for proposals and change orders.
 *
 * Applies optional modifier percentages to parts and labor, then derives the
 * correct tax using the tax-rules matrix.  Every component that produces a
 * proposal or change-order total should call this function instead of
 * maintaining its own copy of the matrix.
 *
 * @param params.lineItems       Array of {partsAmount, laborAmount} inputs
 * @param params.environment     'residential' | 'commercial'
 * @param params.projectType     One of the TaxProjectType enum values
 * @param params.taxRate         Decimal rate, e.g. 0.0935 for 9.35%
 * @param params.isTaxExempt     When true, no tax is applied
 * @param params.netModifierPct  Net sum of all modifier percentages (can be
 *                               negative for discounts). Applied proportionally
 *                               to parts and labor before tax is computed.
 */
export function computeTaxTotals(params: {
  lineItems: TaxLineInput[];
  environment: TaxEnvironment;
  projectType: TaxProjectType;
  taxRate: number;
  isTaxExempt?: boolean;
  netModifierPct?: number;
  /** Two-letter state code — defaults to 'KS' for backward compatibility */
  state?: string;
}): TaxTotalsResult {
  const { lineItems, environment, projectType, taxRate, isTaxExempt = false, netModifierPct = 0, state = 'KS' } = params;

  let rawParts = 0;
  let rawLabor = 0;
  for (const item of lineItems) {
    rawParts += item.partsAmount;
    rawLabor += item.laborAmount;
  }

  const modifiedParts = rawParts * (1 + netModifierPct / 100);
  const modifiedLabor = rawLabor * (1 + netModifierPct / 100);
  const subtotalAfterModifiers = modifiedParts + modifiedLabor;

  const { partsTaxable, laborTaxable } = getTaxApplicability(environment, projectType, state);

  let partsTax = 0;
  let laborTax = 0;

  if (!isTaxExempt && taxRate > 0) {
    partsTax = partsTaxable ? modifiedParts * taxRate : 0;
    laborTax = laborTaxable ? modifiedLabor * taxRate : 0;
  }

  const taxAmount = partsTax + laborTax;

  return {
    modifiedParts,
    modifiedLabor,
    partsTaxable,
    laborTaxable,
    partsTax,
    laborTax,
    taxAmount,
    subtotalAfterModifiers,
    total: subtotalAfterModifiers + taxAmount,
  };
}

export interface InvoiceLineInput {
  /** Dollar amount for this line item */
  amount: number;
  /**
   * Whether this item is a labor line ('labor') or a material/parts line
   * (anything else).  Defaults to 'material' when omitted.
   */
  itemType?: ItemType;
  /**
   * Optional per-item taxability override.  When false, the item is never
   * taxed regardless of the rules matrix.  Defaults to true.
   */
  isTaxable?: boolean;
}

export interface InvoiceTaxResult {
  subtotal: number;
  partsTaxable: boolean;
  laborTaxable: boolean;
  taxAmount: number;
  total: number;
  taxRate: number;
}

/**
 * Authoritative tax calculator for invoices.
 *
 * Combines the per-item `isTaxable` flag with the project-level tax-rules
 * matrix so that invoices always follow the same rules as proposals.
 *
 * @param params.lineItems    Array of invoice line items
 * @param params.environment  'residential' | 'commercial'
 * @param params.projectType  One of the TaxProjectType enum values
 * @param params.taxRate      Decimal rate, e.g. 0.0935 for 9.35%
 * @param params.isTaxExempt  When true, no tax is applied
 */
export function computeInvoiceTax(params: {
  lineItems: InvoiceLineInput[];
  environment: TaxEnvironment;
  projectType: TaxProjectType;
  taxRate: number;
  isTaxExempt?: boolean;
  /** Two-letter state code — defaults to 'KS' for backward compatibility */
  state?: string;
}): InvoiceTaxResult {
  const { lineItems, environment, projectType, taxRate, isTaxExempt = false, state = 'KS' } = params;

  const { partsTaxable, laborTaxable } = getTaxApplicability(environment, projectType, state);

  let subtotal = 0;
  let taxAmount = 0;

  for (const item of lineItems) {
    subtotal += item.amount;

    if (!isTaxExempt && taxRate > 0 && item.isTaxable !== false) {
      const isLaborItem = (item.itemType ?? 'material') === 'labor';
      if (isLaborItem ? laborTaxable : partsTaxable) {
        taxAmount += item.amount * taxRate;
      }
    }
  }

  return {
    subtotal,
    partsTaxable,
    laborTaxable,
    taxAmount,
    total: subtotal + taxAmount,
    taxRate,
  };
}

/**
 * Get tax applicability information for display.
 * Pass `state` (two-letter code) to use that state's rules; defaults to 'KS'.
 */
export function getTaxApplicability(
  environment: TaxEnvironment,
  projectType: TaxProjectType,
  state = 'KS'
): { partsTaxable: boolean; laborTaxable: boolean; explanation: string } {
  const rules = STATE_TAX_RULES[state] || STATE_TAX_RULES['KS'];
  return rules.getApplicability(environment, projectType);
}
