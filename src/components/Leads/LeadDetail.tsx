import { useEffect, useState } from 'react';
import { X, Mail, Phone, Building2, MessageSquare, Send, User, Tag, AtSign, Calendar, UserCircle, Edit2, Save, Trash2, AlertCircle, Clock, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Lead, LeadMessage, LeadTag, Profile } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow } from '../../lib/utils';
import { TaskList } from '../Tasks/TaskList';
import { ConvertLeadToProspectModal } from './ConvertLeadToProspectModal';
import CreateProposalModal from '../Proposals/CreateProposalModal';

interface LeadDetailProps {
  leadId: string;
  onClose: () => void;
}

export function LeadDetail({ leadId, onClose }: LeadDetailProps) {
  const { profile } = useAuth();
  const [lead, setLead] = useState<Lead | null>(null);
  const [messages, setMessages] = useState<LeadMessage[]>([]);
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [assignedProfile, setAssignedProfile] = useState<Profile | null>(null);
  const [creatorProfile, setCreatorProfile] = useState<Profile | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteWithContact, setDeleteWithContact] = useState(false);
  const [showClaimConfirm, setShowClaimConfirm] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showConvertModal, setShowConvertModal] = useState(false);
  const [showCreateProposalModal, setShowCreateProposalModal] = useState(false);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [reminderDate, setReminderDate] = useState('');
  const [savingReminder, setSavingReminder] = useState(false);
  const [editForm, setEditForm] = useState({
    contact_name: '',
    company_name: '',
    email: '',
    phone: '',
    opportunity_description: '',
    assigned_to: '',
  });

  useEffect(() => {
    loadLead();
    loadMessages();
    loadTags();
    loadSalesReps();

    const messagesChannel = supabase
      .channel(`lead_messages:${leadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'lead_messages', filter: `lead_id=eq.${leadId}` },
        () => {
          loadMessages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
    };
  }, [leadId]);

  async function loadSalesReps() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['sales', 'admin', 'manager'])
        .eq('is_active', true)
        .order('full_name');

      if (data) setSalesReps(data);
    } catch (error) {
      console.error('Error loading sales reps:', error);
    }
  }

  async function loadLead() {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) throw error;
      setLead(data);
      setEditForm({
        contact_name: data.contact_name || '',
        company_name: data.company_name || '',
        email: data.email || '',
        phone: data.phone || '',
        opportunity_description: data.opportunity_description || '',
        assigned_to: data.assigned_to || '',
      });

      if (data.reminder_date) {
        const date = new Date(data.reminder_date);
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
        setReminderDate(localDate.toISOString().slice(0, 16));
      } else {
        setReminderDate('');
      }

      if (data.assigned_to) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.assigned_to)
          .single();

        if (profileData) setAssignedProfile(profileData);
      }

      if (data.created_by) {
        const { data: creatorData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.created_by)
          .single();

        if (creatorData) setCreatorProfile(creatorData);
      }
    } catch (error) {
      console.error('Error loading lead:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    try {
      const { data, error } = await supabase
        .from('lead_messages')
        .select(`
          *,
          profiles (
            full_name,
            avatar_url
          )
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  }

  async function loadTags() {
    try {
      const { data, error } = await supabase
        .from('lead_tags')
        .select('*')
        .eq('lead_id', leadId);

      if (error) throw error;
      setTags(data || []);
    } catch (error) {
      console.error('Error loading tags:', error);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !profile) return;

    setSending(true);

    try {
      const { data: message, error: messageError } = await supabase
        .from('lead_messages')
        .insert([
          {
            lead_id: leadId,
            user_id: profile.id,
            message: newMessage.trim(),
            mentions: [],
          },
        ])
        .select()
        .single();

      if (messageError) throw messageError;

      await supabase.from('feed_events').insert([
        {
          event_type: 'message_posted',
          lead_id: leadId,
          message_id: message.id,
          user_id: profile.id,
        },
      ]);

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  }

  async function handleUpdateLead() {
    if (!profile || !lead) return;

    try {
      const assignmentChanged = editForm.assigned_to !== (lead.assigned_to || '');
      const wasUnassigned = !lead.assigned_to && editForm.assigned_to;
      const newAssignee = editForm.assigned_to || null;

      const { error } = await supabase
        .from('leads')
        .update({
          contact_name: editForm.contact_name,
          company_name: editForm.company_name,
          email: editForm.email,
          phone: editForm.phone,
          opportunity_description: editForm.opportunity_description,
          assigned_to: newAssignee,
          is_fishbowl: !newAssignee,
          status: newAssignee ? 'claimed' : 'unclaimed',
          claimed_at: wasUnassigned && newAssignee ? new Date().toISOString() : lead.claimed_at,
        })
        .eq('id', leadId);

      if (error) throw error;

      await supabase.from('feed_events').insert({
        event_type: 'lead_updated',
        lead_id: leadId,
        user_id: profile.id,
        metadata: {
          updated_fields: ['contact_name', 'company_name', 'email', 'phone', 'opportunity_description'],
        },
      });

      // Handle notifications based on assignment change
      if (assignmentChanged && !newAssignee) {
        // Lead returned to fishbowl - notify all sales reps
        const { data: allSalesReps } = await supabase
          .from('profiles')
          .select('id, email, email_leads, notify_on_fishbowl')
          .eq('role', 'sales')
          .eq('is_active', true);

        if (allSalesReps && allSalesReps.length > 0) {
          const repsToNotify = allSalesReps.filter(rep => rep.notify_on_fishbowl !== false);

          if (repsToNotify.length > 0) {
            const notifications = repsToNotify.map((rep) => ({
              user_id: rep.id,
              type: 'fishbowl_lead',
              lead_id: leadId,
              title: 'Lead Returned to Fishbowl',
              body: `${editForm.contact_name}${editForm.company_name ? ` from ${editForm.company_name}` : ''} is now available to claim`,
            }));

            await supabase.from('notifications').insert(notifications);
          }

          const emailReps = allSalesReps.filter(rep => rep.email_leads && rep.email && rep.notify_on_fishbowl !== false);
          if (emailReps.length > 0) {
            const emails = emailReps.map(rep => rep.email);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session?.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  to: emails,
                  leadId: leadId,
                  leadName: editForm.contact_name,
                  companyName: editForm.company_name || undefined,
                  isFishbowl: true,
                }),
              });
            } catch (emailError) {
              console.error('Error sending email notifications:', emailError);
            }
          }
        }
      } else if (assignmentChanged && newAssignee) {
        const { data: assignedUser } = await supabase
          .from('profiles')
          .select('notify_on_lead_assigned')
          .eq('id', newAssignee)
          .single();

        if (assignedUser?.notify_on_lead_assigned !== false) {
          await supabase.from('notifications').insert([
            {
              user_id: newAssignee,
              type: 'lead_assigned',
              lead_id: leadId,
              title: 'Lead Assigned to You',
              body: `You've been assigned ${editForm.contact_name}${editForm.company_name ? ` from ${editForm.company_name}` : ''}`,
            },
          ]);
        }

        const { data: assignedRep } = await supabase
          .from('profiles')
          .select('email, email_leads')
          .eq('id', newAssignee)
          .single();

        if (assignedRep?.email && assignedRep.email_leads) {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-lead-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                to: [assignedRep.email],
                leadId: leadId,
                leadName: editForm.contact_name,
                companyName: editForm.company_name || undefined,
                isFishbowl: false,
              }),
            });
          } catch (emailError) {
            console.error('Error sending email notification:', emailError);
          }
        }
      }

      setIsEditing(false);
      loadLead();
    } catch (error) {
      console.error('Error updating lead:', error);
      alert('Failed to update lead');
    }
  }

  async function handleClaimLead() {
    if (!profile || !lead) return;

    try {
      const { error } = await supabase
        .from('leads')
        .update({
          assigned_to: profile.id,
          status: 'claimed',
          is_fishbowl: false,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;

      await supabase.from('feed_events').insert([
        {
          event_type: 'lead_claimed',
          lead_id: leadId,
          user_id: profile.id,
        },
      ]);

      await supabase.from('notifications').insert([
        {
          user_id: profile.id,
          type: 'lead_claimed',
          lead_id: leadId,
          title: 'Lead Claimed',
          body: `You claimed ${lead.contact_name}`,
        },
      ]);

      if (lead.created_by && (lead.priority === 'high' || lead.priority === 'urgent')) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('notify_on_lead_status')
          .eq('id', lead.created_by)
          .single();

        if (creator?.notify_on_lead_status !== false && lead.created_by !== profile.id) {
          await supabase.from('notifications').insert([
            {
              user_id: lead.created_by,
              type: 'lead_status_update',
              lead_id: leadId,
              title: `${lead.priority === 'urgent' ? 'Urgent' : 'High'} Priority Lead Claimed`,
              body: `${profile.full_name} claimed your ${lead.priority} priority lead: ${lead.contact_name}`,
            },
          ]);
        }
      }

      setShowClaimConfirm(false);
      loadLead();
    } catch (error) {
      console.error('Error claiming lead:', error);
      alert('Failed to claim lead');
    }
  }

  async function handleAssignLead() {
    if (!profile || !lead || !selectedAssignee) return;

    try {
      const assignee = salesReps.find(rep => rep.id === selectedAssignee);
      if (!assignee) return;

      const { error } = await supabase
        .from('leads')
        .update({
          assigned_to: selectedAssignee,
          status: 'claimed',
          is_fishbowl: false,
          claimed_at: new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;

      await supabase.from('feed_events').insert([
        {
          event_type: 'lead_assigned',
          lead_id: leadId,
          user_id: profile.id,
          metadata: { assigned_to: selectedAssignee, assigned_to_name: assignee.full_name },
        },
      ]);

      // Notify the assigned rep
      await supabase.from('notifications').insert([
        {
          user_id: selectedAssignee,
          type: 'lead_assigned',
          lead_id: leadId,
          title: 'New Lead Assigned',
          body: `${profile.full_name} assigned you a lead: ${lead.contact_name}`,
        },
      ]);

      // Notify creator if high/urgent priority
      if (lead.created_by && (lead.priority === 'high' || lead.priority === 'urgent') && lead.created_by !== profile.id && lead.created_by !== selectedAssignee) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('notify_on_lead_status')
          .eq('id', lead.created_by)
          .single();

        if (creator?.notify_on_lead_status !== false) {
          await supabase.from('notifications').insert([
            {
              user_id: lead.created_by,
              type: 'lead_status_update',
              lead_id: leadId,
              title: 'Lead Assigned',
              body: `${profile.full_name} assigned your ${lead.priority} priority lead (${lead.contact_name}) to ${assignee.full_name}`,
            },
          ]);
        }
      }

      setShowAssignModal(false);
      setSelectedAssignee('');
      loadLead();
    } catch (error) {
      console.error('Error assigning lead:', error);
      alert('Failed to assign lead');
    }
  }

  function handleConvertSuccess(contactId: string) {
    setShowConvertModal(false);
    onClose();
    window.location.href = '/pipeline';
  }


  async function handleDelete(alsoDeleteContact: boolean) {
    try {
      if (alsoDeleteContact && lead?.email) {
        const { data: matchedContacts } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', lead.email)
          .limit(1);

        if (matchedContacts && matchedContacts.length > 0) {
          await supabase
            .from('contacts')
            .delete()
            .eq('id', matchedContacts[0].id);
        }
      }

      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;

      onClose();
    } catch (error) {
      console.error('Error deleting lead:', error);
      alert('Failed to delete lead');
    }
  }

  async function handleStatusChange(newStatus: string) {
    if (!lead || !profile) return;

    const oldStatus = lead.status;

    try {
      const { error } = await supabase
        .from('leads')
        .update({ status: newStatus })
        .eq('id', leadId);

      if (error) throw error;

      await supabase.from('feed_events').insert([
        {
          event_type: 'lead_status_changed',
          lead_id: leadId,
          user_id: profile.id,
          metadata: { old_status: oldStatus, new_status: newStatus },
        },
      ]);

      if (lead.created_by && (lead.priority === 'high' || lead.priority === 'urgent') && lead.created_by !== profile.id) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('notify_on_lead_status')
          .eq('id', lead.created_by)
          .single();

        if (creator?.notify_on_lead_status !== false) {
          const statusLabels: Record<string, string> = {
            unclaimed: 'Unclaimed',
            claimed: 'Claimed',
            closed_won: 'Closed Won',
            closed_lost: 'Closed Lost',
            escalated: 'Escalated',
          };

          await supabase.from('notifications').insert([
            {
              user_id: lead.created_by,
              type: 'lead_status_update',
              lead_id: leadId,
              title: `${lead.priority === 'urgent' ? 'Urgent' : 'High'} Priority Lead Status Update`,
              body: `${profile.full_name} changed your ${lead.priority} priority lead (${lead.contact_name}) status to ${statusLabels[newStatus] || newStatus}`,
            },
          ]);
        }
      }

      loadLead();
    } catch (error) {
      console.error('Error updating status:', error);
      alert('Failed to update status');
    }
  }

  async function handleReminderDateChange(newDate: string) {
    if (!lead || !profile) return;

    setSavingReminder(true);
    try {
      const { data: calendarProfile } = await supabase
        .from('profiles')
        .select('google_calendar_connected')
        .eq('id', profile.id)
        .single();

      if (!calendarProfile?.google_calendar_connected) {
        alert('Please connect your Google Calendar in My Settings to use reminders.');
        setSavingReminder(false);
        return;
      }

      if (!newDate) {
        if (lead.google_calendar_event_id) {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-event`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${session?.access_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'delete',
                entityType: 'lead',
                entityId: leadId,
                eventId: lead.google_calendar_event_id,
              }),
            }
          );
        } else {
          await supabase
            .from('leads')
            .update({ reminder_date: null })
            .eq('id', leadId);
        }
        setReminderDate('');
        loadLead();
        setSavingReminder(false);
        return;
      }

      const reminderDateUTC = new Date(newDate).toISOString();

      const { data: { session } } = await supabase.auth.getSession();
      const action = lead.google_calendar_event_id ? 'update' : 'create';

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar-event`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            entityType: 'lead',
            entityId: leadId,
            reminderDate: reminderDateUTC,
            title: `Follow up: ${lead.contact_name}${lead.company_name ? ` (${lead.company_name})` : ''}`,
            description: `Lead follow-up reminder\n\nContact: ${lead.contact_name}\n${lead.company_name ? `Company: ${lead.company_name}\n` : ''}${lead.email ? `Email: ${lead.email}\n` : ''}${lead.phone ? `Phone: ${lead.phone}\n` : ''}${lead.opportunity_description ? `\nOpportunity: ${lead.opportunity_description}` : ''}`,
            eventId: lead.google_calendar_event_id,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create calendar event');
      }

      loadLead();
      alert('Reminder saved and calendar event created!');
    } catch (error) {
      console.error('Error saving reminder:', error);
      alert('Failed to save reminder');
    } finally {
      setSavingReminder(false);
    }
  }

  function getPriorityInfo(priority: string): { label: string; color: string; emoji: string; timeframe: string; bgColor: string } {
    switch (priority) {
      case 'urgent':
        return { label: 'Urgent', color: 'text-red-700 border-red-300', emoji: '🔴', timeframe: 'Follow up within hours', bgColor: 'bg-red-50' };
      case 'high':
        return { label: 'High', color: 'text-orange-700 border-orange-300', emoji: '🟠', timeframe: 'Follow up within 1 day', bgColor: 'bg-orange-50' };
      case 'medium':
        return { label: 'Medium', color: 'text-yellow-700 border-yellow-300', emoji: '🟡', timeframe: 'Follow up within 3 days', bgColor: 'bg-yellow-50' };
      case 'low':
        return { label: 'Low', color: 'text-green-700 border-green-300', emoji: '🟢', timeframe: 'Follow up within 1 week', bgColor: 'bg-green-50' };
      default:
        return { label: 'Medium', color: 'text-yellow-700 border-yellow-300', emoji: '🟡', timeframe: 'Follow up within 3 days', bgColor: 'bg-yellow-50' };
    }
  }

  if (loading || !lead) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="text-gray-600">Loading...</div>
        </div>
      </div>
    );
  }

  const canClaim = lead.is_fishbowl && lead.status === 'unclaimed' && profile?.role === 'sales';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-0 z-50 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full h-full sm:h-auto sm:max-h-[90vh] sm:my-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0 flex-1 pr-2">
            <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{lead.contact_name}</h2>
            {lead.company_name && <p className="text-sm sm:text-base text-gray-600 truncate">{lead.company_name}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isEditing && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  title="Edit lead"
                >
                  <Edit2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete lead"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
              {creatorProfile && (
                <div className="flex items-center gap-2 text-blue-900">
                  <UserCircle className="w-4 h-4 text-blue-600" />
                  <span><strong>Created by:</strong> {creatorProfile.full_name}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-blue-900">
                <Calendar className="w-4 h-4 text-blue-600" />
                <span><strong>Created:</strong> {new Date(lead.created_at).toLocaleString()} ({formatDistanceToNow(lead.created_at)})</span>
              </div>
            </div>
          </div>

          {(() => {
            const priorityInfo = getPriorityInfo(lead.priority || 'medium');
            return (
              <div className={`${priorityInfo.bgColor} border ${priorityInfo.color.split(' ')[1]} rounded-lg p-3`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <h3 className="font-medium text-sm">Follow-up Priority</h3>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${priorityInfo.color} font-medium text-sm`}>
                    <span>{priorityInfo.emoji}</span>
                    <span>{priorityInfo.label}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-xs font-medium opacity-75">{priorityInfo.timeframe}</p>
              </div>
            );
          })()}

          {isEditing ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <h3 className="font-semibold text-blue-900 mb-3">Edit Lead Information</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name *
                </label>
                <input
                  type="text"
                  value={editForm.contact_name}
                  onChange={(e) => setEditForm({ ...editForm, contact_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={editForm.company_name}
                  onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opportunity Description
                </label>
                <textarea
                  value={editForm.opportunity_description}
                  onChange={(e) => setEditForm({ ...editForm, opportunity_description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>

              {(profile.role === 'admin' || profile.role === 'manager' || lead?.assigned_to === profile.id) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Assign to
                  </label>
                  <select
                    value={editForm.assigned_to}
                    onChange={(e) => setEditForm({ ...editForm, assigned_to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">Return to Fishbowl (Unassigned)</option>
                    {salesReps.map((rep) => (
                      <option key={rep.id} value={rep.id}>
                        {rep.id === profile.id ? `${rep.full_name} (You)` : `${rep.full_name} (${rep.role})`}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {editForm.assigned_to === ''
                      ? 'Lead will be returned to the fishbowl for others to claim'
                      : editForm.assigned_to === profile.id
                      ? 'This lead is assigned to you'
                      : 'Lead will be reassigned to the selected sales rep'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditForm({
                      contact_name: lead.contact_name || '',
                      company_name: lead.company_name || '',
                      email: lead.email || '',
                      phone: lead.phone || '',
                      opportunity_description: lead.opportunity_description || '',
                      assigned_to: lead.assigned_to || '',
                    });
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateLead}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6 border-2 border-blue-200 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-600" />
                Customer Information
              </h3>

              <div className="space-y-3">
                <div className="bg-white rounded-lg p-4">
                  <div className="text-sm font-medium text-gray-500 mb-1">Contact Name</div>
                  <div className="text-lg font-semibold text-gray-900">{lead.contact_name}</div>
                </div>

                {lead.company_name && (
                  <div className="bg-white rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Company
                    </div>
                    <div className="text-lg font-semibold text-gray-900">{lead.company_name}</div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {lead.email && (
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </div>
                      <a href={`mailto:${lead.email}`} className="text-base font-medium text-blue-600 hover:text-blue-700 break-all">
                        {lead.email}
                      </a>
                    </div>
                  )}

                  {lead.phone && (
                    <div className="bg-white rounded-lg p-4">
                      <div className="text-sm font-medium text-gray-500 mb-1 flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Phone
                      </div>
                      <a href={`tel:${lead.phone}`} className="text-base font-medium text-blue-600 hover:text-blue-700">
                        {lead.phone}
                      </a>
                    </div>
                  )}
                </div>

                {assignedProfile && (
                  <div className="bg-white rounded-lg p-4">
                    <div className="text-sm font-medium text-gray-500 mb-1">Assigned To</div>
                    <div className="text-base font-medium text-gray-900">{assignedProfile.full_name}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs sm:text-sm font-medium"
                >
                  <Tag className="w-3 h-3" />#{tag.tag}
                </span>
              ))}
            </div>
          )}

          {!isEditing && lead.status && lead.assigned_to && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Lead Status</label>
              <select
                value={lead.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              >
                <option value="unclaimed">Unclaimed</option>
                <option value="claimed">Claimed / In Progress</option>
                <option value="closed_won">Closed Won</option>
                <option value="closed_lost">Closed Lost</option>
                <option value="escalated">Escalated</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Update the status to track progress on this lead
              </p>
            </div>
          )}

          {!isEditing && (
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
              <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-purple-600" />
                Follow-up Reminder
              </label>
              <input
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => {
                  setReminderDate(e.target.value);
                  handleReminderDateChange(e.target.value);
                }}
                disabled={savingReminder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 mt-2">
                {savingReminder ? 'Saving reminder...' : 'Set a follow-up date to create a Google Calendar reminder (requires Google Calendar connection in My Settings)'}
              </p>
            </div>
          )}

          {!isEditing && lead.opportunity_description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Opportunity</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{lead.opportunity_description}</p>
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <TaskList leadId={leadId} />
          </div>

          {canClaim && (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-500 rounded-lg p-4 mb-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-semibold text-green-800 text-sm sm:text-base">This lead is available!</h4>
                  <p className="text-green-700 text-xs sm:text-sm mt-1">Click below to claim it and start working</p>
                </div>
                <button
                  onClick={() => setShowClaimConfirm(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl"
                >
                  Claim This Lead
                </button>
              </div>
            </div>
          )}

          {lead.is_fishbowl && (profile?.role === 'admin' || profile?.role === 'manager') && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-500 rounded-lg p-4 mb-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-semibold text-blue-800 text-sm sm:text-base">Assign this lead</h4>
                  <p className="text-blue-700 text-xs sm:text-sm mt-1">Assign this lead to a specific sales rep</p>
                </div>
                <button
                  onClick={() => setShowAssignModal(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl"
                >
                  Assign Lead
                </button>
              </div>
            </div>
          )}

          <div className="bg-gradient-to-r from-green-50 to-teal-50 border-2 border-green-400 rounded-lg p-4 mb-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="flex-1 text-center sm:text-left">
                <h4 className="font-semibold text-green-800 text-sm sm:text-base flex items-center gap-2 justify-center sm:justify-start">
                  <FileText className="w-4 h-4" />
                  Ready to put a proposal together?
                </h4>
                <p className="text-green-700 text-xs sm:text-sm mt-1">Create a proposal directly from this lead — no conversion needed</p>
              </div>
              <button
                onClick={() => setShowCreateProposalModal(true)}
                className="w-full sm:w-auto px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl"
              >
                Create Proposal
              </button>
            </div>
          </div>

          {profile?.can_view_prospects && lead.status !== 'closed_won' && lead.status !== 'closed_lost' && (
            <div className="bg-gradient-to-r from-blue-50 to-sky-50 border-2 border-blue-400 rounded-lg p-4 mb-4">
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 text-center sm:text-left">
                  <h4 className="font-semibold text-blue-800 text-sm sm:text-base flex items-center gap-2 justify-center sm:justify-start">
                    <Clock className="w-4 h-4" />
                    Not ready to buy? Too early to pursue?
                  </h4>
                  <p className="text-blue-700 text-xs sm:text-sm mt-1">Downgrade to a Prospect and schedule your next follow-up</p>
                </div>
                <button
                  onClick={() => setShowConvertModal(true)}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl"
                >
                  Downgrade to Prospect
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
              Discussion
            </h3>
          </div>

          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">
                No messages yet. Start the conversation!
              </p>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className="bg-gray-50 rounded-lg p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-xs sm:text-sm flex-shrink-0">
                      {msg.profiles?.full_name?.[0] || 'S'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                        <span className="font-semibold text-gray-900 text-xs sm:text-sm truncate">
                          {msg.profiles?.full_name || 'System'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatDistanceToNow(msg.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-700 text-xs sm:text-sm break-words">{msg.message}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <form onSubmit={handleSendMessage} className="p-4 sm:p-6 border-t border-gray-200 bg-white sticky bottom-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Add a comment..."
              className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm sm:text-base"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={sending || !newMessage.trim()}
              className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-1 sm:gap-2 text-sm sm:text-base flex-shrink-0"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </form>
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-full sm:max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Lead?</h3>
            <p className="text-gray-600 mb-5">
              Are you sure you want to delete this lead? This action cannot be undone.
            </p>
            <div className="flex gap-3 mb-4">
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteWithContact(false); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(deleteWithContact);
                  setShowDeleteConfirm(false);
                  setDeleteWithContact(false);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete Lead
              </button>
            </div>
            {lead?.email && (
              <div className="border-t border-gray-100 pt-3">
                <label className="flex items-start gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={deleteWithContact}
                    onChange={(e) => setDeleteWithContact(e.target.checked)}
                    className="mt-0.5 w-3.5 h-3.5 text-red-600 border-gray-300 rounded focus:ring-red-500 flex-shrink-0"
                  />
                  <span className="text-xs text-gray-500 group-hover:text-gray-700 transition-colors">
                    Also delete the associated contact record{lead.contact_name ? ` for ${lead.contact_name}` : ''}
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {showClaimConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-full sm:max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Claim This Lead?</h3>
            <p className="text-gray-600 mb-2">
              Are you sure you want to claim <strong>{lead.contact_name}</strong>?
            </p>
            <p className="text-sm text-gray-500 mb-6">
              This will assign the lead to you and move it from the Fishbowl to your Leads list.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowClaimConfirm(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleClaimLead}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Yes, Claim Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-full sm:max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Lead</h3>
            <p className="text-gray-600 mb-4">
              Select a sales rep to assign <strong>{lead.contact_name}</strong> to:
            </p>
            <select
              value={selectedAssignee}
              onChange={(e) => setSelectedAssignee(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-6"
            >
              <option value="">Select a sales rep...</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.full_name} ({rep.role})
                </option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowAssignModal(false);
                  setSelectedAssignee('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleAssignLead}
                disabled={!selectedAssignee}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign Lead
              </button>
            </div>
          </div>
        </div>
      )}

      {showConvertModal && (
        <ConvertLeadToProspectModal
          lead={lead}
          onClose={() => setShowConvertModal(false)}
          onSuccess={handleConvertSuccess}
        />
      )}

      {showCreateProposalModal && (
        <CreateProposalModal
          leadId={lead.id}
          onClose={() => setShowCreateProposalModal(false)}
          onCreated={(proposalId) => {
            setShowCreateProposalModal(false);
            onClose();
            window.location.href = `/proposals?open=${proposalId}`;
          }}
        />
      )}
    </div>
  );
}
