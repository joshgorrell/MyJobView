import { supabase } from '../../lib/supabase';
import { parseHashtags, resolveMentions } from '../../lib/username';
import { FlowScope } from '../../lib/flow/types';
import { EnrichedThread, Message } from './conversationTypes';

interface Post {
  id: string;
  parent_id: string | null;
  content: string;
  post_type: string;
  user_id: string;
  created_at: string;
  audience_type: 'direct' | 'department' | 'company' | null;
  audience_user_ids: string[];
  audience_department_id: string | null;
  is_private: boolean;
  profiles: { full_name: string } | null;
}
const POST_COLUMNS = 'id,parent_id,content,post_type,user_id,created_at,audience_type,audience_user_ids,audience_department_id,is_private,profiles!discussion_posts_user_id_fkey(full_name)';

// Every query uses the signed-in client and existing audience RLS. Fetch in pages
// and batches so a busy conversation or inbox does not silently lose older rows.
async function pages<T>(query: () => any): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error) throw error;
    result.push(...(data || []));
    if ((data || []).length < 500) return result;
  }
}
async function batches<T>(ids: (string | number)[], query: (batch: any[]) => any): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    result.push(...await pages<T>(() => query(batch)));
  }
  return result;
}
async function unreadState(organizationId: string, userId: string, ids: string[]) {
  const events = await batches<{ id: number; source_id: string }>(ids, batch => supabase.from('flow_events')
    .select('id,source_id').eq('organization_id', organizationId).eq('source_table', 'discussion_posts').in('source_id', batch).order('id'));
  const views = await batches<{ event_id: number }>(events.map(e => e.id), batch => supabase.from('flow_event_views')
    .select('event_id').eq('user_id', userId).in('event_id', batch).order('event_id'));
  const viewed = new Set(views.map(v => v.event_id));
  return new Set(events.filter(e => !viewed.has(e.id)).map(e => e.source_id));
}

export async function loadCoworkerThreads(organizationId: string, userId: string, scope: FlowScope): Promise<EnrichedThread[]> {
  let scopedRoots: string[] | null = null;
  if (scope.contactId || scope.projectId || scope.workOrderId) {
    // Flow events carry normalized customer/project/work-order links even when
    // the original post was routed to just one of those records.
    const events = await pages<{ source_id: string }>(() => {
      let query = supabase.from('flow_events').select('source_id').eq('organization_id', organizationId).eq('source_table', 'discussion_posts').order('id');
      if (scope.contactId) query = query.eq('contact_id', scope.contactId);
      if (scope.projectId) query = query.eq('project_id', scope.projectId);
      if (scope.workOrderId) query = query.eq('work_order_id', scope.workOrderId);
      return query;
    });
    const linked = await batches<Post>([...new Set(events.map(e => e.source_id))], ids => supabase.from('discussion_posts')
      .select(POST_COLUMNS).eq('organization_id', organizationId).in('id', ids).order('id'));
    scopedRoots = [...new Set(linked.map(p => p.parent_id || p.id))];
  }
  const roots = scopedRoots === null
    ? await pages<Post>(() => supabase.from('discussion_posts').select(POST_COLUMNS).eq('organization_id', organizationId).is('parent_id', null).order('created_at').order('id'))
    : await batches<Post>(scopedRoots, ids => supabase.from('discussion_posts').select(POST_COLUMNS).eq('organization_id', organizationId).is('parent_id', null).in('id', ids).order('id'));
  if (!roots.length) return [];
  const replies = await batches<Post>(roots.map(p => p.id), ids => supabase.from('discussion_posts').select(POST_COLUMNS)
    .eq('organization_id', organizationId).in('parent_id', ids).order('created_at').order('id'));
  const all = [...roots, ...replies];
  const unread = await unreadState(organizationId, userId, all.map(p => p.id));
  const people = await batches<{ id: string; full_name: string }>([...new Set(roots.flatMap(p => [p.user_id, ...(p.audience_user_ids || [])]))], ids => supabase.from('profiles')
    .select('id,full_name').eq('organization_id', organizationId).in('id', ids).order('id'));
  const names = new Map(people.map(p => [p.id, p.full_name]));
  const departments = await batches<{ id: string; display_name: string }>([...new Set(roots.map(p => p.audience_department_id).filter((id): id is string => !!id))], ids => supabase.from('departments')
    .select('id,display_name').eq('organization_id', organizationId).in('id', ids).order('id'));
  const departmentNames = new Map(departments.map(d => [d.id, d.display_name]));
  const byRoot = new Map<string, Post[]>();
  replies.forEach(p => { const list = byRoot.get(p.parent_id!) || []; list.push(p); byRoot.set(p.parent_id!, list); });
  return roots.map(root => {
    const history = [root, ...(byRoot.get(root.id) || [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = history[history.length - 1];
    const audience = root.audience_type || (root.is_private ? 'direct' : 'company');
    const recipients = [...new Set([root.user_id, ...(root.audience_user_ids || [])])].filter(id => id !== userId).map(id => names.get(id) || 'Teammate');
    return {
      source: 'coworker', discussion_type: root.post_type, id: root.id, subject: root.content.split('\n')[0].slice(0, 80),
      audience_label: audience === 'direct' ? 'Direct' : audience === 'department' ? 'Department' : 'Company',
      related_context_name: audience === 'department' ? departmentNames.get(root.audience_department_id!) || 'Department' : audience === 'company' ? 'Everyone' : recipients.join(', ') || 'You',
      context_type: 'coworker', context_id: null, proposal_id: null, visibility: 'internal',
      created_by: root.user_id, last_message_at: last.created_at, assigned_sales_rep_id: null, organization_id: organizationId, contact_id: null,
      message_count: history.length, last_message_preview: `${last.profiles?.full_name || 'Teammate'}: ${last.content}`,
      last_message_author_type: 'staff', contact_name: '', proposal_number: '', proposal_title: '', proposal_status: '', rep_name: '',
      unread_count: history.filter(p => p.user_id !== userId && unread.has(p.id)).length,
      last_rep_response_at: null, context_label: null, attachment_url: null, attachment_type: null,
    };
  });
}

export async function loadCoworkerMessages(organizationId: string, userId: string, rootId: string): Promise<Message[]> {
  const { data: root, error } = await supabase.from('discussion_posts').select(POST_COLUMNS).eq('organization_id', organizationId).eq('id', rootId).is('parent_id', null).maybeSingle();
  if (error) throw error;
  if (!root) throw new Error('This conversation is unavailable or you do not have access.');
  const replies = await pages<Post>(() => supabase.from('discussion_posts').select(POST_COLUMNS).eq('organization_id', organizationId).eq('parent_id', rootId).order('created_at').order('id'));
  const history = [root as unknown as Post, ...replies].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const unread = await unreadState(organizationId, userId, history.map(p => p.id));
  return history.map(p => ({ id: p.id, thread_id: rootId, author_id: p.user_id, author_name: p.profiles?.full_name || 'Teammate', author_type: 'staff', body: p.content,
    is_read: !unread.has(p.id), is_internal: true, created_at: p.created_at, context_room_id: null, context_line_item_id: null, context_label: null, attachment_url: null, attachment_type: null }));
}

export async function markCoworkerMessagesRead(organizationId: string, userId: string, ids: string[]) {
  const events = await batches<{ id: number }>(ids, batch => supabase.from('flow_events').select('id').eq('organization_id', organizationId).eq('source_table', 'discussion_posts').in('source_id', batch).order('id'));
  for (let offset = 0; offset < events.length; offset += 100) {
    const { error } = await supabase.from('flow_event_views').upsert(events.slice(offset, offset + 100).map(e => ({ event_id: e.id, user_id: userId })), { onConflict: 'user_id,event_id', ignoreDuplicates: true });
    if (error) throw error;
  }
  window.dispatchEvent(new Event('flow-views-changed'));
}

export async function sendCoworkerReply(organizationId: string, userId: string, rootId: string, content: string) {
  // The database inherits the parent's audience and destination. Mentions notify
  // participants; they never add a new recipient to a private conversation.
  const { userMentions, leadMentions } = await resolveMentions(content, supabase);
  const { error } = await supabase.from('discussion_posts').insert({ organization_id: organizationId, user_id: userId, parent_id: rootId, content, post_type: 'general', mentions: [...userMentions, ...leadMentions], hashtags: parseHashtags(content) });
  if (error) throw error;
}
