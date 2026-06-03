import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../Shared/Toast';
import { Star, Mail, QrCode, TrendingUp, Users, ExternalLink, Send, Check, Eye, X, Search, Calendar, UserPlus, RefreshCw, MessageSquare, Trash2, Loader2, ClipboardList, ThumbsUp, ChevronDown, CheckCircle, Lock } from 'lucide-react';
import { CustomerSatisfactionDashboard } from './CustomerSatisfactionDashboard';

interface Contact {
  id: string;
  contact_name: string;
  company_name: string;
  email: string;
  phone: string;
}

interface ReviewRequest {
  id: string;
  contact_id: string;
  sent_by: string;
  sent_at: string;
  method: 'email' | 'sms' | 'qr_code' | 'manual';
  email_opened: boolean;
  link_clicked: boolean;
  clicked_at: string | null;
  review_completed: boolean;
  notes: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  follow_up_sent_at: string | null;
  contacts: Contact | null;
  profiles: {
    full_name: string;
  };
}

interface SatisfactionRecord {
  id: string;
  customer_name: string;
  customer_email: string;
  sales_rep_name: string;
  lead_tech_name: string;
  rating: string | null;
  comment: string | null;
  sent_at: string;
  responded_at: string | null;
  created_by: string;
  follow_up_sent_at: string | null;
  profiles: { full_name: string } | null;
}

interface EmailPreview {
  subject: string;
  html: string;
  recipientEmail: string;
  recipientName: string;
}

const REVIEW_URL = 'https://g.page/r/CZzvVUth7kuyEBM/review';

function replacePlaceholders(text: string, placeholders: Record<string, string>): string {
  let result = text;
  for (const [key, value] of Object.entries(placeholders)) {
    result = result.split(`{{${key}}}`).join(value || '');
  }
  return result;
}

function convertTextToHtml(text: string): string {
  let html = text;
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#3b82f6;">$1</a>');
  html = html.replace(/^• (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin:10px 0;padding-left:20px;">$&</ul>');
  html = html.replace(/\n\n/g, '</p><p style="margin:15px 0;line-height:1.6;">');
  html = '<p style="margin:15px 0;line-height:1.6;">' + html + '</p>';
  return html;
}

const EL_LOGO_URL = 'https://bqtsuzvuvqvgidipbsis.supabase.co/storage/v1/object/public/company_logo/logo-1770649712721.png';

function wrapInEmailLayout(content: string, companyName: string, companyEmail: string, headerColor = '#0e7490', logoUrl = ''): string {
  const resolvedLogoUrl = logoUrl || EL_LOGO_URL;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:32px 40px 28px;text-align:center;border-bottom:3px solid ${headerColor};"><img src="${resolvedLogoUrl}" alt="${companyName}" style="max-height:64px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" /></td></tr><tr><td style="background:#ffffff;padding:40px 40px 32px;color:#374151;font-size:16px;line-height:1.7;">${content}</td></tr><tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 40px;text-align:center;border-top:1px solid #334155;"><img src="${resolvedLogoUrl}" alt="${companyName}" style="max-height:36px;max-width:140px;object-fit:contain;display:block;margin:0 auto 12px auto;opacity:0.85;" /><p style="color:#06b6d4;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${companyName}</p>${companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 12px 0;">${companyEmail}</p>` : ''}<p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p></td></tr></table></td></tr></table></body></html>`;
}

function buildEmailShell(params: { companyName: string; companyEmail: string; companyLogoUrl?: string }, headerContent: string, bodyContent: string): string {
  const logoUrl = params.companyLogoUrl || EL_LOGO_URL;
  const logoBlock = `<img src="${logoUrl}" alt="${params.companyName}" style="max-height:64px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <!-- Header: dark slate with logo -->
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #06b6d4;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        ${headerContent}
      </td></tr>
      <!-- Body: clean white -->
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">${bodyContent}</td></tr>
      <!-- Footer -->
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <img src="${logoUrl}" alt="${params.companyName}" style="max-height:36px;max-width:140px;object-fit:contain;display:block;margin:0 auto 12px auto;opacity:0.85;" />
        <p style="color:#06b6d4;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 12px 0;">${params.companyEmail}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function buildReviewRequestEmailPreview(params: { customerName: string; companyName: string; companyEmail: string; companyLogoUrl?: string; reviewUrl: string }): string {
  const header = `
    <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">Your Opinion Matters</h1>
    <p style="color:#94a3b8;margin:0;font-size:15px;">to us and to your community</p>
    <div style="margin-top:20px;"><span style="font-size:24px;letter-spacing:3px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>`;
  const body = `
    <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">Hi ${params.customerName},</p>
    <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">Thank you for choosing <strong style="color:#0e7490;">${params.companyName}</strong>. We take pride in every project we complete and we genuinely hope your experience exceeded your expectations.</p>
    <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">If you have a moment, we'd be grateful if you could share your experience with others on Google. Reviews like yours help homeowners and businesses in the community find reliable, quality service.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px 0;">
      <a href="${params.reviewUrl}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;padding:16px 48px;border-radius:10px;font-size:17px;font-weight:700;letter-spacing:0.01em;">Leave Us a Google Review</a>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;"><tr><td style="padding:18px 22px;">
      <p style="color:#0f172a;font-size:13px;margin:0 0 5px 0;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Takes less than 2 minutes</p>
      <p style="color:#475569;font-size:14px;margin:0;line-height:1.6;">Just a sentence or two is enough. Your words directly help our team grow.</p>
    </td></tr></table>`;
  return buildEmailShell(params, header, body);
}

function buildJobSurveyEmailPreview(params: { customerName: string; companyName: string; companyEmail: string; companyLogoUrl?: string; reviewUrl: string; companyWebsite?: string }): string {
  const websiteLink = params.companyWebsite
    ? `<a href="${params.companyWebsite}" style="color:#06b6d4;text-decoration:none;font-weight:600;font-size:13px;">${params.companyWebsite}</a>`
    : '';
  const header = `
    <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">How did we do?</h1>
    <p style="color:#94a3b8;margin:0;font-size:15px;">Your experience means everything to us</p>
    <div style="margin-top:20px;"><span style="font-size:24px;letter-spacing:3px;color:#f59e0b;">&#9733;&#9733;&#9733;&#9733;&#9733;</span></div>`;
  const body = `
    <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">Hi ${params.customerName},</p>
    <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 18px 0;">Thank you for choosing <strong style="color:#0e7490;">${params.companyName}</strong>! We truly appreciate you trusting us with your project and we hope your experience exceeded your expectations.</p>
    <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">We'd love to hear how we did. Your feedback not only helps us grow — it helps other homeowners and businesses in the community find reliable, quality service they can count on.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:24px;">
      <tr><td style="padding:24px 28px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>
          <td style="background:#16a34a;border-radius:6px;width:28px;height:28px;text-align:center;vertical-align:middle;font-size:15px;font-weight:900;color:#ffffff;line-height:28px;">&#9733;</td>
          <td style="padding-left:10px;color:#15803d;font-size:16px;font-weight:700;vertical-align:middle;">If we earned 5 stars...</td>
        </tr></table>
        <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 20px 0;">We'd be so grateful if you'd take 2 minutes to share your experience on Google. A quick review helps our team grow and lets your neighbors know they can count on us.</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${params.reviewUrl}" style="display:inline-block;background:#ffffff;border:2px solid #dadce0;border-radius:8px;text-decoration:none;padding:12px 24px;font-family:Arial,sans-serif;">
            <table cellpadding="0" cellspacing="0"><tr>
              <td style="vertical-align:middle;padding-right:10px;">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.08 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-3.58-13.46-8.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              </td>
              <td style="vertical-align:middle;">
                <span style="color:#3c4043;font-size:15px;font-weight:600;font-family:Arial,sans-serif;letter-spacing:0.01em;">Write a Google Review</span>
              </td>
            </tr></table>
          </a>
        </td></tr></table>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:12px;border:1px solid #fecaca;margin-bottom:32px;">
      <tr><td style="padding:24px 28px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:12px;"><tr>
          <td style="background:#dc2626;border-radius:6px;width:28px;height:28px;text-align:center;vertical-align:middle;font-size:15px;font-weight:900;color:#ffffff;line-height:28px;">!</td>
          <td style="padding-left:10px;color:#b91c1c;font-size:16px;font-weight:700;vertical-align:middle;">If we fell short of 5 stars...</td>
        </tr></table>
        <p style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 4px 0;">Please reach out to us directly before posting a review. We'd love the opportunity to make it right.</p>
        <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;">Simply reply to this email or give us a call — we're here to help.</p>
      </td></tr>
    </table>
    <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 28px 0;">And if you ever need additional service, training, or just have questions about your system, don't hesitate to reach out. We're always happy to help.</p>
    <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 4px 0;">Thank you again for being an <strong style="color:#0e7490;">${params.companyName}</strong> customer.</p>
    <p style="color:#374151;font-size:15px;line-height:1.75;margin:0 0 4px 0;font-style:italic;font-weight:600;">Innovate. Integrate. Inspire.</p>
    <p style="color:#6b7280;font-size:14px;line-height:1.75;margin:0;">The ${params.companyName} Team${websiteLink ? ` &nbsp;&bull;&nbsp; ${websiteLink}` : ''}</p>`;
  return buildEmailShell(params, header, body);
}

interface StaffProfile {
  id: string;
  full_name: string;
}

function buildSatisfactionEmailPreview(params: { customerName: string; companyName: string; companyEmail: string; companyLogoUrl?: string }): string {
  const logoBlock = params.companyLogoUrl
    ? `<img src="${params.companyLogoUrl}" alt="${params.companyName}" style="max-height:60px;max-width:220px;object-fit:contain;display:block;margin:0 auto;" />`
    : `<span style="color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${params.companyName}</span>`;

  const ratings = [
    { label: 'Excellent', emoji: '&#128079;', bg: '#16a34a', desc: 'Everything was great' },
    { label: 'Good', emoji: '&#128077;', bg: '#2563eb', desc: 'Happy with the results' },
    { label: 'Okay', emoji: '&#128528;', bg: '#d97706', desc: 'Some things could improve' },
    { label: 'Needs Attention', emoji: '&#128533;', bg: '#dc2626', desc: 'There was a problem' },
  ];

  const ratingButtons = ratings.map(r => `
    <td align="center" style="padding:8px;">
      <table cellpadding="0" cellspacing="0" width="120" style="border-radius:12px;overflow:hidden;background:${r.bg};">
        <tr><td align="center" style="padding:16px 8px 8px;">
          <span style="font-size:32px;line-height:1;">${r.emoji}</span>
        </td></tr>
        <tr><td align="center" style="padding:0 8px 6px;">
          <span style="color:#ffffff;font-size:14px;font-weight:700;display:block;">${r.label}</span>
        </td></tr>
        <tr><td align="center" style="padding:0 8px 14px;">
          <span style="color:rgba(255,255,255,0.8);font-size:11px;line-height:1.3;display:block;">${r.desc}</span>
        </td></tr>
      </table>
    </td>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>How did we do?</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background:#111827;border-radius:16px 16px 0 0;padding:36px 44px 32px;text-align:center;border-bottom:3px solid #0e7490;">
        <div style="margin-bottom:20px;">${logoBlock}</div>
        <h1 style="color:#ffffff;margin:0 0 8px 0;font-size:28px;font-weight:800;letter-spacing:-0.3px;line-height:1.25;">How Did We Do?</h1>
        <p style="color:#94a3b8;margin:0;font-size:15px;">Your feedback helps us improve</p>
      </td></tr>
      <tr><td style="background:#ffffff;padding:44px 44px 36px;">
        <p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 16px 0;">Hi ${params.customerName || 'there'},</p>
        <p style="color:#374151;font-size:16px;line-height:1.75;margin:0 0 32px 0;">Thank you for choosing <strong style="color:#0e7490;">${params.companyName}</strong>. We hope your experience was exceptional. We'd love to hear how we did — just tap the button that best describes your experience:</p>
        <table width="100%" cellpadding="0" cellspacing="0"><tr>${ratingButtons}</tr></table>
        <p style="color:#9ca3af;font-size:13px;text-align:center;margin:28px 0 0 0;line-height:1.6;">Takes less than 60 seconds. Your feedback goes directly to our team.</p>
      </td></tr>
      <tr><td style="background:#1e293b;border-radius:0 0 16px 16px;padding:28px 44px;text-align:center;border-top:1px solid #334155;">
        <p style="color:#0e7490;font-size:14px;font-weight:700;margin:0 0 4px 0;letter-spacing:0.3px;">${params.companyName}</p>
        ${params.companyEmail ? `<p style="color:#94a3b8;font-size:13px;margin:0 0 2px 0;">${params.companyEmail}</p>` : ''}
        <p style="color:#475569;font-size:12px;margin:12px 0 0 0;line-height:1.6;">You received this email because you recently worked with us.<br>Thank you for your business.</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export default function ReviewsView() {
  const toast = useToast();
  const { profile } = useAuth();
  const canSeeAllRequests = profile?.can_see_all_review_requests ?? false;
  const isAdmin = profile?.role === 'admin';
  const [activeTab, setActiveTab] = useState<'dashboard' | 'satisfaction' | 'send' | 'history'>('dashboard');
  const [requests, setRequests] = useState<ReviewRequest[]>([]);
  const [satisfactionHistory, setSatisfactionHistory] = useState<SatisfactionRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [satContacts, setSatContacts] = useState<Contact[]>([]);
  const [satContactsLoading, setSatContactsLoading] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const satSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [sendMethod, setSendMethod] = useState<'satisfaction' | 'sms' | 'survey'>('satisfaction');

  // Customer Satisfaction form state
  const [staffProfiles, setStaffProfiles] = useState<StaffProfile[]>([]);
  const [satContact, setSatContact] = useState<Contact | null>(null);
  const [satSearchQuery, setSatSearchQuery] = useState('');
  const [satUseManual, setSatUseManual] = useState(false);
  const [satManualName, setSatManualName] = useState('');
  const [satManualEmail, setSatManualEmail] = useState('');
  const [satSalesRepId, setSatSalesRepId] = useState(profile?.id ?? '');
  const [satLeadTechId, setSatLeadTechId] = useState('');
  const [satSending, setSatSending] = useState(false);
  const [satSuccess, setSatSuccess] = useState(false);
  const [stats, setStats] = useState({
    totalSent: 0,
    emailsOpened: 0,
    linksClicked: 0,
    reviewsCompleted: 0,
    openRate: 0,
    clickRate: 0,
    conversionRate: 0
  });

  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState<EmailPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const [sendSuccessOverlay, setSendSuccessOverlay] = useState<{ visible: boolean; name: string; method: string } | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showSuccessAnimation(name: string, method: string) {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSendSuccessOverlay({ visible: true, name, method });
    successTimerRef.current = setTimeout(() => setSendSuccessOverlay(null), 4500);
  }
  const [personalNote, setPersonalNote] = useState('');
  const [editedSubject, setEditedSubject] = useState('');

  useEffect(() => {
    loadReviewRequests();
    generateQRCode();
    loadStaffProfiles();
  }, []);

  async function loadStaffProfiles() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .not('full_name', 'is', null)
        .order('full_name');
      setStaffProfiles(data || []);
    } catch {
      // silently ignore
    }
  }

  useEffect(() => {
    if (staffProfiles.length > 0 && profile?.id && !satSalesRepId) {
      const isMember = staffProfiles.some(p => p.id === profile.id);
      if (isMember) setSatSalesRepId(profile.id);
    }
  }, [staffProfiles, profile?.id]);

  async function sendSatisfactionSurvey() {
    const email = satUseManual ? satManualEmail : satContact?.email;
    const name = satUseManual ? satManualName : satContact?.contact_name;
    if (!email) { toast.warning('Please provide a customer email address.'); return; }
    if (!email.includes('@')) { toast.warning('Please enter a valid email address.'); return; }

    setSatSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const salesRep = staffProfiles.find(p => p.id === satSalesRepId);
      const leadTech = staffProfiles.find(p => p.id === satLeadTechId);

      const body = {
        contactId: !satUseManual && satContact ? satContact.id : undefined,
        customerName: name || '',
        customerEmail: email,
        salesRepId: satSalesRepId || undefined,
        salesRepName: salesRep?.full_name || '',
        leadTechId: satLeadTechId || undefined,
        leadTechName: leadTech?.full_name || '',
        appUrl: window.location.origin,
      };

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-satisfaction-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Failed to send (${response.status})`);
      }

      const sentName = satUseManual ? (satManualName || satManualEmail) : (satContact?.contact_name || email);
      setSatSuccess(true);
      setSatContact(null);
      setSatSearchQuery('');
      setSatUseManual(false);
      setSatManualName('');
      setSatManualEmail('');
      setSatSalesRepId(profile?.id ?? '');
      setSatLeadTechId('');
      setTimeout(() => setSatSuccess(false), 4000);
      showSuccessAnimation(sentName || 'Customer', 'Satisfaction Survey');
    } catch (error: any) {
      toast.error(`Failed to send: ${error.message || 'Please try again.'}`);
    } finally {
      setSatSending(false);
    }
  }

  async function fetchSatisfactionPreview() {
    setLoadingPreview(true);
    try {
      const customerName = satUseManual
        ? (satManualName || 'Valued Customer')
        : (satContact?.contact_name || 'Valued Customer');

      const settingsRes = await supabase
        .from('company_settings')
        .select('company_name, company_email, company_logo_url')
        .maybeSingle();

      const settings = settingsRes.data || { company_name: 'Your Company', company_email: '', company_logo_url: '' };

      const subject = `How did we do, ${customerName}?`;
      const html = buildSatisfactionEmailPreview({
        customerName,
        companyName: settings.company_name,
        companyEmail: settings.company_email || '',
        companyLogoUrl: settings.company_logo_url || '',
      });

      const recipientEmail = satUseManual ? satManualEmail : (satContact?.email || '');
      setPreviewData({ subject, html, recipientEmail, recipientName: customerName });
      setEditedSubject(subject);
      setPersonalNote('');
      setEditMode(false);
      setShowPreview(true);
    } catch (err) {
      console.error('Error building satisfaction preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function loadReviewRequests() {
    try {
      const [reviewsRes, satisfactionRes] = await Promise.all([
        supabase
          .from('review_requests')
          .select(`
            *,
            contacts(id, contact_name, company_name, email, phone),
            profiles(full_name)
          `)
          .order('sent_at', { ascending: false }),
        supabase
          .from('customer_satisfaction')
          .select(`
            id, customer_name, customer_email, sales_rep_name, lead_tech_name,
            rating, comment, sent_at, responded_at, created_by, follow_up_sent_at,
            profiles!created_by(full_name)
          `)
          .order('sent_at', { ascending: false }),
      ]);

      if (reviewsRes.error) throw reviewsRes.error;

      setRequests(reviewsRes.data || []);
      calculateStats(reviewsRes.data || []);
      setSatisfactionHistory((satisfactionRes.data || []) as unknown as SatisfactionRecord[]);
    } catch (error) {
      console.error('Error loading review requests:', error);
    }
  }

  const searchContacts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setContacts([]);
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, contact_name, company_name, email, phone')
        .not('email', 'is', null)
        .or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('contact_name')
        .limit(20);
      setContacts(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const searchSatContacts = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSatContacts([]);
      setSatContactsLoading(false);
      return;
    }
    setSatContactsLoading(true);
    try {
      const { data } = await supabase
        .from('contacts')
        .select('id, contact_name, company_name, email, phone')
        .not('email', 'is', null)
        .or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%`)
        .order('contact_name')
        .limit(20);
      setSatContacts(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    } finally {
      setSatContactsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchContacts(searchQuery), 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchQuery, searchContacts]);

  useEffect(() => {
    if (satSearchDebounceRef.current) clearTimeout(satSearchDebounceRef.current);
    satSearchDebounceRef.current = setTimeout(() => searchSatContacts(satSearchQuery), 250);
    return () => { if (satSearchDebounceRef.current) clearTimeout(satSearchDebounceRef.current); };
  }, [satSearchQuery, searchSatContacts]);

  function calculateStats(data: ReviewRequest[]) {
    const totalSent = data.length;
    const emailsOpened = data.filter(r => r.email_opened).length;
    const linksClicked = data.filter(r => r.link_clicked).length;
    const reviewsCompleted = data.filter(r => r.review_completed).length;

    setStats({
      totalSent,
      emailsOpened,
      linksClicked,
      reviewsCompleted,
      openRate: totalSent > 0 ? (emailsOpened / totalSent) * 100 : 0,
      clickRate: totalSent > 0 ? (linksClicked / totalSent) * 100 : 0,
      conversionRate: totalSent > 0 ? (reviewsCompleted / totalSent) * 100 : 0
    });
  }

  async function generateQRCode() {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(REVIEW_URL)}`;
    setQrCodeUrl(qrUrl);
  }

  function getRecipientInfo() {
    if (useManualEntry) {
      return {
        email: manualEmail,
        name: manualName || 'Valued Customer',
      };
    }
    return {
      email: selectedContact?.email || '',
      name: selectedContact?.contact_name || 'Valued Customer',
    };
  }

  async function fetchEmailPreviewForMethod(method: 'survey') {
    setLoadingPreview(true);
    try {
      const templateType = 'job_completion_survey';
      const { email: recipientEmail, name: recipientName } = getRecipientInfo();

      const [templateRes, settingsRes] = await Promise.all([
        supabase
          .from('email_templates')
          .select('subject, body')
          .eq('template_type', templateType)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('company_settings')
          .select('company_name, company_email, company_logo_url, company_website')
          .maybeSingle(),
      ]);

      const settings = settingsRes.data || { company_name: 'Electronic Life', company_email: '', company_logo_url: '', company_website: '' };
      const placeholders: Record<string, string> = {
        customer_name: recipientName,
        customer_first_name: recipientName,
        company_name: settings.company_name,
        review_url: REVIEW_URL,
        company_website: (settings as any).company_website || '',
      };

      const subject = templateRes.data ? replacePlaceholders(templateRes.data.subject, placeholders) : `How did we do, ${recipientName}?`;
      const html = buildJobSurveyEmailPreview({ customerName: recipientName, companyName: settings.company_name, companyEmail: settings.company_email || '', companyLogoUrl: settings.company_logo_url || '', reviewUrl: REVIEW_URL, companyWebsite: (settings as any).company_website || '' });

      setPreviewData({ subject, html, recipientEmail, recipientName });
      setEditedSubject(subject);
      setPersonalNote('');
      setEditMode(false);
      setShowPreview(true);
    } catch (err) {
      console.error('Error building preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function fetchEmailPreview() {
    setLoadingPreview(true);
    try {
      const templateType = sendMethod === 'survey' ? 'job_completion_survey' : 'review_request';
      const { email: recipientEmail, name: recipientName } = getRecipientInfo();

      const [templateRes, settingsRes] = await Promise.all([
        supabase
          .from('email_templates')
          .select('subject, body')
          .eq('template_type', templateType)
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('company_settings')
          .select('company_name, company_email, company_logo_url, company_website')
          .maybeSingle(),
      ]);

      const settings = settingsRes.data || {
        company_name: 'Electronic Life',
        company_email: '',
        company_logo_url: '',
        company_website: '',
      };

      const placeholders: Record<string, string> = {
        customer_name: recipientName,
        customer_first_name: recipientName,
        company_name: settings.company_name,
        review_url: REVIEW_URL,
        company_website: (settings as any).company_website || '',
      };

      let subject: string;
      let html: string;
      if (sendMethod === 'survey') {
        subject = templateRes.data ? replacePlaceholders(templateRes.data.subject, placeholders) : `How did we do, ${recipientName}?`;
        html = buildJobSurveyEmailPreview({
          customerName: recipientName,
          companyName: settings.company_name,
          companyEmail: settings.company_email || '',
          companyLogoUrl: settings.company_logo_url || '',
          reviewUrl: REVIEW_URL,
          companyWebsite: (settings as any).company_website || '',
        });
      } else {
        subject = `How did we do, ${recipientName}?`;
        html = buildJobSurveyEmailPreview({
          customerName: recipientName,
          companyName: settings.company_name,
          companyEmail: settings.company_email || '',
          companyLogoUrl: settings.company_logo_url || '',
          reviewUrl: REVIEW_URL,
          companyWebsite: (settings as any).company_website || '',
        });
      }

      setPreviewData({ subject, html, recipientEmail, recipientName });
      setEditedSubject(subject);
      setPersonalNote('');
      setEditMode(false);
      setShowPreview(true);
    } catch (err) {
      console.error('Error building preview:', err);
    } finally {
      setLoadingPreview(false);
    }
  }

  function injectNoteIntoHtml(html: string, note: string): string {
    if (!note.trim()) return html;
    const noteBlock = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="background:#f8fafc;border-left:4px solid #06b6d4;border-radius:0 8px 8px 0;padding:16px 20px;">
            <p style="color:#0c4a6e;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px 0;">Personal Note</p>
            <p style="color:#374151;font-size:15px;line-height:1.7;margin:0;white-space:pre-wrap;">${note.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
          </td>
        </tr>
      </table>`;
    const insertBefore = '<p style="color:#111827;font-size:19px;font-weight:600;margin:0 0 20px 0;">';
    if (html.includes(insertBefore)) {
      return html.replace(insertBefore, noteBlock + insertBefore);
    }
    return html.replace('</body>', noteBlock + '</body>');
  }

  async function sendReviewRequest() {
    const isSurvey = sendMethod === 'survey';

    if (isSurvey) {
      if (useManualEntry) {
        if (!manualEmail) { toast.warning('Please enter an email address'); return; }
        if (!manualEmail.includes('@')) { toast.warning('Please enter a valid email address'); return; }
      } else {
        if (!selectedContact) { toast.warning('Please select a contact'); return; }
      }
    } else if (sendMethod === 'sms') {
      if (useManualEntry) {
        if (!manualPhone) { toast.warning('Please enter a phone number'); return; }
      } else {
        if (!selectedContact) { toast.warning('Please select a contact'); return; }
      }
    }

    setSending(true);
    try {
      const requestBody: any = {
        reviewUrl: REVIEW_URL,
        personalNote: personalNote.trim() || undefined,
        customSubject: editedSubject && editedSubject !== previewData?.subject ? editedSubject : undefined,
      };

      if (useManualEntry) {
        if (isSurvey) {
          requestBody.email = manualEmail;
          requestBody.name = manualName;
        } else {
          requestBody.phone = manualPhone;
          requestBody.name = manualName;
        }
      } else {
        requestBody.contactId = selectedContact?.id;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      let functionName: string;
      if (isSurvey) {
        functionName = 'send-job-completion-survey';
      } else {
        functionName = 'send-review-request-sms';
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to send (${response.status})`);
      }

      const { error: insertError } = await supabase
        .from('review_requests')
        .insert({
          contact_id: useManualEntry ? null : selectedContact?.id,
          recipient_email: isEmailBased && useManualEntry ? manualEmail : null,
          recipient_name: useManualEntry ? manualName : null,
          sent_by: profile?.id,
          method: isSurvey ? 'survey' : sendMethod
        });

      if (insertError) throw insertError;

      const sentName = useManualEntry
        ? (manualName || manualEmail || manualPhone)
        : (selectedContact?.contact_name || '');
      const sentMethod = isSurvey ? 'Job Completion Survey' : 'SMS Review Request';

      setShowPreview(false);
      setPreviewData(null);
      setSelectedContact(null);
      setManualEmail('');
      setManualName('');
      setManualPhone('');
      loadReviewRequests();
      showSuccessAnimation(sentName || 'Customer', sentMethod);
    } catch (error: any) {
      console.error('Error sending review request:', error);
      toast.error(`Failed to send review request: ${error.message || 'Please try again.'}`);
    } finally {
      setSending(false);
    }
  }

  async function recordQRCodeUse() {
    try {
      const { error } = await supabase
        .from('review_requests')
        .insert({
          contact_id: null,
          sent_by: profile?.id,
          method: 'qr_code',
          notes: 'QR code displayed to customer'
        });

      if (error) throw error;
      loadReviewRequests();
    } catch (error) {
      console.error('Error recording QR code use:', error);
    }
  }

  async function deleteReviewRequest(id: string) {
    toast.confirm('Delete this review request from history? This cannot be undone.', async () => {
      try {
        const { error } = await supabase.from('review_requests').delete().eq('id', id);
        if (error) throw error;
        await loadReviewRequests();
      } catch (error) {
        console.error('Error deleting review request:', error);
        toast.error('Failed to delete review request. Please try again.');
      }
    }, 'Delete Review Request?');
  }

  async function deleteSatisfactionRecord(id: string) {
    toast.confirm('Delete this satisfaction survey record from history? This cannot be undone.', async () => {
      try {
        const { error } = await supabase.from('customer_satisfaction').delete().eq('id', id);
        if (error) throw error;
        await loadReviewRequests();
      } catch (error) {
        console.error('Error deleting satisfaction record:', error);
        toast.error('Failed to delete satisfaction record. Please try again.');
      }
    }, 'Delete Satisfaction Record?');
  }

  async function resendSatisfactionSurvey(record: SatisfactionRecord) {
    toast.confirm(`Resend satisfaction survey to ${record.customer_name || record.customer_email}?`, async () => {
      setSending(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-satisfaction-email`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resendRecordId: record.id,
            appUrl: window.location.origin,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to resend (${response.status})`);
        }

        toast.success('Satisfaction survey resent successfully!');
      } catch (error: any) {
        console.error('Error resending satisfaction survey:', error);
        toast.error(`Failed to resend: ${error.message || 'Please try again.'}`);
      } finally {
        setSending(false);
      }
    }, 'Resend Survey?');
  }

  async function resendReviewRequest(request: ReviewRequest) {
    toast.confirm('Resend review request to this customer?', async () => {
      setSending(true);
      try {
        const requestBody: any = {
          reviewUrl: REVIEW_URL
        };

        if (request.contact_id && request.contacts) {
          requestBody.contactId = request.contact_id;
        } else if (request.recipient_email) {
          requestBody.email = request.recipient_email;
          requestBody.name = request.recipient_name;
        } else {
          throw new Error('No recipient information available');
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          throw new Error('Not authenticated');
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-review-request`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to resend review request (${response.status})`);
        }

        const { error: insertError } = await supabase
          .from('review_requests')
          .insert({
            contact_id: request.contact_id,
            recipient_email: request.recipient_email,
            recipient_name: request.recipient_name,
            sent_by: profile?.id,
            method: 'email'
          });

        if (insertError) throw insertError;

        toast.success('Review request resent successfully!');
        loadReviewRequests();
      } catch (error: any) {
        console.error('Error resending review request:', error);
        toast.error(`Failed to resend review request: ${error.message || 'Please try again.'}`);
      } finally {
        setSending(false);
      }
    }, 'Resend Review Request?');
  }

  const isSendDisabled =
    sending ||
    (sendMethod === 'survey' && !selectedContact && !manualEmail) ||
    (sendMethod === 'sms' && !selectedContact && !manualPhone);

  const isPreviewDisabled =
    loadingPreview ||
    (sendMethod === 'survey' && !selectedContact && !manualEmail);

  const filteredContacts = contacts;

  const PARTICLES = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * 360;
    const distance = 80 + (i % 3) * 30;
    const x = Math.cos((angle * Math.PI) / 180) * distance;
    const y = Math.sin((angle * Math.PI) / 180) * distance;
    const colors = ['#f59e0b', '#10b981', '#3b82f6', '#f97316', '#a3e635', '#38bdf8'];
    const color = colors[i % colors.length];
    return { x, y, color, delay: i * 0.04 };
  });

  return (
    <div className="space-y-6">

      {/* Success Overlay */}
      {sendSuccessOverlay && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ animation: 'fadeInOverlay 0.2s ease-out' }}
        >
          <style>{`
            @keyframes fadeInOverlay { from { opacity:0 } to { opacity:1 } }
            @keyframes popIn { 0% { transform:scale(0.5); opacity:0 } 60% { transform:scale(1.08) } 100% { transform:scale(1); opacity:1 } }
            @keyframes flyOut {
              0% { transform:translate(0,0) scale(1); opacity:1 }
              100% { transform:translate(var(--tx),var(--ty)) scale(0); opacity:0 }
            }
            @keyframes checkPop { 0%{transform:scale(0) rotate(-15deg);opacity:0} 60%{transform:scale(1.2) rotate(3deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
            @keyframes slideUp { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
            @keyframes shrinkOut { 0%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
          `}</style>

          <div className="relative" style={{ animation: 'shrinkOut 4.5s ease forwards' }}>
            {/* Particles */}
            {PARTICLES.map((p, i) => (
              <div
                key={i}
                className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full"
                style={{
                  background: p.color,
                  ['--tx' as string]: `${p.x}px`,
                  ['--ty' as string]: `${p.y}px`,
                  animation: `flyOut 0.8s cubic-bezier(0.2,0.8,0.4,1) ${p.delay}s both`,
                  marginLeft: -6,
                  marginTop: -6,
                }}
              />
            ))}

            {/* Card */}
            <div
              className="relative bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl px-10 py-8 text-center pointer-events-auto"
              style={{ animation: 'popIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both', minWidth: 300 }}
            >
              <button
                onClick={() => setSendSuccessOverlay(null)}
                className="absolute top-3 right-3 text-gray-600 hover:text-gray-400 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              <div
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-900/40 border-2 border-green-500 mb-5"
                style={{ animation: 'checkPop 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s both' }}
              >
                <CheckCircle className="w-10 h-10 text-green-400" />
              </div>

              <div style={{ animation: 'slideUp 0.35s ease 0.3s both' }}>
                <p className="text-2xl font-bold text-white mb-1">Sent!</p>
                <p className="text-gray-300 text-base font-medium mb-1">
                  {sendSuccessOverlay.name}
                </p>
                <p className="text-gray-500 text-sm">
                  {sendSuccessOverlay.method}
                </p>
              </div>

              <div
                className="mt-5 flex items-center justify-center gap-1.5"
                style={{ animation: 'slideUp 0.35s ease 0.45s both' }}
              >
                {[1,2,3,4,5].map(i => (
                  <Star key={i} className="w-4 h-4 text-amber-400 fill-amber-400" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-500 to-orange-500 rounded-lg p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-8 h-8" />
          <h1 className="text-2xl font-bold">Reviews</h1>
        </div>
        <p className="text-yellow-50">Request and track customer reviews to build your online reputation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'dashboard'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <TrendingUp className="w-4 h-4 inline mr-2" />
          Reviews
        </button>
        <button
          onClick={() => setActiveTab('satisfaction')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'satisfaction'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <ThumbsUp className="w-4 h-4 inline mr-2" />
          Satisfaction
        </button>
        <button
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'send'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Send className="w-4 h-4 inline mr-2" />
          Send Request
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors whitespace-nowrap ${
            activeTab === 'history'
              ? 'text-yellow-400 border-b-2 border-yellow-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Calendar className="w-4 h-4 inline mr-2" />
          History
        </button>
      </div>

      {/* Satisfaction Tab */}
      {activeTab === 'satisfaction' && (
        <CustomerSatisfactionDashboard />
      )}

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Total Requests</span>
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-white">{stats.totalSent}</div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Open Rate</span>
                <Eye className="w-5 h-5 text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-white">{stats.openRate.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-1">{stats.emailsOpened} opened</div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Click Rate</span>
                <ExternalLink className="w-5 h-5 text-green-400" />
              </div>
              <div className="text-3xl font-bold text-white">{stats.clickRate.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-1">{stats.linksClicked} clicked</div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-sm">Conversion Rate</span>
                <Star className="w-5 h-5 text-yellow-400" />
              </div>
              <div className="text-3xl font-bold text-white">{stats.conversionRate.toFixed(1)}%</div>
              <div className="text-xs text-gray-500 mt-1">{stats.reviewsCompleted} reviews</div>
            </div>
          </div>

          {/* QR Code Section */}
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <QrCode className="w-6 h-6 text-yellow-400" />
              <h2 className="text-xl font-bold text-white">QR Code for In-Person Requests</h2>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="bg-white p-4 rounded-lg">
                {qrCodeUrl && <img src={qrCodeUrl} alt="Review QR Code" className="w-64 h-64" />}
              </div>
              <div className="flex-1 space-y-4">
                <p className="text-gray-300">
                  Show this QR code to customers to request a review in person. They can scan it with their phone camera to go directly to your Google review page.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => window.open(qrCodeUrl, '_blank')}
                    className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Download QR Code
                  </button>
                  <button
                    onClick={recordQRCodeUse}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                  >
                    Record Usage
                  </button>
                </div>
                <div className="text-sm text-gray-400 bg-gray-900 p-3 rounded">
                  <strong className="text-gray-300">Review Link:</strong><br />
                  <a href={REVIEW_URL} target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:underline break-all">
                    {REVIEW_URL}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Request Tab */}
      {activeTab === 'send' && (
        <div className="space-y-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Send Review Request</h2>

            {/* Send Method Selection */}
            <div className="mb-2">
              <p className="text-xs text-gray-400 mb-3">
                Choose a method below. Survey and SMS requests are tracked on the History tab.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mb-6">
                {/* Customer Satisfaction Survey */}
                <div className={`rounded-xl border-2 transition-all ${sendMethod === 'satisfaction' ? 'bg-blue-900/30 border-blue-500 shadow-lg shadow-blue-900/20' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                  <button
                    onClick={() => setSendMethod('satisfaction')}
                    className="text-left p-4 w-full"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${sendMethod === 'satisfaction' ? 'bg-blue-600' : 'bg-gray-700'}`}>
                        <ThumbsUp className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold text-sm ${sendMethod === 'satisfaction' ? 'text-blue-300' : 'text-gray-200'}`}>
                        Satisfaction Survey
                      </span>
                      {sendMethod === 'satisfaction' && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      A 4-button rating email (Excellent / Good / Okay / Needs Attention). Happy customers are directed to Google. Unhappy responses alert your team.
                    </p>
                  </button>
                  <div className="px-4 pb-3">
                    <button
                      onClick={e => { e.stopPropagation(); fetchSatisfactionPreview(); }}
                      disabled={loadingPreview}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-cyan-400 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Eye className="w-3.5 h-3.5 group-hover:text-cyan-400" />
                      Preview email
                    </button>
                  </div>
                </div>

                {/* Job Completion Survey */}
                <div className={`rounded-xl border-2 transition-all ${sendMethod === 'survey' ? 'bg-amber-900/30 border-amber-500 shadow-lg shadow-amber-900/20' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                  <button
                    onClick={() => setSendMethod('survey')}
                    className="text-left p-4 w-full"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${sendMethod === 'survey' ? 'bg-amber-600' : 'bg-gray-700'}`}>
                        <ClipboardList className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold text-sm ${sendMethod === 'survey' ? 'text-amber-300' : 'text-gray-200'}`}>
                        Job Completion Survey
                      </span>
                      {sendMethod === 'survey' && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      A longer "How did we do?" email — best sent after a job is completed. Same Google review link, more professional tone.
                    </p>
                  </button>
                  <div className="px-4 pb-3">
                    <button
                      onClick={e => { e.stopPropagation(); fetchEmailPreviewForMethod('survey'); }}
                      disabled={loadingPreview}
                      className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-cyan-400 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Eye className="w-3.5 h-3.5 group-hover:text-cyan-400" />
                      Preview email
                    </button>
                  </div>
                </div>

                {/* SMS / Text */}
                <div className={`rounded-xl border-2 transition-all ${sendMethod === 'sms' ? 'bg-green-900/30 border-green-500 shadow-lg shadow-green-900/20' : 'bg-gray-900 border-gray-700 hover:border-gray-500'}`}>
                  <button
                    onClick={() => setSendMethod('sms')}
                    className="text-left p-4 w-full"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`p-1.5 rounded-lg ${sendMethod === 'sms' ? 'bg-green-600' : 'bg-gray-700'}`}>
                        <MessageSquare className="w-4 h-4 text-white" />
                      </div>
                      <span className={`font-semibold text-sm ${sendMethod === 'sms' ? 'text-green-300' : 'text-gray-200'}`}>
                        SMS / Text
                      </span>
                      {sendMethod === 'sms' && (
                        <span className="ml-auto w-2 h-2 rounded-full bg-green-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      A direct text message with your Google review link. Great for customers who prefer texting over email. Requires Twilio setup.
                    </p>
                  </button>
                  <div className="px-4 pb-3">
                    <span className="flex items-center gap-1.5 text-xs text-gray-600 cursor-default select-none">
                      <Eye className="w-3.5 h-3.5" />
                      No preview for SMS
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Satisfaction Survey Form */}
            {sendMethod === 'satisfaction' && (
              <div className="space-y-4">
                {satSuccess && (
                  <div className="flex items-center gap-3 p-4 bg-green-900/30 border border-green-600/50 rounded-xl text-green-300">
                    <Check className="w-5 h-5 shrink-0" />
                    <span className="font-medium">Satisfaction survey sent successfully!</span>
                  </div>
                )}

                {/* Contact toggle */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setSatUseManual(false); setSatContact(null); setSatSearchQuery(''); }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!satUseManual ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    <Users className="w-4 h-4 inline mr-2" />
                    Select from Contacts
                  </button>
                  <button
                    onClick={() => { setSatUseManual(true); setSatContact(null); }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${satUseManual ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
                  >
                    <UserPlus className="w-4 h-4 inline mr-2" />
                    Enter Manually
                  </button>
                </div>

                {!satUseManual ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={satSearchQuery}
                        onChange={e => setSatSearchQuery(e.target.value)}
                        placeholder="Search contacts..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {satContactsLoading ? (
                        <div className="flex items-center justify-center py-6 text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span className="text-sm">Searching...</span>
                        </div>
                      ) : !satSearchQuery.trim() ? (
                        <div className="text-center py-6 text-gray-500 text-sm">Type to search contacts</div>
                      ) : satContacts.length === 0 ? (
                        <div className="text-center py-6 text-gray-500 text-sm">No contacts found</div>
                      ) : satContacts.map(contact => (
                        <button
                          key={contact.id}
                          onClick={() => setSatContact(contact)}
                          className={`w-full text-left p-3 rounded-lg border transition-colors ${satContact?.id === contact.id ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-900 border-gray-700 hover:border-gray-600'}`}
                        >
                          <div className="font-medium text-white text-sm">{contact.contact_name}</div>
                          {contact.company_name && <div className="text-xs text-gray-400">{contact.company_name}</div>}
                          <div className="text-xs text-gray-500">{contact.email}</div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Customer Name (Optional)</label>
                      <input
                        type="text"
                        value={satManualName}
                        onChange={e => setSatManualName(e.target.value)}
                        placeholder="Customer name..."
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Email Address <span className="text-red-400">*</span></label>
                      <input
                        type="email"
                        value={satManualEmail}
                        onChange={e => setSatManualEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {/* Sales Rep + Lead Tech */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Sales Rep (Optional)</label>
                    <select
                      value={satSalesRepId}
                      onChange={e => setSatSalesRepId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- None --</option>
                      {staffProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Lead Tech (Optional)</label>
                    <select
                      value={satLeadTechId}
                      onChange={e => setSatLeadTechId(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">-- None --</option>
                      {staffProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  onClick={sendSatisfactionSurvey}
                  disabled={satSending || (!satContact && !satManualEmail)}
                  className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {satSending ? (
                    <><Loader2 className="w-5 h-5 animate-spin" />Sending...</>
                  ) : (
                    <><ThumbsUp className="w-5 h-5" />Send Satisfaction Survey</>
                  )}
                </button>
              </div>
            )}

            {/* Toggle between contact and manual entry (for survey/sms methods) */}
            {sendMethod !== 'satisfaction' && (
              <>
                <div className="flex gap-2 mb-6">
                  <button
                    onClick={() => {
                      setUseManualEntry(false);
                      setManualEmail('');
                      setManualName('');
                      setSelectedContact(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      !useManualEntry
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <Users className="w-4 h-4 inline mr-2" />
                    Select from Contacts
                  </button>
                  <button
                    onClick={() => {
                      setUseManualEntry(true);
                      setSelectedContact(null);
                    }}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      useManualEntry
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                  >
                    <UserPlus className="w-4 h-4 inline mr-2" />
                    Enter Email Manually
                  </button>
                </div>

                {!useManualEntry ? (
                  <>
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-300 mb-2">Select Contact</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search contacts by name, company, or email..."
                          className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto space-y-2 mb-4">
                      {contactsLoading ? (
                        <div className="flex items-center justify-center py-8 text-gray-400">
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          <span className="text-sm">Searching...</span>
                        </div>
                      ) : !searchQuery.trim() ? (
                        <div className="text-center py-8 text-gray-400 text-sm">
                          Type a name, company, or email to search
                        </div>
                      ) : filteredContacts.length === 0 ? (
                        <div className="text-center py-8 text-gray-400">
                          No contacts found with email addresses
                        </div>
                      ) : filteredContacts.map(contact => (
                        <button
                          key={contact.id}
                          onClick={() => setSelectedContact(contact)}
                          className={`w-full text-left p-4 rounded-lg border transition-colors ${
                            selectedContact?.id === contact.id
                              ? 'bg-yellow-900/20 border-yellow-500'
                              : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="font-medium text-white">{contact.contact_name}</div>
                          {contact.company_name && (
                            <div className="text-sm text-gray-400">{contact.company_name}</div>
                          )}
                          <div className="text-sm text-gray-500">{contact.email}</div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="space-y-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Recipient Name (Optional)
                      </label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="Customer name..."
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                      />
                    </div>
                    {sendMethod === 'survey' ? (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Email Address <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="email"
                          value={manualEmail}
                          onChange={(e) => setManualEmail(e.target.value)}
                          placeholder="customer@example.com"
                          className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                          required
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Phone Number <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="tel"
                          value={manualPhone}
                          onChange={(e) => setManualPhone(e.target.value)}
                          placeholder="+1 (555) 123-4567"
                          className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="space-y-3">
                  <button
                    onClick={sendReviewRequest}
                    disabled={isSendDisabled}
                    className={`w-full px-6 py-3 text-white rounded-lg font-medium transition-colors disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                      sendMethod === 'survey' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {sendMethod === 'sms' ? <MessageSquare className="w-5 h-5" /> : <ClipboardList className="w-5 h-5" />}
                    {sending
                      ? 'Sending...'
                      : sendMethod === 'survey'
                        ? 'Send Job Completion Survey'
                        : 'Send via SMS'
                    }
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {!canSeeAllRequests && (
            <div className="px-6 py-3 bg-blue-900/30 border-b border-blue-700/50 flex items-center gap-2 text-sm text-blue-300">
              <Eye className="w-4 h-4" />
              <span>Showing only your review requests. Contact admin for full access.</span>
            </div>
          )}
          {(() => {
            const now = Date.now();
            const followUpCount =
              requests.filter(r => !r.review_completed && (now - new Date(r.sent_at).getTime()) >= 14 * 24 * 60 * 60 * 1000).length +
              satisfactionHistory.filter(r => !r.rating && (now - new Date(r.sent_at).getTime()) >= 14 * 24 * 60 * 60 * 1000).length;
            return followUpCount > 0 ? (
              <div className="px-6 py-3 bg-amber-900/25 border-b border-amber-700/50 flex items-center gap-2 text-sm text-amber-300">
                <RefreshCw className="w-4 h-4 flex-shrink-0" />
                <span>
                  <span className="font-semibold">{followUpCount} request{followUpCount !== 1 ? 's' : ''}</span> sent over 2 weeks ago with no response — consider sending a follow-up.
                </span>
              </div>
            ) : null;
          })()}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Method
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Sent By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Sent
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status / Submitted
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {requests.map(request => {
                  const sentMs = new Date(request.sent_at).getTime();
                  const daysSince = Math.floor((Date.now() - sentMs) / (1000 * 60 * 60 * 24));
                  const isFollowUpDue = !request.review_completed && daysSince >= 14;
                  return (
                  <tr key={`review-${request.id}`} className={`hover:bg-gray-750 ${isFollowUpDue ? 'bg-amber-950/20' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {request.contacts?.contact_name || request.recipient_name || 'Unknown'}
                      </div>
                      {(request.contacts?.email || request.recipient_email) && (
                        <div className="text-sm text-gray-400">
                          {request.contacts?.email || request.recipient_email}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {request.method === 'survey' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-900/40 text-amber-300 border border-amber-700/50">
                          Completion Survey
                        </span>
                      ) : request.method === 'email' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/40 text-blue-300">
                          Quick Email
                        </span>
                      ) : request.method === 'sms' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-900/40 text-green-300">
                          SMS
                        </span>
                      ) : request.method === 'qr_code' ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-700 text-gray-300">
                          QR Code
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-700 text-gray-300">
                          {request.method}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {request.profiles?.full_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-300">{new Date(request.sent_at).toLocaleDateString()}</div>
                      <div className="text-xs text-gray-500">{new Date(request.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      {isFollowUpDue && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-700/40 text-amber-300 border border-amber-600/40">
                            <RefreshCw className="w-2.5 h-2.5" />
                            {daysSince}d ago — follow up
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        {request.review_completed && (
                          <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                            <Check className="w-4 h-4" /> Completed
                          </span>
                        )}
                        {!request.review_completed && request.link_clicked && (
                          <span className="flex items-center gap-1 text-blue-400 text-xs font-medium">
                            <ExternalLink className="w-4 h-4" /> Clicked
                          </span>
                        )}
                        {!request.review_completed && !request.link_clicked && request.email_opened && (
                          <span className="flex items-center gap-1 text-yellow-400 text-xs font-medium">
                            <Eye className="w-4 h-4" /> Opened
                          </span>
                        )}
                        {!request.review_completed && !request.link_clicked && !request.email_opened && (
                          <span className="flex items-center gap-1 text-gray-500 text-xs font-medium">
                            <X className="w-4 h-4" /> Pending
                          </span>
                        )}
                        {request.follow_up_sent_at && (
                          <span className="flex items-center gap-1 text-teal-400 text-xs font-medium mt-0.5">
                            <Mail className="w-3.5 h-3.5" /> Auto Follow-up Sent
                          </span>
                        )}
                        {request.clicked_at && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {new Date(request.clicked_at).toLocaleDateString()} {new Date(request.clicked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {!request.review_completed && (
                          <button
                            onClick={() => resendReviewRequest(request)}
                            disabled={sending}
                            className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              isFollowUpDue
                                ? 'bg-amber-700/30 text-amber-300 border border-amber-600/50 hover:bg-amber-700/50 hover:text-amber-200'
                                : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20'
                            }`}
                            title={isFollowUpDue ? `${daysSince} days since last send — resend now` : 'Resend review request'}
                          >
                            <RefreshCw className="w-3 h-3" />
                            {isFollowUpDue ? 'Send Follow-up' : 'Resend'}
                          </button>
                        )}
                        <button
                          onClick={() => deleteReviewRequest(request.id)}
                          className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                          title="Delete from history"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {satisfactionHistory.map(record => {
                  const ratingColors: Record<string, string> = {
                    excellent: 'text-green-400',
                    good: 'text-blue-400',
                    okay: 'text-amber-400',
                    needs_attention: 'text-red-400',
                  };
                  const ratingLabels: Record<string, string> = {
                    excellent: 'Excellent',
                    good: 'Good',
                    okay: 'Okay',
                    needs_attention: 'Needs Attention',
                  };
                  const satSentMs = new Date(record.sent_at).getTime();
                  const satDaysSince = Math.floor((Date.now() - satSentMs) / (1000 * 60 * 60 * 24));
                  const isSatFollowUpDue = !record.rating && satDaysSince >= 14;
                  return (
                    <tr key={`sat-${record.id}`} className={`hover:bg-gray-750 ${isSatFollowUpDue ? 'bg-amber-950/20' : 'bg-blue-950/10'}`}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-white">{record.customer_name || 'Unknown'}</div>
                        {record.customer_email && (
                          <div className="text-sm text-gray-400">{record.customer_email}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/40 text-blue-300 border border-blue-700/50">
                          Satisfaction Survey
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        {record.profiles?.full_name || record.sales_rep_name || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-300">{new Date(record.sent_at).toLocaleDateString()}</div>
                        <div className="text-xs text-gray-500">{new Date(record.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        {isSatFollowUpDue && (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-700/40 text-amber-300 border border-amber-600/40">
                              <RefreshCw className="w-2.5 h-2.5" />
                              {satDaysSince}d ago — follow up
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {record.rating ? (
                            <span className={`flex items-center gap-1 text-xs font-medium ${ratingColors[record.rating] || 'text-gray-400'}`}>
                              <Check className="w-4 h-4" />
                              {ratingLabels[record.rating] || record.rating}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-gray-500 text-xs font-medium">
                              <X className="w-4 h-4" /> Awaiting Response
                            </span>
                          )}
                          {record.follow_up_sent_at && (
                            <span className="flex items-center gap-1 text-teal-400 text-xs font-medium mt-0.5">
                              <Mail className="w-3.5 h-3.5" /> Auto Follow-up Sent
                            </span>
                          )}
                          {record.responded_at && (
                            <div className="text-xs text-gray-500 mt-0.5">
                              {new Date(record.responded_at).toLocaleDateString()} {new Date(record.responded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1">
                          {isAdmin && record.comment && (
                            <span className="text-gray-400 max-w-[140px] truncate block text-xs" title={record.comment}>
                              "{record.comment}"
                            </span>
                          )}
                          {!isAdmin && record.comment && (
                            <span className="text-gray-600 text-xs flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Admin only
                            </span>
                          )}
                          {!record.rating && (
                            <button
                              onClick={() => resendSatisfactionSurvey(record)}
                              disabled={sending}
                              className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded transition-colors w-fit disabled:opacity-50 disabled:cursor-not-allowed ${
                                isSatFollowUpDue
                                  ? 'bg-amber-700/30 text-amber-300 border border-amber-600/50 hover:bg-amber-700/50 hover:text-amber-200'
                                  : 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/20'
                              }`}
                              title={isSatFollowUpDue ? `${satDaysSince} days since last send — resend now` : 'Resend satisfaction survey'}
                            >
                              <RefreshCw className="w-3 h-3" />
                              {isSatFollowUpDue ? 'Send Follow-up' : 'Resend'}
                            </button>
                          )}
                          <button
                            onClick={() => deleteSatisfactionRecord(record.id)}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors w-fit"
                            title="Delete from history"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {requests.length === 0 && satisfactionHistory.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                      No review or satisfaction survey requests sent yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      {showPreview && previewData && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4">
          <div
            className="bg-gray-900 rounded-xl border border-gray-700 shadow-2xl flex flex-col w-full transition-all duration-300"
            style={{ height: '90vh', maxWidth: editMode ? '1100px' : '680px' }}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  {editMode ? (
                    <input
                      value={editedSubject}
                      onChange={e => setEditedSubject(e.target.value)}
                      className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-sm font-medium w-72 focus:outline-none focus:border-cyan-500 transition-colors"
                      placeholder="Email subject..."
                    />
                  ) : (
                    <p className="text-white font-semibold text-sm truncate">{editedSubject || previewData.subject}</p>
                  )}
                  <p className="text-gray-400 text-xs mt-0.5">
                    To: <span className="text-gray-300">{previewData.recipientEmail || previewData.recipientName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setEditMode(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    editMode
                      ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25'
                      : 'bg-gray-800 border-gray-600 text-gray-300 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  {editMode ? 'Hide Editor' : 'Edit / Add Note'}
                </button>
                <button
                  onClick={() => { setShowPreview(false); setPreviewData(null); setEditMode(false); setPersonalNote(''); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body: split when editing */}
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* Edit panel */}
              {editMode && (
                <div className="w-80 shrink-0 border-r border-gray-700 flex flex-col bg-gray-950 overflow-y-auto">
                  <div className="p-5 border-b border-gray-800">
                    <h3 className="text-white font-semibold text-sm mb-1">Personalize this email</h3>
                    <p className="text-gray-400 text-xs leading-relaxed">
                      Add a personal note that will appear at the top of the email body — great for referencing the specific job.
                    </p>
                  </div>

                  <div className="p-5 flex-1 flex flex-col gap-5">
                    {/* Subject line */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Subject Line</label>
                      <input
                        value={editedSubject}
                        onChange={e => setEditedSubject(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 transition-colors placeholder-gray-500"
                        placeholder="Email subject..."
                      />
                    </div>

                    {/* Personal note */}
                    <div className="flex-1 flex flex-col">
                      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Personal Note</label>
                      <textarea
                        value={personalNote}
                        onChange={e => setPersonalNote(e.target.value)}
                        rows={8}
                        className="flex-1 w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm resize-none focus:outline-none focus:border-cyan-500 transition-colors placeholder-gray-500 leading-relaxed"
                        placeholder={`Hi ${previewData.recipientName},\n\nJust wanted to personally reach out and say it was great working with you on the project last week...`}
                      />
                      <p className="text-gray-500 text-xs mt-2">{personalNote.length} characters</p>
                    </div>

                    {/* Tips */}
                    <div className="bg-gray-800/60 rounded-lg p-3 border border-gray-700/50">
                      <p className="text-cyan-400 text-xs font-semibold mb-1.5">Tips</p>
                      <ul className="text-gray-400 text-xs space-y-1 leading-relaxed">
                        <li>• Reference the specific job or project</li>
                        <li>• Mention something they said they loved</li>
                        <li>• Keep it short — 2–3 sentences is ideal</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview iframe */}
              <div className="flex-1 bg-white overflow-hidden">
                <iframe
                  srcDoc={injectNoteIntoHtml(previewData.html, personalNote)}
                  title="Email preview"
                  className="w-full h-full border-0"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 shrink-0">
              <p className="text-xs text-gray-500">Preview only — the review link will be personalized when sent.</p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setShowPreview(false); setPreviewData(null); setEditMode(false); setPersonalNote(''); }}
                  className="px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 border border-gray-600 font-medium text-sm transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={sendReviewRequest}
                  disabled={sending}
                  className={`px-6 py-2 rounded-lg text-white font-medium text-sm transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg ${
                    sendMethod === 'survey'
                      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/30'
                      : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-900/30'
                  }`}
                >
                  {sending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      {personalNote.trim() ? 'Send with Note' : 'Send Now'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
