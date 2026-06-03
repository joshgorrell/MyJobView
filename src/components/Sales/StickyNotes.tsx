import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { StickyNote, Plus, Pin, Archive, Trash2, MessageSquare, CheckSquare, X, Edit2 } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface StickyNote {
  id: string;
  user_id: string;
  content: string;
  color: 'yellow' | 'pink' | 'blue' | 'green' | 'orange';
  pinned: boolean;
  archived: boolean;
  converted_to_task_id: string | null;
  converted_to_discussion_id: string | null;
  created_at: string;
  updated_at: string;
  profiles?: {
    full_name: string | null;
    email: string;
  };
}

const colorClasses = {
  yellow: 'bg-yellow-100 border-yellow-300 hover:bg-yellow-50',
  pink: 'bg-pink-100 border-pink-300 hover:bg-pink-50',
  blue: 'bg-blue-100 border-blue-300 hover:bg-blue-50',
  green: 'bg-green-100 border-green-300 hover:bg-green-50',
  orange: 'bg-orange-100 border-orange-300 hover:bg-orange-50',
};

export default function StickyNotes() {
  const { user, profile } = useAuth();
  const [notes, setNotes] = useState<StickyNote[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newNote, setNewNote] = useState({ content: '', color: 'yellow' as const });
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (user) {
      loadNotes();
    }
  }, [user, showArchived, viewMode]);

  const loadNotes = async () => {
    try {
      let query = supabase
        .from('sticky_notes')
        .select(`
          *,
          profiles:user_id (
            full_name,
            email
          )
        `)
        .eq('archived', showArchived);

      // If not admin or viewing "my notes", filter by user
      if (!isAdmin || viewMode === 'my') {
        query = query.eq('user_id', user?.id);
      }

      const { data, error } = await query
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error loading notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNote = async () => {
    if (!newNote.content.trim()) return;

    try {
      const { error } = await supabase
        .from('sticky_notes')
        .insert({
          user_id: user?.id,
          content: newNote.content,
          color: newNote.color,
        });

      if (error) throw error;

      setNewNote({ content: '', color: 'yellow' });
      setIsCreating(false);
      loadNotes();
    } catch (error) {
      console.error('Error creating note:', error);
    }
  };

  const updateNote = async (id: string, updates: Partial<StickyNote>) => {
    try {
      const { error } = await supabase
        .from('sticky_notes')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      loadNotes();
    } catch (error) {
      console.error('Error updating note:', error);
    }
  };

  const deleteNote = async (id: string) => {
    setConfirmDeleteId(null);
    try {
      const { error } = await supabase
        .from('sticky_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      loadNotes();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const convertToTask = async (note: StickyNote) => {
    try {
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          title: note.content.substring(0, 100),
          description: note.content,
          created_by: user?.id,
          assigned_to: user?.id,
          status: 'pending',
          priority: 'medium',
        })
        .select()
        .single();

      if (taskError) throw taskError;

      await updateNote(note.id, {
        converted_to_task_id: task.id,
        archived: true
      });

      alert('Sticky note converted to task!');
    } catch (error) {
      console.error('Error converting to task:', error);
      alert('Failed to convert to task');
    }
  };

  const convertToDiscussion = async (note: StickyNote) => {
    try {
      const { data: post, error: postError } = await supabase
        .from('discussion_posts')
        .insert({
          user_id: user?.id,
          content: note.content,
          type: 'post',
        })
        .select()
        .single();

      if (postError) throw postError;

      await updateNote(note.id, {
        converted_to_discussion_id: post.id,
        archived: true
      });

      alert('Sticky note converted to discussion post!');
    } catch (error) {
      console.error('Error converting to discussion:', error);
      alert('Failed to convert to discussion');
    }
  };

  const startEdit = (note: StickyNote) => {
    setEditingNote(note.id);
    setEditContent(note.content);
  };

  const saveEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await updateNote(id, { content: editContent });
    setEditingNote(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading sticky notes...</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
              <StickyNote className="text-yellow-500" />
              {isAdmin && viewMode === 'all' ? 'All Sticky Notes' : 'My Sticky Notes'}
            </h1>
            <p className="text-gray-300 mt-1">Quick reminders and notes for yourself</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setViewMode(viewMode === 'my' ? 'all' : 'my')}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'all'
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                    : 'bg-gray-800 text-white hover:bg-gray-700'
                }`}
              >
                {viewMode === 'all' ? 'View My Notes' : 'View All Notes'}
              </button>
            )}
            <button
              onClick={() => setShowArchived(!showArchived)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                showArchived
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Archive className="w-4 h-4 inline mr-1" />
              {showArchived ? 'Show Active' : 'Show Archived'}
            </button>

            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Note</span>
            </button>
          </div>
        </div>
      </div>

      {/* New Note Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">New Sticky Note</h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <textarea
              value={newNote.content}
              onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              placeholder="What do you need to remember?"
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
              autoFocus
            />

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
              <div className="flex gap-2">
                {(['yellow', 'pink', 'blue', 'green', 'orange'] as const).map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewNote({ ...newNote, color })}
                    className={`w-10 h-10 rounded-lg border-2 transition-all ${
                      newNote.color === color ? 'border-gray-800 scale-110' : 'border-gray-300'
                    } ${colorClasses[color]}`}
                  />
                ))}
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setIsCreating(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createNote}
                disabled={!newNote.content.trim()}
                className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes Grid */}
      {notes.length === 0 ? (
        <div className="text-center py-12">
          <StickyNote className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">
            {showArchived ? 'No archived notes' : 'No sticky notes yet'}
          </p>
          {!showArchived && (
            <button
              onClick={() => setIsCreating(true)}
              className="text-yellow-600 hover:text-yellow-700 font-medium"
            >
              Create your first note
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`relative p-4 rounded-lg border-2 shadow-md transition-all ${colorClasses[note.color]} ${
                note.pinned ? 'ring-2 ring-yellow-500' : ''
              }`}
              style={{ minHeight: '150px' }}
            >
              {/* Pin indicator */}
              {note.pinned && (
                <Pin className="absolute top-2 right-2 w-4 h-4 text-yellow-600 fill-yellow-600" />
              )}

              {/* Owner name for admin view */}
              {isAdmin && viewMode === 'all' && note.profiles && (
                <div className="mb-2 pb-2 border-b border-gray-400">
                  <span className="text-xs font-medium text-gray-700">
                    {note.profiles.full_name || note.profiles.email}
                  </span>
                </div>
              )}

              {/* Content */}
              {editingNote === note.id ? (
                <div className="mb-2">
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-24 px-2 py-1 bg-white bg-opacity-50 border border-gray-300 rounded resize-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => saveEdit(note.id)}
                      className="flex-1 px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingNote(null)}
                      className="flex-1 px-2 py-1 bg-gray-500 text-white text-xs rounded hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-800 whitespace-pre-wrap break-words mb-4">
                  {note.content}
                </p>
              )}

              {/* Actions */}
              <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
                {!note.archived && !note.converted_to_task_id && !note.converted_to_discussion_id && (
                  <>
                    {/* Show edit/conversion buttons only for own notes or if admin */}
                    {(note.user_id === user?.id || isAdmin) && (
                      <button
                        onClick={() => startEdit(note)}
                        className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    )}

                    {note.user_id === user?.id && (
                      <>
                        <button
                          onClick={() => updateNote(note.id, { pinned: !note.pinned })}
                          className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all"
                          title={note.pinned ? 'Unpin' : 'Pin'}
                        >
                          <Pin className={`w-3.5 h-3.5 ${note.pinned ? 'text-yellow-600 fill-yellow-600' : 'text-gray-600'}`} />
                        </button>

                        <button
                          onClick={() => convertToTask(note)}
                          className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all"
                          title="Convert to Task"
                        >
                          <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                        </button>

                        <button
                          onClick={() => convertToDiscussion(note)}
                          className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all"
                          title="Convert to Discussion"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                        </button>
                      </>
                    )}

                    {/* Archive button for own notes or admin */}
                    {(note.user_id === user?.id || isAdmin) && (
                      <button
                        onClick={() => updateNote(note.id, { archived: true })}
                        className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all"
                        title={isAdmin && note.user_id !== user?.id ? 'Deactivate (Admin)' : 'Archive'}
                      >
                        <Archive className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                    )}
                  </>
                )}

                {note.archived && (note.user_id === user?.id || isAdmin) && (
                  <button
                    onClick={() => updateNote(note.id, { archived: false })}
                    className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all text-xs"
                    title="Unarchive"
                  >
                    Restore
                  </button>
                )}

                {/* Delete button for own notes or admin */}
                {(note.user_id === user?.id || isAdmin) && (
                  <button
                    onClick={() => setConfirmDeleteId(note.id)}
                    className="p-1.5 bg-white bg-opacity-70 rounded hover:bg-opacity-100 transition-all ml-auto"
                    title={isAdmin && note.user_id !== user?.id ? 'Delete (Admin)' : 'Delete'}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                  </button>
                )}
              </div>

              {/* Conversion badge */}
              {(note.converted_to_task_id || note.converted_to_discussion_id) && (
                <div className="absolute top-2 left-2">
                  <span className="text-xs px-2 py-0.5 bg-white bg-opacity-80 rounded-full text-gray-600">
                    Converted
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Sticky Note"
        message="Delete this sticky note? This cannot be undone."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => { const id = confirmDeleteId; setConfirmDeleteId(null); id && deleteNote(id); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
