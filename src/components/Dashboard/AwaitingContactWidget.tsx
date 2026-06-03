import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Phone, AlertTriangle, ChevronDown, ChevronUp, Clock, MapPin } from 'lucide-react';
import { ContactLogModal } from '../Shared/ContactLogModal';
import { NO_CONTACT_UPDATED_EVENT } from '../../hooks/useNoContactCount';

interface AwaitingItem {
  id: string;
  customer_name: string;
  created_at: string;
  priority: string;
  job_location_city: string | null;
  work_order_id: string | null;
}

interface AwaitingContactWidgetProps {
  onNavigate?: (tab: string) => void;
}

function getDaysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000));
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case 'emergency': return 'text-red-700 bg-red-50 border-red-200';
    case 'urgent': return 'text-orange-700 bg-orange-50 border-orange-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function AwaitingContactWidget({ onNavigate }: AwaitingContactWidgetProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<AwaitingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [contactLogTarget, setContactLogTarget] = useState<AwaitingItem | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (profile) loadItems();
  }, [profile, refreshKey]);

  useEffect(() => {
    const handleUpdate = () => setRefreshKey(k => k + 1);
    window.addEventListener(NO_CONTACT_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(NO_CONTACT_UPDATED_EVENT, handleUpdate);
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data: loggedIds } = await supabase
        .from('customer_contact_log')
        .select('service_request_id')
        .not('service_request_id', 'is', null);

      const contactedIds = (loggedIds || [])
        .map((r: { service_request_id: string }) => r.service_request_id)
        .filter(Boolean) as string[];

      let query = supabase
        .from('service_requests')
        .select('id, customer_name, created_at, priority, job_location_city, work_order_id')
        .not('status', 'in', '("completed","cancelled","closed")')
        .lt('created_at', cutoff)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(20);

      if (contactedIds.length > 0) {
        query = query.not('id', 'in', `(${contactedIds.map(id => `"${id}"`).join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading awaiting contact items:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading || items.length === 0) return null;

  const visibleItems = expanded ? items : items.slice(0, 3);

  return (
    <>
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-300 flex items-center justify-center">
              <Phone className="w-4.5 h-4.5 text-amber-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-amber-900">Awaiting First Contact</h3>
                <span className="flex items-center justify-center min-w-[22px] h-5 px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                  {items.length > 99 ? '99+' : items.length}
                </span>
              </div>
              <p className="text-xs text-amber-700 mt-0.5">Service requests open 24+ hours with no contact logged</p>
            </div>
          </div>
          {onNavigate && (
            <button
              onClick={() => onNavigate('service_requests')}
              className="text-xs text-amber-700 hover:text-amber-900 font-medium underline underline-offset-2"
            >
              View all
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-100">
          {visibleItems.map((item) => {
            const days = getDaysAgo(item.created_at);
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900 truncate">{item.customer_name}</span>
                    {(item.priority === 'emergency' || item.priority === 'urgent') && (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${getPriorityColor(item.priority)}`}>
                        <AlertTriangle className="w-3 h-3" />
                        {item.priority.charAt(0).toUpperCase() + item.priority.slice(1)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {days === 0 ? 'Today' : days === 1 ? '1 day ago' : `${days} days ago`}
                    </span>
                    {item.job_location_city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {item.job_location_city}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setContactLogTarget(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Log Contact
                </button>
              </div>
            );
          })}
        </div>

        {items.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-50 border-t border-gray-100 transition-colors"
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-3.5 h-3.5" /></>
            ) : (
              <>Show {items.length - 3} more <ChevronDown className="w-3.5 h-3.5" /></>
            )}
          </button>
        )}
      </div>

      {contactLogTarget && (
        <ContactLogModal
          serviceRequestId={contactLogTarget.id}
          workOrderId={contactLogTarget.work_order_id ?? undefined}
          customerName={contactLogTarget.customer_name}
          onClose={() => setContactLogTarget(null)}
          onSaved={() => {
            setContactLogTarget(null);
            setRefreshKey(k => k + 1);
          }}
        />
      )}
    </>
  );
}
