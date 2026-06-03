import { useEffect, useRef, useState } from 'react';
import { MessageSquare, UserPlus, Users, AlertTriangle, CheckCircle, TrendingUp, Activity, MessageCircle, Hash, X, AtSign, Search, Briefcase, ListTodo, CheckSquare, Edit3, Trash2, ChevronDown, ChevronUp, Heart, User, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { FeedEvent } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { DiscussionFeed } from './DiscussionFeed';
import { DiscussionPostForm } from './DiscussionPostForm';
import { LeadsHistory } from './LeadsHistory';
import { useAuth } from '../../contexts/AuthContext';

interface MasterFeedProps {
  onLeadClick: (leadId: string) => void;
}

export function MasterFeed({ onLeadClick }: MasterFeedProps) {
  const { profile } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHashtag, setSelectedHashtag] = useState<string | undefined>();
  const [trendingHashtags, setTrendingHashtags] = useState<Array<{ hashtag: string; count: number }>>([]);
  const [showOnlyMentions, setShowOnlyMentions] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMentionsSection, setShowMentionsSection] = useState(true);
  const hashtagReloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadEvents();
    loadTrendingHashtags();

    const channel = supabase
      .channel('master_feed_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'feed_events' }, () => {
        loadEvents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_posts' }, () => {
        if (hashtagReloadTimer.current) clearTimeout(hashtagReloadTimer.current);
        hashtagReloadTimer.current = setTimeout(() => loadTrendingHashtags(), 2000);
      })
      .subscribe();

    return () => {
      if (hashtagReloadTimer.current) clearTimeout(hashtagReloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadEvents() {
    try {
      const { data, error } = await supabase
        .from('feed_events')
        .select(`
          *,
          leads (
            id,
            company_name,
            contact_name,
            status
          ),
          lead_messages (
            id,
            message,
            profiles (
              full_name
            )
          ),
          tasks (
            id,
            title,
            description,
            status
          ),
          profiles (
            full_name,
            avatar_url
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading feed events:', error);
        throw error;
      }

      setEvents(data || []);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrendingHashtags() {
    try {
      // Use the stored hashtags array column instead of parsing full content
      const { data } = await supabase
        .from('discussion_posts')
        .select('hashtags')
        .not('hashtags', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      const hashtagCounts: Record<string, number> = {};

      (data || []).forEach((post) => {
        if (Array.isArray(post.hashtags)) {
          post.hashtags.forEach((tag: string) => {
            const normalized = tag.toLowerCase();
            hashtagCounts[normalized] = (hashtagCounts[normalized] || 0) + 1;
          });
        }
      });

      const sorted = Object.entries(hashtagCounts)
        .map(([hashtag, count]) => ({ hashtag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setTrendingHashtags(sorted);
    } catch (error) {
      console.error('Error loading trending hashtags:', error);
    }
  }

  function handleHashtagClick(hashtag: string) {
    if (selectedHashtag === hashtag) {
      setSelectedHashtag(undefined);
    } else {
      setSelectedHashtag(hashtag);
    }
  }

  function getEventIcon(eventType: string) {
    switch (eventType) {
      case 'lead_created':
        return <UserPlus className="w-5 h-5 text-blue-600" />;
      case 'lead_assigned':
        return <UserPlus className="w-5 h-5 text-green-600" />;
      case 'lead_claimed':
        return <CheckCircle className="w-5 h-5 text-emerald-600" />;
      case 'message_posted':
        return <MessageSquare className="w-5 h-5 text-indigo-600" />;
      case 'lead_escalated':
        return <AlertTriangle className="w-5 h-5 text-orange-600" />;
      case 'lead_updated':
        return <TrendingUp className="w-5 h-5 text-purple-600" />;
      case 'lead_closed':
        return <CheckCircle className="w-5 h-5 text-gray-600" />;
      case 'task_created':
        return <ListTodo className="w-5 h-5 text-cyan-600" />;
      case 'task_completed':
        return <CheckSquare className="w-5 h-5 text-green-600" />;
      case 'task_updated':
        return <Edit3 className="w-5 h-5 text-amber-600" />;
      case 'task_deleted':
        return <Trash2 className="w-5 h-5 text-red-600" />;
      case 'discussion_created':
        return <MessageCircle className="w-5 h-5 text-blue-600" />;
      case 'discussion_replied':
        return <MessageSquare className="w-5 h-5 text-cyan-600" />;
      case 'discussion_liked':
        return <Heart className="w-5 h-5 text-pink-600" />;
      case 'contact_created':
        return <User className="w-5 h-5 text-emerald-600" />;
      case 'contact_updated':
        return <Building2 className="w-5 h-5 text-teal-600" />;
      default:
        return <Users className="w-5 h-5 text-gray-600" />;
    }
  }

  function getEventDescription(event: FeedEvent) {
    const userName = event.profiles?.full_name || 'Someone';
    const leadName = event.leads?.contact_name || 'Unknown';
    const company = event.leads?.company_name ? ` from ${event.leads.company_name}` : '';
    const taskTitle = event.tasks?.title || 'Unknown task';

    switch (event.event_type) {
      case 'lead_created':
        return (
          <>
            <strong>{userName}</strong> created a new lead: <strong>{leadName}</strong>
            {company}
          </>
        );
      case 'lead_assigned':
        return (
          <>
            <strong>{leadName}</strong>
            {company} was assigned to <strong>{event.metadata.assigned_to_name}</strong>
          </>
        );
      case 'lead_claimed':
        return (
          <>
            <strong>{userName}</strong> claimed <strong>{leadName}</strong>
            {company} from the Fishbowl
          </>
        );
      case 'message_posted':
        return (
          <>
            <strong>{event.lead_messages?.profiles?.full_name || userName}</strong> commented on{' '}
            <strong>{leadName}</strong>: {event.lead_messages?.message?.substring(0, 60)}
            {(event.lead_messages?.message?.length || 0) > 60 ? '...' : ''}
          </>
        );
      case 'lead_escalated':
        return (
          <>
            <strong>{leadName}</strong>
            {company} has been escalated (unclaimed for 3+ days)
          </>
        );
      case 'lead_updated':
        return (
          <>
            <strong>{userName}</strong> updated <strong>{leadName}</strong>
            {company}
          </>
        );
      case 'lead_closed':
        return (
          <>
            <strong>{userName}</strong> closed <strong>{leadName}</strong>
            {company} as {event.metadata.status}
          </>
        );
      case 'task_created':
        return (
          <>
            <strong>{userName}</strong> created a task: <strong>{taskTitle}</strong>
          </>
        );
      case 'task_completed':
        return (
          <>
            <strong>{userName}</strong> completed task: <strong>{taskTitle}</strong>
          </>
        );
      case 'task_updated':
        return (
          <>
            <strong>{userName}</strong> updated task: <strong>{taskTitle}</strong>
          </>
        );
      case 'task_deleted':
        return (
          <>
            <strong>{userName}</strong> deleted task: <strong>{taskTitle}</strong>
          </>
        );
      case 'discussion_created': {
        const postType = event.metadata?.post_type || 'post';
        const preview = event.metadata?.content_preview || '';
        return (
          <>
            <strong>{userName}</strong> created a {postType}: {preview}{preview.length >= 100 ? '...' : ''}
          </>
        );
      }
      case 'discussion_replied': {
        const preview = event.metadata?.content_preview || '';
        return (
          <>
            <strong>{userName}</strong> replied to a discussion: {preview}{preview.length >= 100 ? '...' : ''}
          </>
        );
      }
      case 'discussion_liked':
        return (
          <>
            <strong>{userName}</strong> liked a discussion post
          </>
        );
      case 'contact_created': {
        const contactName = event.metadata?.name || 'Unknown';
        const contactCompany = event.metadata?.company;
        return (
          <>
            <strong>{userName}</strong> created contact: <strong>{contactName}</strong>
            {contactCompany && ` from ${contactCompany}`}
          </>
        );
      }
      case 'contact_updated': {
        const contactName = event.metadata?.name || 'Unknown';
        const contactCompany = event.metadata?.company;
        return (
          <>
            <strong>{userName}</strong> updated contact: <strong>{contactName}</strong>
            {contactCompany && ` from ${contactCompany}`}
          </>
        );
      }
      default:
        return `Activity on ${leadName}${company}`;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading feed...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DiscussionPostForm onSuccess={() => {}} />

          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 space-y-4">
              <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search discussions, @users, or #topics..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <button
                    onClick={() => setShowMentionsSection(!showMentionsSection)}
                    className="w-full px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-between gap-2 bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
                  >
                    <div className="flex items-center gap-2">
                      <AtSign className="w-4 h-4" />
                      <span className="text-sm">My Mentions</span>
                    </div>
                    {showMentionsSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showMentionsSection && (
                    <div className="mt-2">
                      <button
                        onClick={() => {
                          setShowOnlyMentions(!showOnlyMentions);
                          if (!showOnlyMentions) {
                            setSelectedHashtag(undefined);
                          }
                        }}
                        className={`w-full px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                          showOnlyMentions
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <AtSign className="w-4 h-4" />
                        {showOnlyMentions ? 'Showing My Mentions' : 'Show My Mentions'}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <DiscussionFeed
                onLeadClick={onLeadClick}
                selectedHashtag={selectedHashtag}
                onHashtagClick={handleHashtagClick}
                showOnlyMentions={showOnlyMentions}
                searchQuery={searchQuery}
              />
            </div>

            {trendingHashtags.length > 0 && (
              <div className="lg:w-80 space-y-4">
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-4 border border-cyan-200 sticky top-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Hash className="w-5 h-5 text-cyan-600" />
                    <h3 className="font-semibold text-gray-900">Trending Topics</h3>
                  </div>
                  <div className="space-y-2">
                    {trendingHashtags.map((item) => (
                      <button
                        key={item.hashtag}
                        onClick={() => {
                          handleHashtagClick(item.hashtag);
                          setShowOnlyMentions(false);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between ${
                          selectedHashtag === item.hashtag
                            ? 'bg-cyan-600 text-white'
                            : 'bg-white text-cyan-700 hover:bg-cyan-100 border border-cyan-300'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Hash className="w-4 h-4" />
                          {item.hashtag}
                        </span>
                        <span className="text-xs opacity-75">{item.count}</span>
                      </button>
                    ))}
                  </div>
                  {selectedHashtag && (
                    <div className="mt-3 pt-3 border-t border-cyan-200">
                      <button
                        onClick={() => setSelectedHashtag(undefined)}
                        className="text-xs text-cyan-700 hover:text-cyan-900 flex items-center gap-1"
                      >
                        <X className="w-3 h-3" />
                        Clear filter
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
    </div>
  );
}
