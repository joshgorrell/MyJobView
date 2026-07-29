import { Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ManagerRepSelectorProps {
  selectedRepId: string | null;
  onSelectRep: (repId: string) => void;
  orgId: string;
}

interface RepOption {
  id: string;
  name: string;
}

export function ManagerRepSelector({ selectedRepId, onSelectRep, orgId }: ManagerRepSelectorProps) {
  const [reps, setReps] = useState<RepOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReps() {
      if (!orgId) {
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, full_name')
          .eq('organization_id', orgId)
          .eq('can_create_proposals', true)
          .order('first_name', { ascending: true });

        if (error) throw error;

        const repOptions = (data || []).map((r) => ({
          id: r.id,
          name: r.first_name && r.last_name
            ? `${r.first_name} ${r.last_name}`
            : r.full_name || 'Unknown',
        }));

        setReps(repOptions);

        if (!selectedRepId && repOptions.length > 0) {
          onSelectRep(repOptions[0].id);
        }
      } catch (err) {
        console.error('Failed to load reps:', err);
      } finally {
        setLoading(false);
      }
    }

    loadReps();
  }, [orgId, selectedRepId, onSelectRep]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 animate-pulse">
        <Users className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-400">Loading reps...</span>
      </div>
    );
  }

  if (reps.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
      <select
        value={selectedRepId || ''}
        onChange={(e) => onSelectRep(e.target.value)}
        className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
      >
        {reps.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name}
          </option>
        ))}
      </select>
    </div>
  );
}
