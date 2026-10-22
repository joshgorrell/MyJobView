import { Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface ManagerRepSelectorProps {
  selectedRepId: string | null;
  onSelectRep: (repId: string | null) => void;
  orgId: string;
  currentUserId?: string;
  currentUserIsSalesRep?: boolean;
}

interface RepOption {
  id: string;
  name: string;
}

export function ManagerRepSelector({ selectedRepId, onSelectRep, orgId, currentUserId, currentUserIsSalesRep = false }: ManagerRepSelectorProps) {
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
          .eq('is_sales_rep', true)
          .eq('is_active', true)
          .order('first_name', { ascending: true });

        if (error) throw error;

        const repOptions = (data || []).map((r) => ({
          id: r.id,
          name: r.first_name && r.last_name
            ? `${r.first_name} ${r.last_name}`
            : r.full_name || 'Unknown',
        }));

        setReps(repOptions);

      } catch (err) {
        console.error('Failed to load reps:', err);
      } finally {
        setLoading(false);
      }
    }

    loadReps();
  }, [orgId]);

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
        aria-label="Salesperson"
        value={selectedRepId ?? (currentUserIsSalesRep ? currentUserId ?? '' : '')}
        onChange={(e) => onSelectRep(e.target.value || null)}
        className="min-w-0 max-w-[190px] sm:max-w-none px-2 sm:px-3 py-2 rounded-lg border border-gray-600 bg-gray-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
      >
        {!currentUserIsSalesRep && <option value="">Select sales rep</option>}
        {reps.map((rep) => (
          <option key={rep.id} value={rep.id}>
            {rep.name}
          </option>
        ))}
      </select>
    </div>
  );
}
