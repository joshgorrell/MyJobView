import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Proposal } from '../../lib/types';
import { Plus, FileText, Eye, Send, CheckCircle, XCircle, Calendar, Copy, File as FileEdit, History, MoreVertical, Search, Clock, Trash2, Maximize2, ChevronLeft, ChevronRight, MessageSquare, Bell, ThumbsUp, AlertCircle, DollarSign, RotateCcw, Globe, EyeOff, Archive, ArchiveRestore, Activity, Filter, X, ExternalLink, Receipt, BarChart2, ShoppingCart, RefreshCw, Ban, Film } from 'lucide-react';
import { ProposalActivityPanel } from './ProposalActivityPanel';
import { DuplicateProposalModal } from './DuplicateProposalModal';
import { CreateRevisionModal } from './CreateRevisionModal';
import { ProposalVersionHistory } from './ProposalVersionHistory';
import { ManualApprovalModal } from './ManualApprovalModal';
import DepositReminderButton from './DepositReminderButton';
import { RecordPaymentModal } from '../Invoices/RecordPaymentModal';
import { ReactivateProposalModalEnhanced } from './ReactivateProposalModalEnhanced';
import { DeclineProposalModal } from './DeclineProposalModal';

interface ProposalsListProps {
  onSelectProposal: (proposalId: string) => void;
  onCreateNew: () => void;
  onSelectSalesOrder?: (salesOrderId: string) => void;
  onNavigateToSalesOrders?: () => void;
  onNavigateToSalesStats?: () => void;
  onOpenVideoLibrary?: () => void;
}

type SortField = 'created_at' | 'status' | 'total' | 'proposal_number';
type SortDirection = 'asc' | 'desc';

export default function ProposalsList({ onSelectProposal, onCreateNew, onSelectSalesOrder, onNavigateToSalesOrders, onNavigateToSalesStats, onOpenVideoLibrary }: ProposalsListProps) {
  const { profile, loading: authLoading } = useAuth();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [pendingDeposits, setPendingDeposits] = useState<Proposal[]>([]);
  const [showPendingDeposits, setShowPendingDeposits] = useState(true);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showExpired, setShowExpired] = useState<'all' | 'active' | 'expired'>('all');
  const [hideDeclined, setHideDeclined] = useState(false);
  const [hideArchived, setHideArchived] = useState(false);
  const [hideApproved, setHideApproved] = useState(true);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showManualApprovalModal, setShowManualApprovalModal] = useState(false);
  const [showReactivateModal, setShowReactivateModal] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);
  const [activityData, setActivityData] = useState<any>(null);
  const [activityTab, setActivityTab] = useState<'summary' | 'timeline'>('summary');
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuOpenAbove, setMenuOpenAbove] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [depositPaymentInvoice, setDepositPaymentInvoice] = useState<any>(null);
  const [loadingDepositInvoice, setLoadingDepositInvoice] = useState<string | null>(null);
  const [pendingDepositSalesOrders, setPendingDepositSalesOrders] = useState<Record<string, string>>({});
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineModalMode, setDeclineModalMode] = useState<'decline' | 'cancel'>('decline');

  // Rep selector — visible to admin / manager / sales_manager
  const isAdminOrManager = ['admin', 'manager', 'sales_manager'].includes(profile?.role || '');
  const [salesReps, setSalesReps] = useState<{ id: string; full_name: string; first_name: string }[]>([]);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  // Load user preferences once on mount, then trigger proposal load
  useEffect(() => {
    if (profile && !preferencesLoaded) {
      loadPreferences().catch(err => {
        console.error('Failed to load preferences:', err);
        setPreferencesLoaded(true);
      });
    }
  }, [profile]);

  // Debounce search query to avoid too many database requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load proposals and pending deposits in parallel when filters or pagination changes.
  // Wait for preferences to be loaded so we use the correct hide* values from the start.
  useEffect(() => {
    if (authLoading || !preferencesLoaded) {
      return;
    }

    if (profile) {
      setLoading(true);
      Promise.all([
        loadProposals().catch(err => console.error('Failed to load proposals:', err)),
        loadPendingDeposits().catch(err => console.error('Failed to load pending deposits:', err))
      ]);
    } else {
      setLoading(false);
    }
  }, [filterStatus, showExpired, hideDeclined, hideArchived, hideApproved, currentPage, itemsPerPage, debouncedSearch, sortField, sortDirection, profile, authLoading, preferencesLoaded, selectedRepId]);

  // Reset to page 1 when filter/sort criteria change (but not when currentPage itself changes).
  const skipNextLoadRef = useRef(false);
  useEffect(() => {
    if (currentPage !== 1) {
      skipNextLoadRef.current = true;
      setCurrentPage(1);
    }
  }, [debouncedSearch, filterStatus, showExpired, itemsPerPage, sortField, sortDirection, selectedRepId]);

  useEffect(() => {
    if (!isAdminOrManager || !profile) return;
    supabase
      .from('profiles')
      .select('id, full_name, first_name')
      .eq('organization_id', profile.organization_id)
      .eq('can_create_proposals', true)
      .order('full_name')
      .then(({ data }) => setSalesReps(data || []));
  }, [isAdminOrManager, profile?.id]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.menu-dropdown') && !target.closest('.menu-button')) {
        setOpenMenuId(null);
      }
      if (!target.closest('.filter-panel') && !target.closest('.filter-button')) {
        setShowFilterPanel(false);
      }
    }

    if (openMenuId || showFilterPanel) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuId, showFilterPanel]);

  async function loadPreferences() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('proposals_hide_declined, proposals_hide_archived, proposals_hide_approved')
        .eq('id', profile?.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading preferences:', error);
      }

      if (data) {
        setHideDeclined(data.proposals_hide_declined || false);
        setHideArchived(data.proposals_hide_archived || false);
        setHideApproved(data.proposals_hide_approved !== false);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    } finally {
      setPreferencesLoaded(true);
    }
  }

  async function savePreference(key: 'proposals_hide_declined' | 'proposals_hide_archived' | 'proposals_hide_approved', value: boolean) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [key]: value })
        .eq('id', profile?.id);

      if (error) {
        console.error('Error saving preference:', error);
      }
    } catch (error) {
      console.error('Error saving preference:', error);
    }
  }

  async function loadProposals() {
    if (!profile) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Calculate pagination range
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;

      let query = supabase
        .from('proposals_with_revision_count')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey(id, full_name, email),
          profiles!created_by(id, full_name),
          leads(id, company_name, contact_name),
          bill_to_contact:contacts!proposals_bill_to_contact_id_fkey(id, full_name, company_name)
        `, { count: 'planned' })
        .eq('is_revision', false);

      // Apply user-scope filter based on proposal_visibility_scope setting
      // Admin always sees all; others respect their visibility scope (default: own)
      const visibilityScope = (profile as any).proposal_visibility_scope || 'own';
      if (isAdminOrManager) {
        if (selectedRepId) {
          query = query.eq('created_by', selectedRepId);
        }
        // No filter when selectedRepId is null — show all org proposals
      } else {
        if (visibilityScope === 'own') {
          query = query.eq('created_by', profile.id);
        }
        // 'office' and 'company' scopes show all org proposals (RLS already handles org isolation)
      }

      // Apply search filter
      if (debouncedSearch.trim()) {
        query = query.or(`title.ilike.%${debouncedSearch}%,proposal_number.ilike.%${debouncedSearch}%,notes.ilike.%${debouncedSearch}%`);
      }

      // Apply status filter
      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      // Proposals with a linked sales order have transitioned — never show them here
      query = query.is('sales_order_id', null);

      // Apply user preference filters
      if (hideDeclined) {
        query = query.neq('status', 'declined');
      }
      if (hideArchived) {
        query = query.neq('status', 'archived');
      }
      if (hideApproved && filterStatus !== 'approved' && filterStatus !== 'approved_pending_action') {
        query = query
          .neq('status', 'approved')
          .neq('status', 'approved_pending_action');
      }

      // Apply expiration filter
      if (showExpired === 'active') {
        // Active means not expired AND not declined
        query = query
          .or('expires_at.is.null,expires_at.gte.' + new Date().toISOString())
          .neq('status', 'declined');
      } else if (showExpired === 'expired') {
        query = query.lt('expires_at', new Date().toISOString());
      }

      // Apply sorting - use simpler approach for status
      // Sort by created_at DESC by default when sorting by status for better performance
      if (sortField === 'status') {
        // Instead of fetching all records, just use created_at sort which is indexed
        // Status can be viewed visually, sorting by it isn't that critical
        query = query
          .order('created_at', { ascending: false })
          .range(from, to);
      } else {
        // Standard sorting for other fields
        query = query
          .order(sortField, { ascending: sortDirection === 'asc' })
          .range(from, to);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error loading proposals:', error);
        throw error;
      }

      // Activity and message data is now included in the view
      setProposals(data || []);
      setTotalCount(count || 0);
      setRetryCount(0); // Reset retry count on success
    } catch (error: any) {
      console.error('Error loading proposals:', error);
      setError(error.message || 'Failed to load proposals');

      // Only show alert if this isn't a retry
      if (retryCount === 0) {
        // Don't show alert immediately - let the UI show the error
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadPendingDeposits() {
    if (!profile) return;

    try {
      const visibilityScope = (profile as any).proposal_visibility_scope || 'own';

      let depositQuery = supabase
        .from('proposals')
        .select(`
          *,
          contacts:contacts!proposals_contact_id_fkey(id, full_name, email, phone)
        `)
        .eq('status', 'approved')
        .eq('deposit_paid', false)
        .eq('require_deposit', true)
        .order('approval_completed_at', { ascending: false })
        .limit(10);

      if (isAdminOrManager) {
        if (selectedRepId) {
          depositQuery = depositQuery.eq('created_by', selectedRepId);
        }
      } else if (visibilityScope === 'own') {
        depositQuery = depositQuery.eq('created_by', profile.id);
      }

      const { data, error } = await depositQuery;

      if (error) throw error;
      const proposals = data || [];
      setPendingDeposits(proposals);

      if (proposals.length > 0) {
        const proposalIds = proposals.map(p => p.id);
        const { data: salesOrders } = await supabase
          .from('sales_orders')
          .select('id, proposal_id')
          .in('proposal_id', proposalIds);

        if (salesOrders && salesOrders.length > 0) {
          const mapping: Record<string, string> = {};
          for (const so of salesOrders) {
            if (so.proposal_id) mapping[so.proposal_id] = so.id;
          }
          setPendingDepositSalesOrders(mapping);
        }
      }
    } catch (error) {
      console.error('Error loading pending deposits:', error);
    }
  }

  function handlePopOutProposal(proposalId: string) {
    const url = `${window.location.origin}/proposals-fullscreen?id=${proposalId}`;
    const features = 'width=1600,height=900,menubar=no,toolbar=no,location=no,status=no';
    window.open(url, '_blank', features);
    setOpenMenuId(null);
  }

  async function handleDeleteProposal(proposal: Proposal) {
    const confirmMessage = proposal.status === 'sent' || proposal.status === 'portal'
      ? `This proposal has been sent to the customer. Deleting it will remove it from their portal as well.\n\nAre you sure you want to delete "${proposal.title}"?`
      : `Are you sure you want to delete "${proposal.title}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('proposals')
        .delete()
        .eq('id', proposal.id);

      if (error) throw error;

      setProposals(proposals.filter(p => p.id !== proposal.id));
      setOpenMenuId(null);
    } catch (error) {
      console.error('Error deleting proposal:', error);
      alert('Failed to delete proposal. Please try again.');
    }
  }

  async function handleRecallProposal(proposalId: string, currentStatus?: string) {
    const isApproved = currentStatus === 'approved' || currentStatus === 'approved_pending_action';
    const message = isApproved
      ? 'This proposal is approved. Recalling it will remove the approval and return it to Designing status. Are you sure?'
      : 'Recall this proposal from the customer portal? It will be returned to Designing status.';

    if (!confirm(message)) {
      return;
    }

    try {
      const updates: Record<string, unknown> = {
        status: 'designing',
        sent_at: null,
        viewed_at: null
      };

      if (isApproved) {
        updates.approved_at = null;
        updates.approved_by = null;
        updates.approval_completed_at = null;
        updates.deposit_paid = false;
        updates.accepted_via_method = null;
        updates.purchase_order_number = null;
      }

      const { error } = await supabase
        .from('proposals')
        .update(updates)
        .eq('id', proposalId);

      if (error) throw error;

      await loadProposals();
      setOpenMenuId(null);
      alert('Proposal recalled successfully!');
    } catch (error) {
      console.error('Error recalling proposal:', error);
      alert('Failed to recall proposal. Please try again.');
    }
  }

  async function handleRefreshProposal(proposalId: string) {
    try {
      const { error } = await supabase
        .from('proposals')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', proposalId);
      if (error) throw error;
      await loadProposals();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Error refreshing proposal:', error);
    }
  }

  async function handleArchiveProposal(proposal: Proposal) {
    const confirmMessage = `Archive proposal "${proposal.title}"? It will be hidden from the list but can be unarchived later.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('proposals')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_by: profile?.id,
          auto_archived: false
        })
        .eq('id', proposal.id);

      if (error) throw error;

      await loadProposals();
      setOpenMenuId(null);
    } catch (error) {
      console.error('Error archiving proposal:', error);
      alert('Failed to archive proposal. Please try again.');
    }
  }

  async function handleUnarchiveProposal(proposal: Proposal) {
    setSelectedProposal(proposal);
    setShowReactivateModal(true);
    setOpenMenuId(null);
  }

  async function handleRecordDepositPayment(proposal: any) {
    setLoadingDepositInvoice(proposal.id);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, contact_id, total, amount_paid, amount_due')
        .eq('proposal_id', proposal.id)
        .eq('invoice_type', 'deposit')
        .neq('status', 'paid')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDepositPaymentInvoice(data);
      } else {
        alert('No unpaid deposit invoice found for this proposal. The deposit invoice may have already been paid or not yet created.');
      }
    } catch (err) {
      console.error('Error fetching deposit invoice:', err);
      alert('Failed to load deposit invoice. Please try again.');
    } finally {
      setLoadingDepositInvoice(null);
    }
  }

  async function handleViewActivity(proposal: Proposal) {
    try {
      const { data, error } = await supabase.rpc('get_proposal_activity_summary', {
        p_proposal_id: proposal.id
      });

      if (error) throw error;

      setActivityData(data?.[0] || null);
      setSelectedProposal(proposal);
      setActivityTab('summary');
      setShowActivityModal(true);
      setOpenMenuId(null);

      // Mark activity as viewed to clear the "New" indicator - update local state only, no full reload
      try {
        const { error: markError } = await supabase.rpc('mark_proposal_activity_viewed', {
          p_proposal_id: proposal.id
        });

        if (markError) {
          console.error('Failed to mark activity as viewed:', markError);
        } else {
          setProposals(prev => prev.map(p =>
            p.id === proposal.id
              ? { ...p, has_recent_activity: false }
              : p
          ));
        }
      } catch (markError) {
        console.error('Error marking activity as viewed:', markError);
      }
    } catch (error) {
      console.error('Error fetching activity data:', error);
      alert('Failed to load activity history');
    }
  }

  function getStatusIcon(status: string) {
    switch (status) {
      case 'designing':
        return <FileEdit size={18} className="text-amber-400" title="Being Designed" />;
      case 'ready_to_submit':
        return <ThumbsUp size={18} className="text-cyan-400" title="Ready to Submit" />;
      case 'sent':
        return <Send size={18} className="text-blue-400" title="Submitted to Portal" />;
      case 'viewed':
        return <Eye size={18} className="text-purple-400" />;
      case 'approved':
        return <CheckCircle size={18} className="text-green-400" />;
      case 'approved_pending_action':
        return <AlertCircle size={18} className="text-yellow-400" title="Approved - Pending PO/Deposit" />;
      case 'declined':
        return <XCircle size={18} className="text-red-400" />;
      case 'expired':
        return <Clock size={18} className="text-orange-400" title="Expired" />;
      case 'archived':
        return <Archive size={18} className="text-gray-400" title="Archived" />;
      default:
        return <FileText size={18} className="text-gray-400" />;
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'designing':
        return 'bg-amber-900 text-amber-300';
      case 'ready_to_submit':
        return 'bg-cyan-900 text-cyan-300';
      case 'sent':
        return 'bg-blue-900 text-blue-300';
      case 'portal':
        return 'bg-blue-900 text-blue-300';
      case 'approved':
        return 'bg-green-900 text-green-300';
      case 'approved_pending_action':
        return 'bg-yellow-900 text-yellow-300';
      case 'declined':
        return 'bg-red-900 text-red-300';
      case 'cancelled':
        return 'bg-gray-700 text-gray-400';
      case 'expired':
        return 'bg-orange-900 text-orange-300';
      case 'archived':
        return 'bg-gray-700 text-gray-400';
      default:
        return 'bg-gray-700 text-gray-300';
    }
  }

  function formatStatusText(status: string): string {
    switch (status) {
      case 'ready_to_submit':
        return 'Ready to Submit';
      case 'approved_pending_action':
        return 'Approved - Pending Action';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status.charAt(0).toUpperCase() + status.slice(1);
    }
  }

  function formatDate(dateString: string) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit'
    }).format(date);
  }

  function formatDateTime(dateString: string) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  }

  function getDisplayTitle(proposal: any) {
    return proposal.title || proposal.proposal_number;
  }

  const POST_SEND_STATUSES = ['sent', 'viewed', 'portal', 'approved', 'approved_pending_action', 'declined', 'expired'];
  const PRE_SEND_STATUSES = ['designing', 'ready_to_submit'];
  const STALE_DAYS = 30;

  function isExpired(proposal: any): boolean {
    if (!proposal.expires_at) return false;
    if (!POST_SEND_STATUSES.includes(proposal.status)) return false;
    return new Date(proposal.expires_at) < new Date();
  }

  function isStale(proposal: any): boolean {
    if (!PRE_SEND_STATUSES.includes(proposal.status)) return false;
    const lastTouched = proposal.updated_at || proposal.created_at;
    if (!lastTouched) return false;
    const daysSince = (Date.now() - new Date(lastTouched).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= STALE_DAYS;
  }

  function getStaleDays(proposal: any): number {
    const lastTouched = proposal.updated_at || proposal.created_at;
    if (!lastTouched) return 0;
    return Math.floor((Date.now() - new Date(lastTouched).getTime()) / (1000 * 60 * 60 * 24));
  }

  function getViewCount(proposal: any): number {
    // Use viewed_at as indicator of views
    return proposal.viewed_at ? 1 : 0;
  }

  function getProposalAgeDays(proposal: any): number {
    return Math.floor((Date.now() - new Date(proposal.created_at).getTime()) / (1000 * 60 * 60 * 24));
  }

  function getAgingBadge(proposal: any): { label: string; className: string; title: string } | null {
    // Stale badge for pre-send proposals not touched in 30+ days
    if (PRE_SEND_STATUSES.includes(proposal.status)) {
      const days = getStaleDays(proposal);
      if (days < STALE_DAYS) return null;
      return {
        label: `Stale ${days}d`,
        className: 'bg-amber-900/70 text-amber-300 border border-amber-800',
        title: `Not updated in ${days} days — needs attention or cleanup`,
      };
    }
    // Aging badge for post-send active proposals
    const activeStatuses = ['sent', 'viewed', 'approved_pending_action'];
    if (!activeStatuses.includes(proposal.status)) return null;
    const days = getProposalAgeDays(proposal);
    if (days < 14) return null;
    if (days >= 60) return { label: `${days}d`, className: 'bg-red-900/70 text-red-300 border border-red-800', title: `${days} days old — needs follow-up` };
    if (days >= 30) return { label: `${days}d`, className: 'bg-orange-900/70 text-orange-300 border border-orange-800', title: `${days} days old — needs follow-up` };
    return { label: `${days}d`, className: 'bg-yellow-900/70 text-yellow-300 border border-yellow-800', title: `${days} days old — needs follow-up` };
  }

  function getLastViewedAt(proposal: any): Date | null {
    // Use viewed_at from proposal
    return proposal.viewed_at ? new Date(proposal.viewed_at) : null;
  }

  function getUnreadCustomerMessageCount(proposal: any): number {
    // Use pre-calculated count from view
    return proposal.unread_messages_count || 0;
  }

  // Calculate active filter count
  function getActiveFilterCount(): number {
    let count = 0;
    if (filterStatus !== 'all') count++;
    if (showExpired !== 'all') count++;
    if (sortField !== 'created_at' || sortDirection !== 'desc') count++;
    if (hideDeclined) count++;
    if (hideArchived) count++;
    if (!hideApproved) count++;
    if (selectedRepId) count++;
    return count;
  }

  function hasRecentActivity(proposal: any): boolean {
    // Use pre-calculated indicator from view
    return proposal.has_recent_activity || false;
  }

  // Pagination calculations
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  // Loading skeleton component
  function LoadingSkeleton() {
    return (
      <div className="space-y-1">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-3 bg-gray-800 border border-gray-700 rounded-lg animate-pulse">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 bg-gray-700 rounded"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-1/2"></div>
              </div>
              <div className="w-24 h-6 bg-gray-700 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="flex-shrink-0 border-b border-gray-700 bg-gray-800 px-4 sm:px-6 py-4">
          <div className="h-6 bg-gray-700 rounded w-32 mb-4 animate-pulse"></div>
          <div className="h-10 bg-gray-700 rounded animate-pulse"></div>
        </div>
        <div className="flex-1 px-3 sm:px-6 py-4">
          <LoadingSkeleton />
        </div>
      </div>
    );
  }

  // Show error state with retry button
  if (error && !loading) {
    return (
      <div className="h-full flex flex-col bg-gray-900">
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Failed to Load Proposals</h3>
            <p className="text-gray-400 mb-6">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setRetryCount(prev => prev + 1);
                if (profile) {
                  Promise.all([
                    loadProposals(),
                    loadPendingDeposits()
                  ]);
                }
              }}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-700 bg-gray-800">
        <div className="px-4 sm:px-6 py-4">
          {/* Mobile: Title on first row, everything else below */}
          <div className="sm:hidden space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-lg font-bold text-white">Proposals</h1>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onNavigateToSalesOrders?.()}
                  className="p-2.5 min-h-[44px] min-w-[44px] bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-lg flex items-center justify-center transition-colors"
                  title="Sales Orders"
                >
                  <ShoppingCart size={16} />
                </button>
                <button
                  onClick={() => onNavigateToSalesStats?.()}
                  className="p-2.5 min-h-[44px] min-w-[44px] bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-lg flex items-center justify-center transition-colors"
                  title="My Sales Stats"
                >
                  <BarChart2 size={16} />
                </button>
                <button
                  onClick={() => onOpenVideoLibrary?.()}
                  className="p-2.5 min-h-[44px] min-w-[44px] bg-gray-700 hover:bg-gray-600 active:bg-gray-500 text-white rounded-lg flex items-center justify-center transition-colors"
                  title="Video Library"
                >
                  <Film size={16} />
                </button>
                <button
                  onClick={onCreateNew}
                  className="px-3 py-2.5 min-h-[44px] bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
                >
                  <Plus size={16} />
                  <span>New</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className="filter-button px-3 py-2.5 bg-gray-900 border border-gray-700 hover:bg-gray-800 active:bg-gray-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 min-h-[44px]"
                >
                  <Filter size={16} />
                  {getActiveFilterCount() > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {getActiveFilterCount()}
                    </span>
                  )}
                </button>

                {/* Filter Panel Dropdown - shared for mobile and desktop */}
                {showFilterPanel && (
                  <div className="filter-panel absolute right-0 top-full mt-2 w-[calc(100vw-2rem)] max-w-[320px] sm:w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-700">
                      <h3 className="text-sm font-semibold text-white">Filter Proposals</h3>
                      <button
                        onClick={() => setShowFilterPanel(false)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Filter Content */}
                    <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                      {/* Status Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Status</label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="all">All Status</option>
                          <option value="designing">Designing</option>
                          <option value="ready_to_submit">Ready to Submit</option>
                          <option value="sent">Sent</option>
                          <option value="portal">Portal</option>
                          <option value="approved">Approved</option>
                          <option value="declined">Declined</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>

                      {/* Expiration Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Expiration</label>
                        <select
                          value={showExpired}
                          onChange={(e) => setShowExpired(e.target.value as 'all' | 'active' | 'expired')}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="all">All</option>
                          <option value="active">Active Only</option>
                          <option value="expired">Expired Only</option>
                        </select>
                      </div>

                      {/* Sort */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Sort By</label>
                        <select
                          value={`${sortField}-${sortDirection}`}
                          onChange={(e) => {
                            const [field, direction] = e.target.value.split('-');
                            setSortField(field as SortField);
                            setSortDirection(direction as SortDirection);
                          }}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="created_at-desc">Newest First</option>
                          <option value="created_at-asc">Oldest First</option>
                          <option value="total-desc">Highest Value</option>
                          <option value="total-asc">Lowest Value</option>
                          <option value="status-asc">Status A-Z</option>
                          <option value="status-desc">Status Z-A</option>
                          <option value="proposal_number-asc">Number A-Z</option>
                          <option value="proposal_number-desc">Number Z-A</option>
                        </select>
                      </div>

                      {/* Visibility Options */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Visibility</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideDeclined}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideDeclined(newValue);
                                savePreference('proposals_hide_declined', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Declined Proposals</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideArchived}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideArchived(newValue);
                                savePreference('proposals_hide_archived', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Archived Proposals</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideApproved}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideApproved(newValue);
                                savePreference('proposals_hide_approved', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Approved Proposals</span>
                          </label>
                        </div>
                      </div>

                      {/* Sales Rep Filter — admin / manager / sales_manager only */}
                      {isAdminOrManager && salesReps.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-2">Sales Rep</label>
                          <select
                            value={selectedRepId ?? ''}
                            onChange={(e) => setSelectedRepId(e.target.value || null)}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-3"
                          >
                            <option value="">All Reps</option>
                            {salesReps.map(rep => (
                              <option key={rep.id} value={rep.id}>
                                {rep.full_name || rep.first_name || 'Unknown'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setFilterStatus('all');
                          setShowExpired('all');
                          setSortField('created_at');
                          setSortDirection('desc');
                          setHideDeclined(false);
                          setHideArchived(false);
                          setHideApproved(true);
                          savePreference('proposals_hide_declined', false);
                          savePreference('proposals_hide_archived', false);
                          savePreference('proposals_hide_approved', true);
                        }}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => setShowFilterPanel(false)}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => window.open('/proposals-fullscreen', '_blank', 'width=1400,height=900')}
                className="px-2 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
                title="Pop out proposals"
              >
                <Maximize2 size={16} />
              </button>
              <button
                onClick={() => onNavigateToSalesOrders?.()}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
                title="Sales Orders"
              >
                <ShoppingCart size={16} />
              </button>
              <button
                onClick={() => onNavigateToSalesStats?.()}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
                title="My Sales Stats"
              >
                <BarChart2 size={16} />
              </button>
              <button
                onClick={() => onOpenVideoLibrary?.()}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
                title="Video Library"
              >
                <Film size={16} />
              </button>
              <button
                onClick={onCreateNew}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-1.5 transition-colors text-sm"
              >
                <Plus size={16} />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Desktop: Everything on one row */}
          <div className="hidden sm:flex items-center justify-between gap-3">
            <h1 className="text-xl font-bold text-white whitespace-nowrap">Proposals</h1>

            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search proposals..."
                  className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowFilterPanel(!showFilterPanel)}
                  className="filter-button px-3 py-2 bg-gray-900 border border-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap"
                >
                  <Filter size={16} />
                  <span>Filters</span>
                  {getActiveFilterCount() > 0 && (
                    <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {getActiveFilterCount()}
                    </span>
                  )}
                </button>

                {/* Filter Panel Dropdown - shared */}
                {showFilterPanel && (
                  <div className="filter-panel absolute right-0 top-full mt-2 w-screen max-w-[320px] sm:w-80 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-700">
                      <h3 className="text-sm font-semibold text-white">Filter Proposals</h3>
                      <button
                        onClick={() => setShowFilterPanel(false)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Filter Content */}
                    <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
                      {/* Status Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Status</label>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="all">All Status</option>
                          <option value="designing">Designing</option>
                          <option value="ready_to_submit">Ready to Submit</option>
                          <option value="sent">Sent</option>
                          <option value="portal">Portal</option>
                          <option value="approved">Approved</option>
                          <option value="declined">Declined</option>
                          <option value="cancelled">Cancelled</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>

                      {/* Expiration Filter */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Expiration</label>
                        <select
                          value={showExpired}
                          onChange={(e) => setShowExpired(e.target.value as 'all' | 'active' | 'expired')}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="all">All</option>
                          <option value="active">Active Only</option>
                          <option value="expired">Expired Only</option>
                        </select>
                      </div>

                      {/* Sort */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Sort By</label>
                        <select
                          value={`${sortField}-${sortDirection}`}
                          onChange={(e) => {
                            const [field, direction] = e.target.value.split('-');
                            setSortField(field as SortField);
                            setSortDirection(direction as SortDirection);
                          }}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                          <option value="created_at-desc">Newest First</option>
                          <option value="created_at-asc">Oldest First</option>
                          <option value="total-desc">Highest Value</option>
                          <option value="total-asc">Lowest Value</option>
                          <option value="status-asc">Status A-Z</option>
                          <option value="status-desc">Status Z-A</option>
                          <option value="proposal_number-asc">Number A-Z</option>
                          <option value="proposal_number-desc">Number Z-A</option>
                        </select>
                      </div>

                      {/* Visibility Options */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-2">Visibility</label>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideDeclined}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideDeclined(newValue);
                                savePreference('proposals_hide_declined', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Declined Proposals</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideArchived}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideArchived(newValue);
                                savePreference('proposals_hide_archived', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Archived Proposals</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input
                              type="checkbox"
                              checked={hideApproved}
                              onChange={(e) => {
                                const newValue = e.target.checked;
                                setHideApproved(newValue);
                                savePreference('proposals_hide_approved', newValue);
                              }}
                              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
                            />
                            <span className="text-sm text-gray-300 group-hover:text-white">Hide Approved Proposals</span>
                          </label>
                        </div>
                      </div>

                      {/* Sales Rep Filter — admin / manager / sales_manager only */}
                      {isAdminOrManager && salesReps.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-400 mb-2">Sales Rep</label>
                          <select
                            value={selectedRepId ?? ''}
                            onChange={(e) => setSelectedRepId(e.target.value || null)}
                            className="w-full px-3 py-2 bg-gray-900 border border-gray-700 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-3"
                          >
                            <option value="">All Reps</option>
                            {salesReps.map(rep => (
                              <option key={rep.id} value={rep.id}>
                                {rep.full_name || rep.first_name || 'Unknown'}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-gray-700 flex items-center justify-between">
                      <button
                        onClick={() => {
                          setFilterStatus('all');
                          setShowExpired('all');
                          setSortField('created_at');
                          setSortDirection('desc');
                          setHideDeclined(false);
                          setHideArchived(false);
                          setHideApproved(true);
                          savePreference('proposals_hide_declined', false);
                          savePreference('proposals_hide_archived', false);
                          savePreference('proposals_hide_approved', true);
                        }}
                        className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
                      >
                        Clear All
                      </button>
                      <button
                        onClick={() => setShowFilterPanel(false)}
                        className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.open('/proposals-fullscreen', '_blank', 'width=1400,height=900')}
                className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                title="Pop out proposals"
              >
                <Maximize2 size={16} />
              </button>
              <button
                onClick={() => onNavigateToSalesOrders?.()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors text-sm whitespace-nowrap"
                title="Sales Orders"
              >
                <ShoppingCart size={18} />
                <span>Sales Orders</span>
              </button>
              <button
                onClick={() => onNavigateToSalesStats?.()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors text-sm whitespace-nowrap"
                title="My Sales Stats"
              >
                <BarChart2 size={18} />
                <span>My Stats</span>
              </button>
              <button
                onClick={() => onOpenVideoLibrary?.()}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium flex items-center gap-2 transition-colors text-sm whitespace-nowrap"
                title="Video Library"
              >
                <Film size={18} />
                <span>Videos</span>
              </button>
              <button
                onClick={onCreateNew}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors text-sm whitespace-nowrap"
              >
                <Plus size={18} />
                <span>New Proposal</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Compact Results Count */}
      {!loading && (
        <div className="flex-shrink-0 px-3 sm:px-6 py-1.5 bg-gray-850 border-b border-gray-700 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            Showing {totalCount > 0 ? startIndex + 1 : 0}-{endIndex} of {totalCount} {totalCount === 1 ? 'proposal' : 'proposals'}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-gray-400">Per page:</span>
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-xs bg-gray-700 border border-gray-600 text-white rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
      )}

      {/* Pending Deposits Alert Section */}
      {pendingDeposits.length > 0 && (
        <div className="flex-shrink-0 px-3 sm:px-6 py-2 bg-yellow-900/20 border-b border-yellow-800/30">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <span className="text-xs font-semibold text-yellow-400">
                {pendingDeposits.length} Awaiting Deposit
              </span>
            </div>
            <button
              onClick={() => setShowPendingDeposits(!showPendingDeposits)}
              className="text-xs text-yellow-400 hover:text-yellow-300 font-medium whitespace-nowrap py-1 px-2 -mr-1"
            >
              {showPendingDeposits ? 'Hide' : 'Show'}
            </button>
          </div>

          {showPendingDeposits && (
            <div className="mt-1.5 space-y-0">
              {pendingDeposits.map(proposal => (
                <div key={proposal.id} className="flex items-center gap-2 py-2 border-t border-yellow-800/20">
                  <button
                    onClick={() => {
                      const salesOrderId = pendingDepositSalesOrders[proposal.id];
                      if (salesOrderId && onSelectSalesOrder) {
                        onSelectSalesOrder(salesOrderId);
                      } else {
                        onSelectProposal(proposal.id);
                      }
                    }}
                    className="text-xs font-medium text-yellow-300 hover:text-yellow-200 active:text-yellow-100 flex items-center gap-1 min-w-0 flex-1 py-1"
                    title={pendingDepositSalesOrders[proposal.id] ? 'Open Sales Order' : 'Open Proposal'}
                  >
                    <span className="flex flex-col items-start min-w-0">
                      <span className="text-sm font-semibold text-yellow-200 truncate max-w-full leading-tight">
                        {proposal.contacts?.full_name || 'Unknown'}
                      </span>
                      <span className="text-xs text-yellow-400/70 font-normal truncate max-w-full leading-tight flex items-center gap-1">
                        {proposal.proposal_number}{proposal.title ? ` — ${proposal.title}` : ''}
                        {pendingDepositSalesOrders[proposal.id] && (
                          <ExternalLink size={9} className="opacity-60 flex-shrink-0" />
                        )}
                      </span>
                    </span>
                  </button>
                  <span className="text-xs text-yellow-400 font-semibold flex-shrink-0 flex items-center gap-0.5 whitespace-nowrap">
                    <DollarSign size={10} />
                    {proposal.deposit_amount_due?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                  {proposal.approval_completed_at && (
                    <span className="text-xs text-gray-500 flex-shrink-0 hidden sm:inline">
                      {new Date(proposal.approval_completed_at).toLocaleDateString()}
                    </span>
                  )}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleRecordDepositPayment(proposal)}
                      disabled={loadingDepositInvoice === proposal.id}
                      className="flex items-center justify-center w-8 h-8 bg-green-700 hover:bg-green-600 active:bg-green-800 disabled:opacity-50 text-white rounded-lg transition-colors flex-shrink-0"
                      title={loadingDepositInvoice === proposal.id ? 'Loading...' : 'Record deposit payment'}
                    >
                      <DollarSign size={14} />
                    </button>
                    <DepositReminderButton
                      proposalId={proposal.id}
                      proposalNumber={proposal.proposal_number}
                      depositAmount={proposal.deposit_amount_due || 0}
                      reminderCount={proposal.deposit_reminder_count || 0}
                      lastReminderSent={proposal.last_deposit_reminder_sent_at}
                      customerName={proposal.contacts?.full_name}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Proposals List */}
      <div className="flex-1 px-3 sm:px-6 py-2">
        {loading ? (
          <LoadingSkeleton />
        ) : totalCount === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 mb-4">
              {searchQuery
                ? `No proposals matching "${searchQuery}"`
                : filterStatus === 'all'
                  ? 'No proposals yet'
                  : `No ${filterStatus} proposals`
              }
            </p>
            {!searchQuery && filterStatus === 'all' && (
              <button
                onClick={onCreateNew}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium inline-flex items-center gap-2"
              >
                <Plus size={20} />
                Create Your First Proposal
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-1">
            {proposals.map(proposal => (
            <div
              key={proposal.id}
              className={`relative p-3 sm:p-3.5 bg-gray-800 border rounded-lg hover:bg-gray-750 transition-colors overflow-visible ${
                isExpired(proposal)
                  ? 'border-red-900/50 bg-red-950/5'
                  : isStale(proposal)
                  ? 'border-amber-900/40 bg-amber-950/5'
                  : 'border-gray-700'
              } ${openMenuId === proposal.id ? 'z-[100]' : 'z-0'}`}
            >
              {/* Mobile: Stacked Layout */}
              <div className="sm:hidden">
                <button
                  onClick={() => onSelectProposal(proposal.id)}
                  className="w-full text-left"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">{getStatusIcon(proposal.status)}</div>
                    <div className="flex-1 min-w-0">
                      {/* Customer name row */}
                      <div className="flex items-center gap-1.5 mb-0 min-w-0">
                        <p className="text-sm font-bold text-white leading-snug truncate min-w-0 flex-1">
                          {proposal.contacts?.full_name || proposal.contacts?.contact_name || 'No Customer'}
                        </p>
                        {(proposal.revision_count && proposal.revision_count > 1) && (
                          <span className="flex-shrink-0 px-1.5 h-4 bg-blue-900 text-blue-200 text-[10px] font-medium rounded flex items-center">
                            R:{proposal.revision_count}
                          </span>
                        )}
                        {getUnreadCustomerMessageCount(proposal) > 0 && (
                          <span className="flex-shrink-0 px-1.5 h-4 bg-red-600 text-white text-[10px] font-bold rounded flex items-center gap-0.5 animate-pulse">
                            <MessageSquare size={9} />
                            {getUnreadCustomerMessageCount(proposal)}
                          </span>
                        )}
                        {hasRecentActivity(proposal) && getUnreadCustomerMessageCount(proposal) === 0 && (
                          <span className="flex-shrink-0 px-1.5 h-4 bg-amber-600 text-white text-[10px] font-medium rounded flex items-center gap-0.5">
                            <Bell size={9} />
                            New
                          </span>
                        )}
                      </div>
                      {/* Title row */}
                      <div className="min-w-0 mb-0.5">
                        <p className="text-xs text-gray-300 truncate leading-snug">{getDisplayTitle(proposal)}</p>
                      </div>
                      {/* Bill-To badge */}
                      {proposal.bill_to_contact_id && proposal.bill_to_contact && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] text-amber-400 font-medium truncate max-w-[200px] flex items-center gap-1">
                            <Receipt size={9} className="flex-shrink-0" />
                            Billed to: {(proposal.bill_to_contact as any).company_name || (proposal.bill_to_contact as any).full_name}
                          </span>
                        </div>
                      )}
                      {/* Meta row */}
                      <div className="text-xs text-gray-500 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                        <span className="font-mono">{proposal.proposal_number}</span>
                        {proposal.profiles?.full_name && (
                          <span className="truncate max-w-[120px]">{proposal.profiles.full_name}</span>
                        )}
                        <span>{formatDate(proposal.created_at)}</span>
                        {proposal.sent_at && (
                          <span className="flex items-center gap-0.5">
                            <Send size={9} className="flex-shrink-0" />
                            {formatDate(proposal.sent_at)}
                          </span>
                        )}
                        {proposal.expires_at && (proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'declined' || proposal.status === 'expired') && (
                          <span className={`flex items-center gap-0.5 ${isExpired(proposal) ? 'text-red-400' : ''}`}>
                            <Clock size={9} className="flex-shrink-0" />
                            {formatDate(proposal.expires_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-700/60 min-w-0">
                  <div className="flex items-center gap-1 flex-wrap min-w-0 flex-1">
                    {/* Portal visibility pill */}
                    {(proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'declined' || proposal.status === 'expired') && (
                      proposal.is_portal_visible ? (
                        <span className="h-5 px-1.5 bg-green-900/50 text-green-300 text-[10px] font-medium rounded flex items-center gap-0.5 whitespace-nowrap" title="Visible on portal">
                          <Globe size={9} />
                        </span>
                      ) : (
                        <span className="h-5 px-1.5 bg-gray-700 text-gray-400 text-[10px] font-medium rounded flex items-center gap-0.5 whitespace-nowrap" title="Hidden from portal">
                          <EyeOff size={9} />
                        </span>
                      )
                    )}
                    {/* Status badge */}
                    <span className={`h-5 px-2 rounded text-[10px] font-medium whitespace-nowrap flex items-center ${getStatusColor(proposal.status)}`}>
                      {formatStatusText(proposal.status)}
                    </span>
                    {/* Aging badge — always adjacent to status badge */}
                    {(() => {
                      const aging = getAgingBadge(proposal);
                      return aging ? (
                        <span className={`h-5 px-1.5 text-[10px] font-medium rounded flex items-center gap-0.5 whitespace-nowrap ${aging.className}`} title={aging.title}>
                          <Clock size={9} />
                          {aging.label}
                        </span>
                      ) : null;
                    })()}
                    {/* View count badge */}
                    {getViewCount(proposal) > 0 && (
                      <span className="h-5 px-1.5 rounded text-[10px] font-medium whitespace-nowrap bg-blue-900/50 text-blue-300 flex items-center gap-1">
                        <Eye size={9} />
                        {getViewCount(proposal)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <div className="text-sm font-bold text-white whitespace-nowrap">
                      ${proposal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenAbove(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 320);
                          setOpenMenuId(openMenuId === proposal.id ? null : proposal.id);
                        }}
                        className="menu-button p-2.5 min-w-[44px] min-h-[44px] text-gray-400 hover:text-white hover:bg-gray-700 active:bg-gray-600 rounded-lg transition-colors flex items-center justify-center"
                        data-menu-id={proposal.id}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {openMenuId === proposal.id && (
                        <div className={`menu-dropdown absolute right-0 w-52 max-w-[calc(100vw-1rem)] bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-[200] max-h-[80vh] overflow-y-auto ${menuOpenAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                          {proposal.status === 'expired' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposal(proposal);
                                setShowReactivateModal(true);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-orange-400 hover:bg-gray-600 hover:text-orange-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <RotateCcw className="w-4 h-4 flex-shrink-0" />
                              Reactivate Proposal
                            </button>
                          )}
                          {isStale(proposal) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRefreshProposal(proposal.id);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-amber-400 hover:bg-gray-600 hover:text-amber-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <RefreshCw className="w-4 h-4 flex-shrink-0" />
                              Mark as Active
                            </button>
                          )}
                          {(proposal.status === 'sent' || proposal.status === 'portal') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposal(proposal);
                                setShowManualApprovalModal(true);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-green-400 hover:bg-gray-600 hover:text-green-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <ThumbsUp className="w-4 h-4 flex-shrink-0" />
                              Manual Approve
                            </button>
                          )}
                          {(proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'approved_pending_action') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRecallProposal(proposal.id, proposal.status);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-amber-400 hover:bg-gray-600 hover:text-amber-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <RotateCcw className="w-4 h-4 flex-shrink-0" />
                              Recall from Portal
                            </button>
                          )}
                          {(proposal.status !== 'declined' && proposal.status !== 'cancelled' && proposal.status !== 'archived' && proposal.status !== 'approved') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposal(proposal);
                                setDeclineModalMode('decline');
                                setShowDeclineModal(true);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-gray-600 hover:text-red-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <XCircle className="w-4 h-4 flex-shrink-0" />
                              Mark as Declined
                            </button>
                          )}
                          {(proposal.status !== 'cancelled' && proposal.status !== 'archived') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProposal(proposal);
                                setDeclineModalMode('cancel');
                                setShowDeclineModal(true);
                                setOpenMenuId(null);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-gray-400 hover:bg-gray-600 hover:text-gray-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <Ban className="w-4 h-4 flex-shrink-0" />
                              Cancel Proposal
                            </button>
                          )}
                          {(proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'approved_pending_action' || proposal.status === 'declined' || proposal.status === 'cancelled' || proposal.status === 'expired') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewActivity(proposal);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <Activity className="w-4 h-4 flex-shrink-0" />
                              Proposal Activity
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePopOutProposal(proposal.id);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2.5 border-b border-gray-600"
                          >
                            <Maximize2 className="w-4 h-4 flex-shrink-0" />
                            Pop Out
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setShowDuplicateModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2.5 border-b border-gray-600"
                          >
                            <Copy className="w-4 h-4 flex-shrink-0" />
                            Duplicate
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setShowVersionHistory(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2.5 border-b border-gray-600"
                          >
                            <History className="w-4 h-4 flex-shrink-0" />
                            Version History
                          </button>
                          {proposal.status === 'archived' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleUnarchiveProposal(proposal);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <ArchiveRestore className="w-4 h-4 flex-shrink-0" />
                              Unarchive
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveProposal(proposal);
                              }}
                              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2.5 border-b border-gray-600"
                            >
                              <Archive className="w-4 h-4 flex-shrink-0" />
                              Archive
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProposal(proposal.id);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-gray-600 hover:text-red-300 transition-colors flex items-center gap-2.5 rounded-b-lg"
                          >
                            <Trash2 className="w-4 h-4 flex-shrink-0" />
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Desktop: Horizontal Layout */}
              <div className="hidden sm:flex items-center justify-between gap-4">
                {/* Left: Status Icon + Info */}
                <button
                  onClick={() => onSelectProposal(proposal.id)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  {getStatusIcon(proposal.status)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 min-w-0">
                      <span className="text-sm font-bold text-white flex-shrink-0 max-w-[35%] truncate">
                        {proposal.contacts?.full_name || proposal.contacts?.contact_name || 'No Customer'}
                      </span>
                      <span className="text-gray-500 flex-shrink-0 text-xs">—</span>
                      <h3 className="text-sm text-gray-300 truncate flex-1 min-w-0">{getDisplayTitle(proposal)}</h3>
                      {(proposal.revision_count && proposal.revision_count > 1) && (
                        <span className="px-1.5 py-0.5 bg-blue-900 text-blue-200 text-[10px] font-medium rounded whitespace-nowrap flex-shrink-0">
                          R:{proposal.revision_count}
                        </span>
                      )}
                      {getUnreadCustomerMessageCount(proposal) > 0 && (
                        <span className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded flex items-center gap-1 whitespace-nowrap animate-pulse flex-shrink-0">
                          <MessageSquare size={12} />
                          {getUnreadCustomerMessageCount(proposal)} New
                        </span>
                      )}
                      {hasRecentActivity(proposal) && getUnreadCustomerMessageCount(proposal) === 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewActivity(proposal);
                          }}
                          className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded flex items-center gap-1 whitespace-nowrap transition-colors cursor-pointer flex-shrink-0"
                        >
                          <Bell size={12} />
                          New Activity
                        </button>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2 overflow-hidden">
                      <span className="whitespace-nowrap font-mono text-gray-500 text-[11px]">{proposal.proposal_number}</span>
                      {proposal.bill_to_contact_id && proposal.bill_to_contact && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className="whitespace-nowrap flex-shrink-0 flex items-center gap-1 text-amber-400">
                            <Receipt size={10} />
                            Billed to: {(proposal.bill_to_contact as any).company_name || (proposal.bill_to_contact as any).full_name}
                          </span>
                        </>
                      )}
                      {proposal.profiles?.full_name && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className="truncate max-w-[150px]">Rep: {proposal.profiles.full_name}</span>
                        </>
                      )}
                      <span className="flex-shrink-0">•</span>
                      <span className="whitespace-nowrap flex-shrink-0">Created: {formatDateTime(proposal.created_at)}</span>
                      {proposal.sent_at && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className="whitespace-nowrap flex-shrink-0 flex items-center gap-1">
                            <Send size={10} />
                            {formatDate(proposal.sent_at)}
                          </span>
                        </>
                      )}
                      {proposal.expires_at && (proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'declined' || proposal.status === 'expired') && (
                        <>
                          <span className="flex-shrink-0">•</span>
                          <span className={`whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${isExpired(proposal) ? 'text-red-400' : ''}`}>
                            <Clock size={10} />
                            Expires: {formatDate(proposal.expires_at)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>

                {/* Right: Status Badge + Price + Menu — fixed widths so every row aligns */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Status + aging badges — fixed width so price never shifts */}
                  <div className="w-40 flex justify-end items-center gap-1.5">
                    {getViewCount(proposal) > 0 && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-blue-900/50 text-blue-300 flex items-center gap-0.5 flex-shrink-0">
                        <Eye size={9} />
                        {getViewCount(proposal)}
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${getStatusColor(proposal.status)}`}>
                      {formatStatusText(proposal.status)}
                    </span>
                    {/* Aging badge — always immediately after status badge */}
                    {(() => {
                      const aging = getAgingBadge(proposal);
                      return aging ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap flex items-center gap-0.5 flex-shrink-0 ${aging.className}`} title={aging.title}>
                          <Clock size={9} />
                          {aging.label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {/* Price — fixed width */}
                  <div className="w-24 text-right">
                    <div className="text-base font-bold text-white whitespace-nowrap">
                      ${proposal.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenAbove(window.innerHeight - e.currentTarget.getBoundingClientRect().bottom < 320);
                        setOpenMenuId(openMenuId === proposal.id ? null : proposal.id);
                      }}
                      className="menu-button p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors"
                      data-menu-id={proposal.id}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                    {openMenuId === proposal.id && (
                      <div className={`menu-dropdown absolute right-0 w-52 max-w-[calc(100vw-1rem)] bg-gray-700 border border-gray-600 rounded-lg shadow-xl z-[200] max-h-[80vh] overflow-y-auto ${menuOpenAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
                        {proposal.status === 'expired' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setShowReactivateModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-orange-400 hover:bg-gray-600 hover:text-orange-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reactivate Proposal
                          </button>
                        )}
                        {isStale(proposal) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRefreshProposal(proposal.id);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-gray-600 hover:text-amber-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Mark as Active
                          </button>
                        )}
                        {(proposal.status === 'sent' || proposal.status === 'portal') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setShowManualApprovalModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-green-400 hover:bg-gray-600 hover:text-green-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                            Manual Approve
                          </button>
                        )}
                        {(proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'approved_pending_action') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRecallProposal(proposal.id, proposal.status);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-amber-400 hover:bg-gray-600 hover:text-amber-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Recall from Portal
                          </button>
                        )}
                        {(proposal.status !== 'declined' && proposal.status !== 'cancelled' && proposal.status !== 'archived' && proposal.status !== 'approved') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setDeclineModalMode('decline');
                              setShowDeclineModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-gray-600 hover:text-red-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Mark as Declined
                          </button>
                        )}
                        {(proposal.status !== 'cancelled' && proposal.status !== 'archived') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProposal(proposal);
                              setDeclineModalMode('cancel');
                              setShowDeclineModal(true);
                              setOpenMenuId(null);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-400 hover:bg-gray-600 hover:text-gray-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            Cancel Proposal
                          </button>
                        )}
                        {(proposal.status === 'sent' || proposal.status === 'portal' || proposal.status === 'approved' || proposal.status === 'approved_pending_action' || proposal.status === 'declined' || proposal.status === 'cancelled' || proposal.status === 'expired') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewActivity(proposal);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-blue-400 hover:bg-gray-600 hover:text-blue-300 transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <Activity className="w-3.5 h-3.5" />
                            Proposal Activity
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePopOutProposal(proposal.id);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2 border-b border-gray-600"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          Pop Out
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProposal(proposal);
                            setShowDuplicateModal(true);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2 border-b border-gray-600"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Duplicate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProposal(proposal);
                            setShowVersionHistory(true);
                            setOpenMenuId(null);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2 border-b border-gray-600"
                        >
                          <History className="w-3.5 h-3.5" />
                          Version History
                        </button>
                        {proposal.status === 'archived' ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnarchiveProposal(proposal);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <ArchiveRestore className="w-3.5 h-3.5" />
                            Unarchive
                          </button>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleArchiveProposal(proposal);
                            }}
                            className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-600 hover:text-white transition-colors flex items-center gap-2 border-b border-gray-600"
                          >
                            <Archive className="w-3.5 h-3.5" />
                            Archive
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteProposal(proposal);
                          }}
                          className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-900/20 hover:text-red-300 transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Pagination Controls */}
      {!loading && totalCount > 0 && totalPages > 1 && (
        <div className="flex-shrink-0 px-2 sm:px-6 py-3 border-t border-gray-700 bg-gray-800">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="hidden sm:block px-2 sm:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded text-xs sm:text-sm font-medium transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>

            <div className="flex items-center gap-0.5 sm:gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-2 sm:px-3 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
            >
              <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="hidden sm:block px-2 sm:px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white rounded text-xs sm:text-sm font-medium transition-colors"
            >
              Last
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-xs text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
          </div>
        </div>
      )}

      {showDuplicateModal && selectedProposal && (
        <DuplicateProposalModal
          proposalId={selectedProposal.id}
          currentContactId={selectedProposal.contact_id}
          currentContactName={selectedProposal.contacts?.contact_name || 'Unknown'}
          onClose={() => {
            setShowDuplicateModal(false);
            setSelectedProposal(null);
          }}
          onSuccess={(newProposalId) => {
            setShowDuplicateModal(false);
            setSelectedProposal(null);
            loadProposals();
            onSelectProposal(newProposalId);
          }}
          onOpenRevisionManager={() => {
            setShowRevisionModal(true);
          }}
        />
      )}

      {showRevisionModal && selectedProposal && (
        <CreateRevisionModal
          proposalId={selectedProposal.id}
          currentTitle={selectedProposal.title}
          onClose={() => {
            setShowRevisionModal(false);
            setSelectedProposal(null);
          }}
          onSuccess={() => {
            setShowRevisionModal(false);
            setSelectedProposal(null);
            loadProposals();
          }}
        />
      )}

      {showVersionHistory && selectedProposal && (
        <ProposalVersionHistory
          proposalId={selectedProposal.id}
          onClose={() => {
            setShowVersionHistory(false);
            setSelectedProposal(null);
          }}
          onRestore={() => {
            loadProposals();
          }}
        />
      )}

      {showManualApprovalModal && selectedProposal && (
        <ManualApprovalModal
          proposalId={selectedProposal.id}
          proposalNumber={selectedProposal.proposal_number}
          contactEmail={selectedProposal.contacts?.email || ''}
          depositAmount={selectedProposal.deposit_amount_due || 0}
          onClose={() => {
            setShowManualApprovalModal(false);
            setSelectedProposal(null);
          }}
          onSuccess={async (salesOrderId) => {
            setShowManualApprovalModal(false);
            const pid = selectedProposal?.id;
            setSelectedProposal(null);
            // If salesOrderId came back directly, navigate; otherwise look it up
            let soId = salesOrderId;
            if (!soId && pid) {
              try {
                const { data } = await supabase
                  .rpc('get_proposal_sales_order_id', { p_proposal_id: pid })
                  .maybeSingle();
                if (data) soId = data as string;
              } catch { }
            }
            if (soId && onSelectSalesOrder) {
              onSelectSalesOrder(soId);
            } else {
              loadProposals();
            }
          }}
        />
      )}

      {depositPaymentInvoice && (
        <RecordPaymentModal
          invoice={depositPaymentInvoice}
          onClose={() => setDepositPaymentInvoice(null)}
          onSuccess={() => {
            setDepositPaymentInvoice(null);
            loadPendingDeposits();
            loadProposals();
          }}
        />
      )}

      {showDeclineModal && selectedProposal && (
        <DeclineProposalModal
          proposalId={selectedProposal.id}
          proposalNumber={selectedProposal.proposal_number}
          customerName={selectedProposal.contacts?.full_name || selectedProposal.contacts?.contact_name || 'Unknown Customer'}
          mode={declineModalMode}
          onClose={() => {
            setShowDeclineModal(false);
            setSelectedProposal(null);
          }}
          onSuccess={() => {
            setShowDeclineModal(false);
            setSelectedProposal(null);
            loadProposals();
          }}
        />
      )}

      {showReactivateModal && selectedProposal && (
        <ReactivateProposalModalEnhanced
          proposalId={selectedProposal.id}
          proposalNumber={selectedProposal.proposal_number}
          lastModified={selectedProposal.updated_at || selectedProposal.created_at}
          totalAmount={selectedProposal.total}
          onClose={() => {
            setShowReactivateModal(false);
            setSelectedProposal(null);
          }}
          onSuccess={() => {
            setShowReactivateModal(false);
            setSelectedProposal(null);
            loadProposals();
          }}
          onReview={() => {
            setShowReactivateModal(false);
            onSelectProposal(selectedProposal.id);
          }}
        />
      )}

      {showActivityModal && selectedProposal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-full sm:max-w-2xl border border-gray-700">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className="text-blue-400" size={24} />
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      Customer Activity
                    </h2>
                    <p className="text-sm text-gray-400">
                      Proposal {selectedProposal.proposal_number}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowActivityModal(false);
                    setSelectedProposal(null);
                    setActivityData(null);
                    setActivityTab('summary');
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
              <div className="flex gap-1 mt-4">
                <button
                  onClick={() => setActivityTab('summary')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activityTab === 'summary' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setActivityTab('timeline')}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${activityTab === 'timeline' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >
                  Full Timeline
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {activityTab === 'timeline' ? (
                <ProposalActivityPanel proposalId={selectedProposal.id} />
              ) : activityData ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Total Views</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.total_views || 0}
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Unique Viewers</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.unique_viewers || 0}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {activityData.unique_viewers === 1 ? 'IP address' : 'IP addresses'}
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Total Time</div>
                      <div className="text-2xl font-bold text-white">
                        {activityData.total_time_seconds
                          ? `${Math.floor(activityData.total_time_seconds / 60)}m ${activityData.total_time_seconds % 60}s`
                          : '0m 0s'
                        }
                      </div>
                    </div>
                    <div className="bg-gray-700 p-4 rounded-lg">
                      <div className="text-gray-400 text-sm mb-1">Last Viewed</div>
                      <div className="text-sm font-bold text-white">
                        {activityData.last_viewed_at
                          ? new Date(activityData.last_viewed_at).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })
                          : 'Never'
                        }
                      </div>
                    </div>
                  </div>

                  {/* Device & Browser Breakdown */}
                  {(activityData.device_breakdown || activityData.browser_breakdown || activityData.os_breakdown) && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {activityData.device_breakdown && Object.keys(activityData.device_breakdown).length > 0 && (
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <div className="text-gray-400 text-xs mb-2 uppercase tracking-wide">Devices</div>
                          <div className="space-y-1">
                            {Object.entries(activityData.device_breakdown).map(([device, count]: [string, any]) => (
                              <div key={device} className="flex items-center justify-between text-sm">
                                <span className="text-white capitalize">{device}</span>
                                <span className="text-gray-400">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activityData.browser_breakdown && Object.keys(activityData.browser_breakdown).length > 0 && (
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <div className="text-gray-400 text-xs mb-2 uppercase tracking-wide">Browsers</div>
                          <div className="space-y-1">
                            {Object.entries(activityData.browser_breakdown).map(([browser, count]: [string, any]) => (
                              <div key={browser} className="flex items-center justify-between text-sm">
                                <span className="text-white">{browser}</span>
                                <span className="text-gray-400">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activityData.os_breakdown && Object.keys(activityData.os_breakdown).length > 0 && (
                        <div className="bg-gray-700 p-4 rounded-lg">
                          <div className="text-gray-400 text-xs mb-2 uppercase tracking-wide">Operating Systems</div>
                          <div className="space-y-1">
                            {Object.entries(activityData.os_breakdown).map(([os, count]: [string, any]) => (
                              <div key={os} className="flex items-center justify-between text-sm">
                                <span className="text-white">{os}</span>
                                <span className="text-gray-400">{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Unique IP Addresses */}
                  {activityData.unique_ips && activityData.unique_ips.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                        Viewer Locations
                      </h3>
                      <div className="space-y-2">
                        {activityData.unique_ips.map((ipInfo: any, index: number) => (
                          <div
                            key={index}
                            className="bg-gray-700 p-3 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="font-mono text-sm text-blue-400">{ipInfo.ip}</div>
                              <div className="text-xs text-gray-400">
                                {ipInfo.views} {ipInfo.views === 1 ? 'view' : 'views'}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                              {ipInfo.deviceType && (
                                <span className="capitalize">{ipInfo.deviceType}</span>
                              )}
                              {ipInfo.browser && <span>{ipInfo.browser}</span>}
                              {ipInfo.os && <span>{ipInfo.os}</span>}
                              {ipInfo.lastSeen && (
                                <span className="ml-auto">
                                  Last: {new Date(ipInfo.lastSeen).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Timeline */}
                  {activityData.activity_timeline && activityData.activity_timeline.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-300 mb-3 uppercase tracking-wide">
                        Activity Timeline
                      </h3>
                      <div className="space-y-2">
                        {activityData.activity_timeline.map((activity: any, index: number) => (
                          <div
                            key={index}
                            className="bg-gray-700 p-3 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-3">
                                {activity.type === 'viewed' && <Eye className="text-blue-400" size={16} />}
                                {activity.type === 'downloaded' && <FileText className="text-green-400" size={16} />}
                                {activity.type === 'accepted' && <CheckCircle className="text-green-400" size={16} />}
                                {activity.type === 'declined' && <XCircle className="text-red-400" size={16} />}
                                <div>
                                  <div className="text-sm text-white capitalize">{activity.type}</div>
                                  {activity.duration > 0 && (
                                    <div className="text-xs text-gray-400">
                                      {Math.floor(activity.duration / 60)}m {activity.duration % 60}s
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-gray-400">
                                {new Date(activity.created_at).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                })}
                              </div>
                            </div>
                            {(activity.ip_address || activity.deviceType || activity.browser) && (
                              <div className="flex items-center gap-3 text-xs text-gray-400 mt-2 pl-7">
                                {activity.ip_address && (
                                  <span className="font-mono text-blue-400">{activity.ip_address}</span>
                                )}
                                {activity.deviceType && (
                                  <span className="capitalize">{activity.deviceType}</span>
                                )}
                                {activity.browser && <span>{activity.browser}</span>}
                                {activity.os && <span>{activity.os}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12 text-gray-400">
                  <Activity className="mx-auto mb-3 text-gray-600" size={48} />
                  <p>No activity recorded yet</p>
                  <p className="text-sm mt-2">Customer hasn't viewed this proposal</p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-700">
              <button
                onClick={() => {
                  setShowActivityModal(false);
                  setSelectedProposal(null);
                  setActivityData(null);
                  setActivityTab('summary');
                }}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
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
