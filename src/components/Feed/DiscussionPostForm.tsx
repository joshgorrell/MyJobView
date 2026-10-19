import { notify } from '../../lib/feedback';
import { useState, useEffect, useRef } from 'react';
import { Send, ListTodo, HelpCircle, MessageCircle, Calendar, ChevronDown, ChevronUp, Users, Lock, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { resolveMentions, parseHashtags } from '../../lib/username';
import { offlineSupabaseInsert } from '../../lib/offlineSupport';
import { FlowTarget } from '../../lib/flow/types';
import { insertFlowTag, useFlowTags } from '../Flow/useFlowTags';

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
  const [audience, setAudience] = useState<'company' | 'direct' | 'department'>('company');
  const [departmentId, setDepartmentId] = useState('');
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ type: 'user' | 'lead'; username: string; name: string; id: string }>>([]);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [route, setRoute] = useState<FlowTarget | null>(null);
  const [routeToken, setRouteToken] = useState('');
  const [highlight, setHighlight] = useState(0);
  const { tag, choices } = useFlowTags(content, cursorPosition, profile?.organization_id ?? undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!profile?.organization_id) return;
    void supabase.from('departments').select('id,display_name,name').eq('organization_id', profile.organization_id).eq('is_active', true).order('sort_order').then(({ data }) => {
      setDepartments((data || []).map((d: any) => ({ id: d.id, name: d.display_name || d.name })));
    });
  }, [profile?.organization_id]);

  useEffect(() => {
    const text = content.slice(0, cursorPosition);
    const match = text.match(/@(\w*)$/);

    if (match && !tag?.symbol?.includes('#')) {
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

  function chooseRoute(choice: FlowTarget) {
    if (!tag) return;
    const inserted = insertFlowTag(content, cursorPosition, tag.start, choice);
    setContent(inserted.text); setCursorPosition(inserted.cursor); setRoute(choice); setRouteToken(inserted.text.slice(tag.start, inserted.cursor).trim()); setHighlight(0);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(inserted.cursor, inserted.cursor); });
  }
  function handleTagKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const options = tag?.symbol === '#' ? choices.filter(c => c.kind !== 'person') : [];
    if (tag?.symbol === '@' && showSuggestions && suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectSuggestion(suggestions[Math.min(highlight, suggestions.length - 1)].username); setHighlight(0); }
      if (e.key === 'Escape') { e.preventDefault(); setShowSuggestions(false); }
      return;
    }
    if (tag?.symbol !== '#' || !options.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setHighlight(i => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); chooseRoute(options[Math.min(highlight, options.length - 1)] as FlowTarget); }
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
        is_private: audience !== 'company',
        audience_type: audience,
        audience_department_id: audience === 'department' ? departmentId : null,
        audience_user_ids: audience === 'direct' ? userMentions : [],
        contact_id: route?.kind === 'contact' ? route.id : null,
        project_id: route?.kind === 'project' ? route.id : null,
        work_order_id: route?.kind === 'work_order' ? route.id : null,
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

      setContent(''); setRoute(null); setRouteToken('');
      setPostType(null);
      setReminderDate('');
      setShowReminder(false);
      setAssignedUsername('');
      setAudience('company');
      setDepartmentId('');
      onSuccess();
    } catch (error) {
      console.error('Error creating post:', error);
      notify('Failed to create post. Please try again.', { theme: 'cyan', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="relative space-y-5 rounded-2xl bg-transparent p-2 text-slate-100 sm:p-4">
      <div className="mb-3">
        <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-slate-300">Message type <span className="text-rose-400">*</span></label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button type="button" aria-pressed={postType === 'task'} onClick={() => setPostType('task')}
            className={`relative flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${postType === 'task' ? 'border-blue-400 bg-blue-600/20 text-white ring-1 ring-blue-500' : 'border-slate-600 bg-slate-800/50 text-slate-200 hover:border-slate-400'}`}>
            <ListTodo className="h-6 w-6 shrink-0" />
            <span className="min-w-0"><strong className="block text-sm">Task</strong><small className="block text-xs text-slate-400">Assign work or next steps</small></span>
            {postType === 'task' && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-blue-300" />}
          </button>
          <button type="button" aria-pressed={postType === 'question'} onClick={() => setPostType('question')}
            className={`relative flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${postType === 'question' ? 'border-blue-400 bg-blue-600/20 text-white ring-1 ring-blue-500' : 'border-slate-600 bg-slate-800/50 text-slate-200 hover:border-slate-400'}`}>
            <HelpCircle className="h-6 w-6 shrink-0" />
            <span className="min-w-0"><strong className="block text-sm">Question</strong><small className="block text-xs text-slate-400">Get input or clarification</small></span>
            {postType === 'question' && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-blue-300" />}
          </button>
          <button type="button" aria-pressed={postType === 'general'} onClick={() => setPostType('general')}
            className={`relative flex min-h-[76px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${postType === 'general' ? 'border-blue-400 bg-blue-600/20 text-white ring-1 ring-blue-500' : 'border-slate-600 bg-slate-800/50 text-slate-200 hover:border-slate-400'}`}>
            <MessageCircle className="h-6 w-6 shrink-0" />
            <span className="min-w-0"><strong className="block text-sm">General</strong><small className="block text-xs text-slate-400">Share information</small></span>
            {postType === 'general' && <CheckCircle2 className="absolute right-2 top-2 h-4 w-4 text-blue-300" />}
          </button>
        </div>
      </div>

      {(postType === 'task' || postType === 'question') && (
        <div className="mb-3 p-3 bg-slate-800/70 border border-slate-600 rounded-lg space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1 flex items-center gap-1">
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
            <p className="text-xs text-slate-400 mt-1">
              Type @username to assign to a specific user, or @anyone for open assignment. Points will be awarded based on admin settings.
            </p>
          </div>
        </div>
      )}

      <label htmlFor="flow-message-content" className="block text-xs font-bold uppercase tracking-widest text-slate-300">Your message <span className="text-rose-400">*</span></label>
      <textarea
        id="flow-message-content"
        ref={textareaRef}
        value={content}
        onChange={(e) => { setContent(e.target.value); setCursorPosition(e.target.selectionStart); if (routeToken && !e.target.value.includes(routeToken)) { setRoute(null); setRouteToken(''); } setHighlight(0); }}
        onKeyDown={handleTagKey}
        onSelect={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        onClick={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        onKeyUp={(e) => setCursorPosition((e.target as HTMLTextAreaElement).selectionStart)}
        placeholder="Write your message… Use @ to mention someone or # to link a job."
        rows={5}
        maxLength={2000}
        className="w-full min-h-40 resize-y rounded-xl border border-slate-600 bg-slate-900/70 px-4 py-4 text-slate-100 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />

      <div className="-mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400"><span>@ Mention a person &nbsp; · &nbsp; # Link a job</span><span>{content.length}/2000</span></div>

      {tag?.symbol === '#' && <div className="flow flow-tag-results" role="listbox" aria-label="Matching customers and jobs">{choices.filter(c => c.kind !== 'person').map((choice, index) => <button type="button" role="option" aria-selected={index === highlight} key={`${choice.kind}:${choice.id}`} onClick={() => chooseRoute(choice as FlowTarget)}>{choice.label} · {choice.kind.replace('_', ' ')}</button>)}</div>}
      {route && <p className="text-sm text-blue-700 my-2">Posting to {route.label} <button type="button" onClick={() => { setRoute(null); setRouteToken(''); }}>Remove</button></p>}
      <div className="mt-3 space-y-2">
        <div className="space-y-3 rounded-xl border border-slate-600 bg-slate-800/60 p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-200"><Lock className="w-4 h-4" /> Recipients</label>
          <div className="flex gap-2 flex-wrap">
            <button type="button" onClick={() => setAudience('company')} className={`px-3 py-1.5 rounded-lg text-sm ${audience === 'company' ? 'bg-blue-600 text-white' : 'bg-slate-900/60 border border-slate-600 text-slate-200 hover:border-slate-400'}`}>@everyone</button>
            <button type="button" onClick={() => setAudience('direct')} className={`px-3 py-1.5 rounded-lg text-sm ${audience === 'direct' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}>@user(s)</button>
            <button type="button" onClick={() => setAudience('department')} className={`px-3 py-1.5 rounded-lg text-sm ${audience === 'department' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300'}`}>@department</button>
          </div>
          {audience === 'direct' && <p className="text-xs text-slate-400">Mention one or more teammates with @username. Only you and those users can see the message.</p>}
          {audience === 'department' && <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"><option value="">Choose department…</option>{departments.map(d => <option key={d.id} value={d.id}>@{d.name}</option>)}</select>}
          {audience === 'company' && <p className="text-xs text-slate-400">Visible to everyone in the company with Flow access.</p>}
        </div>

        <button
          type="button"
          onClick={() => setShowReminder(!showReminder)}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-gray-900 transition-colors"
        >
          <Calendar className="w-4 h-4" />
          <span>{showReminder ? 'Hide' : 'Add'} Reminder</span>
          {showReminder ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showReminder && (
          <div className="mt-2 rounded-xl border border-slate-600 bg-slate-800/60 p-3">
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
              className={`w-full px-4 py-2 text-left hover:bg-gray-100 flex items-center gap-2 transition-colors ${index === highlight ? 'bg-blue-50' : ''}`}
            >
              <span className="font-mono text-sm text-blue-600">@{suggestion.username}</span>
              <span className="text-slate-200">{suggestion.name}</span>
              <span className="ml-auto text-xs text-gray-500">
                {suggestion.type === 'user' ? 'User' : 'Lead'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-slate-700 pt-4">
        <button
          type="submit"
          disabled={loading || !content.trim() || !postType || (audience === 'department' && !departmentId)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}
