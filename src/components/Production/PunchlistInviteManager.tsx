import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Mail,
  CheckCircle2,
  CheckCircle,
  X,
  User,
  Calendar,
  Building,
  Clock,
  AlertCircle,
  MessageSquare,
  Send,
  Plus,
  Search,
  Trash2,
  Eye,
  FileText,
  PlayCircle,
  CheckCheck,
  Star,
  TrendingUp,
  Sparkles,
  Users,
  PauseCircle,
  Link,
  Phone,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
} from 'lucide-react';
import { useToast } from '../Shared/Toast';
import { CompleteProjectModal, type UpcomingCustomer } from './CompleteProjectModal';

interface PendingInvite {
  id: string;
  contact_id: string;
  project_id: string;
  status: string;
  created_at: string;
  notes: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  project_name: string;
  project_number: string;
  substantial_completion_date: string;
  days_pending: number;
  decline_reason?: string;
}

interface PunchlistInviteManagerProps {
  openInviteCount?: number;
  onViewCustomerTasks?: (contactId: string, contactName: string, filterStatus: string) => void;
  onOpenSalesOrder?: (salesOrderId: string) => void;
}

/* ─── Customer Detail Modal ──────────────────────────────────────────────── */
function CustomerDetailModal({
  customer,
  accessLabel,
  accessIcon,
  accessColor,
  daysRemaining,
  isSuspended,
  onClose,
  onViewTasks,
  onResendEmail,
  onResendMagicLink,
  onSuspendToggle,
  onDelete,
  resendingEmail,
  resendingMagicLink,
}: {
  customer: any;
  accessLabel: string;
  accessIcon: React.ReactNode;
  accessColor: string;
  daysRemaining: number | null;
  isSuspended: boolean;
  onClose: () => void;
  onViewTasks: (status: string) => void;
  onResendEmail: () => void;
  onResendMagicLink: () => void;
  onSuspendToggle: () => void;
  onDelete: () => void;
  resendingEmail: boolean;
  resendingMagicLink: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const initials = customer.contact_name
    ?.split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

  const hasGrant = !!customer.grant_id;
  const isExpired = customer.status === 'expired';

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      style={{ animation: 'fadeInBg 0.15s ease' }}
    >
      <style>{`
        @keyframes fadeInBg{from{opacity:0}to{opacity:1}}
        @keyframes slideUpSheet{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
      `}</style>
      <div
        className="bg-gray-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden border-t border-gray-700/60 sm:border"
        style={{ animation: 'slideUpSheet 0.22s ease-out', maxHeight: '92dvh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-gray-600" />
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto" style={{ maxHeight: 'calc(92dvh - 20px)' }}>
          {/* Header */}
          <div className="px-5 pt-3 pb-4 flex items-start justify-between gap-3 border-b border-gray-800">
            <div className="flex items-center gap-3 min-w-0">
              {/* Avatar initials */}
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-white leading-tight truncate">{customer.contact_name}</h2>
                <div className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${accessColor}`}>
                  {accessIcon}
                  <span>{accessLabel}</span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Status banners */}
          {(isSuspended || isExpired) && (
            <div className={`mx-4 mt-3 px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              isSuspended ? 'bg-yellow-900/30 border border-yellow-700 text-yellow-300' : 'bg-orange-900/30 border border-orange-700 text-orange-300'
            }`}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {isSuspended ? 'Access is currently suspended' : 'Access has expired'}
            </div>
          )}

          {/* Contact info */}
          <div className="px-5 py-4 space-y-3">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Info</h3>
            {customer.contact_email ? (
              <a href={`mailto:${customer.contact_email}`} className="flex items-center gap-3 group py-2 -mx-1 px-1 rounded-xl hover:bg-gray-800/60 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Email</div>
                  <div className="text-sm text-gray-200 group-hover:text-blue-400 transition-colors truncate">{customer.contact_email}</div>
                </div>
              </a>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <div className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
                  <Mail className="w-4 h-4 text-gray-600" />
                </div>
                <span className="text-sm text-gray-600 italic">No email on file</span>
              </div>
            )}
            {customer.contact_phone && (
              <a href={`tel:${customer.contact_phone}`} className="flex items-center gap-3 group py-2 -mx-1 px-1 rounded-xl hover:bg-gray-800/60 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center flex-shrink-0">
                  <Phone className="w-4 h-4 text-green-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Phone</div>
                  <div className="text-sm text-gray-200 group-hover:text-green-400 transition-colors">{customer.contact_phone}</div>
                </div>
              </a>
            )}
            {customer.project_name && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-9 h-9 rounded-xl bg-gray-700/60 flex items-center justify-center flex-shrink-0">
                  <Building className="w-4 h-4 text-gray-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Project</div>
                  <div className="text-sm text-gray-200 truncate">{customer.project_name}</div>
                </div>
              </div>
            )}
            {daysRemaining !== null && !isSuspended && !isExpired && (
              <div className="flex items-center gap-3 py-2">
                <div className="w-9 h-9 rounded-xl bg-gray-700/60 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-4 h-4 text-gray-400" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Access Remaining</div>
                  <div className={`text-sm font-semibold ${daysRemaining <= 14 ? 'text-orange-400' : 'text-gray-200'}`}>
                    {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Task stats */}
          {customer.taskStats && customer.taskStats.total > 0 && (
            <div className="px-5 pb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Tasks</h3>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => { onViewTasks('all'); onClose(); }}
                  className="flex flex-col items-center py-3 bg-gray-800 hover:bg-gray-750 active:bg-gray-700 rounded-xl border border-gray-700 hover:border-blue-600 transition-colors"
                >
                  <span className="text-xl font-bold text-blue-400 truncate">{customer.taskStats.total}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Total</span>
                </button>
                <button
                  onClick={() => { onViewTasks('requested'); onClose(); }}
                  className="flex flex-col items-center py-3 bg-gray-800 hover:bg-gray-750 active:bg-gray-700 rounded-xl border border-gray-700 hover:border-yellow-600 transition-colors"
                >
                  <span className="text-xl font-bold text-yellow-400 truncate">{customer.taskStats.submitted}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Pending</span>
                </button>
                <button
                  onClick={() => { onViewTasks('completed'); onClose(); }}
                  className="flex flex-col items-center py-3 bg-gray-800 hover:bg-gray-750 active:bg-gray-700 rounded-xl border border-gray-700 hover:border-green-600 transition-colors"
                >
                  <span className="text-xl font-bold text-green-400 truncate">{customer.taskStats.completed}</span>
                  <span className="text-[10px] text-gray-500 mt-0.5">Done</span>
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="px-5 pb-6 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Actions</h3>

            {/* View Portal */}
            <button
              onClick={() => { window.open(`${window.location.origin}/portal/punchlist?contact=${customer.contact_id}&name=${encodeURIComponent(customer.contact_name)}`, '_blank'); }}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-2xl transition-colors font-semibold text-sm"
            >
              <Eye className="w-5 h-5 flex-shrink-0" />
              View Portal as Customer
            </button>

            {/* Resend Email */}
            <button
              onClick={onResendEmail}
              disabled={resendingEmail}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 hover:text-white rounded-2xl transition-colors font-medium text-sm border border-gray-700 disabled:opacity-50"
            >
              {resendingEmail
                ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                : <Mail className="w-5 h-5 flex-shrink-0 text-gray-400" />}
              Resend Welcome Email
            </button>

            {/* Resend Magic Link */}
            <button
              onClick={onResendMagicLink}
              disabled={resendingMagicLink}
              className="w-full flex items-center gap-3 px-4 py-3.5 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-gray-200 hover:text-white rounded-2xl transition-colors font-medium text-sm border border-gray-700 disabled:opacity-50"
            >
              {resendingMagicLink
                ? <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                : <Link className="w-5 h-5 flex-shrink-0 text-gray-400" />}
              Resend Magic Link
            </button>

            {/* Suspend / Resume */}
            {hasGrant && (
              <button
                onClick={onSuspendToggle}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-colors font-medium text-sm border ${
                  isSuspended
                    ? 'bg-green-900/30 hover:bg-green-900/50 active:bg-green-900/70 border-green-700 text-green-300'
                    : 'bg-yellow-900/20 hover:bg-yellow-900/40 active:bg-yellow-900/60 border-yellow-700/60 text-yellow-300'
                }`}
              >
                {isSuspended
                  ? <><PlayCircle className="w-5 h-5 flex-shrink-0" /> Resume Access</>
                  : <><PauseCircle className="w-5 h-5 flex-shrink-0" /> Suspend Access</>}
              </button>
            )}

            {/* Delete */}
            {hasGrant && (
              <button
                onClick={onDelete}
                className="w-full flex items-center gap-3 px-4 py-3.5 bg-red-900/20 hover:bg-red-900/40 active:bg-red-900/60 border border-red-800/60 text-red-400 hover:text-red-300 rounded-2xl transition-colors font-medium text-sm"
              >
                <Trash2 className="w-5 h-5 flex-shrink-0" />
                Delete Access & All Tasks
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Resend Confirmation Modal ──────────────────────────────────────────── */
function ResendConfirmModal({
  type,
  customer,
  onConfirm,
  onCancel,
  isSending,
}: {
  type: 'invite_email' | 'magic_link';
  customer: any;
  onConfirm: () => void;
  onCancel: () => void;
  isSending: boolean;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const isEmail = type === 'invite_email';

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-[60] p-4"
      onClick={onCancel}
      style={{ animation: 'fadeInBg 0.15s ease' }}
    >
      <style>{`@keyframes fadeInBg{from{opacity:0}to{opacity:1}} @keyframes slideUpModal{from{opacity:0;transform:translateY(12px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}`}</style>
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'slideUpModal 0.18s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Colored top band */}
        <div className={`h-1 w-full ${isEmail ? 'bg-gradient-to-r from-blue-500 to-cyan-400' : 'bg-gradient-to-r from-emerald-500 to-teal-400'}`} />

        <div className="p-5">
          {/* Icon + title */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isEmail ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
              {isEmail ? <Mail className="w-5 h-5" /> : <Link className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white leading-tight">
                {isEmail ? 'Resend Welcome Email' : 'Resend Magic Link'}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                {isEmail
                  ? `Send the full invite email to ${customer.contact_name}. They'll receive their portal link and access instructions.`
                  : `Send a fresh login link to ${customer.contact_name}. The previous link will still work until it expires.`}
              </p>
            </div>
          </div>

          {/* Recipient chip */}
          {customer.contact_email && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-4">
              <Mail className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <span className="text-xs text-gray-300 truncate">{customer.contact_email}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSending}
              className="flex-1 py-2 text-sm font-medium text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-xl transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSending}
              className={`flex-1 py-2 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60 ${
                isEmail
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-900/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/40'
              }`}
            >
              {isSending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {isEmail ? <Mail className="w-3.5 h-3.5" /> : <Link className="w-3.5 h-3.5" />}
                  {isEmail ? 'Send Email' : 'Send Link'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PunchlistInviteManager({ openInviteCount = 0, onViewCustomerTasks, onOpenSalesOrder }: PunchlistInviteManagerProps) {
  const toast = useToast();
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [pendingAcceptance, setPendingAcceptance] = useState<any[]>([]);
  const [activeAccess, setActiveAccess] = useState<any[]>([]);
  const [expiredAccess, setExpiredAccess] = useState<any[]>([]);
  const [declinedInvites, setDeclinedInvites] = useState<PendingInvite[]>([]);
  const [allCustomers, setAllCustomers] = useState<any[]>([]);
  const [accessTypeFilter, setAccessTypeFilter] = useState<'all' | 'vip_membership' | 'promotional' | 'test_and_tune' | 'test_and_tune_no_portal'>('all');
  const [selectedTab, setSelectedTab] = useState<'all' | 'pending' | 'awaiting' | 'active' | 'expired' | 'declined'>('all');
  const [loading, setLoading] = useState(true);
  const [declineReason, setDeclineReason] = useState('');
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [showCreateInvite, setShowCreateInvite] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [inviteNotes, setInviteNotes] = useState('');
  const [showNewContactForm, setShowNewContactForm] = useState(false);
  const [newContactData, setNewContactData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: ''
  });
  const [showSendConfirmation, setShowSendConfirmation] = useState(false);
  const [inviteToSend, setInviteToSend] = useState<PendingInvite | null>(null);
  const [editableEmail, setEditableEmail] = useState('');
  const [selectedInviteType, setSelectedInviteType] = useState<'test_and_tune' | 'test_and_tune_no_portal' | 'promotional' | 'vip_signup' | null>(null);
  const [inviteModalStep, setInviteModalStep] = useState<'type' | 'confirm'>('type');
  const [vipSignupLinkCopied, setVipSignupLinkCopied] = useState(false);
  const [showManualSendConfirmation, setShowManualSendConfirmation] = useState(false);
  const [manualInviteEmail, setManualInviteEmail] = useState('');
  const [manualInviteType, setManualInviteType] = useState<'test_and_tune' | 'test_and_tune_no_portal' | 'promotional' | 'vip_signup' | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [sendingManualInvite, setSendingManualInvite] = useState(false);
  const [resendingEmailFor, setResendingEmailFor] = useState<string | null>(null);
  const [resendingMagicLinkFor, setResendingMagicLinkFor] = useState<string | null>(null);
  const [sendSuccessOverlay, setSendSuccessOverlay] = useState<{ visible: boolean; name: string; type: 'send' | 'resend' | 'manual'; accessType?: string } | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emailPreview, setEmailPreview] = useState<{ subject: string; html: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [suspendConfirm, setSuspendConfirm] = useState<{
    grantId: string;
    contactName: string;
    currentStatus: string;
  } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    grantId: string;
    contactName: string;
  } | null>(null);
  const [actionInProgress, setActionInProgress] = useState(false);
  const [infoPopoverFor, setInfoPopoverFor] = useState<string | null>(null);
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<any | null>(null);
  const [resendConfirm, setResendConfirm] = useState<{
    type: 'invite_email' | 'magic_link';
    customer: any;
  } | null>(null);
  const [upcomingCustomers, setUpcomingCustomers] = useState<UpcomingCustomer[]>([]);
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const [completeProjectCustomer, setCompleteProjectCustomer] = useState<UpcomingCustomer | null>(null);

  function showSuccessAnimation(name: string, type: 'send' | 'resend' | 'manual' = 'send', accessType?: string) {
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    setSendSuccessOverlay({ visible: true, name, type, accessType });
    successTimerRef.current = setTimeout(() => setSendSuccessOverlay(null), 4500);
  }

  useEffect(() => {
    loadInvites();

    const subscription = supabase
      .channel('pending_invites_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pending_punchlist_invites' },
        () => {
          loadInvites();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (openInviteCount > 0) {
      setShowCreateInvite(true);
    }
  }, [openInviteCount]);

  // Sync email when contact is selected
  useEffect(() => {
    if (selectedContact) {
      setManualInviteEmail(selectedContact.email || '');
    } else {
      setManualInviteEmail('');
    }
  }, [selectedContact]);

  async function loadInvites() {
    try {
      // Load pending and declined invites
      const { data: invitesData, error: invitesError } = await supabase
        .from('pending_invites_with_details')
        .select('*')
        .order('created_at', { ascending: false });

      if (invitesError) throw invitesError;

      const pending = invitesData?.filter(i => i.status === 'pending') || [];
      const declined = invitesData?.filter(i => i.status === 'declined') || [];

      setPendingInvites(pending);
      setDeclinedInvites(declined);

      // Load active and expired access grants with task counts
      const { data: accessData, error: accessError } = await supabase
        .from('punchlist_access_grants')
        .select(`
          *,
          contact:contacts(id, full_name, email, phone),
          project:projects(id, name, project_number)
        `)
        .order('created_at', { ascending: false });

      if (accessError) throw accessError;

      // Fetch task counts for each access grant
      const accessWithStats = await Promise.all(
        (accessData || []).map(async (access) => {
          const { data: tasks } = await supabase
            .from('punchlist_tasks')
            .select('id, status')
            .eq('contact_id', access.contact_id);

          const taskStats = {
            total: tasks?.length || 0,
            submitted: tasks?.filter(t => t.status === 'submitted').length || 0,
            in_progress: tasks?.filter(t => t.status === 'in_progress').length || 0,
            completed: tasks?.filter(t => t.status === 'completed').length || 0,
          };

          return { ...access, taskStats };
        })
      );

      const pendingAcc = accessWithStats.filter(a => a.status === 'pending') || [];
      const active = accessWithStats.filter(a => a.status === 'active' || a.status === 'suspended') || [];
      const expired = accessWithStats.filter(a => a.status === 'expired') || [];

      setPendingAcceptance(pendingAcc);
      setActiveAccess(active);
      setExpiredAccess(expired);

      // Load all customers with any form of punchlist access
      // This combines VIP subscriptions, Test & Tune, and Promotional access
      const { data: allAccessData, error: allAccessError } = await supabase.rpc('get_all_punchlist_customers');

      if (allAccessError) {
        console.error('Error loading all customers:', allAccessError);
      } else {
        // Fetch task counts for each customer
        const customersWithStats = await Promise.all(
          (allAccessData || []).map(async (customer: any) => {
            const { data: tasks } = await supabase
              .from('punchlist_tasks')
              .select('id, status')
              .eq('contact_id', customer.contact_id);

            const taskStats = {
              total: tasks?.length || 0,
              submitted: tasks?.filter(t => t.status === 'requested').length || 0,
              completed: tasks?.filter(t => t.status === 'completed').length || 0,
            };

            return { ...customer, taskStats };
          })
        );

        setAllCustomers(customersWithStats);
      }

      // Load upcoming customers (in-progress projects not yet on T&T)
      const { data: upcomingData, error: upcomingError } = await supabase.rpc('get_upcoming_punchlist_customers');
      if (upcomingError) {
        console.error('Error loading upcoming customers:', upcomingError);
      } else {
        setUpcomingCustomers((upcomingData as UpcomingCustomer[]) || []);
      }
    } catch (error) {
      console.error('Error loading invites:', error);
    } finally {
      setLoading(false);
    }
  }

  function prepareToSendInvite(inviteId: string) {
    const invite = pendingInvites.find(i => i.id === inviteId);
    if (!invite) return;

    setInviteToSend(invite);
    setEditableEmail(invite.contact_email);
    setSelectedInviteType(null);
    setInviteModalStep('type');
    setVipSignupLinkCopied(false);
    setShowSendConfirmation(true);
  }

  function closeSendConfirmation() {
    setShowSendConfirmation(false);
    setInviteToSend(null);
    setEditableEmail('');
    setSelectedInviteType(null);
    setInviteModalStep('type');
    setVipSignupLinkCopied(false);
  }

  function getVipSignupUrl(): string {
    return `${window.location.origin}/portal/membership`;
  }

  async function copyVipSignupLink() {
    await navigator.clipboard.writeText(getVipSignupUrl());
    setVipSignupLinkCopied(true);
    setTimeout(() => setVipSignupLinkCopied(false), 2500);
  }

  async function confirmSendInvite() {
    if (!inviteToSend) return;

    if (!editableEmail.trim() || !editableEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSendingInvite(true);
    console.log('[Punchlist] Starting send invite process for invite:', inviteToSend.id);

    try {
      // Update contact email if changed
      if (editableEmail !== inviteToSend.contact_email) {
        console.log('[Punchlist] Updating contact email...');
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ email: editableEmail.trim() })
          .eq('id', inviteToSend.contact_id);

        if (updateError) {
          console.error('[Punchlist] Email update error:', updateError);
          throw updateError;
        }
        console.log('[Punchlist] Email updated successfully');
      }

      console.log('[Punchlist] Sending punchlist invite via RPC...');
      const { data: accessGrantId, error } = await supabase.rpc('send_punchlist_invite', {
        p_invite_id: inviteToSend.id
      });

      if (error) {
        console.error('[Punchlist] Send invite RPC error:', error);
        throw error;
      }
      console.log('[Punchlist] Access grant created with ID:', accessGrantId);

      console.log('[Punchlist] Fetching grant details...');
      const { data: grant } = await supabase
        .from('punchlist_access_grants')
        .select('expiration_date')
        .eq('id', accessGrantId)
        .maybeSingle();

      console.log('[Punchlist] Sending email notification...');
      try {
        const emailResult = await supabase.functions.invoke('send-punchlist-invite', {
          body: {
            invite_id: inviteToSend.id,
            contact_email: editableEmail.trim(),
            contact_name: inviteToSend.contact_name,
            project_name: inviteToSend.project_name,
            expiration_date: grant?.expiration_date,
            access_type: selectedInviteType === 'promotional' ? 'promotional' : selectedInviteType === 'test_and_tune_no_portal' ? 'test_and_tune_no_portal' : 'test_and_tune'
          }
        });

        console.log('[Punchlist] Email result:', emailResult);
      } catch (emailError: any) {
        console.error('[Punchlist] Email sending error:', emailError);
      }

      console.log('[Punchlist] Send invite process completed successfully');
      const sentName = inviteToSend.contact_name;
      const sentAccessType = selectedInviteType === 'promotional' ? 'promotional' : selectedInviteType === 'test_and_tune_no_portal' ? 'test_and_tune_no_portal' : 'test_and_tune';
      closeSendConfirmation();
      showSuccessAnimation(sentName, 'send', sentAccessType);
      loadInvites();
    } catch (error: any) {
      console.error('[Punchlist] Error sending invite:', error);
      toast.error(error.message || 'Unknown error occurred', 'Failed to send invite');
    } finally {
      setSendingInvite(false);
    }
  }

  async function resendWelcomeEmail(customer: any) {
    if (!customer.contact_email) {
      toast.warning('Please add an email address in their contact record first.', 'No email on file');
      return;
    }

    setResendingEmailFor(customer.contact_id);
    try {
      const { data: grants } = await supabase
        .from('punchlist_access_grants')
        .select('expiration_date, access_type')
        .eq('contact_id', customer.contact_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      const grant = grants?.[0];

      const result = await supabase.functions.invoke('send-punchlist-invite', {
        body: {
          contact_email: customer.contact_email,
          contact_name: customer.contact_name,
          project_name: customer.project_name || '',
          expiration_date: grant?.expiration_date || null,
          access_type: grant?.access_type || customer.access_type || 'test_and_tune'
        }
      });

      if (result.data?.error) {
        toast.error(result.data.error, 'Email could not be sent');
      } else if (result.error) {
        // Try to extract the real error message from the function response body
        let errMsg = result.error.message;
        try {
          const context = (result.error as any).context;
          if (context) {
            const body = await context.json();
            if (body?.error) errMsg = body.error;
          }
        } catch { /* ignore parse errors */ }
        toast.error(errMsg, 'Email could not be sent');
      } else {
        showSuccessAnimation(customer.contact_name || customer.contact_email, 'resend', grant?.access_type);
      }
    } catch (err: any) {
      toast.error(err.message, 'Failed to resend email');
    } finally {
      setResendingEmailFor(null);
    }
  }

  async function resendMagicLink(customer: any) {
    if (!customer.contact_email) {
      toast.warning('Please add an email address in their contact record first.', 'No email on file');
      return;
    }

    setResendingMagicLinkFor(customer.contact_id);
    try {
      const { data: grants } = await supabase
        .from('punchlist_access_grants')
        .select('expiration_date, access_type')
        .eq('contact_id', customer.contact_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);

      const grant = grants?.[0];

      const result = await supabase.functions.invoke('send-punchlist-invite', {
        body: {
          contact_email: customer.contact_email,
          contact_name: customer.contact_name,
          access_type: grant?.access_type || customer.access_type || 'test_and_tune',
          magic_link_only: true
        }
      });

      if (result.data?.error) {
        toast.error(result.data.error, 'Email could not be sent');
      } else if (result.error) {
        let errMsg = result.error.message;
        try {
          const context = (result.error as any).context;
          if (context) {
            const body = await context.json();
            if (body?.error) errMsg = body.error;
          }
        } catch { /* ignore */ }
        toast.error(errMsg, 'Email could not be sent');
      } else {
        toast.success(`Magic link sent to ${customer.contact_name || customer.contact_email}`, 'Link Sent');
      }
    } catch (err: any) {
      toast.error(err.message, 'Failed to send magic link');
    } finally {
      setResendingMagicLinkFor(null);
    }
  }

  async function handleDeclineInvite(inviteId: string) {
    if (!declineReason.trim()) {
      toast.warning('Please provide a reason for declining');
      return;
    }

    try {
      const { error } = await supabase.rpc('decline_punchlist_invite', {
        p_invite_id: inviteId,
        p_decline_reason: declineReason
      });

      if (error) throw error;

      setDecliningId(null);
      setDeclineReason('');
      loadInvites();
    } catch (error: any) {
      console.error('Error declining invite:', error);
      toast.error(error.message, 'Failed to decline invite');
    }
  }

  async function handleDeleteInvite(inviteId: string) {
    toast.confirm('Are you sure you want to delete this invite? This action cannot be undone.', async () => {
      try {
        const { error } = await supabase
          .from('pending_punchlist_invites')
          .delete()
          .eq('id', inviteId);

        if (error) throw error;

        toast.success('Invite deleted successfully');
        loadInvites();
      } catch (error: any) {
        console.error('Error deleting invite:', error);
        toast.error(error.message, 'Failed to delete invite');
      }
    }, 'Delete invite');
  }

  async function handleRenewAccess(accessGrantId: string, contactName: string) {
    toast.confirm(`This will add 90 more days to ${contactName}'s current trial period.`, async () => {
      try {
        const { error } = await supabase.rpc('renew_punchlist_access', {
          p_access_grant_id: accessGrantId,
          p_days: 90
        });

        if (error) throw error;

        toast.success(`${contactName} now has 90 more days of Test & Tune access.`, 'Trial Extended');
        loadInvites();
      } catch (error: any) {
        console.error('Error renewing access:', error);
        toast.error(error.message, 'Failed to renew access');
      }
    }, `Extend trial for ${contactName}?`);
  }

  async function handleSuspendToggle() {
    if (!suspendConfirm) return;
    setActionInProgress(true);
    try {
      const { error } = await supabase.rpc('toggle_punchlist_access_suspension', {
        p_access_grant_id: suspendConfirm.grantId
      });
      if (error) throw error;
      setSuspendConfirm(null);
      loadInvites();
    } catch (error: any) {
      console.error('Error toggling suspension:', error);
      toast.error(error.message, 'Failed to update access');
    } finally {
      setActionInProgress(false);
    }
  }

  async function handleDeleteAccessGrant() {
    if (!deleteConfirm) return;
    setActionInProgress(true);
    try {
      const { data: grant } = await supabase
        .from('punchlist_access_grants')
        .select('contact_id')
        .eq('id', deleteConfirm.grantId)
        .maybeSingle();

      if (grant?.contact_id) {
        await supabase
          .from('punchlist_tasks')
          .delete()
          .eq('contact_id', grant.contact_id);
      }

      const { error } = await supabase
        .from('punchlist_access_grants')
        .delete()
        .eq('id', deleteConfirm.grantId);
      if (error) throw error;
      setDeleteConfirm(null);
      loadInvites();
    } catch (error: any) {
      console.error('Error deleting access grant:', error);
      toast.error(error.message, 'Failed to delete');
    } finally {
      setActionInProgress(false);
    }
  }

  async function searchContacts(query: string) {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, email, phone')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    }
  }

  async function handleCreateNewContact() {
    if (!newContactData.full_name.trim() || !newContactData.email.trim()) {
      toast.warning('Please provide at least a name and email');
      return;
    }

    try {
      const { data: newContact, error } = await supabase
        .from('contacts')
        .insert({
          full_name: newContactData.full_name.trim(),
          email: newContactData.email.trim(),
          phone: newContactData.phone.trim() || null,
          company_name: newContactData.company_name.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSelectedContact(newContact);
      setManualInviteEmail(newContact.email || '');
      setShowNewContactForm(false);
      setNewContactData({ full_name: '', email: '', phone: '', company_name: '' });
      toast.success('Contact created. You can now create the invite.');
    } catch (error: any) {
      console.error('Error creating contact:', error);
      toast.error(error.message, 'Failed to create contact');
    }
  }

  async function fetchEmailPreview(params: {
    contact_name: string;
    contact_email?: string;
    access_type: string;
    project_name?: string;
    expiration_date?: string;
  }) {
    setLoadingPreview(true);
    try {
      const result = await supabase.functions.invoke('send-punchlist-invite', {
        body: {
          contact_name: params.contact_name,
          contact_email: params.contact_email || 'preview@example.com',
          access_type: params.access_type,
          project_name: params.project_name,
          expiration_date: params.expiration_date,
          preview: true,
        }
      });
      if (result.error) throw new Error(result.error.message);
      if (result.data?.html) {
        setEmailPreview({ subject: result.data.subject || '', html: result.data.html });
      }
    } catch (err: any) {
      toast.error(err.message, 'Could not load preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  function prepareManualInvite() {
    if (!selectedContact) {
      toast.warning('Please select a contact');
      return;
    }

    if (!manualInviteType) {
      toast.warning('Please select an invite type');
      return;
    }

    if (!manualInviteEmail.trim() || !manualInviteEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setShowManualSendConfirmation(true);
  }

  async function confirmManualInvite() {
    if (!selectedContact || !manualInviteType) return;

    if (manualInviteType === 'vip_signup') {
      if (!manualInviteEmail.trim() || !manualInviteEmail.includes('@')) {
        toast.error('Please enter a valid email address');
        return;
      }
      setSendingManualInvite(true);
      try {
        if (manualInviteEmail !== selectedContact.email) {
          const { error: updateError } = await supabase
            .from('contacts')
            .update({ email: manualInviteEmail.trim() })
            .eq('id', selectedContact.id);
          if (updateError) throw updateError;
        }

        const { error: grantError } = await supabase
          .from('punchlist_access_grants')
          .insert({
            contact_id: selectedContact.id,
            access_type: 'vip_signup',
            status: 'active',
            granted_date: new Date().toISOString(),
            expiration_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            notes: inviteNotes.trim() || null
          });

        if (grantError) {
          console.error('[Punchlist] VIP Signup access grant error:', grantError);
          toast.error('Failed to create access grant. ' + grantError.message);
          return;
        }

        const emailResult = await supabase.functions.invoke('send-punchlist-invite', {
          body: {
            contact_email: manualInviteEmail.trim(),
            contact_name: selectedContact.full_name,
            access_type: 'vip_signup',
          }
        });
        if (emailResult.data?.error) {
          toast.warning(emailResult.data.error);
        } else if (emailResult.error) {
          toast.error(emailResult.error.message, 'Email sending error');
        }
      } catch (emailError: any) {
        toast.error(emailError.message, 'Email could not be sent');
      } finally {
        setSendingManualInvite(false);
      }
      await loadInvites();
      setShowManualSendConfirmation(false);
      setShowCreateInvite(false);
      setSelectedContact(null);
      setContactSearch('');
      setSearchResults([]);
      setInviteNotes('');
      setManualInviteEmail('');
      setManualInviteType(null);
      return;
    }

    if (!manualInviteEmail.trim() || !manualInviteEmail.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    setSendingManualInvite(true);
    const dbAccessType = manualInviteType === 'test_and_tune_no_portal' ? 'test_and_tune' : manualInviteType;
    console.log('[Punchlist] Starting invite process, type:', manualInviteType, 'for contact:', selectedContact.id);

    try {
      if (manualInviteEmail !== selectedContact.email) {
        console.log('[Punchlist] Updating contact email...');
        const { error: updateError } = await supabase
          .from('contacts')
          .update({ email: manualInviteEmail.trim() })
          .eq('id', selectedContact.id);

        if (updateError) {
          console.error('[Punchlist] Email update error:', updateError);
          throw updateError;
        }
        console.log('[Punchlist] Email updated successfully');
      }

      console.log('[Punchlist] Creating access grant with type:', dbAccessType);
      const { data: accessGrant, error: grantError } = await supabase
        .from('punchlist_access_grants')
        .insert({
          contact_id: selectedContact.id,
          access_type: dbAccessType,
          status: 'active',
          granted_date: new Date().toISOString(),
          expiration_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          notes: inviteNotes.trim() || null
        })
        .select()
        .single();

      if (grantError) {
        console.error('[Punchlist] Access grant creation error:', grantError);
        throw grantError;
      }
      console.log('[Punchlist] Access grant created:', accessGrant.id);

      console.log('[Punchlist] Sending email notification...');
      try {
        const emailResult = await supabase.functions.invoke('send-punchlist-invite', {
          body: {
            contact_email: manualInviteEmail.trim(),
            contact_name: selectedContact.full_name,
            project_name: null,
            expiration_date: accessGrant.expiration_date,
            access_type: manualInviteType
          }
        });

        console.log('[Punchlist] Email result:', emailResult);

        if (emailResult.data?.error) {
          toast.warning(emailResult.data.error, 'Access granted — email issue');
        } else if (emailResult.error) {
          toast.warning(emailResult.error.message, 'Access granted — email issue');
        }
      } catch (emailError: any) {
        console.error('[Punchlist] Email sending error:', emailError);
        toast.warning(emailError.message, 'Access granted — email could not be sent');
      }

      console.log('[Punchlist] Invite process completed successfully');
      const sentName = selectedContact.full_name;
      const capturedInviteType = manualInviteType;
      setShowManualSendConfirmation(false);
      setShowCreateInvite(false);
      setSelectedContact(null);
      setContactSearch('');
      setSearchResults([]);
      setInviteNotes('');
      setManualInviteEmail('');
      setManualInviteType(null);
      showSuccessAnimation(sentName, 'manual', capturedInviteType || 'test_and_tune');
      loadInvites();
    } catch (error: any) {
      console.error('[Punchlist] Error creating and sending invite:', error);
      toast.error(error.message || 'Unknown error occurred', 'Failed to send invite');
    } finally {
      setSendingManualInvite(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading invites...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Upcoming Projects Section ──────────────────────────────────────── */}
      <div className="bg-gray-800/60 border border-gray-700 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setUpcomingExpanded(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-800/80 active:bg-gray-700/60 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
              <Zap className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Upcoming T&amp;T Customers</span>
                {upcomingCustomers.length > 0 && (
                  <span className="text-xs px-2 py-0.5 bg-emerald-500/20 border border-emerald-600/40 text-emerald-300 rounded-full font-semibold">
                    {upcomingCustomers.length}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400">In-progress projects — mark complete to trigger T&amp;T invite</p>
            </div>
          </div>
          <div className="flex-shrink-0 text-gray-500">
            {upcomingExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {upcomingExpanded && (
          <div className="border-t border-gray-700/60">
            {upcomingCustomers.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-gray-600" />
                <p className="text-sm text-gray-400">No in-progress projects awaiting T&amp;T</p>
                <p className="text-xs text-gray-600 mt-1">Customers will appear here once a project is active and they don't have an existing invite</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-700/50">
                {upcomingCustomers.map(customer => {
                  const isOverdue = customer.days_until_completion !== null && customer.days_until_completion < 0;
                  const isDueSoon = customer.days_until_completion !== null && customer.days_until_completion >= 0 && customer.days_until_completion <= 14;
                  const urgencyColor = isOverdue
                    ? 'text-red-400 bg-red-900/20 border-red-700/50'
                    : isDueSoon
                    ? 'text-amber-400 bg-amber-900/20 border-amber-700/50'
                    : 'text-gray-400 bg-gray-800/40 border-gray-700/50';
                  const urgencyLabel = isOverdue
                    ? `${Math.abs(customer.days_until_completion!)}d overdue`
                    : customer.days_until_completion !== null
                    ? `${customer.days_until_completion}d to go`
                    : 'No date set';
                  const statusColors: Record<string, string> = {
                    active: 'bg-blue-900/30 border-blue-700 text-blue-300',
                    planning: 'bg-gray-700/60 border-gray-600 text-gray-300',
                  };
                  const statusColor = statusColors[customer.project_status] || 'bg-gray-700/60 border-gray-600 text-gray-300';

                  const hasEstimatedHours = (customer.total_estimated_hours ?? 0) > 0;
                  const progressPct = customer.progress_percent ?? 0;

                  return (
                    <div
                      key={customer.project_id}
                      className="px-4 py-3 hover:bg-gray-800/40 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        {/* Left: customer + project info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold text-white truncate max-w-[160px]">
                              {customer.contact_name}
                            </span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${statusColor}`}>
                              {customer.project_status}
                            </span>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${urgencyColor}`}>
                              <Clock className="w-2.5 h-2.5" />
                              {urgencyLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                            <span className="flex items-center gap-1 truncate">
                              <Building className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate max-w-[140px]">{customer.project_name}</span>
                              {customer.project_number && (
                                <span className="text-gray-600">#{customer.project_number}</span>
                              )}
                            </span>
                            {customer.sales_order_id && customer.sales_order_number && onOpenSalesOrder && (
                              <button
                                type="button"
                                onClick={() => onOpenSalesOrder(customer.sales_order_id!)}
                                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors flex-shrink-0"
                              >
                                <Link className="w-3 h-3" />
                                SO #{customer.sales_order_number}
                              </button>
                            )}
                            {customer.assigned_pm_name && (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <User className="w-3 h-3" />
                                {customer.assigned_pm_name}
                              </span>
                            )}
                            {customer.target_completion_date && (
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <Calendar className="w-3 h-3" />
                                {new Date(customer.target_completion_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                          {/* Hours progress bar */}
                          {hasEstimatedHours && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                                <span>Labor</span>
                                <span className={`font-semibold ${progressPct >= 80 ? 'text-green-400' : 'text-amber-400'}`}>
                                  {(customer.total_actual_hours ?? 0).toFixed(1)} / {(customer.total_estimated_hours ?? 0).toFixed(1)} hrs &mdash; {progressPct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${progressPct >= 80 ? 'bg-green-500' : 'bg-amber-500'}`}
                                  style={{ width: `${Math.min(100, progressPct)}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right: Mark Complete button */}
                        <button
                          type="button"
                          onClick={() => setCompleteProjectCustomer(customer)}
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-md shadow-emerald-900/30 whitespace-nowrap"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Mark Complete</span>
                          <span className="sm:hidden">Done</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Punchlist Customers
          </h3>
          {/* Compact filter bar */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Type dropdown */}
            <div className="relative">
              <select
                value={accessTypeFilter}
                onChange={e => { setAccessTypeFilter(e.target.value as typeof accessTypeFilter); setSelectedTab('all'); }}
                className="appearance-none pl-3 pr-7 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-400 cursor-pointer hover:border-gray-500 transition-colors"
              >
                <option value="all">All Types</option>
                <option value="vip_membership">VIP ({allCustomers.filter(c => c.access_type === 'vip_membership').length})</option>
                <option value="promotional">Promo ({allCustomers.filter(c => c.access_type === 'promotional').length})</option>
                <option value="test_and_tune">T&amp;T ({allCustomers.filter(c => c.access_type === 'test_and_tune').length})</option>
                <option value="test_and_tune_no_portal">No Portal ({allCustomers.filter(c => c.access_type === 'test_and_tune_no_portal').length})</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            {/* Status dropdown */}
            <div className="relative">
              <select
                value={selectedTab}
                onChange={e => setSelectedTab(e.target.value as typeof selectedTab)}
                className="appearance-none pl-3 pr-7 py-1.5 bg-gray-800 border border-gray-600 rounded-lg text-xs text-gray-200 focus:outline-none focus:border-gray-400 cursor-pointer hover:border-gray-500 transition-colors"
              >
                <option value="all">All Statuses ({allCustomers.length})</option>
                <option value="pending">Pending Review ({pendingInvites.length})</option>
                <option value="awaiting">Awaiting Accept ({pendingAcceptance.length})</option>
                <option value="active">Active Access ({activeAccess.length})</option>
                <option value="expired">Expired ({expiredAccess.length})</option>
                <option value="declined">Rejected ({declinedInvites.length})</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
            {/* Clear filters */}
            {(accessTypeFilter !== 'all' || selectedTab !== 'all') && (
              <button
                type="button"
                onClick={() => { setAccessTypeFilter('all'); setSelectedTab('all'); }}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 border border-gray-700 rounded-lg transition-colors"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {showCreateInvite && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div className="p-4 sm:p-6 flex items-center justify-between bg-gray-750 border-b border-gray-700">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-400" />
              <h4 className="text-lg font-semibold text-white">Send Invite</h4>
            </div>
            <button
              onClick={() => {
                setShowCreateInvite(false);
                setManualInviteType(null);
                setSelectedContact(null);
                setContactSearch('');
                setSearchResults([]);
                setManualInviteEmail('');
                setInviteNotes('');
              }}
              className="p-1 text-gray-400 hover:text-white rounded transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Search Contact
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    searchContacts(e.target.value);
                  }}
                  placeholder="Search by name, email, or phone..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-base"
                  disabled={!!selectedContact}
                />
              </div>

              {selectedContact && (
                <div className="mt-3 p-3 bg-green-900/30 border border-green-700 rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-medium text-white">{selectedContact.full_name}</div>
                      {selectedContact.phone && (
                        <div className="text-sm text-gray-400">{selectedContact.phone}</div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setSelectedContact(null);
                        setContactSearch('');
                        setSearchResults([]);
                      }}
                      className="p-1 text-gray-400 hover:text-white rounded"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1.5">
                      Email Address <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="email"
                      value={manualInviteEmail}
                      onChange={(e) => setManualInviteEmail(e.target.value)}
                      placeholder="customer@example.com"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Review and update the email address if needed before sending.
                    </p>
                  </div>
                </div>
              )}

              {searchResults.length > 0 && !selectedContact && (
                <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg max-h-60 overflow-y-auto">
                  {searchResults.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => {
                        setSelectedContact(contact);
                        setManualInviteEmail(contact.email || '');
                        setContactSearch('');
                        setSearchResults([]);
                      }}
                      className="w-full p-3 text-left hover:bg-gray-800 border-b border-gray-700 last:border-0"
                    >
                      <div className="font-medium text-white">{contact.full_name}</div>
                      <div className="text-sm text-gray-400 flex items-center gap-3">
                        <span>{contact.email}</span>
                        {contact.phone && <span>{contact.phone}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {contactSearch && searchResults.length === 0 && !selectedContact && (
                <div className="mt-2 p-4 bg-gray-900 border border-gray-700 rounded-lg text-center">
                  <p className="text-gray-400 text-sm mb-3">No contacts found</p>
                  <button
                    onClick={() => setShowNewContactForm(true)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm flex items-center gap-2 mx-auto"
                  >
                    <Plus className="w-4 h-4" />
                    Create New Contact
                  </button>
                </div>
              )}
            </div>

            {showNewContactForm && (
              <div className="p-4 bg-gray-900 border border-green-700 rounded-lg space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-semibold text-white">New Contact Details</h5>
                  <button
                    onClick={() => {
                      setShowNewContactForm(false);
                      setNewContactData({ full_name: '', email: '', phone: '', company_name: '' });
                    }}
                    className="p-1 text-gray-400 hover:text-white rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={newContactData.full_name}
                    onChange={(e) => setNewContactData({ ...newContactData, full_name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Email <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={newContactData.email}
                    onChange={(e) => setNewContactData({ ...newContactData, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newContactData.phone}
                    onChange={(e) => setNewContactData({ ...newContactData, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-base"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Company Name
                  </label>
                  <input
                    type="text"
                    value={newContactData.company_name}
                    onChange={(e) => setNewContactData({ ...newContactData, company_name: e.target.value })}
                    placeholder="Acme Corp"
                    className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-base"
                  />
                </div>

                <button
                  onClick={handleCreateNewContact}
                  disabled={!newContactData.full_name.trim() || !newContactData.email.trim()}
                  className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm"
                >
                  Create Contact
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Invite Type <span className="text-red-400">*</span>
              </label>
              <div className="space-y-2">
                <button
                  onClick={() => setManualInviteType('test_and_tune')}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    manualInviteType === 'test_and_tune'
                      ? 'border-cyan-500 bg-cyan-900/20'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${manualInviteType === 'test_and_tune' ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">Test &amp; Tune</span>
                        <span className="text-xs px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded-full border border-cyan-700">90 Days Free</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">For completed projects — sends welcome email with portal link.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${manualInviteType === 'test_and_tune' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`} />
                  </div>
                </button>

                <button
                  onClick={() => setManualInviteType('promotional')}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    manualInviteType === 'promotional'
                      ? 'border-amber-500 bg-amber-900/20'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${manualInviteType === 'promotional' ? 'bg-amber-600' : 'bg-gray-700'}`}>
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">Promotional</span>
                        <span className="text-xs px-1.5 py-0.5 bg-amber-900/50 text-amber-300 rounded-full border border-amber-700">Limited Trial</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">General invite for prospects or existing customers to explore the portal.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${manualInviteType === 'promotional' ? 'border-amber-500 bg-amber-500' : 'border-gray-600'}`} />
                  </div>
                </button>

                <button
                  onClick={() => setManualInviteType('vip_signup')}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    manualInviteType === 'vip_signup'
                      ? 'border-yellow-500 bg-yellow-900/20'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${manualInviteType === 'vip_signup' ? 'bg-yellow-600' : 'bg-gray-700'}`}>
                      <Star className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">VIP Signup</span>
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full border border-yellow-700">Paid Plan</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Share a signup link directing the customer to choose a VIP plan.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${manualInviteType === 'vip_signup' ? 'border-yellow-500 bg-yellow-500' : 'border-gray-600'}`} />
                  </div>
                </button>

                <button
                  onClick={() => setManualInviteType('test_and_tune_no_portal')}
                  className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                    manualInviteType === 'test_and_tune_no_portal'
                      ? 'border-cyan-500 bg-cyan-900/20'
                      : 'border-gray-700 bg-gray-900 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${manualInviteType === 'test_and_tune_no_portal' ? 'bg-cyan-700' : 'bg-gray-700'}`}>
                      <CheckCheck className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">Test &amp; Tune (No Portal)</span>
                        <span className="text-xs px-1.5 py-0.5 bg-cyan-900/50 text-cyan-300 rounded-full border border-cyan-800">Email Only</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Sends the T&T welcome email without including the portal link.</p>
                    </div>
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${manualInviteType === 'test_and_tune_no_portal' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`} />
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Notes (Optional)
              </label>
              <textarea
                value={inviteNotes}
                onChange={(e) => setInviteNotes(e.target.value)}
                placeholder="Add notes about why this invite is being created..."
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-base"
              />
            </div>

            <button
              onClick={prepareManualInvite}
              disabled={
                !selectedContact ||
                !manualInviteType ||
                (!manualInviteEmail.trim() || !manualInviteEmail.includes('@'))
              }
              className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 font-medium"
            >
              <Send className="w-4 h-4" />
              Send Invite
            </button>
          </div>
        </div>
      )}

      {selectedTab === 'all' && (
        <div className="space-y-2">
          {allCustomers
            .filter(c => accessTypeFilter === 'all' || c.access_type === accessTypeFilter)
            .map(customer => {
            // Determine access type icon and label
            let accessIcon: React.ReactNode, accessLabel: string, accessColor: string, daysRemaining: number | null;

            if (customer.access_type === 'vip_membership') {
              accessIcon = <Star className="w-3.5 h-3.5" />;
              accessLabel = 'VIP Member';
              accessColor = 'text-amber-400 bg-amber-900/30 border-amber-700';
              daysRemaining = null;
            } else if (customer.access_type === 'promotional') {
              accessIcon = <Sparkles className="w-3.5 h-3.5" />;
              accessLabel = 'Promotional';
              accessColor = 'text-green-400 bg-green-900/30 border-green-700';
              daysRemaining = customer.days_remaining;
            } else if (customer.access_type === 'test_and_tune') {
              accessIcon = <TrendingUp className="w-3.5 h-3.5" />;
              accessLabel = 'Test & Tune';
              accessColor = 'text-blue-400 bg-blue-900/30 border-blue-700';
              daysRemaining = customer.days_remaining;
            } else if (customer.access_type === 'test_and_tune_no_portal') {
              accessIcon = <FileText className="w-3.5 h-3.5" />;
              accessLabel = 'T&T No Portal';
              accessColor = 'text-cyan-400 bg-cyan-900/30 border-cyan-700';
              daysRemaining = customer.days_remaining;
            } else {
              accessIcon = <User className="w-3.5 h-3.5" />;
              accessLabel = 'Unknown';
              accessColor = 'text-gray-400 bg-gray-900/30 border-gray-700';
              daysRemaining = null;
            }

            const isSuspended = customer.status === 'suspended';
            const isExpired = customer.status === 'expired';

            return (
              <button
                key={customer.contact_id}
                type="button"
                onClick={() => setSelectedCustomerDetail(customer)}
                className={`w-full text-left bg-gray-800 border rounded-xl px-4 py-3 transition-colors hover:border-gray-500 active:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-blue-500/40 ${
                  isSuspended
                    ? 'border-yellow-700/50 opacity-80'
                    : isExpired
                    ? 'border-orange-700/60 opacity-75'
                    : 'border-gray-700'
                }`}
              >
                {/* Row 1: name + badge + status */}
                <div className="flex items-center gap-2 min-w-0 mb-1.5">
                  <span className="text-sm font-semibold text-white truncate flex-1 min-w-0">
                    {customer.contact_name}
                  </span>
                  <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${accessColor}`}>
                    {accessIcon}
                    <span className="hidden xs:inline">{accessLabel}</span>
                  </div>
                  {isSuspended && (
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-yellow-900/30 border border-yellow-700 text-yellow-400 flex-shrink-0">
                      <PauseCircle className="w-3 h-3" />
                      <span className="hidden sm:inline">Suspended</span>
                    </div>
                  )}
                  {!isSuspended && isExpired && (
                    <div className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-orange-900/30 border border-orange-700 text-orange-400 flex-shrink-0">
                      <AlertCircle className="w-3 h-3" />
                      <span className="hidden sm:inline">Expired</span>
                    </div>
                  )}
                </div>

                {/* Row 2: meta info */}
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                  {customer.project_name && (
                    <span className="flex items-center gap-1 truncate max-w-[160px]">
                      <Building className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{customer.project_name}</span>
                    </span>
                  )}
                  {daysRemaining !== null && !isSuspended && !isExpired && (
                    <span className={`flex items-center gap-1 flex-shrink-0 ${daysRemaining <= 14 ? 'text-orange-400' : 'text-gray-500'}`}>
                      <Clock className="w-3 h-3 flex-shrink-0" />
                      {daysRemaining}d left
                    </span>
                  )}
                  {customer.taskStats && customer.taskStats.total > 0 && (
                    <span className="flex items-center gap-2 ml-auto flex-shrink-0">
                      <span className="flex items-center gap-0.5 text-blue-400">
                        <FileText className="w-3 h-3" />
                        <span className="font-semibold">{customer.taskStats.total}</span>
                      </span>
                      {customer.taskStats.submitted > 0 && (
                        <span className="flex items-center gap-0.5 text-yellow-400">
                          <MessageSquare className="w-3 h-3" />
                          <span className="font-semibold">{customer.taskStats.submitted}</span>
                          <span className="text-gray-600">new</span>
                        </span>
                      )}
                      {customer.taskStats.completed > 0 && (
                        <span className="flex items-center gap-0.5 text-green-400">
                          <CheckCheck className="w-3 h-3" />
                          <span className="font-semibold">{customer.taskStats.completed}</span>
                        </span>
                      )}
                    </span>
                  )}
                  {(!customer.taskStats || customer.taskStats.total === 0) && (
                    <span className="ml-auto text-gray-600 text-xs italic">No tasks yet</span>
                  )}
                </div>
              </button>
            );
          })}

          {allCustomers.filter(c => accessTypeFilter === 'all' || c.access_type === accessTypeFilter).length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              {accessTypeFilter !== 'all' ? (
                <>
                  <p>No customers with this access type</p>
                  <button onClick={() => setAccessTypeFilter('all')} className="text-xs mt-2 text-blue-400 hover:text-blue-300 underline">
                    Show all customers
                  </button>
                </>
              ) : (
                <>
                  <p>No customers with Punchlist access</p>
                  <p className="text-xs mt-2">Send invites or create VIP subscriptions to give customers portal access</p>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {selectedTab === 'pending' && (
        <div className="space-y-3">
          {pendingInvites.map(invite => (
            <div
              key={invite.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-blue-700 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                    <User className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{invite.contact_name}</span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-400">
                    <div className="flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{invite.contact_email}</span>
                    </div>
                    {invite.contact_phone && (
                      <div className="flex items-center gap-1 truncate">
                        <span className="flex-shrink-0">📱</span>
                        <span className="truncate">{invite.contact_phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1 truncate col-span-2">
                      <Building className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">
                        {invite.project_name} ({invite.project_number})
                      </span>
                    </div>
                    <div className="flex items-center gap-1 truncate col-span-2">
                      <Calendar className="w-3 h-3 flex-shrink-0" />
                      <span>
                        Completed: {new Date(invite.substantial_completion_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {invite.notes && (
                    <div className="mt-2 p-2 bg-gray-900 rounded border border-gray-700">
                      <div className="text-xs text-gray-400 mb-0.5">Notes:</div>
                      <div className="text-xs text-gray-300 line-clamp-2">{invite.notes}</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center sm:flex-col sm:items-end gap-2">
                  <div className={`text-xl font-bold ${
                    invite.days_pending > 7 ? 'text-red-400' :
                    invite.days_pending > 3 ? 'text-yellow-400' :
                    'text-gray-400'
                  }`}>
                    {invite.days_pending}
                  </div>
                  <div className="text-xs text-gray-400">days pending</div>
                </div>
              </div>

              {decliningId === invite.id ? (
                <div className="space-y-2 bg-gray-900 p-3 rounded">
                  <textarea
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    placeholder="Why is this invite being rejected? (e.g., dispute, wrong customer, etc.)"
                    rows={2}
                    className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDeclineInvite(invite.id)}
                      disabled={!declineReason.trim()}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs"
                    >
                      Reject Invite
                    </button>
                    <button
                      onClick={() => {
                        setDecliningId(null);
                        setDeclineReason('');
                      }}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => prepareToSendInvite(invite.id)}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
                  >
                    <Send className="w-4 h-4" />
                    Send Invite
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDecliningId(invite.id)}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject</span>
                    </button>
                    <button
                      onClick={() => handleDeleteInvite(invite.id)}
                      className="px-4 py-2.5 bg-gray-700 hover:bg-red-600 text-white rounded-lg flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="hidden sm:inline">Delete</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {pendingInvites.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No pending invites to review</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'awaiting' && (
        <div className="space-y-2">
          {pendingAcceptance.map(access => (
            <div
              key={access.id}
              className="bg-gray-800 border border-yellow-700 rounded-lg p-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="text-sm font-bold text-white truncate">{access.contact?.full_name}</h4>
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-900/40 border border-yellow-700 rounded text-xs text-yellow-400 whitespace-nowrap">
                      <Mail className="w-3 h-3" />Invite Sent
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-gray-400">
                    <div className="truncate">{access.contact?.email}</div>
                    {access.project && <div className="truncate">Project: {access.project.name}</div>}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Invited: {new Date(access.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Will expire: {access.expiration_date ? new Date(access.expiration_date).toLocaleDateString() : 'Never'}</span>
                    </div>
                    {access.notes && (
                      <div className="mt-2 p-2 bg-gray-900 rounded border border-gray-700">
                        <div className="text-xs text-gray-400 mb-0.5">Notes:</div>
                        <div className="text-xs text-gray-300">{access.notes}</div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-row flex-wrap sm:flex-col gap-1.5 justify-end items-end">
                  <div className="text-xs text-gray-400 hidden sm:block mb-0.5">Waiting for customer</div>
                  <button
                    onClick={(e) => { e.stopPropagation(); resendWelcomeEmail({ contact_id: access.contact_id, contact_email: access.contact?.email, contact_name: access.contact?.full_name, access_type: access.access_type }); }}
                    disabled={resendingEmailFor === access.contact_id}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors"
                    title="Resend full invite email"
                  >
                    {resendingEmailFor === access.contact_id ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending...</>
                    ) : (
                      <><Mail className="w-3 h-3" />Resend Invite</>
                    )}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); resendMagicLink({ contact_id: access.contact_id, contact_email: access.contact?.email, contact_name: access.contact?.full_name, access_type: access.access_type }); }}
                    disabled={resendingMagicLinkFor === access.contact_id}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors"
                    title="Resend magic login link only"
                  >
                    {resendingMagicLinkFor === access.contact_id ? (
                      <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending...</>
                    ) : (
                      <><Link className="w-3 h-3" />Resend Link</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {pendingAcceptance.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Mail className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No invites awaiting customer acceptance</p>
              <p className="text-xs mt-2">Sent invites appear here until customers accept them</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'active' && (
        <div className="space-y-2">
          {activeAccess.map(access => {
            const isSuspended = access.status === 'suspended';
            return (
              <div
                key={access.id}
                className={`bg-gray-800 border rounded-lg p-3 transition-colors ${
                  isSuspended
                    ? 'border-yellow-700/60 opacity-80'
                    : 'border-green-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-bold text-white truncate">{access.contact?.full_name}</h4>
                      {isSuspended ? (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-yellow-900/40 border border-yellow-700 rounded text-xs text-yellow-400 whitespace-nowrap">
                          <PauseCircle className="w-3 h-3" />Suspended
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-900/40 border border-green-700 rounded text-xs text-green-400 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />Active
                        </span>
                      )}
                      {access.expiration_date && !isSuspended && (
                        <span className="text-xs text-gray-400">
                          {Math.ceil((new Date(access.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days left
                        </span>
                      )}
                    </div>
                    <div className="space-y-0.5 text-xs text-gray-400">
                      <div className="truncate">{access.contact?.email}</div>
                      {access.project && <div className="truncate">Project: {access.project.name}</div>}
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Granted: {new Date(access.granted_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        <span>Expires: {access.expiration_date ? new Date(access.expiration_date).toLocaleDateString() : 'Never'}</span>
                      </div>
                      {access.taskStats && access.taskStats.total > 0 && (
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700">
                          <button
                            onClick={(e) => { e.stopPropagation(); onViewCustomerTasks?.(access.contact_id, access.contact?.full_name || access.contact_email, 'all'); }}
                            className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors"
                            title="View all tasks"
                          >
                            <FileText className="w-3 h-3" />
                            <span className="font-medium">{access.taskStats.total}</span>
                            <span className="text-gray-500">total</span>
                          </button>
                          {access.taskStats.submitted > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onViewCustomerTasks?.(access.contact_id, access.contact?.full_name || access.contact_email, 'requested'); }}
                              className="flex items-center gap-1 text-yellow-400 hover:text-yellow-300 transition-colors"
                              title="View new requests"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span className="font-medium">{access.taskStats.submitted}</span>
                              <span className="text-gray-500">new</span>
                            </button>
                          )}
                          {access.taskStats.in_progress > 0 && (
                            <div className="flex items-center gap-1 text-orange-400">
                              <PlayCircle className="w-3 h-3" />
                              <span className="font-medium">{access.taskStats.in_progress}</span>
                              <span className="text-gray-500">active</span>
                            </div>
                          )}
                          {access.taskStats.completed > 0 && (
                            <div className="flex items-center gap-1 text-green-400">
                              <CheckCheck className="w-3 h-3" />
                              <span className="font-medium">{access.taskStats.completed}</span>
                              <span className="text-gray-500">done</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-row flex-wrap sm:flex-col gap-1.5 justify-end items-end">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const name = access.contact?.full_name || 'Customer';
                        window.open(`${window.location.origin}/portal/punchlist?contact=${access.contact_id}&name=${encodeURIComponent(name)}`, '_blank');
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors"
                      title="View punchlist portal as this customer"
                    >
                      <Eye className="w-3 h-3" />
                      View Portal
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); resendWelcomeEmail({ contact_id: access.contact_id, contact_email: access.contact?.email, contact_name: access.contact?.full_name, access_type: access.access_type }); }}
                      disabled={resendingEmailFor === access.contact_id}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors"
                      title="Resend full invite email"
                    >
                      {resendingEmailFor === access.contact_id ? (
                        <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending...</>
                      ) : (
                        <><Mail className="w-3 h-3" />Resend Invite</>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); resendMagicLink({ contact_id: access.contact_id, contact_email: access.contact?.email, contact_name: access.contact?.full_name, access_type: access.access_type }); }}
                      disabled={resendingMagicLinkFor === access.contact_id}
                      className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors"
                      title="Resend magic login link only"
                    >
                      {resendingMagicLinkFor === access.contact_id ? (
                        <><div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />Sending...</>
                      ) : (
                        <><Link className="w-3 h-3" />Resend Link</>
                      )}
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSuspendConfirm({
                            grantId: access.id,
                            contactName: access.contact?.full_name || 'this customer',
                            currentStatus: access.status
                          });
                        }}
                        className={`p-1.5 rounded transition-colors ${
                          isSuspended
                            ? 'text-green-500 hover:bg-green-900/30 hover:text-green-400'
                            : 'text-gray-500 hover:bg-yellow-900/30 hover:text-yellow-400'
                        }`}
                        title={isSuspended ? 'Restore access' : 'Suspend access'}
                      >
                        {isSuspended ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({
                            grantId: access.id,
                            contactName: access.contact?.full_name || 'this customer'
                          });
                        }}
                        className="p-1.5 text-gray-500 hover:bg-red-900/30 hover:text-red-400 rounded transition-colors"
                        title="Delete access grant and all tasks"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {activeAccess.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No active access grants</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'expired' && (
        <div className="space-y-2">
          {expiredAccess.map(access => (
            <div
              key={access.id}
              className="bg-gray-800 border border-orange-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white mb-1 truncate">{access.contact?.full_name}</h4>
                  <div className="space-y-0.5 text-xs text-gray-400">
                    <div className="truncate">{access.contact?.email}</div>
                    {access.project && <div className="truncate">Project: {access.project.name}</div>}
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      <span>Expired: {new Date(access.expiration_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-orange-400 mb-0.5">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium text-xs">Expired</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {Math.abs(Math.ceil((new Date(access.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} days ago
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRenewAccess(access.id, access.contact?.full_name)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Renew for 90 Days</span>
              </button>
            </div>
          ))}

          {expiredAccess.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No expired access grants</p>
            </div>
          )}
        </div>
      )}

      {selectedTab === 'declined' && (
        <div className="space-y-2">
          {declinedInvites.map(invite => (
            <div
              key={invite.id}
              className="bg-gray-800 border border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white mb-1 truncate">{invite.contact_name}</h4>
                  <div className="space-y-0.5 text-xs text-gray-400">
                    <div className="truncate">{invite.contact_email}</div>
                    <div className="truncate">Project: {invite.project_name}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="flex items-center gap-1.5 text-gray-400 mb-0.5">
                    <X className="w-4 h-4" />
                    <span className="font-medium text-xs">Rejected</span>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(invite.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
              {invite.decline_reason && (
                <div className="p-2 bg-gray-900 rounded border border-gray-700">
                  <div className="text-xs text-gray-400 mb-0.5">Staff Reason:</div>
                  <div className="text-xs text-gray-300 line-clamp-2">{invite.decline_reason}</div>
                </div>
              )}
            </div>
          ))}

          {declinedInvites.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No rejected invites</p>
              <p className="text-xs mt-2">Staff can reject pending invites if there's an issue</p>
            </div>
          )}
        </div>
      )}

      {emailPreview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-600/40 flex items-center justify-center flex-shrink-0">
                  <Eye className="w-4 h-4 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">Email Preview</div>
                  <div className="text-xs text-gray-400 truncate">{emailPreview.subject}</div>
                </div>
              </div>
              <button
                onClick={() => setEmailPreview(null)}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0 ml-3"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={emailPreview.html}
                title="Email Preview"
                className="w-full h-full border-0 rounded-b-xl"
                style={{ minHeight: '500px' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}

      {showManualSendConfirmation && selectedContact && manualInviteType && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-lg max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Send className="w-5 h-5" />
                Confirm Send Invite
              </h3>
              <button
                onClick={() => setShowManualSendConfirmation(false)}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
                <div className="text-sm text-blue-300 mb-2">
                  You are about to send a punchlist invite to:
                </div>
                <div className="font-medium text-white">{selectedContact.full_name}</div>
                {selectedContact.company_name && (
                  <div className="text-sm text-gray-400">{selectedContact.company_name}</div>
                )}
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-blue-800">
                  <Mail className="w-4 h-4 text-blue-400" />
                  <span className="text-white font-medium">{manualInviteEmail}</span>
                </div>
              </div>

              {manualInviteType === 'test_and_tune' && (
                <div className="p-3 border rounded-lg bg-cyan-900/30 border-cyan-600">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-cyan-400" />
                    <div className="text-sm font-semibold text-cyan-400">Test &amp; Tune (90 Days Free)</div>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Grant 90-day Test &amp; Tune portal access</li>
                    <li>• Send personalized welcome email with portal link</li>
                    <li>• Allow customer to submit service requests and adjustments</li>
                  </ul>
                </div>
              )}

              {manualInviteType === 'test_and_tune_no_portal' && (
                <div className="p-3 border rounded-lg bg-cyan-900/30 border-cyan-700">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCheck className="w-4 h-4 text-cyan-400" />
                    <div className="text-sm font-semibold text-cyan-400">Test &amp; Tune — Email Only</div>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Grant 90-day Test &amp; Tune portal access (silently)</li>
                    <li>• Send welcome email <span className="font-medium text-cyan-300">without</span> a portal link</li>
                    <li>• Portal access can be shared with the customer later if needed</li>
                  </ul>
                </div>
              )}

              {manualInviteType === 'promotional' && (
                <div className="p-3 border rounded-lg bg-amber-900/30 border-amber-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <div className="text-sm font-semibold text-amber-400">Promotional Access (90 Days)</div>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Grant 90-day promotional punchlist access</li>
                    <li>• Allow customer to explore proposals, invoices, and messaging</li>
                    <li>• Send welcome email with login instructions</li>
                    <li>• <span className="font-medium text-amber-400">Expires after 90 days</span></li>
                  </ul>
                </div>
              )}

              {manualInviteType === 'vip_signup' && (
                <div className="p-3 border rounded-lg bg-yellow-900/30 border-yellow-600">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-400" />
                    <div className="text-sm font-semibold text-yellow-400">VIP Signup Invite</div>
                  </div>
                  <ul className="text-sm text-gray-300 space-y-1">
                    <li>• Send email with VIP portal information and signup link</li>
                    <li>• No portal access grant created &mdash; customer chooses their plan</li>
                    <li>• Customer activates access through the membership signup page</li>
                  </ul>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button
                    onClick={confirmManualInvite}
                    disabled={sendingManualInvite}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2"
                  >
                    {sendingManualInvite ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invite
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowManualSendConfirmation(false)}
                    disabled={sendingManualInvite}
                    className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </div>
                {manualInviteType !== 'vip_signup' && (
                  <button
                    onClick={() => fetchEmailPreview({
                      contact_name: selectedContact.full_name,
                      contact_email: manualInviteEmail,
                      access_type: manualInviteType,
                    })}
                    disabled={loadingPreview}
                    className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 hover:text-white border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    {loadingPreview ? (
                      <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                    Preview Email
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSendConfirmation && inviteToSend && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full">

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-800">
              <div>
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-400" />
                  {inviteModalStep === 'type' ? 'Choose Invite Type' : 'Confirm & Send'}
                </h3>
                <p className="text-sm text-gray-400 mt-0.5">
                  {inviteToSend.contact_name}
                  {inviteToSend.project_name ? ` · ${inviteToSend.project_name}` : ''}
                </p>
              </div>
              <button onClick={closeSendConfirmation} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-800">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${inviteModalStep === 'type' ? 'text-blue-400' : 'text-gray-500'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${inviteModalStep === 'type' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>1</div>
                Select Type
              </div>
              <div className="flex-1 h-px bg-gray-700" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${inviteModalStep === 'confirm' ? 'text-blue-400' : 'text-gray-500'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${inviteModalStep === 'confirm' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'}`}>2</div>
                Confirm
              </div>
            </div>

            <div className="p-6">

              {/* STEP 1: Type Selection */}
              {inviteModalStep === 'type' && (
                <div className="space-y-3">
                  {/* Test & Tune */}
                  <button
                    onClick={() => setSelectedInviteType('test_and_tune')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedInviteType === 'test_and_tune'
                        ? 'border-cyan-500 bg-cyan-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedInviteType === 'test_and_tune' ? 'bg-cyan-600' : 'bg-gray-700'}`}>
                        <TrendingUp className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">Test & Tune</span>
                          <span className="text-xs px-2 py-0.5 bg-cyan-900/50 text-cyan-300 rounded-full border border-cyan-700">90 Days Free</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          For customers whose project is substantially complete. Grants 90-day free portal access for system fine-tuning, adjustments, and support. Sends a personalized welcome email explaining the program.
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${selectedInviteType === 'test_and_tune' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`} />
                    </div>
                  </button>

                  {/* Promotional */}
                  <button
                    onClick={() => setSelectedInviteType('promotional')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedInviteType === 'promotional'
                        ? 'border-amber-500 bg-amber-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedInviteType === 'promotional' ? 'bg-amber-600' : 'bg-gray-700'}`}>
                        <Sparkles className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">Promotional</span>
                          <span className="text-xs px-2 py-0.5 bg-amber-900/50 text-amber-300 rounded-full border border-amber-700">Limited Trial</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          A general-purpose portal invite for prospects or existing customers. Gives temporary access to explore proposals, project status, invoices, and direct messaging — no program enrollment required.
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${selectedInviteType === 'promotional' ? 'border-amber-500 bg-amber-500' : 'border-gray-600'}`} />
                    </div>
                  </button>

                  {/* VIP Signup */}
                  <button
                    onClick={() => setSelectedInviteType('vip_signup')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedInviteType === 'vip_signup'
                        ? 'border-yellow-500 bg-yellow-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedInviteType === 'vip_signup' ? 'bg-yellow-600' : 'bg-gray-700'}`}>
                        <Star className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">VIP Signup</span>
                          <span className="text-xs px-2 py-0.5 bg-yellow-900/50 text-yellow-300 rounded-full border border-yellow-700">Paid Plan</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Direct the customer to your VIP membership signup page where they can choose a plan and subscribe. Use this when a customer is ready to sign up for ongoing VIP portal access. You will receive a link to share with them.
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${selectedInviteType === 'vip_signup' ? 'border-yellow-500 bg-yellow-500' : 'border-gray-600'}`} />
                    </div>
                  </button>

                  {/* Test & Tune (No Portal) */}
                  <button
                    onClick={() => setSelectedInviteType('test_and_tune_no_portal')}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      selectedInviteType === 'test_and_tune_no_portal'
                        ? 'border-cyan-500 bg-cyan-900/20'
                        : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedInviteType === 'test_and_tune_no_portal' ? 'bg-cyan-700' : 'bg-gray-700'}`}>
                        <CheckCheck className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">Test &amp; Tune (No Portal)</span>
                          <span className="text-xs px-2 py-0.5 bg-cyan-900/50 text-cyan-300 rounded-full border border-cyan-800">90 Days · Email Only</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                          Enrolls the customer in the 90-day Test &amp; Tune program and sends the welcome email — without including a portal link. Portal access is still created silently in the background and can be shared later if needed.
                        </p>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-1 ${selectedInviteType === 'test_and_tune_no_portal' ? 'border-cyan-500 bg-cyan-500' : 'border-gray-600'}`} />
                    </div>
                  </button>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setInviteModalStep('confirm')}
                      disabled={!selectedInviteType}
                      className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                    >
                      Continue
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button onClick={closeSendConfirmation} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Confirm */}
              {inviteModalStep === 'confirm' && (
                <div className="space-y-4">

                  {/* Selected type reminder */}
                  <div className={`flex items-center gap-3 p-3 rounded-lg border ${
                    selectedInviteType === 'test_and_tune' ? 'bg-cyan-900/20 border-cyan-700' :
                    selectedInviteType === 'test_and_tune_no_portal' ? 'bg-cyan-900/20 border-cyan-800' :
                    selectedInviteType === 'promotional' ? 'bg-amber-900/20 border-amber-700' :
                    'bg-yellow-900/20 border-yellow-700'
                  }`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      selectedInviteType === 'test_and_tune' ? 'bg-cyan-600' :
                      selectedInviteType === 'test_and_tune_no_portal' ? 'bg-cyan-700' :
                      selectedInviteType === 'promotional' ? 'bg-amber-600' : 'bg-yellow-600'
                    }`}>
                      {selectedInviteType === 'test_and_tune' && <TrendingUp className="w-4 h-4 text-white" />}
                      {selectedInviteType === 'test_and_tune_no_portal' && <CheckCheck className="w-4 h-4 text-white" />}
                      {selectedInviteType === 'promotional' && <Sparkles className="w-4 h-4 text-white" />}
                      {selectedInviteType === 'vip_signup' && <Star className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className={`text-xs font-semibold ${
                        selectedInviteType === 'test_and_tune' ? 'text-cyan-300' :
                        selectedInviteType === 'test_and_tune_no_portal' ? 'text-cyan-300' :
                        selectedInviteType === 'promotional' ? 'text-amber-300' : 'text-yellow-300'
                      }`}>
                        {selectedInviteType === 'test_and_tune' ? 'Test & Tune' :
                         selectedInviteType === 'test_and_tune_no_portal' ? 'Test & Tune (No Portal)' :
                         selectedInviteType === 'promotional' ? 'Promotional' : 'VIP Signup'}
                      </div>
                      <div className="text-xs text-gray-400">
                        {selectedInviteType === 'test_and_tune' && '90-day free trial · Welcome email included'}
                        {selectedInviteType === 'test_and_tune_no_portal' && '90 days · Email only · No portal link sent'}
                        {selectedInviteType === 'promotional' && 'Limited trial access · Portal invite email'}
                        {selectedInviteType === 'vip_signup' && 'Share the signup link with your customer'}
                      </div>
                    </div>
                    <button onClick={() => setInviteModalStep('type')} className="ml-auto text-xs text-gray-500 hover:text-gray-300 underline underline-offset-2">
                      Change
                    </button>
                  </div>

                  {/* VIP Signup flow */}
                  {selectedInviteType === 'vip_signup' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-300">
                        Share this link with <span className="font-semibold text-white">{inviteToSend.contact_name}</span> so they can choose a VIP plan and sign up for ongoing portal access.
                      </p>
                      <div className="flex items-center gap-2 p-3 bg-gray-800 border border-gray-700 rounded-lg">
                        <span className="flex-1 text-sm text-gray-300 font-mono truncate">{getVipSignupUrl()}</span>
                        <button
                          onClick={copyVipSignupLink}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all flex-shrink-0 ${
                            vipSignupLinkCopied
                              ? 'bg-green-700 text-green-100'
                              : 'bg-gray-700 hover:bg-gray-600 text-white'
                          }`}
                        >
                          {vipSignupLinkCopied ? <CheckCheck className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                          {vipSignupLinkCopied ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="flex gap-3 pt-1">
                        <button
                          onClick={() => { window.open(getVipSignupUrl(), '_blank'); }}
                          className="flex-1 px-4 py-2.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                        >
                          <Star className="w-4 h-4" />
                          Open Signup Page
                        </button>
                        <button onClick={closeSendConfirmation} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors">
                          Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Test & Tune / Promotional email flow */
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Email Address <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="email"
                          value={editableEmail}
                          onChange={(e) => setEditableEmail(e.target.value)}
                          placeholder="customer@example.com"
                          className="w-full px-3 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                          autoFocus
                        />
                        <p className="text-xs text-gray-500 mt-1.5">Review and update if needed. The invite email will be sent to this address.</p>
                      </div>

                      {selectedInviteType === 'test_and_tune' && (
                        <div className="p-3 bg-cyan-900/20 border border-cyan-800 rounded-lg text-xs text-cyan-300 space-y-1">
                          <div className="font-semibold text-cyan-200 mb-1.5">This will:</div>
                          <div>• Grant 90-day free Test &amp; Tune trial access</div>
                          <div>• Send a personalized welcome email with program details</div>
                          <div>• Provide full portal access (proposals, punchlist, messaging)</div>
                          <div>• <span className="text-yellow-400">Access expires after 90 days</span> unless customer subscribes</div>
                        </div>
                      )}

                      {selectedInviteType === 'test_and_tune_no_portal' && (
                        <div className="p-3 bg-cyan-900/20 border border-cyan-800 rounded-lg text-xs text-cyan-300 space-y-1">
                          <div className="font-semibold text-cyan-200 mb-1.5">This will:</div>
                          <div>• Grant 90-day Test &amp; Tune program access (silently, in the background)</div>
                          <div>• Send a personalized welcome email explaining the program</div>
                          <div>• <span className="text-gray-400">No portal link will be included in the email</span></div>
                          <div>• Portal access is ready and can be shared with the customer later if needed</div>
                          <div>• <span className="text-yellow-400">Access expires after 90 days</span> unless customer subscribes</div>
                        </div>
                      )}

                      {selectedInviteType === 'promotional' && (
                        <div className="p-3 bg-amber-900/20 border border-amber-800 rounded-lg text-xs text-amber-300 space-y-1">
                          <div className="font-semibold text-amber-200 mb-1.5">This will:</div>
                          <div>• Grant temporary portal access to explore features</div>
                          <div>• Send a portal invite email with login instructions</div>
                          <div>• Provide access to proposals, projects, invoices, and messaging</div>
                          <div>• <span className="text-yellow-400">Access expires</span> unless customer subscribes to a VIP plan</div>
                        </div>
                      )}

                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex gap-2">
                          <button
                            onClick={confirmSendInvite}
                            disabled={!editableEmail.trim() || !editableEmail.includes('@') || sendingInvite}
                            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                          >
                            {sendingInvite ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Send className="w-4 h-4" />
                                Send Invite
                              </>
                            )}
                          </button>
                          <button onClick={closeSendConfirmation} disabled={sendingInvite} className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors">
                            Cancel
                          </button>
                        </div>
                        <button
                          onClick={() => fetchEmailPreview({
                            contact_name: inviteToSend?.contact_name || '',
                            contact_email: editableEmail,
                            access_type: selectedInviteType || 'test_and_tune',
                            project_name: inviteToSend?.project_name,
                            expiration_date: undefined,
                          })}
                          disabled={loadingPreview || !editableEmail.trim()}
                          className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 hover:text-white border border-gray-600 rounded-lg text-sm flex items-center justify-center gap-2 transition-colors"
                        >
                          {loadingPreview ? (
                            <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          Preview Email
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Complete Project Modal */}
      {completeProjectCustomer && (
        <CompleteProjectModal
          customer={completeProjectCustomer}
          onClose={() => setCompleteProjectCustomer(null)}
          onComplete={() => {
            setCompleteProjectCustomer(null);
            loadInvites();
          }}
          onOpenSalesOrder={onOpenSalesOrder}
        />
      )}

      {/* Customer Detail Modal */}
      {selectedCustomerDetail && (() => {
        const customer = selectedCustomerDetail;
        let accessIcon: React.ReactNode, accessLabel: string, accessColor: string, daysRemaining: number | null;
        if (customer.access_type === 'vip_membership') {
          accessIcon = <Star className="w-3.5 h-3.5" />; accessLabel = 'VIP Member'; accessColor = 'text-amber-400 bg-amber-900/30 border-amber-700'; daysRemaining = null;
        } else if (customer.access_type === 'promotional') {
          accessIcon = <Sparkles className="w-3.5 h-3.5" />; accessLabel = 'Promotional'; accessColor = 'text-green-400 bg-green-900/30 border-green-700'; daysRemaining = customer.days_remaining;
        } else if (customer.access_type === 'test_and_tune') {
          accessIcon = <TrendingUp className="w-3.5 h-3.5" />; accessLabel = 'Test & Tune'; accessColor = 'text-blue-400 bg-blue-900/30 border-blue-700'; daysRemaining = customer.days_remaining;
        } else if (customer.access_type === 'test_and_tune_no_portal') {
          accessIcon = <FileText className="w-3.5 h-3.5" />; accessLabel = 'T&T No Portal'; accessColor = 'text-cyan-400 bg-cyan-900/30 border-cyan-700'; daysRemaining = customer.days_remaining;
        } else {
          accessIcon = <User className="w-3.5 h-3.5" />; accessLabel = 'Unknown'; accessColor = 'text-gray-400 bg-gray-900/30 border-gray-700'; daysRemaining = null;
        }
        const isSuspended = customer.status === 'suspended';
        return (
          <CustomerDetailModal
            customer={customer}
            accessLabel={accessLabel}
            accessIcon={accessIcon}
            accessColor={accessColor}
            daysRemaining={daysRemaining}
            isSuspended={isSuspended}
            onClose={() => setSelectedCustomerDetail(null)}
            onViewTasks={(status) => {
              onViewCustomerTasks?.(customer.contact_id, customer.contact_name, status);
            }}
            onResendEmail={() => {
              setSelectedCustomerDetail(null);
              setResendConfirm({ type: 'invite_email', customer });
            }}
            onResendMagicLink={() => {
              setSelectedCustomerDetail(null);
              setResendConfirm({ type: 'magic_link', customer });
            }}
            onSuspendToggle={() => {
              setSelectedCustomerDetail(null);
              setSuspendConfirm({
                grantId: customer.grant_id,
                contactName: customer.contact_name,
                currentStatus: customer.status
              });
            }}
            onDelete={() => {
              setSelectedCustomerDetail(null);
              setDeleteConfirm({
                grantId: customer.grant_id,
                contactName: customer.contact_name
              });
            }}
            resendingEmail={resendingEmailFor === customer.contact_id}
            resendingMagicLink={resendingMagicLinkFor === customer.contact_id}
          />
        );
      })()}

      {/* Resend Confirmation Modal */}
      {resendConfirm && (
        <ResendConfirmModal
          type={resendConfirm.type}
          customer={resendConfirm.customer}
          isSending={
            resendConfirm.type === 'invite_email'
              ? resendingEmailFor === resendConfirm.customer.contact_id
              : resendingMagicLinkFor === resendConfirm.customer.contact_id
          }
          onConfirm={async () => {
            const c = resendConfirm.customer;
            if (resendConfirm.type === 'invite_email') {
              await resendWelcomeEmail(c);
            } else {
              await resendMagicLink(c);
            }
            setResendConfirm(null);
          }}
          onCancel={() => setResendConfirm(null)}
        />
      )}

      {/* Suspend Confirmation Modal */}
      {suspendConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                suspendConfirm.currentStatus === 'suspended'
                  ? 'bg-green-900/40 border border-green-700'
                  : 'bg-yellow-900/40 border border-yellow-700'
              }`}>
                {suspendConfirm.currentStatus === 'suspended'
                  ? <PlayCircle className="w-5 h-5 text-green-400" />
                  : <PauseCircle className="w-5 h-5 text-yellow-400" />
                }
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">
                  {suspendConfirm.currentStatus === 'suspended' ? 'Restore Access' : 'Suspend Access'}
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  {suspendConfirm.currentStatus === 'suspended'
                    ? `Restore portal access for ${suspendConfirm.contactName}? They will be able to log in immediately.`
                    : `Suspend portal access for ${suspendConfirm.contactName}? They will be blocked from logging in immediately. No notification will be sent.`
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleSuspendToggle}
                disabled={actionInProgress}
                className={`flex-1 px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                  suspendConfirm.currentStatus === 'suspended'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-yellow-600 hover:bg-yellow-700'
                }`}
              >
                {actionInProgress ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : suspendConfirm.currentStatus === 'suspended' ? (
                  <>
                    <PlayCircle className="w-4 h-4" />
                    Restore Access
                  </>
                ) : (
                  <>
                    <PauseCircle className="w-4 h-4" />
                    Suspend Access
                  </>
                )}
              </button>
              <button
                onClick={() => setSuspendConfirm(null)}
                disabled={actionInProgress}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-900/60 rounded-xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-900/40 border border-red-700 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete Access Grant</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Permanently delete access for <span className="text-white font-medium">{deleteConfirm.contactName}</span>?
                </p>
                <p className="text-sm text-red-400 mt-2">
                  This will also delete all of their punchlist tasks and history. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteAccessGrant}
                disabled={actionInProgress}
                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {actionInProgress ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Delete Permanently
                  </>
                )}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={actionInProgress}
                className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      {/* Send Success Animation */}
      {sendSuccessOverlay && (() => {
        const PARTICLES = Array.from({ length: 18 }, (_, i) => {
          const angle = (i / 18) * 360;
          const distance = 80 + (i % 3) * 30;
          const x = Math.cos((angle * Math.PI) / 180) * distance;
          const y = Math.sin((angle * Math.PI) / 180) * distance;
          const colors = ['#f59e0b', '#10b981', '#3b82f6', '#06b6d4', '#a3e635', '#38bdf8'];
          const color = colors[i % colors.length];
          return { x, y, color, delay: i * 0.04 };
        });
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ animation: 'fadeInOverlayPI 0.2s ease-out' }}
          >
            <style>{`
              @keyframes fadeInOverlayPI { from { opacity:0 } to { opacity:1 } }
              @keyframes popInPI { 0% { transform:scale(0.5); opacity:0 } 60% { transform:scale(1.08) } 100% { transform:scale(1); opacity:1 } }
              @keyframes flyOutPI {
                0% { transform:translate(0,0) scale(1); opacity:1 }
                100% { transform:translate(var(--tx),var(--ty)) scale(0); opacity:0 }
              }
              @keyframes checkPopPI { 0%{transform:scale(0) rotate(-15deg);opacity:0} 60%{transform:scale(1.2) rotate(3deg)} 100%{transform:scale(1) rotate(0deg);opacity:1} }
              @keyframes slideUpPI { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
              @keyframes shrinkOutPI { 0%{opacity:1} 70%{opacity:1} 100%{opacity:0} }
            `}</style>

            <div className="relative" style={{ animation: 'shrinkOutPI 4.5s ease forwards' }}>
              {PARTICLES.map((p, i) => (
                <div
                  key={i}
                  className="absolute top-1/2 left-1/2 w-3 h-3 rounded-full"
                  style={{
                    background: p.color,
                    ['--tx' as string]: `${p.x}px`,
                    ['--ty' as string]: `${p.y}px`,
                    animation: `flyOutPI 0.8s cubic-bezier(0.2,0.8,0.4,1) ${p.delay}s both`,
                    marginLeft: -6,
                    marginTop: -6,
                  }}
                />
              ))}

              <div
                className="relative bg-gray-900 border border-gray-700 rounded-3xl shadow-2xl px-10 py-8 text-center pointer-events-auto"
                style={{ animation: 'popInPI 0.4s cubic-bezier(0.34,1.56,0.64,1) both', minWidth: 300 }}
              >
                <button
                  onClick={() => setSendSuccessOverlay(null)}
                  className="absolute top-3 right-3 text-gray-600 hover:text-gray-400 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                {(() => {
                  const isResend = sendSuccessOverlay.type === 'resend';
                  const accessType = sendSuccessOverlay.accessType;
                  const isVIP = accessType === 'vip_signup';
                  const isPromotional = accessType === 'promotional';
                  const isNoPortal = accessType === 'test_and_tune_no_portal';

                  const iconBg = isResend ? 'bg-blue-900/40 border-blue-500' : isVIP ? 'bg-amber-900/40 border-amber-400' : 'bg-cyan-900/40 border-cyan-500';
                  const iconColor = isResend ? 'text-blue-400' : isVIP ? 'text-amber-400' : 'text-cyan-400';
                  const headline = isResend ? 'Login Link Resent!' : isVIP ? 'VIP Invite Sent!' : isPromotional ? 'Promotional Access Sent!' : 'Invite Sent!';
                  const subtitle = isResend
                    ? 'A fresh 30-day login link was emailed'
                    : isVIP
                    ? 'VIP membership invitation delivered'
                    : isPromotional
                    ? 'Promotional portal access activated'
                    : isNoPortal
                    ? '90-Day Test & Tune trial activated'
                    : '90-Day Test & Tune trial activated';
                  const showStars = !isResend;
                  const starColor = isVIP ? 'text-amber-400 fill-amber-400' : 'text-amber-400 fill-amber-400';

                  return (
                    <>
                      <div
                        className={`inline-flex items-center justify-center w-20 h-20 rounded-full ${iconBg} border-2 mb-5`}
                        style={{ animation: 'checkPopPI 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.15s both' }}
                      >
                        <CheckCircle className={`w-10 h-10 ${iconColor}`} />
                      </div>

                      <div style={{ animation: 'slideUpPI 0.35s ease 0.3s both' }}>
                        <p className="text-2xl font-bold text-white mb-1">{headline}</p>
                        <p className="text-gray-300 text-base font-medium mb-1">
                          {sendSuccessOverlay.name}
                        </p>
                        <p className="text-gray-500 text-sm">{subtitle}</p>
                      </div>

                      {showStars && (
                        <div
                          className="mt-5 flex items-center justify-center gap-1.5"
                          style={{ animation: 'slideUpPI 0.35s ease 0.45s both' }}
                        >
                          {[1,2,3,4,5].map(i => (
                            <Star key={i} className={`w-4 h-4 ${starColor}`} />
                          ))}
                        </div>
                      )}

                      {isResend && (
                        <div
                          className="mt-4 flex items-center justify-center gap-1.5 text-blue-400/70 text-xs"
                          style={{ animation: 'slideUpPI 0.35s ease 0.45s both' }}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Valid for 30 days</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
