export interface EnrichedThread {
  source?: 'coworker';
  discussion_type?: string;
  audience_label?: string;
  id: string;
  subject: string;
  context_type: string;
  context_id: string | null;
  proposal_id: string | null;
  visibility: string;
  created_by: string;
  last_message_at: string;
  assigned_sales_rep_id: string | null;
  organization_id: string;
  contact_id: string | null;
  message_count: number;
  last_message_preview: string;
  last_message_author_type: string;
  contact_name: string;
  proposal_number: string;
  proposal_title: string;
  proposal_status: string;
  rep_name: string;
  unread_count: number;
  last_rep_response_at: string | null;
  last_customer_message_at?: string | null;
  related_context_name?: string;
  context_label: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
}

export interface Message {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  author_type: 'staff' | 'customer';
  body: string;
  is_read: boolean;
  is_internal: boolean;
  created_at: string;
  context_room_id: string | null;
  context_line_item_id: string | null;
  context_label: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'link' | null;
}

