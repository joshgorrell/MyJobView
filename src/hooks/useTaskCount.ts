import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useTaskCount() {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }

    const loadCount = async () => {
      try {
        const { count: tasksCount, error: tasksError } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .or(`user_id.eq.${profile.id},assigned_to.eq.${profile.id}`)
          .neq('status', 'completed');

        if (tasksError) {
          console.error('Tasks count error:', tasksError);
        }

        let discussionCount = 0;
        try {
          const { count, error: discussionError } = await supabase
            .from('discussion_posts')
            .select('id', { count: 'exact', head: true })
            .eq('post_type', 'task')
            .is('parent_id', null)
            .eq('is_completed', false)
            .or(`user_id.eq.${profile.id},assigned_to.eq.${profile.id}`);

          if (discussionError) {
            console.error('Discussion posts count error:', discussionError);
          } else {
            discussionCount = count || 0;
          }
        } catch (err) {
          console.error('Discussion posts query failed:', err);
        }

        setCount((tasksCount || 0) + discussionCount);
      } catch (error) {
        console.error('Error loading task count:', error);
        setCount(0);
      }
    };

    loadCount();

    const channel = supabase
      .channel(`task_count_changes:${profile.id}:${Math.random()}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tasks',
      }, loadCount)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'discussion_posts',
      }, loadCount)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

  return count;
}
