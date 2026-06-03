import { useState, useEffect } from 'react';
import { Eye, EyeOff, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface TaskWatcher {
  id: string;
  task_id: string;
  user_id: string;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    username: string;
  };
}

interface TaskWatchersProps {
  taskId: string;
}

export function TaskWatchers({ taskId }: TaskWatchersProps) {
  const { profile } = useAuth();
  const [watchers, setWatchers] = useState<TaskWatcher[]>([]);
  const [isWatching, setIsWatching] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadWatchers();
    subscribeToWatchers();
  }, [taskId]);

  async function loadWatchers() {
    try {
      const { data, error } = await supabase
        .from('task_watchers')
        .select(`
          *,
          user:profiles!task_watchers_user_id_fkey(id, full_name, username)
        `)
        .eq('task_id', taskId);

      if (error) throw error;
      setWatchers(data || []);

      const watching = data?.some((w) => w.user_id === profile?.id) || false;
      setIsWatching(watching);
    } catch (error) {
      console.error('Error loading watchers:', error);
    }
  }

  function subscribeToWatchers() {
    const channel = supabase
      .channel(`task_watchers:${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'task_watchers',
          filter: `task_id=eq.${taskId}`,
        },
        () => {
          loadWatchers();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }

  async function toggleWatching() {
    if (!profile) return;

    setLoading(true);
    try {
      if (isWatching) {
        const { error } = await supabase
          .from('task_watchers')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', profile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('task_watchers')
          .insert({
            task_id: taskId,
            user_id: profile.id,
          });

        if (error) throw error;
      }

      loadWatchers();
    } catch (error: any) {
      console.error('Error toggling watch status:', error);
      alert('Failed to update watch status: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-400">
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">
            {watchers.length} {watchers.length === 1 ? 'Watcher' : 'Watchers'}
          </span>
        </div>

        <button
          onClick={toggleWatching}
          disabled={loading}
          className={`flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            isWatching
              ? 'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          } disabled:opacity-50`}
        >
          {isWatching ? (
            <>
              <Eye className="w-3 h-3" />
              Watching
            </>
          ) : (
            <>
              <EyeOff className="w-3 h-3" />
              Watch
            </>
          )}
        </button>
      </div>

      {watchers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {watchers.map((watcher) => (
            <div
              key={watcher.id}
              className="flex items-center gap-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-xs"
            >
              <span className="text-white font-medium">
                {watcher.user?.full_name || 'Unknown'}
              </span>
              <span className="text-gray-500">
                @{watcher.user?.username}
              </span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500">
        Watchers are automatically notified of comments and updates. You're added as a watcher when you create, are assigned to, comment on, or are mentioned in a task.
      </p>
    </div>
  );
}
