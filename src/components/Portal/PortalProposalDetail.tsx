import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, XCircle, MessageSquare, Download, AlertCircle, Clock, DollarSign, Package, FileText, Layers, Video, Play, Pause, ChevronDown, ChevronUp, CreditCard, Printer, Phone, Mail, HelpCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { ProposalApprovalModal } from './ProposalApprovalModal';
import { ProposalQA } from '../Proposals/ProposalQA';
import { buildPortalInvoicePrintHTML, openInvoicePrint, type PrintableCompanyInfo } from '../../lib/portalInvoicePrint';

interface ProposalRecording {
  id: string;
  title: string;
  description: string | null;
  recording_scope: 'full_proposal' | 'area';
  room_id: string | null;
  storage_path: string | null;
  video_url: string | null;
  duration_seconds: number | null;
  sort_order: number;
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VideoPlayer({ recording, signedUrl, logoUrl }: { recording: ProposalRecording; signedUrl?: string; logoUrl?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  const videoSrc = recording.storage_path ? signedUrl : recording.video_url || undefined;

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
      setPlaying(false);
    } else {
      videoRef.current.play();
      setPlaying(true);
    }
  };

  if (!videoSrc) return null;

  return (
    <div className="rounded-xl overflow-hidden border border-blue-200 bg-gradient-to-br from-blue-950 to-gray-900 shadow-lg">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Video className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-tight">{recording.title}</p>
            {recording.description && (
              <p className="text-xs text-blue-300 mt-0.5 leading-tight">{recording.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {recording.duration_seconds != null && (
            <span className="text-xs text-blue-300 font-mono">{formatDuration(recording.duration_seconds)}</span>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {expanded ? 'Collapse' : 'Play Video'}
          </button>
        </div>
      </div>

      {/* Video */}
      {expanded && (
        <div className="relative aspect-video bg-black">
          <video
            ref={videoRef}
            src={videoSrc}
            controls
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            autoPlay
            className="w-full h-full"
          />
          {logoUrl && (
            <div className="absolute bottom-12 right-3 pointer-events-none z-10">
              <div className="bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1.5 shadow-lg">
                <img
                  src={logoUrl}
                  alt="Company logo"
                  className="h-7 w-auto max-w-[80px] object-contain opacity-85"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Proposal {
  id: string;
  proposal_number: string;
  title: string;
  status: string;
  total: number;
  subtotal: number;
  tax_amount: number;
  deposit_amount_due: number;
  deposit_percent: number;
  require_deposit: boolean | null;
  deposit_paid: boolean | null;
  deposit_request_sent: boolean | null;
  deposit_invoice_id: string | null;
  created_at: string;
  valid_until: string | null;
  expires_at: string | null;
  notes: string | null;
  revision_notes: string | null;
  renewal_count: number;
  discount_amount: number;
  project_management_amount: number;
  current_portal_version?: number | null;
}

interface ProposalRoom {
  id: string;
  name: string;
  sort_order: number;
  description: string | null;
  show_scope: boolean;
}

interface LineItem {
  id: string;
  room_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  labor_hours: number | null;
  labor_rate: number | null;
  labor_total: number | null;
  is_hidden: boolean;
  parent_item_id: string | null;
  product_id: string | null;
  products: { image_url: string | null } | null;
}

interface ReportTemplate {
  show_quantity: boolean;
  show_unit_price: boolean;
  show_line_item_total: boolean;
  show_manufacturer: boolean;
  show_sku: boolean;
  show_model_number: boolean;
  show_labor_hours: boolean;
  show_labor_rate: boolean;
  show_labor_total: boolean;
  show_area_descriptions: boolean;
  show_area_subtotals: boolean;
  show_tax_breakdown: boolean;
  show_accepted_payment_methods: boolean;
  show_payment_instructions: boolean;
  show_product_images: boolean;
}

interface PortalInvoice {
  id: string;
  invoice_number: string;
  invoice_title: string | null;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  qbo_invoice_id: string | null;
  invoice_type: string | null;
  billing_name: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
}

interface PortalProposalDetailProps {
  proposalId: string;
  onBack: () => void;
  /** Label for the back button (default: "Proposals") */
  backLabel?: string;
  /** When true, skip activity tracking and status updates (internal preview use) */
  previewMode?: boolean;
  /** Override the template used for display (internal preview use) */
  templateOverrideId?: string | null;
  /** When true, suppress expiration checks and validity dates (Sales Order context) */
  hideExpiration?: boolean;
  /** Override the display number shown in the header (e.g. Sales Order number instead of proposal number) */
  overrideDisplayNumber?: string;
}

export function PortalProposalDetail({ proposalId, onBack, backLabel, previewMode = false, templateOverrideId, hideExpiration = false, overrideDisplayNumber }: PortalProposalDetailProps) {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [rooms, setRooms] = useState<ProposalRoom[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [comment, setComment] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showQA, setShowQA] = useState(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [animate, setAnimate] = useState(false);
  const [template, setTemplate] = useState<ReportTemplate | null>(null);
  const [recordings, setRecordings] = useState<ProposalRecording[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [orgLogoUrl, setOrgLogoUrl] = useState<string | null>(null);
  const [relatedInvoices, setRelatedInvoices] = useState<PortalInvoice[]>([]);
  const [printingInvoiceId, setPrintingInvoiceId] = useState<string | null>(null);
  const [paymentUnavailableInvoice, setPaymentUnavailableInvoice] = useState<PortalInvoice | null>(null);
  const [qaContext, setQaContext] = useState<{ roomId: string | null; lineItemId: string | null; label: string | null }>({ roomId: null, lineItemId: null, label: null });

  useEffect(() => {
    loadProposalDetails();
    if (!previewMode) trackProposalView();
    setTimeout(() => setAnimate(true), 100);
  }, [proposalId]);

  async function trackProposalDownload() {
    if (previewMode) return;
    try {
      let clientInfo = {
        ip: 'Unknown',
        userAgent: navigator.userAgent,
        deviceType: 'desktop',
        browser: 'Unknown',
        os: 'Unknown'
      };
      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        if (response.ok) {
          const data = await response.json();
          clientInfo = { ...clientInfo, ...data };
        }
      } catch {}
      await supabase.from('proposal_activity').insert({
        proposal_id: proposalId,
        activity_type: 'downloaded',
        user_agent: clientInfo.userAgent,
        ip_address: clientInfo.ip,
        metadata: {
          timestamp: new Date().toISOString(),
          deviceType: clientInfo.deviceType,
          browser: clientInfo.browser,
          os: clientInfo.os
        }
      });
    } catch {}
  }

  async function trackProposalView() {
    try {
      // Get client IP and device information from edge function
      let clientInfo = {
        ip: 'Unknown',
        userAgent: navigator.userAgent,
        deviceType: 'desktop',
        browser: 'Unknown',
        os: 'Unknown'
      };

      try {
        const { data: { supabaseUrl } } = await supabase.auth.getSession();
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-client-ip`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          }
        });

        if (response.ok) {
          const data = await response.json();
          clientInfo = { ...clientInfo, ...data };
        }
      } catch (ipError) {
        console.error('Failed to get IP information:', ipError);
        // Continue with default values
      }

      // Insert activity record with IP and device information
      await supabase.from('proposal_activity').insert({
        proposal_id: proposalId,
        activity_type: 'viewed',
        user_agent: clientInfo.userAgent,
        ip_address: clientInfo.ip,
        metadata: {
          timestamp: new Date().toISOString(),
          deviceType: clientInfo.deviceType,
          browser: clientInfo.browser,
          os: clientInfo.os
        }
      });

      // Update proposal status from 'sent' to 'portal' (skip in preview mode)
      if (!previewMode) {
        await supabase
          .from('proposals')
          .update({ status: 'portal' })
          .eq('id', proposalId)
          .eq('status', 'sent');
      }
    } catch (error) {
      console.error('Error tracking view:', error);
    }
  }

  async function loadProposalDetails() {
    try {
      const [proposalRes, roomsRes, itemsRes] = await Promise.all([
        supabase
          .from('proposals')
          .select(`
            *,
            contacts:contacts!proposals_contact_id_fkey(full_name, contact_name, first_name, last_name)
          `)
          .eq('id', proposalId)
          .maybeSingle(),
        supabase
          .from('proposal_rooms')
          .select('*')
          .eq('proposal_id', proposalId)
          .order('sort_order'),
        supabase
          .from('proposal_line_items')
          .select('*, products(image_url)')
          .eq('proposal_id', proposalId)
          .order('sort_order'),
      ]);

      if (proposalRes.error) throw proposalRes.error;
      if (roomsRes.error) throw roomsRes.error;
      if (itemsRes.error) throw itemsRes.error;

      if (proposalRes.data) {
        setProposal(proposalRes.data);
        setRooms(roomsRes.data || []);
        setLineItems(itemsRes.data || []);

        // Fetch organization logo for video overlay
        if (proposalRes.data.organization_id) {
          supabase
            .from('organizations')
            .select('header_logo_url')
            .eq('id', proposalRes.data.organization_id)
            .maybeSingle()
            .then(({ data: orgData }) => {
              if (orgData?.header_logo_url) setOrgLogoUrl(orgData.header_logo_url);
            });
        }

        // Load template settings — use override ID (from sales order) if provided, else fall back to proposal's own template
        const effectiveTemplateId = templateOverrideId !== undefined ? templateOverrideId : proposalRes.data.report_template_id;
        if (effectiveTemplateId) {
          const { data: templateData, error: templateError } = await supabase
            .from('proposal_report_templates')
            .select('*')
            .eq('id', effectiveTemplateId)
            .maybeSingle();

          if (!templateError && templateData) {
            setTemplate(templateData);
          } else {
            console.log('No template found, using default display (show all)');
            // Default to showing everything
            setTemplate({
              show_quantity: true,
              show_unit_price: true,
              show_line_item_total: true,
              show_manufacturer: true,
              show_sku: true,
              show_model_number: true,
              show_labor_hours: true,
              show_labor_rate: true,
              show_labor_total: true,
              show_area_descriptions: true,
              show_area_subtotals: true,
              show_tax_breakdown: true,
              show_accepted_payment_methods: true,
              show_payment_instructions: true,
              show_product_images: true,
            });
          }
        } else {
          // No template assigned, show everything
          setTemplate({
            show_quantity: true,
            show_unit_price: true,
            show_line_item_total: true,
            show_manufacturer: true,
            show_sku: true,
            show_model_number: true,
            show_labor_hours: true,
            show_labor_rate: true,
            show_labor_total: true,
            show_area_descriptions: true,
            show_area_subtotals: true,
            show_tax_breakdown: true,
            show_accepted_payment_methods: true,
            show_payment_instructions: true,
            show_product_images: true,
          });
        }

        if (proposalRes.data.contacts) {
          const name = proposalRes.data.contacts.full_name ||
                       proposalRes.data.contacts.contact_name ||
                       `${proposalRes.data.contacts.first_name || ''} ${proposalRes.data.contacts.last_name || ''}`.trim() ||
                       'Customer';
          setCustomerName(name);
        }

        // Load visible recordings
        const { data: recordingsData } = await supabase
          .from('proposal_recordings')
          .select('id, title, description, recording_scope, room_id, storage_path, video_url, duration_seconds, sort_order')
          .eq('proposal_id', proposalId)
          .eq('is_portal_visible', true)
          .order('recording_scope', { ascending: false })
          .order('sort_order');

        if (recordingsData && recordingsData.length > 0) {
          setRecordings(recordingsData);
          // Fetch signed URLs for stored videos
          const storedPaths = recordingsData
            .filter((r: ProposalRecording) => r.storage_path)
            .map((r: ProposalRecording) => r.storage_path as string);
          if (storedPaths.length > 0) {
            const urls: Record<string, string> = {};
            await Promise.all(
              storedPaths.map(async (path: string) => {
                const { data } = await supabase.storage
                  .from('proposal-recordings')
                  .createSignedUrl(path, 7200);
                if (data?.signedUrl) urls[path] = data.signedUrl;
              })
            );
            setSignedUrls(urls);
          }
        }

        // Load invoices linked to any sales orders for this proposal
        const { data: salesOrders } = await supabase
          .from('sales_orders')
          .select('id')
          .eq('proposal_id', proposalId);

        const allInvoices: PortalInvoice[] = [];

        // Fetch deposit invoices linked directly to this proposal
        const { data: depositInvoices } = await supabase
          .from('invoices')
          .select(`
            id, invoice_number, invoice_title, invoice_date, due_date, status,
            subtotal, tax, total, amount_paid, amount_due, qbo_invoice_id, invoice_type,
            billing_name, billing_address_line1, billing_address_line2,
            billing_city, billing_state, billing_zip
          `)
          .eq('proposal_id', proposalId)
          .eq('invoice_type', 'deposit')
          .not('status', 'eq', 'void')
          .order('invoice_date');

        if (depositInvoices) allInvoices.push(...depositInvoices);

        // Fetch invoices linked to sales orders for this proposal
        if (salesOrders && salesOrders.length > 0) {
          const soIds = salesOrders.map((so: { id: string }) => so.id);
          const { data: invoicesData } = await supabase
            .from('invoices')
            .select(`
              id, invoice_number, invoice_title, invoice_date, due_date, status,
              subtotal, tax, total, amount_paid, amount_due, qbo_invoice_id, invoice_type,
              billing_name, billing_address_line1, billing_address_line2,
              billing_city, billing_state, billing_zip
            `)
            .in('sales_order_id', soIds)
            .not('status', 'eq', 'void')
            .order('invoice_date');
          if (invoicesData) allInvoices.push(...invoicesData);
        }

        // Deduplicate by invoice ID
        const seen = new Set<string>();
        const deduped = allInvoices.filter(inv => {
          if (seen.has(inv.id)) return false;
          seen.add(inv.id);
          return true;
        });
        setRelatedInvoices(deduped);
      }
    } catch (error) {
      console.error('Error loading proposal details:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleApprove() {
    setShowApprovalModal(true);
  }

  function handleApprovalSuccess() {
    setShowApprovalModal(false);
    loadProposalDetails(); // Reload to show updated status
  }

  async function handleInvoicePayment(invoice: PortalInvoice) {
    if (!invoice.qbo_invoice_id) {
      setPaymentUnavailableInvoice(invoice);
      return;
    }
    const { data: settings } = await supabase
      .from('company_settings')
      .select('qbo_realm_id')
      .maybeSingle();
    if (!settings?.qbo_realm_id) {
      setPaymentUnavailableInvoice(invoice);
      return;
    }
    window.open(`https://app.qbo.intuit.com/app/paynow?invoiceId=${invoice.qbo_invoice_id}`, '_blank');
  }

  async function handleInvoicePrint(invoice: PortalInvoice) {
    setPrintingInvoiceId(invoice.id);
    try {
      const [itemsRes, paymentsRes, settingsRes, officeRes] = await Promise.all([
        supabase
          .from('invoice_line_items')
          .select('description, quantity, unit_price, amount, notes, notes_visible_on_invoice')
          .eq('invoice_id', invoice.id)
          .order('sort_order'),
        supabase
          .from('invoice_payments')
          .select('payment_date, payment_method, amount')
          .eq('invoice_id', invoice.id)
          .order('payment_date'),
        supabase
          .from('company_settings')
          .select('company_name, company_logo_url, phone, email')
          .maybeSingle(),
        supabase
          .from('office_addresses')
          .select('address_line1, address_line2, city, state, zip, phone')
          .eq('is_primary', true)
          .maybeSingle(),
      ]);

      const company: PrintableCompanyInfo = {
        company_name: settingsRes.data?.company_name,
        logo_url: settingsRes.data?.company_logo_url,
        phone: officeRes.data?.phone || settingsRes.data?.phone,
        email: settingsRes.data?.email,
        address_line1: officeRes.data?.address_line1,
        address_line2: officeRes.data?.address_line2,
        city: officeRes.data?.city,
        state: officeRes.data?.state,
        zip: officeRes.data?.zip,
      };

      const html = buildPortalInvoicePrintHTML(
        invoice,
        itemsRes.data || [],
        paymentsRes.data || [],
        company,
      );
      openInvoicePrint(html);
    } catch (err) {
      console.error('Error generating invoice print:', err);
    } finally {
      setPrintingInvoiceId(null);
    }
  }

  async function handleDecline() {
    if (!proposal) return;
    if (!declineReason) {
      alert('Please select a reason for declining this proposal.');
      return;
    }
    if (!confirm('Are you sure you want to decline this proposal?')) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('proposals')
        .update({
          status: 'declined',
          decline_reason: declineReason,
          decline_notes: comment.trim() || null,
          declined_at: new Date().toISOString(),
          declined_by: 'customer',
          updated_at: new Date().toISOString()
        })
        .eq('id', proposalId);

      if (error) throw error;

      // Log activity
      await supabase.from('proposal_activity').insert({
        proposal_id: proposalId,
        activity_type: 'declined',
        metadata: { reason: declineReason, notes: comment.trim() || null, by: 'customer' },
      }).throwOnError().catch(() => {});

      alert('Proposal declined. We will be in touch shortly.');
      onBack();
    } catch (error) {
      console.error('Error declining proposal:', error);
      alert('Failed to decline proposal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Proposal Not Found</h2>
          <p className="text-gray-500 mb-6">This proposal could not be loaded. It may have been removed or you may not have access.</p>
          <button onClick={onBack} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
            Back to {backLabel ?? 'Proposals'}
          </button>
        </div>
      </div>
    );
  }

  const isProposalExpired = !hideExpiration && proposal.expires_at && new Date(proposal.expires_at) < new Date();

  if (isProposalExpired) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center h-16 sm:h-20 gap-3">
              <button onClick={onBack} className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]">
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">{backLabel ?? 'Proposals'}</span>
              </button>
              <img src="/el_logo_color_(2).png" alt="Electronic Life" className="h-8 sm:h-10 object-contain" />
            </div>
          </div>
        </header>
        <div className="max-w-xl mx-auto px-4 py-20 text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-10">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold mb-4">
              <Clock className="w-3 h-3" />
              Expired
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">This Proposal Has Expired</h2>
            <p className="text-gray-500 mb-2">
              Proposal <span className="font-semibold text-gray-700">{proposal.proposal_number}</span> expired on{' '}
              <span className="font-semibold text-gray-700">{new Date(proposal.expires_at!).toLocaleDateString()}</span>.
            </p>
            <p className="text-gray-500 mb-8 text-sm">
              Pricing and availability may have changed. Please contact your sales representative to have this proposal reviewed and reactivated.
            </p>
            <button
              onClick={onBack}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
            >
              Back to {backLabel ?? 'Proposals'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canTakeAction = proposal.status === 'sent' || proposal.status === 'viewed';

  return (
    <div className={previewMode ? 'bg-gray-50' : 'min-h-screen bg-gray-50'}>
      {/* Header — only shown in standalone mode */}
      {!previewMode && (
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px] flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="hidden sm:inline text-sm font-medium">{backLabel ?? 'Proposals'}</span>
              </button>
              <img
                src="/el_logo_color_(2).png"
                alt="Electronic Life"
                className="h-8 sm:h-10 object-contain flex-shrink-0"
              />
              <div className="hidden sm:block border-l border-white/20 pl-4 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-white font-semibold text-sm leading-tight truncate">{proposal.title}</p>
                  {proposal.renewal_count > 0 && (
                    <span className="px-2 py-0.5 bg-blue-500/30 text-blue-100 text-xs font-bold rounded">
                      Rev. {proposal.renewal_count}
                    </span>
                  )}
                  {(proposal.current_portal_version ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-white/10 text-blue-200 text-xs font-semibold rounded border border-white/20">
                      <Layers className="w-3 h-3" />
                      Version {proposal.current_portal_version}
                    </span>
                  )}
                </div>
                <p className="text-blue-300 text-xs mt-0.5">{overrideDisplayNumber ?? proposal.proposal_number}</p>
              </div>
            </div>
            <button
              onClick={trackProposalDownload}
              className="flex items-center gap-2 px-4 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors text-sm font-medium min-h-[44px] flex-shrink-0"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download PDF</span>
            </button>
          </div>
        </div>
      </header>
      )}

      <main className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 ${animate ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Revision Notice */}
            {proposal.revision_notes && proposal.renewal_count > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-500 rounded-xl p-4 sm:p-6 shadow-md">
                <div className="flex items-start gap-4">
                  <div className="bg-blue-500/10 p-2.5 rounded-lg">
                    <AlertCircle className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <h4 className="font-bold text-blue-900 text-lg">Updated Proposal</h4>
                      <span className="px-3 py-1 bg-blue-200 text-blue-800 rounded-full font-bold text-xs">
                        Revision #{proposal.renewal_count}
                      </span>
                    </div>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed mb-3">
                      {proposal.revision_notes}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-100 px-3 py-2 rounded-lg">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="font-medium">
                        This proposal has been updated and you have a new 30-day review window
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Full Proposal Video Recordings */}
            {recordings.filter(r => r.recording_scope === 'full_proposal').map(recording => (
              <div key={recording.id} style={{ animation: animate ? 'slideInUp 0.4s ease-out both' : 'none' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-semibold text-gray-700">Proposal Walkthrough Video</span>
                  <span className="text-xs text-gray-400">— recorded by your sales rep</span>
                </div>
                <VideoPlayer
                  recording={recording}
                  signedUrl={recording.storage_path ? signedUrls[recording.storage_path] : undefined}
                  logoUrl={orgLogoUrl}
                />
              </div>
            ))}

            {/* Room Cards */}
            {rooms.map((room, roomIndex) => {
              const roomItems = lineItems.filter(item => item.room_id === room.id && !item.is_hidden);
              const roomSubtotal = roomItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
              const showImages = template?.show_product_images !== false && roomItems.some(item => item.products?.image_url);

              return (
                <div
                  key={room.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-300"
                  style={{
                    animation: animate ? `slideInUp 0.5s ease-out ${roomIndex * 0.1}s both` : 'none'
                  }}
                >
                  {/* Room Header */}
                  <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-4 sm:px-6 py-3 sm:py-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-blue-500/20 p-2 rounded-lg">
                        <Package className="w-5 h-5 text-blue-400" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold text-white flex-1">{room.name}</h3>
                      <button
                        onClick={() => { setQaContext({ roomId: room.id, lineItemId: null, label: room.name }); setShowQA(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-blue-200 hover:text-white text-xs font-medium rounded-lg transition-colors"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Ask about this room
                      </button>
                    </div>
                  </div>

                  {/* Per-area presentation video */}
                  {(() => {
                    const roomRecordings = recordings.filter(r => r.recording_scope === 'area' && r.room_id === room.id);
                    if (roomRecordings.length === 0) return null;
                    return (
                      <div className="px-6 pt-4 space-y-2">
                        {roomRecordings.map(recording => (
                          <VideoPlayer
                            key={recording.id}
                            recording={recording}
                            signedUrl={recording.storage_path ? signedUrls[recording.storage_path] : undefined}
                            logoUrl={orgLogoUrl}
                          />
                        ))}
                      </div>
                    );
                  })()}

                  {room.description && room.show_scope && template?.show_area_descriptions && (
                    <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3">
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-start gap-2 mb-2">
                          <FileText className="w-4 h-4 text-blue-600 mt-0.5" />
                          <p className="text-sm font-bold text-blue-900">Scope of Work</p>
                        </div>
                        <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed ml-6">
                          {room.description}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Items Table */}
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            {showImages && <th className="py-3 w-16"></th>}
                            <th className="text-left py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Item</th>
                            {template?.show_quantity && (
                              <th className="text-center py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Qty</th>
                            )}
                            {template?.show_unit_price && (
                              <th className="text-right py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Price</th>
                            )}
                            {template?.show_line_item_total && (
                              <th className="text-right py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {roomItems.map((item) => (
                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              {showImages && (
                                <td className="py-3 pr-3 w-16">
                                  {item.products?.image_url ? (
                                    <img
                                      src={item.products.image_url}
                                      alt={item.description}
                                      className="w-12 h-12 object-cover rounded-lg border border-gray-200 shadow-sm"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50" />
                                  )}
                                </td>
                              )}
                              <td className="py-4">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900">{item.description}</p>
                                  <button
                                    onClick={() => { setQaContext({ roomId: room?.id || null, lineItemId: item.id, label: item.description }); setShowQA(true); }}
                                    className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                    title="Ask about this item"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              {template?.show_quantity && (
                                <td className="text-center py-4 text-sm text-gray-700 font-medium">{item.quantity}</td>
                              )}
                              {template?.show_unit_price && (
                                <td className="text-right py-4 text-sm text-gray-700">
                                  {formatCurrency(item.unit_price)}
                                </td>
                              )}
                              {template?.show_line_item_total && (
                                <td className="text-right py-4 text-sm font-bold text-gray-900">
                                  {formatCurrency(item.line_total)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        {template?.show_area_subtotals && (
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={
                                (showImages ? 1 : 0) +
                                1 +
                                (template?.show_quantity ? 1 : 0) +
                                (template?.show_unit_price ? 1 : 0) +
                                (template?.show_line_item_total ? 1 : 0) - 1
                              } className="pt-4 pb-4 pr-4 text-right font-bold text-gray-900 text-sm uppercase tracking-wide">
                                Room Subtotal:
                              </td>
                              <td className="pt-4 pb-4 text-right font-bold text-blue-600 text-lg">
                                {formatCurrency(roomSubtotal)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Unassigned Items (items without a room/area) */}
            {(() => {
              const unassignedItems = lineItems.filter(item => !item.room_id && !item.is_hidden);
              if (unassignedItems.length === 0) return null;
              const hasRooms = rooms.length > 0;
              const unassignedSubtotal = unassignedItems.reduce((sum, item) => sum + (item.line_total || 0), 0);
              const showImages = template?.show_product_images !== false && unassignedItems.some(item => item.products?.image_url);
              return (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-300">
                  {hasRooms && (
                    <div className="bg-gradient-to-r from-amber-700 to-amber-800 px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-amber-500/20 p-2 rounded-lg">
                          <Package className="w-5 h-5 text-amber-300" />
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-white">Unassigned Items</h3>
                      </div>
                    </div>
                  )}
                  <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b-2 border-gray-200">
                            {showImages && <th className="py-3 w-16"></th>}
                            <th className="text-left py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Item</th>
                            {template?.show_quantity && (
                              <th className="text-center py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Qty</th>
                            )}
                            {template?.show_unit_price && (
                              <th className="text-right py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Price</th>
                            )}
                            {template?.show_line_item_total && (
                              <th className="text-right py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</th>
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          {unassignedItems.map((item) => (
                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                              {showImages && (
                                <td className="py-3 pr-3 w-16">
                                  {item.products?.image_url ? (
                                    <img
                                      src={item.products.image_url}
                                      alt={item.description}
                                      className="w-12 h-12 object-cover rounded-lg border border-gray-200 shadow-sm"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                  ) : (
                                    <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50" />
                                  )}
                                </td>
                              )}
                              <td className="py-4">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-semibold text-gray-900">{item.description}</p>
                                  <button
                                    onClick={() => { setQaContext({ roomId: room?.id || null, lineItemId: item.id, label: item.description }); setShowQA(true); }}
                                    className="text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0"
                                    title="Ask about this item"
                                  >
                                    <HelpCircle className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                              {template?.show_quantity && (
                                <td className="text-center py-4 text-sm text-gray-700 font-medium">{item.quantity}</td>
                              )}
                              {template?.show_unit_price && (
                                <td className="text-right py-4 text-sm text-gray-700">
                                  {formatCurrency(item.unit_price)}
                                </td>
                              )}
                              {template?.show_line_item_total && (
                                <td className="text-right py-4 text-sm font-bold text-gray-900">
                                  {formatCurrency(item.line_total)}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                        {template?.show_area_subtotals && hasRooms && (
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={
                                (showImages ? 1 : 0) +
                                1 +
                                (template?.show_quantity ? 1 : 0) +
                                (template?.show_unit_price ? 1 : 0) +
                                (template?.show_line_item_total ? 1 : 0) - 1
                              } className="pt-4 pb-4 pr-4 text-right font-bold text-gray-900 text-sm uppercase tracking-wide">
                                Subtotal:
                              </td>
                              <td className="pt-4 pb-4 text-right font-bold text-blue-600 text-lg">
                                {formatCurrency(unassignedSubtotal)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Additional Notes */}
            {proposal.notes && (
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-2xl p-4 sm:p-6 shadow-md">
                <div className="flex items-start gap-3">
                  <div className="bg-blue-500/10 p-2 rounded-lg">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-blue-900 mb-2">Additional Notes</h3>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">{proposal.notes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:sticky lg:top-20 lg:self-start space-y-6">
            {/* Proposal Summary Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-100 p-2.5 rounded-xl">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Proposal Summary</h3>
              </div>

              {/* Total Amount */}
              <div className="mb-6">
                <div className="bg-blue-50 rounded-xl p-5 border border-blue-200">
                  <div className="text-center">
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Total Investment</div>
                    <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-blue-600">
                      ${(proposal.total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {!hideExpiration && proposal.valid_until && (
                <div className="mb-6 flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Valid until: {new Date(proposal.valid_until).toLocaleDateString()}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={() => setShowQA(true)}
                  className="w-full px-4 py-3.5 border-2 border-blue-500 text-blue-600 rounded-xl hover:bg-blue-50 flex items-center justify-center gap-2 font-bold transition-all duration-200 hover:scale-105"
                >
                  <MessageSquare className="w-5 h-5" />
                  Ask Questions
                </button>

                {canTakeAction && (
                  <>
                    <button
                      onClick={handleApprove}
                      disabled={submitting}
                      className="w-full px-4 py-3.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 font-bold transition-colors shadow-sm"
                    >
                      <CheckCircle className="w-5 h-5" />
                      Approve Proposal
                    </button>

                    <button
                      onClick={() => setComment(comment ? '' : 'open')}
                      className="w-full px-4 py-3.5 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 font-bold transition-all duration-200"
                    >
                      <MessageSquare className="w-5 h-5" />
                      Request Changes
                    </button>

                    <button
                      onClick={() => setDeclineReason(declineReason ? '' : 'open')}
                      className="w-full px-4 py-3.5 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 flex items-center justify-center gap-2 font-medium transition-all duration-200"
                    >
                      <XCircle className="w-5 h-5" />
                      Decline Proposal
                    </button>
                  </>
                )}

                {/* Status Badges */}
                {proposal.status === 'approved' && (
                  <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl flex items-start gap-3">
                    <div className="bg-green-500/20 p-2 rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-green-900">Approved</p>
                      <p className="text-xs text-green-700 mt-1">
                        This proposal has been approved and a project has been created.
                      </p>
                    </div>
                  </div>
                )}

                {proposal.status === 'declined' && (
                  <div className="p-4 bg-gradient-to-br from-red-50 to-orange-50 border-2 border-red-200 rounded-xl flex items-start gap-3">
                    <div className="bg-red-500/20 p-2 rounded-lg">
                      <XCircle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-900">Declined</p>
                      <p className="text-xs text-red-700 mt-1">
                        This proposal has been declined. We will be in touch shortly.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Request Changes / Comments Section */}
            {comment && comment !== '' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
                <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Request Changes / Questions
                </h3>
                <textarea
                  value={comment === 'open' ? '' : comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Please let us know what changes you'd like or any questions you have..."
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
                <button
                  disabled={submitting || !comment.trim() || comment === 'open'}
                  className="w-full mt-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl disabled:opacity-50 font-bold transition-colors"
                >
                  Submit Feedback
                </button>
              </div>
            )}

            {/* Decline Section */}
            {declineReason && (
              <div className="bg-white rounded-2xl shadow-sm border-2 border-red-200 p-4 sm:p-6">
                <h3 className="text-sm font-bold text-red-800 mb-1 flex items-center gap-2">
                  <XCircle className="w-4 h-4" />
                  Decline This Proposal
                </h3>
                <p className="text-xs text-gray-500 mb-4">Please let us know why so we can improve our service.</p>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Reason <span className="text-red-500">*</span></label>
                  <select
                    value={declineReason === 'open' ? '' : declineReason}
                    onChange={(e) => setDeclineReason(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-transparent text-sm"
                  >
                    <option value="">Select a reason...</option>
                    <option value="price_too_high">Price is too high</option>
                    <option value="went_with_competitor">Going with another company</option>
                    <option value="project_cancelled">Project cancelled / no longer needed</option>
                    <option value="timing">Not the right time</option>
                    <option value="scope_change">Scope changed / not what I expected</option>
                    <option value="changed_mind">I changed my mind</option>
                    <option value="dont_want_rep">I do not want to work with this representative</option>
                    <option value="dont_want_company">I do not want to work with this company</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Additional comments <span className="text-gray-400">(optional)</span></label>
                  <textarea
                    value={comment === 'open' ? '' : comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Any additional details..."
                    rows={3}
                    className="w-full px-3 py-2.5 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-red-400 focus:border-transparent text-sm resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setDeclineReason(''); setComment(''); }}
                    className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-600 rounded-xl hover:bg-gray-50 font-medium text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDecline}
                    disabled={submitting || !declineReason || declineReason === 'open'}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl disabled:opacity-50 font-bold text-sm transition-colors"
                  >
                    {submitting ? 'Submitting...' : 'Confirm Decline'}
                  </button>
                </div>
              </div>
            )}

            {proposal.deposit_amount_due > 0 && (() => {
              const depositInvoice = relatedInvoices.find(inv => inv.id === proposal.deposit_invoice_id) ||
                relatedInvoices.find(inv => inv.invoice_type === 'deposit' as any) ||
                relatedInvoices.find(inv => inv.invoice_number?.toLowerCase().includes('deposit'));
              const isDepositPaid = proposal.deposit_paid || depositInvoice?.status === 'paid';
              const isDepositInvoiceReady = depositInvoice && depositInvoice.status === 'sent' && depositInvoice.qbo_invoice_id;
              const isAwaitingInvoice = !depositInvoice && (proposal.status === 'approved' || proposal.status === 'approved_pending_action') && !isDepositPaid;

              return (
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 sm:p-6 shadow-md">
                  <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Deposit
                  </h3>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-gray-600">Amount</span>
                    <span className="text-lg font-bold text-gray-900">
                      ${(proposal.deposit_amount_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>

                  {isDepositPaid ? (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                      <p className="text-sm font-medium text-green-800">Deposit Paid</p>
                    </div>
                  ) : isDepositInvoiceReady ? (
                    <>
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 mb-3">
                        <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
                        <p className="text-sm font-medium text-amber-800">Deposit Invoice Ready</p>
                      </div>
                      <button
                        onClick={() => depositInvoice && handleInvoicePayment(depositInvoice)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors"
                      >
                        <CreditCard className="w-4 h-4" />
                        Pay Deposit Now
                      </button>
                    </>
                  ) : isAwaitingInvoice ? (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
                      <Clock className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800">
                        Your sales representative will send you a deposit invoice shortly. You can pay it from the Invoices tab once it arrives.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700">
                      A deposit of <span className="font-bold">${(proposal.deposit_amount_due || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span> ({proposal.deposit_percent}%) is required upon approval.
                    </p>
                  )}
                </div>
              );
            })()}

            {/* Related Invoices Panel */}
            {relatedInvoices.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-100 p-2 rounded-xl">
                    <FileText className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900">
                    Invoice{relatedInvoices.length !== 1 ? 's' : ''}
                  </h3>
                  <span className="ml-auto text-xs font-semibold px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                    {relatedInvoices.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {relatedInvoices.map((inv) => {
                    const isPaid = inv.status === 'paid';
                    const isOverdue = inv.status === 'overdue';
                    const statusColors: Record<string, string> = {
                      sent: 'bg-blue-100 text-blue-700',
                      partial: 'bg-amber-100 text-amber-700',
                      paid: 'bg-green-100 text-green-700',
                      overdue: 'bg-red-100 text-red-700',
                      draft: 'bg-gray-100 text-gray-600',
                    };
                    const badgeClass = statusColors[inv.status] || 'bg-gray-100 text-gray-600';

                    return (
                      <div
                        key={inv.id}
                        className={`rounded-xl border p-4 ${isOverdue ? 'border-red-200 bg-red-50/30' : 'border-gray-200 bg-gray-50/50'}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 leading-tight">
                              #{inv.invoice_number}
                            </p>
                            {inv.invoice_title && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{inv.invoice_title}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(inv.invoice_date).toLocaleDateString()}
                              {inv.due_date && ` · Due ${new Date(inv.due_date).toLocaleDateString()}`}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full capitalize ${badgeClass}`}>
                            {inv.status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-xs text-gray-500">
                              {isPaid ? 'Total Paid' : 'Amount Due'}
                            </p>
                            <p className={`text-lg font-bold ${isPaid ? 'text-green-600' : isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                              ${(isPaid ? inv.total : inv.amount_due).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          {!isPaid && inv.amount_paid > 0 && (
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Paid</p>
                              <p className="text-sm font-semibold text-green-600">
                                ${inv.amount_paid.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {!isPaid && (
                            <button
                              onClick={() => handleInvoicePayment(inv)}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              Pay Now
                            </button>
                          )}
                          <button
                            onClick={() => handleInvoicePrint(inv)}
                            disabled={printingInvoiceId === inv.id}
                            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 hover:bg-gray-100 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            {printingInvoiceId === inv.id ? 'Preparing...' : 'Print'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <p className="mt-4 text-xs text-gray-400 text-center leading-relaxed">
                  Pay online via QuickBooks or print to mail a check.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Approval Modal */}
      {showApprovalModal && proposal && (
        <ProposalApprovalModal
          proposalId={proposalId}
          proposalNumber={proposal.proposal_number}
          onClose={() => setShowApprovalModal(false)}
          onSuccess={handleApprovalSuccess}
        />
      )}

      {/* Q&A Chat */}
      {showQA && (
        <ProposalQA
          proposalId={proposalId}
          isPortal={true}
          customerName={customerName}
          onClose={() => { setShowQA(false); setQaContext({ roomId: null, lineItemId: null, label: null }); }}
          contextRoomId={qaContext.roomId}
          contextLineItemId={qaContext.lineItemId}
          contextLabel={qaContext.label}
        />
      )}

      {/* Payment unavailable modal */}
      {paymentUnavailableInvoice && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-amber-100 p-2.5 rounded-xl">
                <AlertCircle className="w-5 h-5 text-amber-600" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Online Payment Unavailable</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              Invoice <span className="font-semibold">#{paymentUnavailableInvoice.invoice_number}</span> is not yet set up for online payment. Please contact us to pay by phone or mail a check.
            </p>
            <p className="text-sm text-gray-500 mb-5 leading-relaxed">
              You can also <button onClick={() => { handleInvoicePrint(paymentUnavailableInvoice); setPaymentUnavailableInvoice(null); }} className="text-blue-600 underline font-medium">print this invoice</button> for remittance by mail.
            </p>
            <button
              onClick={() => setPaymentUnavailableInvoice(null)}
              className="w-full px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
