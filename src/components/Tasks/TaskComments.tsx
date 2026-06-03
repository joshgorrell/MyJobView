import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Edit2, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { formatDistanceToNow } from '../../lib/utils';
import ConfirmModal from '../ui/ConfirmModal';

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    full_name: string;
    username: string;
  };
}

interface Profile {
  id: string;
  full_name: string;
  username: string;
}

interface TaskCommentsProps {
  taskId: string;
}

export function TaskComments({ taskId }: TaskCommentsProps) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionUsers, setMentionUsers] = useState<Profile[]>([]);
  const [mentionPosition, setMentionPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
    subscribeToComments();
  }, [taskId]);

  async function loadComments() {
    try {
      const { data, error } = await supabase
        .from('task_comments')
        .select(`
          *,
          user:profiles!task_comments_user_id_fkey(id, full_name, username)
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  }

  function subscribeToComments() {
    const channel = supabase
      .channel(`task_comments:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_comments',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          loadComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function loadMentionUsers(search: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('is_active', true)
        .ilike('username', `%${search}%`)
        .limit(5);

      if (error) throw error;
      setMentionUsers(data || []);
    } catch (error) {
      console.error('Error loading users for mentions:', error);
    }
  }

  function handleCommentChange(value: string) {
    setNewComment(value);

    const cursorPosition = textareaRef.current?.selectionStart || 0;
    const textBeforeCursor = value.substring(0, cursorPosition);
    const mentionMatch = textBeforeCursor.match(/@([a-zA-Z0-9_]*)$/);

    if (mentionMatch) {
      const search = mentionMatch[1];
      setMentionSearch(search);
      setMentionPosition(cursorPosition);
      setShowMentions(true);
      loadMentionUsers(search);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(username: string) {
    const before = newComment.substring(0, mentionPosition - mentionSearch.length - 1);
    const after = newComment.substring(mentionPosition);
    const newValue = `${before}@${username} ${after}`;
    setNewComment(newValue);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !newComment.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('task_comments')
        .insert({
          task_id: taskId,
          user_id: profile.id,
          content: newComment.trim(),
        });

      if (error) throw error;

      setNewComment('');
      loadComments();
    } catch (error: any) {
      console.error('Error posting comment:', error);
      alert('Failed to post comment: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateComment(commentId: string) {
    if (!editContent.trim()) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('task_comments')
        .update({ content: editContent.trim() })
        .eq('id', commentId);

      if (error) throw error;

      setEditingComment(null);
      setEditContent('');
      loadComments();
    } catch (error: any) {
      console.error('Error updating comment:', error);
      alert('Failed to update comment: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteComment(commentId: string) {
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase
        .from('task_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      loadComments();
    } catch (error: any) {
      console.error('Error deleting comment:', error);
    }
  }

  function startEditing(comment: TaskComment) {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  }

  function renderCommentContent(content: string) {
    const parts = content.split(/(@[a-zA-Z0-9_]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('@')) {
        return (
          <span key={index} className="text-cyan-400 font-medium">
            {part}
          </span>
        );
      }
      return <span key={index}>{part}</span>;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-gray-400 mb-3">
        <MessageSquare className="w-4 h-4" />
        <span className="text-sm font-medium">
          {comments.length} {comments.length === 1 ? 'Comment' : 'Comments'}
        </span>
      </div>

      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white text-sm">
                  {comment.user?.full_name || 'Unknown User'}
                </span>
                <span className="text-xs text-gray-500">
                  @{comment.user?.username}
                </span>
                <span className="text-xs text-gray-500">
                  {formatDistanceToNow(comment.created_at)}
                </span>
                {comment.updated_at !== comment.created_at && (
                  <span className="text-xs text-gray-500">(edited)</span>
                )}
              </div>

              {comment.user_id === profile?.id && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEditing(comment)}
                    className="p-1 text-gray-400 hover:text-cyan-400 transition-colors"
                    title="Edit comment"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(comment.id)}
                    className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            {editingComment === comment.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateComment(comment.id)}
                    disabled={loading || !editContent.trim()}
                    className="px-3 py-1 bg-cyan-600 text-white text-sm rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setEditingComment(null);
                      setEditContent('');
                    }}
                    className="px-3 py-1 bg-gray-700 text-white text-sm rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-300 whitespace-pre-wrap">
                {renderCommentContent(comment.content)}
              </p>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmitComment} className="relative">
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => handleCommentChange(e.target.value)}
            placeholder="Add a comment... Use @username to mention someone"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 text-white text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none pr-12"
            rows={3}
          />

          {showMentions && mentionUsers.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-full bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-40 overflow-y-auto z-10">
              {mentionUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => insertMention(user.username)}
                  className="w-full px-3 py-2 text-left hover:bg-gray-700 transition-colors flex items-center gap-2"
                >
                  <span className="text-sm text-white font-medium">
                    {user.full_name}
                  </span>
                  <span className="text-xs text-gray-400">
                    @{user.username}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !newComment.trim()}
            className="absolute right-2 bottom-2 p-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Post comment"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-1">
          Tip: Type @ to mention a team member. They'll be notified and added as a watcher.
        </p>
      </form>

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Comment"
        message="Delete this comment? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => confirmDeleteId && handleDeleteComment(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
