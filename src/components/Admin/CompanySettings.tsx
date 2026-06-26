import { useState, useEffect, useRef } from 'react';
import { Building2, Globe, Phone, Plus, Trash2, Save, Upload, X, MapPin, Mail, CreditCard, Loader2, Clock, Image } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { CompanySettings as CompanySettingsType, CompanyOffice } from '../../lib/types';
import { TIMEZONE_OPTIONS, clearTimezoneCache } from '../../lib/timezoneUtils';
import ConfirmModal from '../ui/ConfirmModal';

export function CompanySettings() {
  const [settings, setSettings] = useState<CompanySettingsType | null>(null);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingHeaderLogo, setUploadingHeaderLogo] = useState(false);
  const [uploadingFooterLogo, setUploadingFooterLogo] = useState(false);
  const [geocodingOfficeId, setGeocodingOfficeId] = useState<string | null>(null);
  const geocodeTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [appUrl, setAppUrl] = useState('');
  const [portalUrl, setPortalUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [headerLogoUrl, setHeaderLogoUrl] = useState('');
  const [footerLogoUrl, setFooterLogoUrl] = useState('');
  const [orgId, setOrgId] = useState<string | null>(null);
  const [timezone, setTimezone] = useState('America/Chicago');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [replyToEmail, setReplyToEmail] = useState('');
  const [photographerEmail, setPhotographerEmail] = useState('');
  const [ccFeeEnabled, setCcFeeEnabled] = useState(false);
  const [ccFeeType, setCcFeeType] = useState<'percentage' | 'flat'>('percentage');
  const [ccFeePercentage, setCcFeePercentage] = useState(3.0);
  const [ccFeeFlatAmount, setCcFeeFlatAmount] = useState(3.0);
  const [ccFeeLabel, setCcFeeLabel] = useState('Credit Card Convenience Fee');
  const [defaultInvoiceTermsAndConditions, setDefaultInvoiceTermsAndConditions] = useState('');

  const [portalProposalsEnabled, setPortalProposalsEnabled] = useState(true);
  const [portalProjectsEnabled, setPortalProjectsEnabled] = useState(false);
  const [portalAppointmentsEnabled, setPortalAppointmentsEnabled] = useState(false);
  const [portalInvoicesEnabled, setPortalInvoicesEnabled] = useState(false);
  const [portalMessagesEnabled, setPortalMessagesEnabled] = useState(false);
  const [portalVipServicesEnabled, setPortalVipServicesEnabled] = useState(false);
  const [portalTasksEnabled, setPortalTasksEnabled] = useState(true);
  const [portalSalesOrdersEnabled, setPortalSalesOrdersEnabled] = useState(true);
  const [enablePublicVipSignup, setEnablePublicVipSignup] = useState(false);

  // Project Task Auto-Completion Settings
  const [autoCompletionEnabled, setAutoCompletionEnabled] = useState(true);
  const [autoCompletionRequiresApproval, setAutoCompletionRequiresApproval] = useState(false);
  const [autoCompletionReopenOnDelete, setAutoCompletionReopenOnDelete] = useState(true);

  // Auto Clock-Out Settings
  const [autoClockOutEnabled, setAutoClockOutEnabled] = useState(false);
  const [autoClockOutCutoffTime, setAutoClockOutCutoffTime] = useState('22:00');
  const [autoClockOutTime, setAutoClockOutTime] = useState('16:00');
  const [forgotClockOutPenaltyPoints, setForgotClockOutPenaltyPoints] = useState(15);

  // Auto Review Follow-up Settings
  const [autoReviewFollowupEnabled, setAutoReviewFollowupEnabled] = useState(false);
  const [autoReviewFollowupDays, setAutoReviewFollowupDays] = useState(14);

  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const headerLogoInputRef = useRef<HTMLInputElement>(null);
  const footerLogoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
    loadOffices();
    loadOrganization();
  }, []);

  async function loadSettings() {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setSettings(data);
        setCompanyName(data.company_name);
        setWebsite(data.website || '');
        setAppUrl(data.app_url || '');
        setPortalUrl(data.portal_url || '');
        setLogoUrl(data.company_logo_url || '');
        setFromEmail(data.from_email || '');
        setFromName(data.from_name || '');
        setReplyToEmail(data.reply_to_email || '');
        setPhotographerEmail(data.photographer_email || '');
        setCcFeeEnabled(data.cc_convenience_fee_enabled || false);
        setCcFeeType(data.cc_convenience_fee_type || 'percentage');
        setCcFeePercentage(data.cc_convenience_fee_percentage ? Number(data.cc_convenience_fee_percentage) * 100 : 3.0);
        setCcFeeFlatAmount(data.cc_convenience_fee_flat_amount ? Number(data.cc_convenience_fee_flat_amount) : 3.0);
        setCcFeeLabel(data.cc_convenience_fee_label || 'Credit Card Convenience Fee');
        setDefaultInvoiceTermsAndConditions(data.default_invoice_terms_and_conditions || '');

        setPortalProposalsEnabled(data.portal_proposals_enabled ?? true);
        setPortalProjectsEnabled(data.portal_projects_enabled ?? false);
        setPortalAppointmentsEnabled(data.portal_appointments_enabled ?? false);
        setPortalInvoicesEnabled(data.portal_invoices_enabled ?? false);
        setPortalMessagesEnabled(data.portal_messages_enabled ?? false);
        setPortalVipServicesEnabled(data.portal_vip_services_enabled ?? false);
        setPortalTasksEnabled(data.portal_tasks_enabled ?? true);
        setPortalSalesOrdersEnabled(data.portal_sales_orders_enabled ?? true);
        setEnablePublicVipSignup(data.enable_public_vip_signup ?? false);

        // Auto-completion settings
        setAutoCompletionEnabled(data.auto_completion_enabled ?? true);
        setAutoCompletionRequiresApproval(data.auto_completion_requires_approval ?? false);
        setAutoCompletionReopenOnDelete(data.auto_completion_reopen_on_delete ?? true);

        // Auto clock-out settings
        setAutoClockOutEnabled(data.auto_clock_out_enabled ?? false);
        setAutoClockOutCutoffTime(data.auto_clock_out_cutoff_time ? String(data.auto_clock_out_cutoff_time).substring(0, 5) : '22:00');
        setAutoClockOutTime(data.auto_clock_out_time ? String(data.auto_clock_out_time).substring(0, 5) : '16:00');
        setForgotClockOutPenaltyPoints(data.forgot_clock_out_penalty_points ?? 15);

        // Auto review follow-up settings
        setAutoReviewFollowupEnabled(data.auto_review_followup_enabled ?? false);
        setAutoReviewFollowupDays(data.auto_review_followup_days ?? 14);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadOffices() {
    try {
      const { data, error } = await supabase
        .from('company_offices')
        .select('*')
        .order('display_order', { ascending: true });

      if (error) throw error;
      setOffices(data || []);
    } catch (error) {
      console.error('Error loading offices:', error);
    }
  }

  async function loadOrganization() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, timezone, header_logo_url, footer_logo_url')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        if (data.timezone) setTimezone(data.timezone);
        setOrgId(data.id);
        setHeaderLogoUrl(data.header_logo_url || '');
        setFooterLogoUrl(data.footer_logo_url || '');
      }
    } catch (error) {
      console.error('Error loading organization:', error);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;

      if (logoUrl) {
        const oldFileName = logoUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage
            .from('company_logo')
            .remove([oldFileName]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('company_logo')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('company_logo')
        .getPublicUrl(fileName);

      setLogoUrl(publicUrl);
      alert('Logo uploaded successfully! Click "Save Company Info" to apply changes.');
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function removeLogo() {
    if (!logoUrl) return;
    setConfirmModal({
      title: 'Remove Logo',
      message: 'Are you sure you want to remove the logo?',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fileName = logoUrl.split('/').pop();
          if (fileName) {
            await supabase.storage
              .from('company_logo')
              .remove([fileName]);
          }
          setLogoUrl('');
          alert('Logo removed! Click "Save Company Info" to apply changes.');
        } catch (error) {
          console.error('Error removing logo:', error);
          alert('Failed to remove logo');
        }
      },
    });
  }

  async function uploadBrandingLogo(
    file: File,
    field: 'header_logo_url' | 'footer_logo_url',
    currentUrl: string,
    setUrl: (url: string) => void,
    setUploading: (v: boolean) => void,
    inputRef: React.RefObject<HTMLInputElement>
  ) {
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${field}-${Date.now()}.${fileExt}`;

      if (currentUrl) {
        const oldFileName = currentUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage.from('company_logo').remove([oldFileName]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('company_logo')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('company_logo').getPublicUrl(fileName);

      if (orgId) {
        const { error: updateError } = await supabase
          .from('organizations')
          .update({ [field]: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', orgId);
        if (updateError) throw updateError;
      }

      setUrl(publicUrl);
      alert('Logo uploaded and saved successfully!');
    } catch (error) {
      console.error('Error uploading branding logo:', error);
      alert('Failed to upload logo');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function removeBrandingLogo(
    field: 'header_logo_url' | 'footer_logo_url',
    currentUrl: string,
    setUrl: (url: string) => void
  ) {
    if (!currentUrl) return;
    setConfirmModal({
      title: 'Remove Logo',
      message: 'Are you sure you want to remove this logo?',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const fileName = currentUrl.split('/').pop();
          if (fileName) {
            await supabase.storage.from('company_logo').remove([fileName]);
          }

          if (orgId) {
            await supabase
              .from('organizations')
              .update({ [field]: null, updated_at: new Date().toISOString() })
              .eq('id', orgId);
          }

          setUrl('');
          alert('Logo removed successfully!');
        } catch (error) {
          console.error('Error removing branding logo:', error);
          alert('Failed to remove logo');
        }
      },
    });
  }

  async function saveSettings() {
    setSaving(true);
    try {
      if (settings) {
        const { error } = await supabase
          .from('company_settings')
          .update({
            company_name: companyName,
            website: website,
            app_url: appUrl?.trim() || null,
            portal_url: portalUrl || null,
            company_logo_url: logoUrl || null,
            from_email: fromEmail?.trim() || null,
            from_name: fromName?.trim() || null,
            reply_to_email: replyToEmail?.trim() || null,
            photographer_email: photographerEmail?.trim() || null,
            cc_convenience_fee_enabled: ccFeeEnabled,
            cc_convenience_fee_type: ccFeeType,
            cc_convenience_fee_percentage: ccFeePercentage / 100,
            cc_convenience_fee_flat_amount: ccFeeFlatAmount,
            cc_convenience_fee_label: ccFeeLabel,
            portal_proposals_enabled: portalProposalsEnabled,
            portal_projects_enabled: portalProjectsEnabled,
            portal_appointments_enabled: portalAppointmentsEnabled,
            portal_invoices_enabled: portalInvoicesEnabled,
            portal_messages_enabled: portalMessagesEnabled,
            portal_vip_services_enabled: portalVipServicesEnabled,
            portal_tasks_enabled: portalTasksEnabled,
            portal_sales_orders_enabled: portalSalesOrdersEnabled,
            enable_public_vip_signup: enablePublicVipSignup,
            auto_completion_enabled: autoCompletionEnabled,
            auto_completion_requires_approval: autoCompletionRequiresApproval,
            auto_completion_reopen_on_delete: autoCompletionReopenOnDelete,
            auto_clock_out_enabled: autoClockOutEnabled,
            auto_clock_out_schedule_enabled: autoClockOutEnabled,
            auto_clock_out_cutoff_time: autoClockOutCutoffTime + ':00',
            auto_clock_out_time: autoClockOutTime + ':00',
            forgot_clock_out_penalty_points: forgotClockOutPenaltyPoints,
            auto_review_followup_enabled: autoReviewFollowupEnabled,
            auto_review_followup_days: autoReviewFollowupDays,
            default_invoice_terms_and_conditions: defaultInvoiceTermsAndConditions || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('company_settings')
          .insert({
            company_name: companyName,
            website: website,
            app_url: appUrl?.trim() || null,
            portal_url: portalUrl || null,
            company_logo_url: logoUrl || null,
            from_email: fromEmail?.trim() || null,
            from_name: fromName?.trim() || null,
            reply_to_email: replyToEmail?.trim() || null,
            photographer_email: photographerEmail?.trim() || null,
            cc_convenience_fee_enabled: ccFeeEnabled,
            cc_convenience_fee_type: ccFeeType,
            cc_convenience_fee_percentage: ccFeePercentage / 100,
            cc_convenience_fee_flat_amount: ccFeeFlatAmount,
            cc_convenience_fee_label: ccFeeLabel,
            portal_proposals_enabled: portalProposalsEnabled,
            portal_projects_enabled: portalProjectsEnabled,
            portal_appointments_enabled: portalAppointmentsEnabled,
            portal_invoices_enabled: portalInvoicesEnabled,
            portal_messages_enabled: portalMessagesEnabled,
            portal_vip_services_enabled: portalVipServicesEnabled,
            portal_tasks_enabled: portalTasksEnabled,
            portal_sales_orders_enabled: portalSalesOrdersEnabled,
            enable_public_vip_signup: enablePublicVipSignup,
            auto_completion_enabled: autoCompletionEnabled,
            auto_completion_requires_approval: autoCompletionRequiresApproval,
            auto_completion_reopen_on_delete: autoCompletionReopenOnDelete,
            auto_clock_out_enabled: autoClockOutEnabled,
            auto_clock_out_schedule_enabled: autoClockOutEnabled,
            auto_clock_out_cutoff_time: autoClockOutCutoffTime + ':00',
            auto_clock_out_time: autoClockOutTime + ':00',
            forgot_clock_out_penalty_points: forgotClockOutPenaltyPoints,
            auto_review_followup_enabled: autoReviewFollowupEnabled,
            auto_review_followup_days: autoReviewFollowupDays,
            default_invoice_terms_and_conditions: defaultInvoiceTermsAndConditions || null,
          });

        if (error) throw error;
      }

      window.location.reload();

      // Save timezone to organizations table
      await saveTimezone();

      clearTimezoneCache();

      alert('Company settings saved successfully');
      loadSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function saveTimezone() {
    try {
      const { data: org, error: fetchError } = await supabase
        .from('organizations')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (org) {
        const { error } = await supabase
          .from('organizations')
          .update({
            timezone: timezone,
            updated_at: new Date().toISOString()
          })
          .eq('id', org.id);

        if (error) throw error;
      }
    } catch (error) {
      console.error('Error saving timezone:', error);
      throw error;
    }
  }

  async function updateOffice(office: CompanyOffice) {
    try {
      const { error } = await supabase
        .from('company_offices')
        .update({
          office_name: office.office_name,
          phone: office.phone,
          address_line1: office.address_line1,
          address_line2: office.address_line2,
          city: office.city,
          state: office.state,
          zip: office.zip,
          latitude: office.latitude,
          longitude: office.longitude,
          display_order: office.display_order,
          updated_at: new Date().toISOString()
        })
        .eq('id', office.id);

      if (error) throw error;
      alert('Office updated successfully');
    } catch (error) {
      console.error('Error updating office:', error);
      alert('Failed to update office');
    }
  }

  async function addOffice() {
    try {
      const maxOrder = Math.max(...offices.map(o => o.display_order), 0);
      const { error } = await supabase
        .from('company_offices')
        .insert({
          office_name: 'New Office',
          display_order: maxOrder + 1,
        });

      if (error) throw error;
      loadOffices();
    } catch (error) {
      console.error('Error adding office:', error);
      alert('Failed to add office');
    }
  }

  function deleteOffice(id: string) {
    setConfirmModal({
      title: 'Delete Office',
      message: 'Are you sure you want to delete this office?',
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const { error } = await supabase
            .from('company_offices')
            .delete()
            .eq('id', id);

          if (error) throw error;
          loadOffices();
        } catch (error) {
          console.error('Error deleting office:', error);
          alert('Failed to delete office');
        }
      },
    });
  }

  async function geocodeOfficeAddress(office: CompanyOffice) {
    if (!office.address_line1 || !office.city || !office.state || !office.zip) {
      return;
    }

    const apiKey = settings?.google_maps_api_key;
    if (!apiKey) {
      return;
    }

    setGeocodingOfficeId(office.id);

    try {
      const addressParts = [
        office.address_line1,
        office.address_line2,
        office.city,
        office.state,
        office.zip
      ].filter(Boolean);

      const fullAddress = addressParts.join(', ');

      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${apiKey}`
      );

      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const location = data.results[0].geometry.location;

        const updated = offices.map(o =>
          o.id === office.id
            ? { ...o, latitude: location.lat, longitude: location.lng }
            : o
        );
        setOffices(updated);
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
    } finally {
      setGeocodingOfficeId(null);
    }
  }

  function handleAddressChange(officeId: string, field: keyof CompanyOffice, value: string) {
    const updated = offices.map(o =>
      o.id === officeId ? { ...o, [field]: value } : o
    );
    setOffices(updated);

    // Clear existing timeout for this office
    if (geocodeTimeoutRef.current[officeId]) {
      clearTimeout(geocodeTimeoutRef.current[officeId]);
    }

    // Set new timeout to geocode after 1 second of no typing
    geocodeTimeoutRef.current[officeId] = setTimeout(() => {
      const office = updated.find(o => o.id === officeId);
      if (office) {
        geocodeOfficeAddress(office);
      }
    }, 1000);
  }

  if (loading) {
    return <div className="text-center py-8">Loading settings...</div>;
  }

  return (
    <>
    <ConfirmModal
      isOpen={!!confirmModal}
      title={confirmModal?.title || ''}
      message={confirmModal?.message || ''}
      variant="danger"
      onConfirm={() => confirmModal?.onConfirm()}
      onCancel={() => setConfirmModal(null)}
    />
    <div className="space-y-6">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Company Settings</h2>
        <p className="text-gray-300">Manage company information displayed on business cards</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Building2 className="w-5 h-5" />
          Company Information
        </h3>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Globe className="w-4 h-4 inline mr-1" />
            Website
          </label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://www.example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Globe className="w-4 h-4 inline mr-1" />
            App URL
          </label>
          <input
            type="url"
            value={appUrl}
            onChange={(e) => setAppUrl(e.target.value)}
            placeholder="https://app.example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            The URL of your main application. Used in satisfaction survey email links and other internal notifications.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Globe className="w-4 h-4 inline mr-1" />
            Portal URL
          </label>
          <input
            type="url"
            value={portalUrl}
            onChange={(e) => setPortalUrl(e.target.value)}
            placeholder="https://portal.example.com"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">
            The URL where your customers access the portal. Used in email links and notifications.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <Clock className="w-4 h-4 inline mr-1" />
            Company Timezone *
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            All times in the system will use this timezone. Affects time clock entries, reports, and scheduling.
          </p>
          <p className="text-xs text-amber-600 mt-1 font-medium">
            ⚠️ Changing timezone will affect how times are displayed. Existing timestamps remain accurate.
          </p>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-4">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Settings (Resend)
          </h4>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-900">
              <strong>Important:</strong> The "From Email" must use a domain you've verified in Resend.
              Don't forget to add your Resend API key to Supabase Edge Functions secrets.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Email Address *
            </label>
            <input
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="proposals@yourdomain.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Must be from a domain verified in Resend (e.g., proposals@yourdomain.com)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Name
            </label>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Your Company Name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              The display name shown in emails (e.g., "Acme Security")
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply-To Email
            </label>
            <input
              type="email"
              value={replyToEmail}
              onChange={(e) => setReplyToEmail(e.target.value)}
              placeholder="support@yourdomain.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Where customers should reply (optional, defaults to From Email)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Photographer Email
            </label>
            <input
              type="email"
              value={photographerEmail}
              onChange={(e) => setPhotographerEmail(e.target.value)}
              placeholder="photographer@yourdomain.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Where paparazzi photo requests will be sent (optional)
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Company Logo
          </label>

          {logoUrl && (
            <div className="mb-3 flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
              <img
                src={logoUrl}
                alt="Company Logo"
                className="h-16 w-auto object-contain"
              />
              <button
                onClick={removeLogo}
                className="ml-auto p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                title="Remove logo"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="hidden"
              id="logo-upload"
            />
            <label
              htmlFor="logo-upload"
              className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploading
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {uploading ? 'Uploading...' : 'Upload Logo Image'}
              </span>
            </label>
            <p className="text-xs text-gray-500">
              PNG, JPG or GIF. Max 5MB. Recommended: 400x100px or similar aspect ratio.
            </p>
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4 space-y-6">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <Image className="w-5 h-5" />
            App Branding
          </h4>
          <p className="text-sm text-gray-500 -mt-3">
            Upload your company logo for the header and footer. The MyJobView logo is used as a
            placeholder until you upload your own.
          </p>

          {/* Header Logo */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Header Logo</label>
            <p className="text-xs text-gray-500">Shown in the top navigation bar. Recommended: wide/horizontal format (e.g. 300x80px).</p>
            {headerLogoUrl && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <img src={headerLogoUrl} alt="Header Logo" className="h-10 w-auto object-contain" />
                <button
                  onClick={() => removeBrandingLogo('header_logo_url', headerLogoUrl, setHeaderLogoUrl)}
                  className="ml-auto p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove header logo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <input
              ref={headerLogoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadBrandingLogo(file, 'header_logo_url', headerLogoUrl, setHeaderLogoUrl, setUploadingHeaderLogo, headerLogoInputRef);
              }}
              className="hidden"
              id="header-logo-upload"
            />
            <label
              htmlFor="header-logo-upload"
              className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploadingHeaderLogo
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {uploadingHeaderLogo ? 'Uploading...' : headerLogoUrl ? 'Replace Header Logo' : 'Upload Header Logo'}
              </span>
            </label>
          </div>

          {/* Footer Logo */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Footer Logo</label>
            <p className="text-xs text-gray-500">Shown in the bottom footer strip. Recommended: wide/horizontal format (e.g. 300x80px).</p>
            {footerLogoUrl && (
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <img src={footerLogoUrl} alt="Footer Logo" className="h-8 w-auto object-contain" />
                <button
                  onClick={() => removeBrandingLogo('footer_logo_url', footerLogoUrl, setFooterLogoUrl)}
                  className="ml-auto p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  title="Remove footer logo"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <input
              ref={footerLogoInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadBrandingLogo(file, 'footer_logo_url', footerLogoUrl, setFooterLogoUrl, setUploadingFooterLogo, footerLogoInputRef);
              }}
              className="hidden"
              id="footer-logo-upload"
            />
            <label
              htmlFor="footer-logo-upload"
              className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                uploadingFooterLogo
                  ? 'border-gray-300 bg-gray-50 cursor-not-allowed'
                  : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
              }`}
            >
              <Upload className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-700">
                {uploadingFooterLogo ? 'Uploading...' : footerLogoUrl ? 'Replace Footer Logo' : 'Upload Footer Logo'}
              </span>
            </label>
          </div>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Company Info'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5" />
          Payment Settings
        </h3>

        <div className="border border-gray-200 rounded-lg p-4 space-y-4">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="cc-fee-enabled"
              checked={ccFeeEnabled}
              onChange={(e) => setCcFeeEnabled(e.target.checked)}
              className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="cc-fee-enabled" className="font-medium text-gray-900 cursor-pointer">
                Enable Credit Card Convenience Fee
              </label>
              <p className="text-sm text-gray-600 mt-1">
                Automatically add a convenience fee when customers pay invoices with a credit card.
                No fee is charged for ACH, check, or cash payments.
              </p>
            </div>
          </div>

          {ccFeeEnabled && (
            <div className="space-y-4 pl-7">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fee Type
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="percentage"
                      checked={ccFeeType === 'percentage'}
                      onChange={(e) => setCcFeeType(e.target.value as 'percentage' | 'flat')}
                      className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Percentage of invoice amount</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      value="flat"
                      checked={ccFeeType === 'flat'}
                      onChange={(e) => setCcFeeType(e.target.value as 'percentage' | 'flat')}
                      className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Flat dollar amount</span>
                  </label>
                </div>
              </div>

              {ccFeeType === 'percentage' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Percentage Fee (%)
                  </label>
                  <input
                    type="number"
                    value={ccFeePercentage}
                    onChange={(e) => setCcFeePercentage(Number(e.target.value))}
                    step="0.1"
                    min="0"
                    max="100"
                    className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Common range: 2.5% - 3.5%. Example: 3% fee on $1,000 invoice = $30.00
                  </p>
                </div>
              )}

              {ccFeeType === 'flat' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Flat Fee Amount ($)
                  </label>
                  <input
                    type="number"
                    value={ccFeeFlatAmount}
                    onChange={(e) => setCcFeeFlatAmount(Number(e.target.value))}
                    step="0.01"
                    min="0"
                    className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Fixed fee charged regardless of invoice amount
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fee Label (appears on invoice/receipt)
                </label>
                <input
                  type="text"
                  value={ccFeeLabel}
                  onChange={(e) => setCcFeeLabel(e.target.value)}
                  placeholder="Credit Card Convenience Fee"
                  className="w-full max-w-lg px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Customize how this fee appears to customers
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  <strong>Preview:</strong> When a customer pays a $1,000 invoice with a credit card,
                  {ccFeeType === 'percentage'
                    ? ` they will be charged an additional ${formatCurrency(1000 * (ccFeePercentage / 100))} (${ccFeePercentage}%).`
                    : ` they will be charged an additional ${formatCurrency(ccFeeFlatAmount)}.`
                  }
                  {' '}Total: {formatCurrency(ccFeeType === 'percentage'
                    ? 1000 + (1000 * (ccFeePercentage / 100))
                    : 1000 + ccFeeFlatAmount
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Default Invoice Terms &amp; Conditions
          </label>
          <p className="text-xs text-gray-500">
            This text will automatically appear at the bottom of every printed invoice. It is not editable by staff on individual invoices.
          </p>
          <textarea
            value={defaultInvoiceTermsAndConditions}
            onChange={(e) => setDefaultInvoiceTermsAndConditions(e.target.value)}
            rows={5}
            placeholder="e.g. Payment is due within 30 days. Late payments are subject to a 1.5% monthly finance charge..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Payment Settings'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Globe className="w-5 h-5" />
          Customer Portal Visibility
        </h3>
        <p className="text-sm text-gray-600">
          Control which sections are visible to customers in the portal. Use this to enable features as you're ready to launch them.
        </p>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-proposals"
              checked={portalProposalsEnabled}
              onChange={(e) => setPortalProposalsEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-proposals" className="font-medium text-gray-900 cursor-pointer">
                Proposals
              </label>
              <p className="text-sm text-gray-600">Allow customers to view and approve proposals</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-tasks"
              checked={portalTasksEnabled}
              onChange={(e) => setPortalTasksEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-tasks" className="font-medium text-gray-900 cursor-pointer">
                Tasks
              </label>
              <p className="text-sm text-gray-600">Allow customers to submit and track punchlist items</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-sales-orders"
              checked={portalSalesOrdersEnabled}
              onChange={(e) => setPortalSalesOrdersEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-sales-orders" className="font-medium text-gray-900 cursor-pointer">
                Projects
              </label>
              <p className="text-sm text-gray-600">Allow customers to view their approved projects</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-projects"
              checked={portalProjectsEnabled}
              onChange={(e) => setPortalProjectsEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-projects" className="font-medium text-gray-900 cursor-pointer">
                Projects
              </label>
              <p className="text-sm text-gray-600">Allow customers to view active project details and status</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-appointments"
              checked={portalAppointmentsEnabled}
              onChange={(e) => setPortalAppointmentsEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-appointments" className="font-medium text-gray-900 cursor-pointer">
                Appointments
              </label>
              <p className="text-sm text-gray-600">Allow customers to view and schedule appointments</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-invoices"
              checked={portalInvoicesEnabled}
              onChange={(e) => setPortalInvoicesEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-invoices" className="font-medium text-gray-900 cursor-pointer">
                Invoices
              </label>
              <p className="text-sm text-gray-600">Allow customers to view and pay invoices</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-messages"
              checked={portalMessagesEnabled}
              onChange={(e) => setPortalMessagesEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-messages" className="font-medium text-gray-900 cursor-pointer">
                Messages
              </label>
              <p className="text-sm text-gray-600">Allow customers to send and receive messages</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="portal-vip-services"
              checked={portalVipServicesEnabled}
              onChange={(e) => setPortalVipServicesEnabled(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="portal-vip-services" className="font-medium text-gray-900 cursor-pointer">
                VIP Services
              </label>
              <p className="text-sm text-gray-600">Allow VIP customers to view upcoming service appointments</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded-lg border-2 border-yellow-300">
            <input
              type="checkbox"
              id="enable-public-vip-signup"
              checked={enablePublicVipSignup}
              onChange={(e) => setEnablePublicVipSignup(e.target.checked)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1">
              <label htmlFor="enable-public-vip-signup" className="font-medium text-gray-900 cursor-pointer">
                Enable Public VIP Self-Signup
              </label>
              <p className="text-sm text-gray-600">
                Allow anonymous customers to sign up for VIP memberships on their own.
                When disabled, the public VIP page shows "Coming Soon" and customers can only join via punchlist invites or contact you directly.
              </p>
            </div>
          </div>
        </div>

        {/* Project Task Auto-Completion Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-6 h-6 text-blue-600" />
            Project Task Auto-Completion
          </h2>
          <p className="text-sm text-gray-600">
            Configure how project tasks are automatically marked complete when technicians finish work orders.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="auto-completion-enabled"
                checked={autoCompletionEnabled}
                onChange={(e) => setAutoCompletionEnabled(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex-1">
                <label htmlFor="auto-completion-enabled" className="font-medium text-gray-900 cursor-pointer">
                  Enable Auto-Completion
                </label>
                <p className="text-sm text-gray-600">
                  Automatically mark project tasks as complete when a technician completes them on a work order.
                  This eliminates duplicate manual tracking.
                </p>
              </div>
            </div>

            {autoCompletionEnabled && (
              <>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg ml-6">
                  <input
                    type="checkbox"
                    id="auto-completion-requires-approval"
                    checked={autoCompletionRequiresApproval}
                    onChange={(e) => setAutoCompletionRequiresApproval(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="auto-completion-requires-approval" className="font-medium text-gray-900 cursor-pointer">
                      Require Supervisor Approval
                    </label>
                    <p className="text-sm text-gray-600">
                      Prevent automatic completion and require a supervisor/manager to manually mark tasks complete.
                      Use this if you need quality control before marking tasks done.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg ml-6">
                  <input
                    type="checkbox"
                    id="auto-completion-reopen-on-delete"
                    checked={autoCompletionReopenOnDelete}
                    onChange={(e) => setAutoCompletionReopenOnDelete(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="auto-completion-reopen-on-delete" className="font-medium text-gray-900 cursor-pointer">
                      Reopen on Delete
                    </label>
                    <p className="text-sm text-gray-600">
                      Automatically reopen a project task if all technician completions are deleted.
                      Disable this if you want tasks to stay marked complete once done.
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900">
              <strong>How it works:</strong> When you create project work orders and add tasks from a labor phase,
              those tasks are linked to the project's master task list. As technicians complete tasks on their work orders,
              the system automatically marks the master project task as complete (using the "first completion wins\" strategy).
              This gives you real-time visibility into project progress without duplicate tracking.
            </p>
          </div>
        </div>

        {/* Auto Clock-Out Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-orange-600" />
            Auto Clock-Out
          </h2>
          <p className="text-sm text-gray-600">
            Automatically clock out employees who forget to clock out. Runs nightly after the cutoff time.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="auto-clock-out-enabled"
                checked={autoClockOutEnabled}
                onChange={(e) => setAutoClockOutEnabled(e.target.checked)}
                className="w-5 h-5 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex-1">
                <label htmlFor="auto-clock-out-enabled" className="font-medium text-gray-900 cursor-pointer">
                  Enable Auto Clock-Out
                </label>
                <p className="text-sm text-gray-600">
                  Any employee still clocked in after the cutoff time will be automatically clocked out nightly.
                </p>
              </div>
            </div>

            {autoClockOutEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 ml-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cutoff Time
                  </label>
                  <input
                    type="time"
                    value={autoClockOutCutoffTime}
                    onChange={(e) => setAutoClockOutCutoffTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Anyone still clocked in after this time gets auto-clocked-out
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Clock-Out Time
                  </label>
                  <input
                    type="time"
                    value={autoClockOutTime}
                    onChange={(e) => setAutoClockOutTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Time used for the clock-out (e.g. end of shift)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Penalty Points
                  </label>
                  <input
                    type="number"
                    value={forgotClockOutPenaltyPoints}
                    onChange={(e) => setForgotClockOutPenaltyPoints(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Points deducted for forgetting to clock out
                  </p>
                </div>
              </div>
            )}
          </div>

          {autoClockOutEnabled && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="text-sm text-orange-900">
                <strong>How it works:</strong> Every night at 11:00 PM (your timezone), the system checks for anyone still clocked in past the cutoff time.
                They are clocked out at the configured clock-out time, {forgotClockOutPenaltyPoints} points are deducted, and admins are notified for approval before payroll.
              </p>
            </div>
          )}
        </div>

        {/* Auto Review Follow-up Settings */}
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-yellow-600" />
            Automated Review Follow-ups
          </h2>
          <p className="text-sm text-gray-600">
            Automatically re-send review requests and satisfaction surveys to customers who haven't responded after a set number of days. Each customer receives at most one automated follow-up.
          </p>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <input
                type="checkbox"
                id="auto-review-followup-enabled"
                checked={autoReviewFollowupEnabled}
                onChange={(e) => setAutoReviewFollowupEnabled(e.target.checked)}
                className="w-5 h-5 text-yellow-600 rounded focus:ring-2 focus:ring-yellow-500"
              />
              <div className="flex-1">
                <label htmlFor="auto-review-followup-enabled" className="font-medium text-gray-900 cursor-pointer">
                  Enable Automated Follow-ups
                </label>
                <p className="text-sm text-gray-600">
                  Sends a follow-up email to customers who haven't responded to a review request or satisfaction survey.
                </p>
              </div>
            </div>

            {autoReviewFollowupEnabled && (
              <div className="ml-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Follow-up delay (days)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    value={autoReviewFollowupDays}
                    onChange={(e) => setAutoReviewFollowupDays(Math.max(1, Number(e.target.value)))}
                    min={1}
                    max={90}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-600">days after the original send with no response</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Default is 14 days. The follow-up runs once daily at 9:00 AM UTC.
                </p>
              </div>
            )}
          </div>

          {autoReviewFollowupEnabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-900">
                <strong>How it works:</strong> Every day at 9:00 AM UTC the system checks for unanswered review requests and satisfaction surveys that were sent {autoReviewFollowupDays}+ days ago.
                A single follow-up email is sent to each qualifying customer, then that record is stamped so it never fires again.
              </p>
            </div>
          )}
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Portal Settings'}
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Office Locations
          </h3>
          <button
            onClick={addOffice}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add Office
          </button>
        </div>

        <div className="space-y-4">
          {offices.map((office, index) => (
            <div key={office.id} className="border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Office {index + 1}</h4>
                <button
                  onClick={() => deleteOffice(office.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Office Name
                  </label>
                  <input
                    type="text"
                    value={office.office_name}
                    onChange={(e) => {
                      const updated = offices.map(o =>
                        o.id === office.id ? { ...o, office_name: e.target.value } : o
                      );
                      setOffices(updated);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Phone className="w-4 h-4 inline mr-1" />
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={office.phone || ''}
                    onChange={(e) => {
                      const updated = offices.map(o =>
                        o.id === office.id ? { ...o, phone: e.target.value } : o
                      );
                      setOffices(updated);
                    }}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 1
                  </label>
                  <input
                    type="text"
                    value={office.address_line1 || ''}
                    onChange={(e) => handleAddressChange(office.id, 'address_line1', e.target.value)}
                    placeholder="123 Main Street"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Line 2
                  </label>
                  <input
                    type="text"
                    value={office.address_line2 || ''}
                    onChange={(e) => handleAddressChange(office.id, 'address_line2', e.target.value)}
                    placeholder="Suite 100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={office.city || ''}
                    onChange={(e) => handleAddressChange(office.id, 'city', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={office.state || ''}
                      onChange={(e) => handleAddressChange(office.id, 'state', e.target.value)}
                      placeholder="LA"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP
                    </label>
                    <input
                      type="text"
                      value={office.zip || ''}
                      onChange={(e) => handleAddressChange(office.id, 'zip', e.target.value)}
                      placeholder="70501"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-blue-900 font-medium flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      GPS Coordinates (Required for Travel Bonus)
                    </p>
                    {geocodingOfficeId === office.id && (
                      <div className="flex items-center gap-1 text-xs text-green-700">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Auto-setting...
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-blue-700 mb-3">
                    Coordinates auto-populate from address. Edit manually if needed.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Latitude
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={office.latitude || ''}
                        onChange={(e) => {
                          const updated = offices.map(o =>
                            o.id === office.id ? { ...o, latitude: e.target.value ? parseFloat(e.target.value) : null } : o
                          );
                          setOffices(updated);
                        }}
                        placeholder="30.224949"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Longitude
                      </label>
                      <input
                        type="number"
                        step="0.000001"
                        value={office.longitude || ''}
                        onChange={(e) => {
                          const updated = offices.map(o =>
                            o.id === office.id ? { ...o, longitude: e.target.value ? parseFloat(e.target.value) : null } : o
                          );
                          setOffices(updated);
                        }}
                        placeholder="-92.019868"
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => updateOffice(office)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
              >
                <Save className="w-4 h-4" />
                Save Office
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}
