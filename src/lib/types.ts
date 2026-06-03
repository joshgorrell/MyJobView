export interface Profile {
  id: string;
  email: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  username: string;
  role: 'admin' | 'finance' | 'manager' | 'sales' | 'tech';
  is_active: boolean;
  avatar_url: string | null;
  email_leads: boolean;
  organization_id?: string | null;
  can_view_team_pulse?: boolean;
  can_access_recur?: boolean;
  can_send_portal_invites?: boolean;
  can_view_prospects?: boolean;
  can_edit_contacts?: boolean;
  can_edit_contact_assignments?: boolean;
  can_delete_invoices?: boolean;
  can_create_work_orders?: boolean;
  last_seen_fishbowl_at: string | null;
  last_seen_punchlist_at: string | null;
  default_calendar_view: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  company_name: string | null;
  contact_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  opportunity_description: string | null;
  status: 'unclaimed' | 'claimed' | 'escalated' | 'closed_won' | 'closed_lost' | 'in_progress';
  assigned_to: string | null;
  created_by: string | null;
  office_id: string | null;
  is_fishbowl: boolean;
  lead_source?: 'manual' | 'kiosk' | 'website' | 'referral' | 'import' | 'other';
  claimed_at: string | null;
  escalated_at: string | null;
  qbo_customer_id: string | null;
  time_to_claim_seconds: number | null;
  unclaimed_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  /**
   * contact_type encodes both entity shape AND sales status:
   * - 'lead'     : showed interest, inbound inquiry, requesting a quote
   * - 'prospect' : being pursued, cold outreach, no interest expressed yet
   * - 'person'   : a customer (individual)
   * - 'business' : a customer (company)
   *
   * is_prospect is a derived field kept in sync by DB trigger:
   *   is_prospect = (contact_type = 'prospect')
   * Do NOT set is_prospect directly — change contact_type instead.
   */
  contact_type: 'person' | 'business' | 'lead' | 'prospect';
  company_name: string | null;
  contact_name: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  username: string;
  email: string | null;
  phone: string | null;
  business_phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string | null;
  notes: string | null;
  qbo_customer_id: string | null;
  business_card_photo_url: string | null;
  business_card_photo: string | null;
  is_tax_exempt: boolean | null;
  is_prospect: boolean;
  temperature: 'hot' | 'warm' | 'cold' | 'on_fire' | null;
  portal_access_enabled: boolean;
  tax_rate: number | null;
  tax_jurisdiction_id: string | null;
  default_payment_terms: string | null;
  assigned_to: string | null;
  last_contact_date: string | null;
  next_follow_up: string | null;
  office_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactSalesStatus = 'prospect' | 'lead' | 'customer';

export function getContactSalesStatus(contact: Pick<Contact, 'contact_type'>): ContactSalesStatus {
  if (contact.contact_type === 'lead') return 'lead';
  if (contact.contact_type === 'prospect') return 'prospect';
  return 'customer';
}

export interface ContactTag {
  id: string;
  contact_id: string;
  tag: string;
  created_at: string;
}

export interface LeadTag {
  id: string;
  lead_id: string;
  tag: string;
  created_at: string;
}

export interface LeadMessage {
  id: string;
  lead_id: string;
  user_id: string | null;
  message: string;
  mentions: string[];
  created_at: string;
  profiles?: Profile;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'lead_assigned' | 'fishbowl_lead' | 'escalated' | 'mention' | 'lead_claimed' | 'lead_updated';
  lead_id: string | null;
  message_id: string | null;
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  leads?: Lead;
}

export interface FeedEvent {
  id: string;
  event_type: 'lead_created' | 'lead_assigned' | 'lead_claimed' | 'message_posted' | 'lead_escalated' | 'lead_updated' | 'lead_closed';
  lead_id: string | null;
  message_id: string | null;
  user_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
  leads?: Lead;
  lead_messages?: LeadMessage;
  profiles?: Profile;
}

export interface LeadWithDetails extends Lead {
  profiles?: Profile;
  assigned_profile?: Profile;
  lead_tags?: LeadTag[];
  message_count?: number;
}

export interface BusinessCard {
  id: string;
  user_id: string | null;
  slug: string;
  full_name: string;
  title: string;
  email: string;
  phone: string;
  photo_url: string | null;
  bio: string | null;
  linkedin_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactCapture {
  id: string;
  business_card_id: string;
  contact_phone: string;
  contact_name: string | null;
  captured_by: string | null;
  sms_sent: boolean;
  sms_sent_at: string | null;
  sms_delivered: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  lead_id: string | null;
  contact_id: string | null;
  user_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  contacts?: Contact;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  company_logo_url: string | null;
  website: string | null;
  portal_url?: string | null;
  from_email?: string | null;
  from_name?: string | null;
  reply_to_email?: string | null;
  job_module_enabled?: boolean;
  job_module_settings?: {
    commission_defaults?: {
      basis: 'gross' | 'profit';
      rates: {
        sales: number;
        project_manager: number;
        designer: number;
        installer: number;
      };
    };
    tax_rate?: number;
    deposit_default_percent?: number;
    invoice_terms?: string;
    stripe_account_id?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface CompanyOffice {
  id: string;
  office_name: string;
  phone: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface DiscussionPost {
  id: string;
  user_id: string;
  lead_id: string | null;
  parent_id: string | null;
  content: string;
  post_type: 'task' | 'question' | 'general';
  mentions: string[];
  hashtags: string[];
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  leads?: Lead;
  like_count?: number;
  user_has_liked?: boolean;
  replies?: DiscussionPost[];
  reply_count?: number;
}

export interface QuickBooksSettings {
  id: string;
  access_token: string | null;
  refresh_token: string | null;
  realm_id: string | null;
  token_expires_at: string | null;
  is_connected: boolean;
  auto_import_customers: boolean;
  last_customer_sync_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FeatureSuggestion {
  id: string;
  user_id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_review' | 'completed' | 'declined';
  admin_notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
}

export interface UserOffice {
  id: string;
  user_id: string;
  office_id: string;
  created_at: string;
  company_offices?: CompanyOffice;
}

export interface LaborPhase {
  id: string;
  name: string;
  description?: string | null;
  default_rate?: number | null;
  sort_order?: number;
}

export interface Product {
  id: string;
  company_id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  item_type: 'labor' | 'material' | 'both' | null;
  is_taxable: boolean | null;
  unit_price: number;
  our_price?: number;
  cost: number | null;
  unit: string;
  default_labor_hours?: number | null;
  labor_phase_id?: string | null;
  portal_io_product_id: string | null;
  portal_io_data: Record<string, any> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  company_id: string;
  contact_id: string;
  lead_id: string | null;
  proposal_number: string;
  title: string;
  status: 'designing' | 'ready_to_submit' | 'sent' | 'viewed' | 'portal' | 'approved' | 'approved_pending_action' | 'declined' | 'cancelled' | 'expired' | 'archived';
  valid_until: string | null;
  notes: string | null;
  customer_notes: string | null;
  archived_at?: string | null;
  archived_by?: string | null;
  auto_archived?: boolean;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_percent: number;
  deposit_amount: number;
  discount_amount?: number;
  project_management_amount?: number;
  project_design_amount?: number;
  system_design_amount?: number;
  credit_card_fee_amount?: number;
  misc_parts_amount?: number;
  custom_modifier_1_amount?: number;
  custom_modifier_2_amount?: number;
  created_by: string;
  sent_at: string | null;
  viewed_at: string | null;
  approved_at: string | null;
  declined_at: string | null;
  decline_reason?: string | null;
  decline_notes?: string | null;
  declined_by?: 'customer' | 'rep' | 'company' | null;
  created_at: string;
  updated_at: string;
  expires_at?: string | null;
  last_renewed_at?: string | null;
  renewal_count?: number;
  is_revision?: boolean;
  parent_proposal_id?: string | null;
  revision_name?: string | null;
  is_active_revision?: boolean;
  is_portal_visible?: boolean;
  revision_number?: number;
  revision_count?: number;
  is_locked?: boolean;
  locked_at?: string | null;
  locked_by?: string | null;
  template_id?: string | null;
  last_emailed_at?: string | null;
  last_emailed_by?: string | null;
  bill_to_contact_id?: string | null;
  bill_to_send_to?: 'customer' | 'bill_to' | 'both';
  bill_to_contact?: Contact;
  contacts?: Contact;
  profiles?: Profile;
  leads?: Lead;
  report_template_id?: string | null;
}

export interface ProposalRoom {
  id: string;
  proposal_id: string;
  name: string;
  description: string | null;
  sort_order: number;
  show_scope: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProposalLineItem {
  id: string;
  proposal_id: string;
  room_id: string | null;
  product_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  cost: number | null;
  line_total: number;
  sort_order: number;
  is_custom: boolean;
  created_at: string;
  updated_at: string;
  products?: Product;
  labor_hours?: number | null;
  labor_rate?: number | null;
  labor_total?: number | null;
  item_type?: string | null;
  task_notes?: string | null;
  parent_item_id?: string | null;
  display_mode?: 'itemized' | 'bundle' | 'collapsed';
  accessories?: ProposalLineItem[];
  show_task_notes?: boolean;
  is_hidden?: boolean;
  labor_phase_id?: string | null;
  labor_phases?: LaborPhase | null;
  class_id?: string | null;
  is_taxable?: boolean;
  task_completed?: boolean;
}

export interface ProposalWithDetails extends Proposal {
  rooms: (ProposalRoom & {
    line_items: ProposalLineItem[];
  })[];
}

export interface DiscontinuedItem {
  line_item_id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost: number;
  line_total: number;
  product_name: string;
}

export interface PricingChangedItem {
  line_item_id: string;
  product_id: string;
  description: string;
  quantity: number;
  old_unit_price: number;
  new_unit_price: number;
  old_cost: number;
  new_cost: number;
  old_line_total: number;
  new_line_total: number;
  price_difference: number;
  line_difference: number;
  product_name: string;
}

export interface UnchangedItem {
  line_item_id: string;
  product_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  cost: number;
  line_total: number;
  product_name: string;
}

export interface ProposalPricingAnalysis {
  discontinued_items: DiscontinuedItem[];
  pricing_changed_items: PricingChangedItem[];
  pricing_unchanged_items: UnchangedItem[];
  summary: {
    old_total: number;
    new_total: number;
    difference: number;
    has_discontinued: boolean;
    has_pricing_changes: boolean;
  };
}

export interface PricingUpdateOptions {
  update_pricing: boolean;
  convert_discontinued_to_custom: boolean;
  new_status: 'designing' | 'sent';
  expires_at?: string;
  is_portal_visible?: boolean;
}
