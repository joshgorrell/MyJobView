import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Heart, Trash2, ListTodo, HelpCircle, MessageCircle, Reply, TrendingUp, CheckCircle, Award, User, Lock, EyeOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';
import { DiscussionPost } from '../../lib/types';
import { formatDistanceToNow } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { offlineSupabaseInsert, offlineSupabaseDelete, offlineSupabaseUpdate } from '../../lib/offlineSupport';

interface DiscussionFeedProps {
  onLeadClick: (leadId: string) => void;
  selectedHashtag?: string;
  onHashtagClick?: (hashtag: string) => void;
  showOnlyMentions?: boolean;
  searchQuery?: string;
}

export function DiscussionFeed({ onLeadClick, selectedHashtag, onHashtagClick, showOnlyMentions, searchQuery }: DiscussionFeedProps) {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<DiscussionPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [expandedBumpHistory, setExpandedBumpHistory] = useState<Set<string>>(new Set());
  const [bumpHistory, setBumpHistory] = useState<Record<string, any[]>>({});
  const [hideCompleted, setHideCompleted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleReload() {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      loadPosts();
    }, 500);
  }

  useEffect(() => {
    loadPosts();

    const channel = supabase
      .channel('discussion_feed_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_posts' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'discussion_post_likes' }, scheduleReload)
      .subscribe();

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [profile, selectedHashtag, showOnlyMentions, searchQuery]);

  async function loadPosts() {
    if (!profile) return;

    try {
      let query = supabase
        .from('discussion_posts')
        .select(`
          *,
          profiles!discussion_posts_user_id_fkey (
            full_name,
            avatar_url
          ),
          assigned_profile:profiles!discussion_posts_assigned_to_fkey (
            id,
            full_name,
            username
          ),
          completed_profile:profiles!discussion_posts_completed_by_fkey (
            id,
            full_name
          ),
          leads (
            id,
            contact_name,
            company_name
          )
        `)
        .is('parent_id', null);

      if (selectedHashtag) {
        query = query.contains('hashtags', [selectedHashtag]);
      }

      if (showOnlyMentions) {
        query = query.contains('mentions', [profile.id]);
      }

      if (searchQuery && searchQuery.trim()) {
        const trimmedQuery = searchQuery.trim();

        if (trimmedQuery.startsWith('@')) {
          const username = trimmedQuery.slice(1).toLowerCase();
          const { data: userProfiles } = await supabase
            .from('profiles')
            .select('id')
            .ilike('username', `%${username}%`)
            .eq('is_active', true);

          if (userProfiles && userProfiles.length > 0) {
            const userIds = userProfiles.map(p => p.id);
            query = query.or(userIds.map(id => `mentions.cs.{${id}}`).join(','));
          } else {
            query = query.eq('id', '00000000-0000-0000-0000-000000000000');
          }
        } else if (trimmedQuery.startsWith('#')) {
          const hashtag = trimmedQuery.slice(1).toLowerCase();
          query = query.contains('hashtags', [hashtag]);
        } else {
          query = query.ilike('content', `%${trimmedQuery}%`);
        }
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;

      const sortedData = (data || []).sort((a, b) => {
        const aTime = a.bumped_at ? new Date(a.bumped_at).getTime() : new Date(a.created_at).getTime();
        const bTime = b.bumped_at ? new Date(b.bumped_at).getTime() : new Date(b.created_at).getTime();
        return bTime - aTime;
      });

      if (sortedData.length === 0) {
        setPosts([]);
        return;
      }

      const parentPostIds = sortedData.map(p => p.id);

      // Fetch all replies for all parent posts in a single query
      const { data: allReplies } = await supabase
        .from('discussion_posts')
        .select(`
          *,
          profiles!discussion_posts_user_id_fkey (
            full_name,
            avatar_url
          )
        `)
        .in('parent_id', parentPostIds)
        .order('created_at', { ascending: true });

      const allReplyIds = (allReplies || []).map(r => r.id);
      const allPostIds = [...parentPostIds, ...allReplyIds];

      // Fetch all likes for all posts (parents + replies) in two bulk queries
      const [allLikesResult, userLikesResult] = await Promise.all([
        supabase
          .from('discussion_post_likes')
          .select('post_id')
          .in('post_id', allPostIds),
        supabase
          .from('discussion_post_likes')
          .select('post_id')
          .in('post_id', allPostIds)
          .eq('user_id', profile.id)
      ]);

      // Build lookup maps for O(1) access
      const likeCounts: Record<string, number> = {};
      (allLikesResult.data || []).forEach(l => {
        likeCounts[l.post_id] = (likeCounts[l.post_id] || 0) + 1;
      });

      const userLikedSet = new Set((userLikesResult.data || []).map(l => l.post_id));

      // Group replies by parent_id
      const repliesByParent: Record<string, any[]> = {};
      (allReplies || []).forEach(reply => {
        if (!repliesByParent[reply.parent_id]) {
          repliesByParent[reply.parent_id] = [];
        }
        repliesByParent[reply.parent_id].push({
          ...reply,
          like_count: likeCounts[reply.id] || 0,
          user_has_liked: userLikedSet.has(reply.id),
        });
      });

      const postsWithLikesAndReplies = sortedData.map(post => {
        const replies = repliesByParent[post.id] || [];
        return {
          ...post,
          like_count: likeCounts[post.id] || 0,
          user_has_liked: userLikedSet.has(post.id),
          replies,
          reply_count: replies.length,
        };
      });

      setPosts(postsWithLikesAndReplies);
    } catch (error) {
      console.error('Error loading posts:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleLike(postId: string, isLiked: boolean) {
    if (!profile) return;

    try {
      if (isLiked) {
        await supabase
          .from('discussion_post_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', profile.id);
      } else {
        await offlineSupabaseInsert('discussion_post_likes', { post_id: postId, user_id: profile.id });
      }
      loadPosts();
    } catch (error) {
      console.error('Error toggling like:', error);
    }
  }

  async function handleDelete(postId: string) {
    setConfirmDeleteId(null);
    try {
      await offlineSupabaseDelete('discussion_posts', postId);
      loadPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  }

  async function handleReply(parentId: string) {
    if (!profile || !replyContent.trim()) return;

    try {
      await offlineSupabaseInsert('discussion_posts', {
        user_id: profile.id,
        parent_id: parentId,
        content: replyContent.trim(),
        post_type: 'general',
        mentions: [],
        hashtags: [],
      });

      setReplyContent('');
      setReplyingTo(null);
      loadPosts();
    } catch (error) {
      console.error('Error posting reply:', error);
      alert('Failed to post reply. Please try again.');
    }
  }

  async function handleComplete(post: DiscussionPost) {
    if (!profile) return;

    try {
      if ((post as any).is_completed) {
        alert('This has already been completed');
        return;
      }

      const assignedTo = (post as any).assigned_to;
      if (assignedTo && assignedTo !== profile.id) {
        alert('Only the assigned person can mark this as complete');
        return;
      }

      // Get points configuration
      const { data: pointsConfig } = await supabase
        .from('points_configuration')
        .select('task_completion_points, question_answer_points')
        .single();

      const postPoints = post.post_type === 'task'
        ? (pointsConfig?.task_completion_points || 10)
        : (pointsConfig?.question_answer_points || 5);

      await offlineSupabaseUpdate('discussion_posts', {
        is_completed: true,
        completed_by: profile.id,
        completed_at: new Date().toISOString(),
      }, post.id);

      // Create points transaction
      await supabase.from('points_transactions').insert([{
        user_id: profile.id,
        points_amount: postPoints,
        transaction_type: post.post_type === 'task' ? 'task_completion' : 'question_answer',
        reference_id: post.id,
        description: `${post.post_type === 'task' ? 'Completed task' : 'Answered question'}: ${post.content.substring(0, 50)}...`,
      }]);

      await supabase.from('notifications').insert([{
        user_id: profile.id,
        type: 'points_earned',
        title: `+${postPoints} Points!`,
        body: `You earned ${postPoints} points for ${post.post_type === 'task' ? 'completing a task' : 'answering a question'}`,
      }]);

      if (post.user_id !== profile.id) {
        await supabase.from('notifications').insert([{
          user_id: post.user_id,
          type: post.post_type === 'task' ? 'task_completed' : 'question_answered',
          title: post.post_type === 'task' ? 'Task Completed' : 'Question Answered',
          body: `${profile.full_name} ${post.post_type === 'task' ? 'completed' : 'answered'} your ${post.post_type}`,
        }]);
      }

      loadPosts();
    } catch (error) {
      console.error('Error completing post:', error);
      alert('Failed to mark as complete');
    }
  }

  async function handleBump(post: DiscussionPost) {
    if (!profile) return;

    try {
      const postAge = Date.now() - new Date(post.created_at).getTime();
      const hoursSinceCreation = postAge / (1000 * 60 * 60);

      if (hoursSinceCreation < 4) {
        alert('Posts can only be bumped after 4 hours');
        return;
      }

      if (post.reply_count && post.reply_count > 0) {
        alert('This post already has replies');
        return;
      }

      const lastBumpedAt = (post as any).bumped_at;
      if (lastBumpedAt) {
        const timeSinceLastBump = Date.now() - new Date(lastBumpedAt).getTime();
        const hoursSinceLastBump = timeSinceLastBump / (1000 * 60 * 60);

        if (hoursSinceLastBump < 24) {
          alert('Posts can only be bumped once every 24 hours');
          return;
        }
      }

      const currentBumpCount = (post as any).bump_count || 0;

      await offlineSupabaseUpdate('discussion_posts', {
        bumped_at: new Date().toISOString(),
        bump_count: currentBumpCount + 1,
        last_bumped_by: profile.id,
      }, post.id);

      await offlineSupabaseInsert('discussion_post_bumps', {
        post_id: post.id,
        bumped_by: profile.id,
        bumped_at: new Date().toISOString(),
      });

      if (post.mentions && post.mentions.length > 0) {
        const { data: mentionedUsers } = await supabase
          .from('profiles')
          .select('id, email, notify_on_mention')
          .in('id', post.mentions)
          .eq('notify_on_mention', true);

        if (mentionedUsers && mentionedUsers.length > 0) {
          await supabase.functions.invoke('send-lead-notification', {
            body: {
              recipients: mentionedUsers.map(u => u.email),
              subject: 'Reminder: You were mentioned in a discussion',
              content: `${profile.full_name} bumped a post where you were mentioned: "${post.content.substring(0, 100)}..."`,
            },
          });
        }
      }

      loadPosts();
    } catch (error) {
      console.error('Error bumping post:', error);
      alert('Failed to bump post');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading discussions...</div>
      </div>
    );
  }

  const filteredPosts = hideCompleted
    ? posts.filter(post => !(post as any).is_completed)
    : posts;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          onClick={() => setHideCompleted(!hideCompleted)}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            hideCompleted
              ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
          }`}
        >
          <EyeOff className="w-4 h-4" />
          {hideCompleted ? 'Show Completed' : 'Hide Completed'}
        </button>
      </div>
      {filteredPosts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-400" />
          <p>No discussions yet. Start the conversation!</p>
        </div>
      ) : (
        filteredPosts.map((post) => (
          <div
            key={post.id}
            className="bg-white rounded-lg p-4 shadow-sm border border-gray-200"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold flex-shrink-0">
                {post.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-gray-900">
                    {post.profiles?.full_name || 'Unknown User'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {formatDistanceToNow(post.created_at)}
                  </span>
                  {post.post_type && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                      post.post_type === 'task'
                        ? 'bg-blue-100 text-blue-700'
                        : post.post_type === 'question'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {post.post_type === 'task' && <ListTodo className="w-3 h-3" />}
                      {post.post_type === 'question' && <HelpCircle className="w-3 h-3" />}
                      {post.post_type === 'general' && <MessageCircle className="w-3 h-3" />}
                      {post.post_type.charAt(0).toUpperCase() + post.post_type.slice(1)}
                    </span>
                  )}
                  {(post as any).is_private && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200">
                      <Lock className="w-3 h-3" />
                      Private
                    </span>
                  )}
                  {post.user_id === profile?.id && (
                    <button
                      onClick={() => setConfirmDeleteId(post.id)}
                      className="ml-auto p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete post"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {post.lead_id && post.leads && (
                  <button
                    onClick={() => onLeadClick(post.lead_id!)}
                    className="text-xs text-blue-600 hover:text-blue-700 mb-2 inline-flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3" />
                    {post.leads.contact_name}
                    {post.leads.company_name && ` from ${post.leads.company_name}`}
                  </button>
                )}

                <p className="text-gray-700 whitespace-pre-wrap break-words">
                  {post.content.split(/(@\w+|#\w+)/g).map((part, index) => {
                    if (part.startsWith('@')) {
                      return (
                        <span
                          key={index}
                          className="text-blue-600 font-semibold hover:underline cursor-pointer"
                        >
                          {part}
                        </span>
                      );
                    }
                    if (part.startsWith('#')) {
                      const hashtag = part.slice(1);
                      return (
                        <span
                          key={index}
                          onClick={() => onHashtagClick?.(hashtag)}
                          className="text-cyan-600 font-semibold hover:underline cursor-pointer"
                        >
                          {part}
                        </span>
                      );
                    }
                    return part;
                  })}
                </p>

                {(post.post_type === 'task' || post.post_type === 'question') && (
                  <div className="mt-3 p-2 bg-gray-50 rounded-lg border border-gray-200 text-sm">
                    <div className="flex items-center gap-4 flex-wrap">
                      {(post as any).assigned_profile ? (
                        <div className="flex items-center gap-1 text-gray-700">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Assigned to:</span>
                          <span className="text-blue-600">@{(post as any).assigned_profile.username}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-600">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Open to:</span>
                          <span className="text-blue-600">@anyone</span>
                        </div>
                      )}
                      {(post as any).points && (
                        <div className="flex items-center gap-1 text-orange-600">
                          <Award className="w-4 h-4" />
                          <span className="font-semibold">{(post as any).points} points</span>
                        </div>
                      )}
                      {(post as any).is_completed && (post as any).completed_profile && (
                        <div className="flex items-center gap-1 text-green-600 ml-auto">
                          <CheckCircle className="w-4 h-4" />
                          <span className="font-medium">Completed by {(post as any).completed_profile.full_name}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-3">
                  <button
                    onClick={() => handleLike(post.id, post.user_has_liked || false)}
                    className={`flex items-center gap-1 text-sm transition-colors ${
                      post.user_has_liked
                        ? 'text-red-600 hover:text-red-700'
                        : 'text-gray-500 hover:text-red-600'
                    }`}
                  >
                    <Heart
                      className={`w-4 h-4 ${post.user_has_liked ? 'fill-current' : ''}`}
                    />
                    <span>{post.like_count || 0}</span>
                  </button>
                  <button
                    onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)}
                    className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                  >
                    <Reply className="w-4 h-4" />
                    <span>{post.reply_count || 0}</span>
                  </button>
                  {(post.post_type === 'task' || post.post_type === 'question') && !(post as any).is_completed && (
                    (() => {
                      const assignedTo = (post as any).assigned_to;
                      const canComplete = !assignedTo || assignedTo === profile?.id;

                      return canComplete ? (
                        <button
                          onClick={() => handleComplete(post)}
                          className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700 transition-colors font-medium"
                          title={`Mark as ${post.post_type === 'task' ? 'completed' : 'answered'}`}
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Mark as {post.post_type === 'task' ? 'Complete' : 'Answered'}</span>
                        </button>
                      ) : null;
                    })()
                  )}
                  {(!post.reply_count || post.reply_count === 0) && (() => {
                    const postAge = Date.now() - new Date(post.created_at).getTime();
                    const hoursSinceCreation = postAge / (1000 * 60 * 60);
                    const lastBumpedAt = (post as any).bumped_at;
                    const canBump = hoursSinceCreation >= 4 && (!lastBumpedAt || (Date.now() - new Date(lastBumpedAt).getTime()) >= (24 * 60 * 60 * 1000));
                    const bumpCount = (post as any).bump_count || 0;

                    return bumpCount > 0 || canBump ? (
                      <div className="flex items-center gap-2">
                        {canBump && (
                          <button
                            onClick={() => handleBump(post)}
                            className="flex items-center gap-1 text-sm text-orange-600 hover:text-orange-700 transition-colors"
                            title="Bump this post to the top"
                          >
                            <TrendingUp className="w-4 h-4" />
                            <span>Bump{bumpCount > 0 ? ` (${bumpCount})` : ''}</span>
                          </button>
                        )}
                        {bumpCount > 0 && (
                          <button
                            onClick={async () => {
                              if (expandedBumpHistory.has(post.id)) {
                                setExpandedBumpHistory(prev => {
                                  const next = new Set(prev);
                                  next.delete(post.id);
                                  return next;
                                });
                              } else {
                                const { data } = await supabase
                                  .from('discussion_post_bumps')
                                  .select(`
                                    *,
                                    profiles!discussion_post_bumps_bumped_by_fkey (
                                      full_name
                                    )
                                  `)
                                  .eq('post_id', post.id)
                                  .order('bumped_at', { ascending: false });

                                setBumpHistory(prev => ({ ...prev, [post.id]: data || [] }));
                                setExpandedBumpHistory(prev => new Set(prev).add(post.id));
                              }
                            }}
                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                          >
                            {expandedBumpHistory.has(post.id) ? 'Hide' : 'View'} bump history
                          </button>
                        )}
                      </div>
                    ) : null;
                  })()}
                </div>

                {expandedBumpHistory.has(post.id) && bumpHistory[post.id] && bumpHistory[post.id].length > 0 && (
                  <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                    <h4 className="text-sm font-semibold text-orange-900 mb-2 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" />
                      Bump History ({bumpHistory[post.id].length})
                    </h4>
                    <div className="space-y-2">
                      {bumpHistory[post.id].map((bump: any) => (
                        <div key={bump.id} className="flex items-center gap-2 text-sm">
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {bump.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <span className="font-medium text-gray-900">
                            {bump.profiles?.full_name || 'Unknown User'}
                          </span>
                          <span className="text-gray-500">bumped this post</span>
                          <span className="text-gray-400 ml-auto">
                            {formatDistanceToNow(bump.bumped_at)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {post.replies && post.replies.length > 0 && (
                  <div className="mt-4 space-y-3 pl-4 border-l-2 border-gray-200">
                    {post.replies.map((reply) => (
                      <div key={reply.id} className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-500 to-gray-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                          {reply.profiles?.full_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm text-gray-900">
                              {reply.profiles?.full_name || 'Unknown User'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDistanceToNow(reply.created_at)}
                            </span>
                            {reply.user_id === profile?.id && (
                              <button
                                onClick={() => setConfirmDeleteId(reply.id)}
                                className="ml-auto p-1 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete reply"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {reply.content}
                          </p>
                          <div className="flex items-center gap-4 mt-2">
                            <button
                              onClick={() => handleLike(reply.id, reply.user_has_liked || false)}
                              className={`flex items-center gap-1 text-xs transition-colors ${
                                reply.user_has_liked
                                  ? 'text-red-600 hover:text-red-700'
                                  : 'text-gray-500 hover:text-red-600'
                              }`}
                            >
                              <Heart
                                className={`w-3 h-3 ${reply.user_has_liked ? 'fill-current' : ''}`}
                              />
                              <span>{reply.like_count || 0}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {replyingTo === post.id && (
                  <div className="mt-4 pl-4 border-l-2 border-blue-300">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Write a reply..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                      rows={3}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleReply(post.id)}
                        disabled={!replyContent.trim()}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setReplyingTo(null);
                          setReplyContent('');
                        }}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Post"
        message="Are you sure you want to delete this post? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); id && handleDelete(id); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
