import { useState, useEffect, useRef } from 'react';
import { Send, ListTodo, HelpCircle, MessageCircle, Calendar, ChevronDown, ChevronUp, Users, Lock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { resolveMentions, parseHashtags } from '../../lib/username';
import { offlineSupabaseInsert } from '../../lib/offlineSupport';

interface DiscussionPostFormProps {
  onSuccess: () => void;
}

export function DiscussionPostForm({ onSuccess }: DiscussionPostFormProps) {
  const { profile } = useAuth();
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'task' | 'question' | 'general' | null>(null);
  const [reminderDate, setReminderDate] = useState('');
  const [showReminder, setShowReminder] = useState(false);
  const [assignedUsername, setAssignedUsername] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ type: 'user' | 'lead'; username: string; name: string; id: string }>>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const text = content.slice(0, cursorPosition);
    const match = text.match(/@(\w*)$/);

    if (match) {
      const search = match[1].toLowerCase();
      loadSuggestions(search);
    } else {
      setShowSuggestions(false);
    }
  }, [content, cursorPosition]);

  async function loadSuggestions(search: string) {
    try {
      const [usersResult, leadsResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, full_name')
          .ilike('username', `${search}%`)
          .eq('is_active', true)
          .limit(5),
        supabase
          .from('leads')
          .select('id, username, contact_name')
          .ilike('username', `${search}%`)
          .limit(5),
      ]);

      const userSuggestions = (usersResult.data || []).map(u => ({
        type: 'user' as const,
        username: u.username,
        name: u.full_name,
        id: u.id,
      }));

      const leadSuggestions = (leadsResult.data || []).map(l => ({
        type: 'lead' as const,
        username: l.username,
        name: l.contact_name,
        id: l.id,
      }));

      setSuggestions([...userSuggestions, ...leadSuggestions]);
      setShowSuggestions(true);
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  }

  function selectSuggestion(username: string) {
    const beforeMention = content.slice(0, cursorPosition).replace(/@\w*$/, '');
    const afterMention = content.slice(cursorPosition);
    const newContent = `${beforeMention}@${username} ${afterMention}`;
    const newPosition = beforeMention.length + username.length + 2;

    setContent(newContent);
    setShowSuggestions(false);
    setSuggestions([]);
    setCursorPosition(newPosition);

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !profile || !postType) return;

    setLoading(true);
    try {
      const { userMentions, leadMentions } = await resolveMentions(content, supabase);
      const hashtags = parseHashtags(content);

      let assignedToId = null;
      if ((postType === 'task' || postType === 'question') && assignedUsername && assignedUsername.toLowerCase() !== 'anyone') {
        const { data: assignedUser } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', assignedUsername)
          .maybeSingle();

        assignedToId = assignedUser?.id || null;
      }

      const postData = {
        user_id: profile.id,
        content: content.trim(),
        post_type: postType,
        mentions: [...userMentions, ...leadMentions],
        hashtags: hashtags,
        reminder_date: reminderDate ? new Date(reminderDate).toISOString() : null,
        assigned_to: (postType === 'task' || postType === 'question') ? assignedToId : null,
        is_private: isPrivate,
      };

      const postResult = await offlineSupabaseInsert('discussion_posts', postData);
      if (postResult.error) throw postResult.error;
      const newPost = Array.isArray(postResult.data) ? postResult.data[0] : postResult.data;

      if (reminderDate && newPost) {
        const { data: calendarProfile } = await supabase
          .from('profiles')
          .select('google_calendar_connected')
          .eq('id', profile.id)
          .single();

        if (calendarProfile?.google_calendar_connected) {
          try {
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
                  action: 'create',
                  entityType: 'discussion_post',
                  entityId: newPost.id,
                  reminderDate: new Date(reminderDate).toISOString(),
                  title: `Discussion: ${postType === 'task' ? 'Task' : postType === 'question' ? 'Question' : 'General'}`,
                  description: content.trim().substring(0, 500),
                }),
              }
            );
          } catch (calError) {
            console.error('Failed to create calendar event:', calError);
          }
        }
      }

      if (userMentions.length > 0) {
        const { data: usersWithPreferences } = await supabase
          .from('profiles')
          .select('id, notify_on_mention')
          .in('id', userMentions);

        const usersToNotify = (usersWithPreferences || [])
          .filter(u => u.notify_on_mention !== false)
          .map(u => u.id);

        if (usersToNotify.length > 0) {
          const notifications = usersToNotify.map((userId: string) => ({
            user_id: userId,
            type: 'mention',
            title: 'You were mentioned',
            body: `${profile.full_name} mentioned you in a discussion`,
          }));

          await supabase.from('notifications').insert(notifications);
        }
      }

      setContent('');
      setPostType(null);
      setReminderDate('');
      setShowReminder(false);
      setAssignedUsername('');
      setIsPrivate(false);
      onSuccess();
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Failed to create post. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg p-4 shadow-sm border border-gray-200 relative">
      <div className="mb-3">
        <label className="block text-sm font-medium text-gray-700 mb-2">Post Type *</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPostType('task')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
              postType === 'task'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:border-gray-400 text-gray-700'
            }`}
          >
            <ListTodo className="w-4 h-4" />
            Task
          </button>
          <button
            type="button"
            onClick={() => setPostType('question')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
              postType === 'question'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:border-gray-400 text-gray-700'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            Question
          </button>
          <button
            type="button"
            onClick={() => setPostType('general')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${
              postType === 'general'
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : 'border-gray-300 hover:border-gray-400 text-gray-700'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            General
          </button>
        </div>
      </div>

      {(postType === 'task' || postType === 'question') && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <Users className="w-4 h-4" />
              Assign To
            </label>
            <input
              type="text"
              value={assignedUsername}
              onChange={(e) => setAssignedUsername(e.target.value)}
              placeholder="Enter username or type 'anyone'"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-600 mt-1">
              Type @username to assign to a specific user, or @anyone for open assignment. Points will be awarded based on admin settings.
            </p>
          </div>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        placeholder="Start a discussion... Use @ to mention users/leads, # for hashtags"
        rows={3}
        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
      />

      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="private-toggle"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor="private-toggle" className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <Lock className="w-4 h-4" />
            <span>Private discussion (only visible to mentioned users)</span>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setShowReminder(!showReminder)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          <span>{showReminder ? 'Hide' : 'Add'} Reminder</span>
          {showReminder ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showReminder && (
          <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <input
              type="datetime-local"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Creates a Google Calendar reminder
            </p>
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute left-4 right-4 bg-white border border-gray-300 rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.type}-${suggestion.id}`}
              type="button"
              onClick={() => selectSuggestion(suggestion.username)}
              className="w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors"
            >
              <span className="font-mono text-sm text-blue-600">@{suggestion.username}</span>
              <span className="text-gray-700">{suggestion.name}</span>
              <span className="ml-auto text-xs text-gray-500">
                {suggestion.type === 'user' ? 'User' : 'Lead'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end mt-2">
        <button
          type="submit"
          disabled={loading || !content.trim() || !postType}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Posting...' : 'Post'}
        </button>
      </div>
    </form>
  );
}
