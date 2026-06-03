import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Phone, Clock, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';

interface ContactLogEntry {
  id: string;
  notes: string;
  logged_by_name: string;
  created_at: string;
}

interface ContactLogHistoryProps {
  workOrderId?: string;
  serviceRequestId?: string;
  refreshKey?: number;
}

export function ContactLogHistory({ workOrderId, serviceRequestId, refreshKey }: ContactLogHistoryProps) {
  const [entries, setEntries] = useState<ContactLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    loadEntries();
  }, [workOrderId, serviceRequestId, refreshKey]);

  async function loadEntries() {
    setLoading(true);
    try {
      let query = supabase
        .from('customer_contact_log')
        .select('id, notes, logged_by_name, created_at')
        .order('created_at', { ascending: false });

      if (workOrderId) {
        query = query.eq('work_order_id', workOrderId);
      } else if (serviceRequestId) {
        query = query.eq('service_request_id', serviceRequestId);
      } else {
        setEntries([]);
        setLoading(false);
        return;
      }

      const { data, error } = await query;
      if (error) throw error;
      setEntries(data || []);
    } catch (error) {
      console.error('Error loading contact log:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg p-3 border border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Clock className="w-4 h-4 animate-pulse" />
          Loading contact history...
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return null;
  }

  const latest = entries[0];
  const remaining = entries.slice(1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-3.5 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Phone className="w-4 h-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Contact History</span>
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
            {entries.length}
          </span>
        </div>
        {remaining.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {expanded ? (
              <>Hide older <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>+{remaining.length} more <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>

      <div className="divide-y divide-gray-100">
        <ContactLogEntryRow entry={latest} isLatest />
        {expanded && remaining.map((entry) => (
          <ContactLogEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ContactLogEntryRow({ entry, isLatest }: { entry: ContactLogEntry; isLatest?: boolean }) {
  return (
    <div className={`px-3.5 py-3 ${isLatest ? 'bg-white' : 'bg-gray-50/50'}`}>
      <div className="flex items-start gap-2.5">
        <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
          <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold text-gray-800">{entry.logged_by_name}</span>
            {isLatest && (
              <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full font-medium">
                Latest
              </span>
            )}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{entry.notes}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(entry.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
