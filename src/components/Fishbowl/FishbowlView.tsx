import { useEffect, useState } from 'react';
import { Fish, AlertCircle, Building2, Mail, Phone, Tag, Clock, Award, MailOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { LeadWithDetails } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { markFishbowlSeen } from '../../hooks/useFishbowlCount';

interface FishbowlViewProps {
  onLeadClick: (leadId: string) => void;
}

export function FishbowlView({ onLeadClick }: FishbowlViewProps) {
  const { profile } = useAuth();
  const [leads, setLeads] = useState<LeadWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [avgClaimTime, setAvgClaimTime] = useState<number | null>(null);

  useEffect(() => {
    if (profile) {
      markFishbowlSeen(profile.id);
    }
  }, [profile?.id]);

  useEffect(() => {
    loadFishbowlLeads();
    loadMetrics();

    const channel = supabase
      .channel('fishbowl_leads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: 'is_fishbowl=eq.true' },
        () => {
          loadFishbowlLeads();
          loadMetrics();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  async function loadFishbowlLeads() {
    if (!profile) return;

    try {
      const { data: userOffices } = await supabase
        .from('user_offices')
        .select('office_id')
        .eq('user_id', profile.id);

      const hasOfficeAssignments = userOffices && userOffices.length > 0;

      let query = supabase
        .from('leads')
        .select(`
          id,
          contact_name,
          company_name,
          email,
          phone,
          opportunity_description,
          priority,
          status,
          is_fishbowl,
          lead_source,
          created_by,
          created_at,
          office_id,
          profiles:created_by (
            full_name,
            first_name,
            last_name
          ),
          lead_tags (
            tag
          )
        `)
        .eq('is_fishbowl', true)
        .eq('status', 'unclaimed');

      if (hasOfficeAssignments) {
        const officeIds = userOffices.map(uo => uo.office_id);
        query = query.or(`office_id.is.null,office_id.in.(${officeIds.join(',')})`);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // Debug logging for timestamp investigation
      if (data && data.length > 0) {
        console.log('Fishbowl leads loaded:', data.length);
        console.log('Most recent lead timestamps:', data.slice(0, 3).map(lead => ({
          name: lead.contact_name,
          created_at: lead.created_at,
          parsed: new Date(lead.created_at).toISOString(),
          now: new Date().toISOString(),
          diffMinutes: Math.floor((new Date().getTime() - new Date(lead.created_at).getTime()) / 1000 / 60)
        })));
      }

      setLeads(data || []);
    } catch (error) {
      console.error('Error loading fishbowl leads:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadMetrics() {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('time_to_claim_seconds')
        .not('time_to_claim_seconds', 'is', null);

      if (error) throw error;

      if (data && data.length > 0) {
        const total = data.reduce((sum, lead) => sum + (lead.time_to_claim_seconds || 0), 0);
        setAvgClaimTime(Math.floor(total / data.length));
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    }
  }

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  async function handleClaimLead(leadId: string, leadName: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!profile) return;

    setClaiming(leadId);

    try {
      const { data: leadData } = await supabase
        .from('leads')
        .select('created_by, priority')
        .eq('id', leadId)
        .single();

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
          body: `You claimed ${leadName}`,
        },
      ]);

      if (leadData?.created_by && (leadData.priority === 'high' || leadData.priority === 'urgent')) {
        const { data: creator } = await supabase
          .from('profiles')
          .select('notify_on_lead_status')
          .eq('id', leadData.created_by)
          .single();

        if (creator?.notify_on_lead_status !== false && leadData.created_by !== profile.id) {
          await supabase.from('notifications').insert([
            {
              user_id: leadData.created_by,
              type: 'lead_status_update',
              lead_id: leadId,
              title: `${leadData.priority === 'urgent' ? 'Urgent' : 'High'} Priority Lead Claimed`,
              body: `${profile.full_name} claimed your ${leadData.priority} priority lead: ${leadName}`,
            },
          ]);
        }
      }

      loadFishbowlLeads();
    } catch (error) {
      console.error('Error claiming lead:', error);
      alert('Failed to claim lead');
    } finally {
      setClaiming(null);
    }
  }

  function getPriorityInfo(priority: string): { label: string; color: string; emoji: string; timeframe: string } {
    switch (priority) {
      case 'urgent':
        return { label: 'Urgent', color: 'text-red-700 bg-red-100 border-red-300', emoji: '🔴', timeframe: 'Follow up within hours' };
      case 'high':
        return { label: 'High', color: 'text-orange-700 bg-orange-100 border-orange-300', emoji: '🟠', timeframe: 'Follow up within 1 day' };
      case 'medium':
        return { label: 'Medium', color: 'text-yellow-700 bg-yellow-100 border-yellow-300', emoji: '🟡', timeframe: 'Follow up within 3 days' };
      case 'low':
        return { label: 'Low', color: 'text-green-700 bg-green-100 border-green-300', emoji: '🟢', timeframe: 'Follow up within 1 week' };
      default:
        return { label: 'Medium', color: 'text-yellow-700 bg-yellow-100 border-yellow-300', emoji: '🟡', timeframe: 'Follow up within 3 days' };
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading fishbowl...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 border border-blue-200">
        <div className="flex items-center gap-2 text-blue-800">
          <Fish className="w-4 h-4 sm:w-5 sm:h-5" />
          <h2 className="text-sm sm:text-base font-semibold">Fishbowl</h2>
          <span className="ml-auto bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {leads.length}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-blue-700 mt-2">
          Unclaimed leads available for all sales reps. Click a lead to view details and claim it.
        </p>
        {avgClaimTime !== null && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-blue-200">
            <Award className="w-5 h-5 text-blue-600" />
            <div>
              <span className="text-xs text-blue-700">Average Claim Time: </span>
              <span className="text-lg font-bold text-blue-800">{formatDuration(avgClaimTime)}</span>
            </div>
          </div>
        )}
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Fish className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No leads in the fishbowl right now.</p>
          <p className="text-sm mt-1">Check back later or create a new lead!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {leads.map((lead) => {
            const daysSinceCreated = Math.floor(
              (new Date().getTime() - new Date(lead.created_at).getTime()) / (1000 * 60 * 60 * 24)
            );
            const isEscalated = daysSinceCreated >= 3;
            const priorityInfo = getPriorityInfo(lead.priority || 'medium');

            return (
              <div
                key={lead.id}
                onClick={() => onLeadClick(lead.id)}
                className={`bg-white rounded-lg p-4 shadow-sm border-2 ${
                  isEscalated ? 'border-orange-400' : 'border-gray-200'
                } hover:shadow-md transition-all cursor-pointer`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold border ${priorityInfo.color}`}>
                    <Clock className="w-3 h-3" />
                    <span>{priorityInfo.emoji} {priorityInfo.label}</span>
                  </div>
                  {isEscalated && (
                    <div className="flex items-center gap-1 text-orange-600 text-xs font-semibold">
                      <AlertCircle className="w-4 h-4" />
                      {daysSinceCreated}d
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-600 mb-2">{priorityInfo.timeframe}</p>

                <h3 className="font-bold text-gray-900 text-lg mb-1">{lead.contact_name}</h3>

                {lead.company_name && lead.company_name.toLowerCase() !== 'unknown' && (
                  <div className="flex items-center gap-2 text-gray-600 text-sm mb-2">
                    <Building2 className="w-4 h-4" />
                    <span className="truncate">{lead.company_name}</span>
                  </div>
                )}

                {lead.lead_source === 'kiosk' && (
                  <div className="flex items-center gap-2 text-blue-600 text-sm mb-2 font-semibold">
                    <span>📱 Kiosk Entry</span>
                  </div>
                )}

                {lead.lead_source === 'email_forward' && (
                  <div className="flex items-center gap-2 text-blue-600 text-sm mb-2 font-semibold">
                    <MailOpen className="w-4 h-4" />
                    <span>Email Forward</span>
                  </div>
                )}

                <div className="space-y-1 mb-3">
                  {lead.email && (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{lead.email}</span>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <Phone className="w-3 h-3" />
                      <span>{lead.phone}</span>
                    </div>
                  )}
                </div>

                {lead.opportunity_description && (
                  <p className="text-gray-600 text-sm line-clamp-2 mb-3">
                    {lead.opportunity_description}
                  </p>
                )}

                {lead.lead_tags && lead.lead_tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {lead.lead_tags.slice(0, 3).map((tag, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        <Tag className="w-2 h-2" />#{tag.tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-100 mb-3">
                  <span>
                    {(() => {
                      // If we have profile data, show creator
                      if (lead.profiles && (lead.profiles.full_name || (lead.profiles.first_name && lead.profiles.last_name))) {
                        return `Created by ${lead.profiles.full_name || `${lead.profiles.first_name} ${lead.profiles.last_name}`}`;
                      }
                      // Otherwise show lead source
                      switch (lead.lead_source) {
                        case 'kiosk':
                          return '📱 Kiosk Entry';
                        case 'email_forward':
                          return '✉️ Email Forward';
                        case 'website':
                          return '🌐 Website Form';
                        case 'referral':
                          return '🤝 Referral';
                        case 'import':
                          return '📥 Import';
                        default:
                          return 'Lead';
                      }
                    })()}
                  </span>
                  <span title={`Created: ${new Date(lead.created_at).toLocaleString()}`}>
                    {formatDistanceToNow(lead.created_at)}
                  </span>
                </div>

                <button
                  onClick={(e) => handleClaimLead(lead.id, lead.contact_name, e)}
                  disabled={claiming === lead.id}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {claiming === lead.id ? 'Claiming...' : 'Claim Lead'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
