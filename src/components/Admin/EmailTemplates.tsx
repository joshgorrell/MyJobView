import { useState, useEffect } from 'react';
import { Mail, Save, AlertCircle, Check, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../Shared/Toast';

interface EmailTemplate {
  id: string;
  template_type: string;
  subject: string;
  body: string;
  is_active: boolean;
}

const TEMPLATE_TYPES = [
  {
    value: 'welcome_email',
    label: 'Welcome Email',
    category: 'User Management',
    placeholders: ['{{full_name}}', '{{email}}', '{{company_name}}', '{{login_url}}']
  },
  {
    value: 'password_reset',
    label: 'Password Reset',
    category: 'User Management',
    placeholders: ['{{full_name}}', '{{company_name}}', '{{reset_link}}']
  },
  {
    value: 'portal_magic_link',
    label: 'Portal Magic Link',
    category: 'Customer Portal',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{magic_link}}']
  },
  {
    value: 'proposal_sent',
    label: 'Proposal Sent',
    category: 'Customer Portal',
    placeholders: ['{{customer_name}}', '{{proposal_number}}', '{{project_name}}', '{{proposal_total}}', '{{portal_link}}', '{{sales_rep_name}}', '{{sales_rep_email}}', '{{sales_rep_phone}}', '{{company_name}}']
  },
  {
    value: 'invoice_sent',
    label: 'Invoice Sent',
    category: 'Customer Portal',
    placeholders: ['{{customer_name}}', '{{invoice_number}}', '{{invoice_date}}', '{{amount_due}}', '{{due_date}}', '{{portal_link}}', '{{company_phone}}', '{{company_email}}', '{{company_name}}', '{{company_address}}']
  },
  {
    value: 'punchlist_test_and_tune',
    label: 'Test & Tune Invite (with Portal)',
    category: 'Punchlist Invites',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{portal_link}}', '{{project_name}}', '{{expiration_date}}']
  },
  {
    value: 'punchlist_test_and_tune_no_portal',
    label: 'Test & Tune Invite (no Portal)',
    category: 'Punchlist Invites',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{project_name}}', '{{expiration_date}}']
  },
  {
    value: 'punchlist_invite',
    label: 'Punchlist Invite',
    category: 'Punchlist Invites',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{portal_link}}', '{{project_name}}', '{{expiration_date}}']
  },
  {
    value: 'vip_signup',
    label: 'VIP Signup Invite',
    category: 'Punchlist Invites',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{signup_link}}']
  },
  {
    value: 'lead_notification',
    label: 'Lead Notification',
    category: 'Lead & Sales',
    placeholders: ['{{sales_rep_name}}', '{{lead_name}}', '{{lead_company}}', '{{lead_email}}', '{{lead_phone}}', '{{lead_source}}', '{{lead_priority}}', '{{lead_notes}}', '{{app_link}}', '{{company_name}}']
  },
  {
    value: 'appointment_reminder',
    label: 'Appointment Reminder',
    category: 'Lead & Sales',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{appointment_date}}', '{{appointment_time}}', '{{appointment_duration}}', '{{appointment_type}}', '{{appointment_location}}', '{{staff_name}}', '{{staff_phone}}', '{{appointment_notes}}', '{{company_phone}}', '{{company_email}}', '{{portal_link}}']
  },
  {
    value: 'work_order_assigned',
    label: 'Work Order Assigned',
    category: 'Service & Production',
    placeholders: ['{{technician_name}}', '{{work_order_number}}', '{{project_name}}', '{{customer_name}}', '{{priority_level}}', '{{scheduled_date}}', '{{start_time}}', '{{estimated_hours}}', '{{job_address}}', '{{map_link}}', '{{work_description}}', '{{special_instructions}}', '{{app_link}}', '{{company_name}}']
  },
  {
    value: 'service_request_update',
    label: 'Service Request Update',
    category: 'Service & Production',
    placeholders: ['{{customer_name}}', '{{service_request_number}}', '{{new_status}}', '{{update_date}}', '{{update_message}}', '{{status_description}}', '{{next_steps}}', '{{estimated_completion}}', '{{portal_link}}', '{{company_phone}}', '{{company_email}}', '{{company_name}}']
  },
  {
    value: 'daily_summary',
    label: 'Daily Summary',
    category: 'Admin Notifications',
    placeholders: ['{{manager_name}}', '{{report_date}}', '{{new_leads_count}}', '{{proposals_sent_count}}', '{{proposals_won_count}}', '{{daily_revenue}}', '{{jobs_completed_count}}', '{{jobs_in_progress_count}}', '{{jobs_scheduled_count}}', '{{avg_completion_time}}', '{{new_requests_count}}', '{{resolved_requests_count}}', '{{pending_requests_count}}', '{{avg_response_time}}', '{{total_clock_hours}}', '{{active_technicians_count}}', '{{top_performer_name}}', '{{top_performer_metric}}', '{{new_customers_count}}', '{{portal_logins_count}}', '{{punchlist_items_count}}', '{{action_items}}', '{{alerts_summary}}', '{{app_link}}', '{{company_name}}']
  },
  {
    value: 'issue_alert',
    label: 'Issue Alert',
    category: 'Admin Notifications',
    placeholders: ['{{admin_name}}', '{{issue_number}}', '{{severity_level}}', '{{reporter_name}}', '{{reported_date}}', '{{issue_type}}', '{{issue_description}}', '{{affected_area}}', '{{steps_to_reproduce}}', '{{expected_behavior}}', '{{actual_behavior}}', '{{impact_description}}', '{{recommended_action}}', '{{user_browser}}', '{{user_device}}', '{{user_role}}', '{{issue_link}}', '{{company_name}}']
  },
  {
    value: 'contract_invitation',
    label: 'Security Contract Invitation',
    category: 'Finance & Contracts',
    placeholders: ['{{customer_name}}', '{{onboarding_url}}', '{{expiration_days}}', '{{company_name}}']
  },
  {
    value: 'work_order_feedback',
    label: 'Work Order Feedback',
    category: 'Service & Production',
    placeholders: ['{{customer_name}}', '{{company_name}}', '{{work_order_number}}', '{{work_order_title}}', '{{completion_date}}', '{{technician_names}}', '{{company_phone}}']
  },
  {
    value: 'job_completion_survey',
    label: 'Job Completion Survey',
    category: 'Reviews',
    placeholders: ['{{customer_first_name}}', '{{company_name}}', '{{review_url}}', '{{company_website}}']
  },
];

const SAMPLE_DATA: Record<string, Record<string, string>> = {
  welcome_email: {
    full_name: 'John Smith',
    email: 'john.smith@example.com',
    company_name: 'Elite Lighting',
    login_url: 'https://app.elitelighting.com/login'
  },
  password_reset: {
    full_name: 'John Smith',
    company_name: 'Elite Lighting',
    reset_link: 'https://app.elitelighting.com/reset-password?token=abc123'
  },
  portal_magic_link: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    magic_link: 'https://portal.elitelighting.com/login?token=xyz789'
  },
  proposal_sent: {
    customer_name: 'Sarah Johnson',
    proposal_number: 'LAF-2024-001',
    project_name: 'Office Building Lighting Upgrade',
    proposal_total: '$12,450.00',
    portal_link: 'https://portal.elitelighting.com/proposals/123',
    sales_rep_name: 'Mike Williams',
    sales_rep_email: 'mike@elitelighting.com',
    sales_rep_phone: '(555) 123-4567',
    company_name: 'Elite Lighting'
  },
  invoice_sent: {
    customer_name: 'Sarah Johnson',
    invoice_number: 'INV-2024-0042',
    invoice_date: 'January 15, 2024',
    amount_due: '$5,230.00',
    due_date: 'February 15, 2024',
    portal_link: 'https://portal.elitelighting.com/invoices/42',
    company_phone: '(555) 123-4567',
    company_email: 'billing@elitelighting.com',
    company_name: 'Elite Lighting',
    company_address: '123 Main Street, Lafayette, LA 70501'
  },
  punchlist_test_and_tune: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    portal_link: 'https://portal.elitelighting.com/portal',
    project_name: 'Office Building Installation',
    expiration_date: 'January 30, 2024'
  },
  punchlist_test_and_tune_no_portal: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    project_name: 'Office Building Installation',
    expiration_date: 'January 30, 2024'
  },
  punchlist_invite: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    portal_link: 'https://portal.elitelighting.com/punchlist/invite/abc123',
    project_name: 'Office Building Installation',
    expiration_date: 'January 30, 2024'
  },
  vip_signup: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    signup_link: 'https://portal.elitelighting.com/portal/membership'
  },
  lead_notification: {
    sales_rep_name: 'Mike Williams',
    lead_name: 'Tom Anderson',
    lead_company: 'Anderson Construction',
    lead_email: 'tom@andersonconstruction.com',
    lead_phone: '(555) 987-6543',
    lead_source: 'Website Form',
    lead_priority: 'High',
    lead_notes: 'Interested in warehouse lighting for new facility',
    app_link: 'https://app.elitelighting.com/leads/456',
    company_name: 'Elite Lighting'
  },
  appointment_reminder: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    appointment_date: 'January 20, 2024',
    appointment_time: '10:00 AM',
    appointment_duration: '2 hours',
    appointment_type: 'Site Survey',
    appointment_location: '456 Business Park Drive, Lafayette, LA',
    staff_name: 'Mike Williams',
    staff_phone: '(555) 123-4567',
    appointment_notes: 'Please have electrical plans available',
    company_phone: '(555) 123-4567',
    company_email: 'info@elitelighting.com',
    portal_link: 'https://portal.elitelighting.com/appointments/789'
  },
  work_order_assigned: {
    technician_name: 'Dave Martinez',
    work_order_number: 'WO-2024-0125',
    project_name: 'Office Building Installation',
    customer_name: 'Sarah Johnson',
    priority_level: 'High',
    scheduled_date: 'January 22, 2024',
    start_time: '8:00 AM',
    estimated_hours: '6 hours',
    job_address: '456 Business Park Drive, Lafayette, LA 70508',
    map_link: 'https://maps.google.com/?q=456+Business+Park+Drive+Lafayette+LA',
    work_description: 'Install LED fixtures in conference rooms and offices',
    special_instructions: 'Building access code: 1234. Park in rear lot.',
    app_link: 'https://app.elitelighting.com/work-orders/125',
    company_name: 'Elite Lighting'
  },
  service_request_update: {
    customer_name: 'Sarah Johnson',
    service_request_number: 'SR-2024-0089',
    new_status: 'In Progress',
    update_date: 'January 18, 2024',
    update_message: 'Our technician is on the way to your location',
    status_description: 'Technician Dave Martinez has been assigned',
    next_steps: 'Technician will arrive within 2 hours',
    estimated_completion: 'Same day completion expected',
    portal_link: 'https://portal.elitelighting.com/service-requests/89',
    company_phone: '(555) 123-4567',
    company_email: 'service@elitelighting.com',
    company_name: 'Elite Lighting'
  },
  contract_invitation: {
    customer_name: 'Robert Wilson',
    onboarding_url: 'https://portal.elitelighting.com/onboarding/abc123',
    expiration_days: '7',
    company_name: 'Elite Lighting'
  },
  work_order_feedback: {
    customer_name: 'Sarah Johnson',
    company_name: 'Elite Lighting',
    work_order_number: 'WO-2024-0125',
    work_order_title: 'Office Building Installation',
    completion_date: 'January 22, 2024',
    technician_names: 'Dave Martinez, John Smith',
    company_phone: '(555) 123-4567'
  },
  job_completion_survey: {
    customer_first_name: 'Sarah',
    company_name: 'Elite Lighting',
    review_url: 'https://g.page/r/CZzvVUth7kuyEBM/review',
    company_website: 'https://www.electroniclife.com'
  }
};

export function EmailTemplates() {
  const toast = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedType, setSelectedType] = useState('welcome_email');
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadAllTemplates();
  }, []);

  useEffect(() => {
    if (templates.length > 0) {
      loadTemplate(selectedType);
    }
  }, [selectedType, templates]);

  async function loadAllTemplates() {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .order('template_type');

      if (error) throw error;

      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Failed to load email templates');
    } finally {
      setLoading(false);
    }
  }

  function loadTemplate(templateType: string) {
    const foundTemplate = templates.find(t => t.template_type === templateType);
    if (foundTemplate) {
      setTemplate(foundTemplate);
      setSubject(foundTemplate.subject);
      setBody(foundTemplate.body);
      setIsActive(foundTemplate.is_active);
    }
  }

  async function handleSave() {
    if (!template) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_templates')
        .update({
          subject,
          body,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        })
        .eq('id', template.id);

      if (error) throw error;

      toast.success('Email template saved successfully!');
      loadAllTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Failed to save email template');
    } finally {
      setSaving(false);
    }
  }

  function renderPreview(text: string): string {
    const sampleData = SAMPLE_DATA[selectedType] || {};
    let rendered = text;

    Object.entries(sampleData).forEach(([key, value]) => {
      const placeholder = `{{${key}}}`;
      rendered = rendered.split(placeholder).join(value);
    });

    return rendered;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading email templates...</div>
      </div>
    );
  }

  const selectedTemplateInfo = TEMPLATE_TYPES.find(t => t.value === selectedType);
  const groupedTemplates = TEMPLATE_TYPES.reduce((acc, template) => {
    if (!acc[template.category]) {
      acc[template.category] = [];
    }
    acc[template.category].push(template);
    return acc;
  }, {} as Record<string, typeof TEMPLATE_TYPES>);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
          <Mail className="w-5 h-5 text-blue-600" />
          Email Templates
        </h3>
        <p className="text-sm text-gray-600">
          Customize email templates for all automated communications.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="col-span-1 lg:col-span-1 space-y-1">
          {Object.entries(groupedTemplates).map(([category, templates]) => (
            <div key={category}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 py-2">
                {category}
              </div>
              {templates.map((tmpl) => (
                <button
                  key={tmpl.value}
                  onClick={() => setSelectedType(tmpl.value)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    selectedType === tmpl.value
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {tmpl.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="col-span-1 lg:col-span-3 space-y-6">
          {template ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold text-gray-900">
                    {selectedTemplateInfo?.label}
                  </h4>
                  <p className="text-sm text-gray-600">
                    {selectedTemplateInfo?.category}
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-medium mb-2">Available Placeholders:</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {selectedTemplateInfo?.placeholders.map((placeholder) => (
                        <div key={placeholder}>
                          <code className="bg-blue-100 px-1.5 py-0.5 rounded text-xs">
                            {placeholder}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter email subject..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Body
                  </label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={16}
                    placeholder="Enter email body content..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Use plain text. Line breaks will be preserved in the email.
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-3">
                <button
                  onClick={() => setShowPreview(true)}
                  disabled={!subject.trim() || !body.trim()}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !subject.trim() || !body.trim()}
                  className="inline-flex items-center justify-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Template'}</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-96 text-gray-500">
              Select a template to edit
            </div>
          )}
        </div>
      </div>

      {showPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Eye className="w-5 h-5 text-blue-600" />
                  Email Preview
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {selectedTemplateInfo?.label} with sample data
                </p>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="space-y-6">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="text-xs font-medium text-gray-500 mb-2">SUBJECT:</div>
                  <div className="text-base font-semibold text-gray-900">
                    {renderPreview(subject)}
                  </div>
                </div>

                <div className="bg-white rounded-lg p-6 border border-gray-300 shadow-sm">
                  <div className="text-xs font-medium text-gray-500 mb-4">EMAIL BODY:</div>
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-gray-900 leading-relaxed">
                      {renderPreview(body)}
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-medium mb-1">Sample Data Used:</p>
                      <p className="text-xs">
                        This preview uses sample data to show how the email will look when sent.
                        Actual emails will use real customer and system data.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowPreview(false)}
                className="px-6 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
