import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { notify } from '../../lib/feedback';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ContactDetail } from '../Contacts/ContactDetail';
import { ContactForm } from '../Contacts/ContactForm';
import { PipelineStageOverview } from './PipelineStageOverview';

interface PipelineBoardProps {
  onNavigate: (module: 'proposals' | 'sales_orders' | 'leads') => void;
  canViewLeads: boolean;
  canViewProposals: boolean;
  canViewSalesOrders: boolean;
}

export function PipelineBoard({ onNavigate, canViewLeads, canViewProposals, canViewSalesOrders }: PipelineBoardProps) {
  const { profile } = useAuth();
  const [viewMode, setViewMode] = useState<'my' | 'all'>('my');
  const [allPipelineUserId, setAllPipelineUserId] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [prospectRefresh, setProspectRefresh] = useState(0);
  const userId = profile?.id;
  const canViewAllPipeline = Boolean(userId && allPipelineUserId === userId);

  useEffect(() => {
    let active = true;
    if (userId) {
      void supabase.from('profiles').select('can_view_all_pipeline').eq('id', userId).maybeSingle()
        .then(({ data, error }) => {
          if (active) setAllPipelineUserId(!error && data?.can_view_all_pipeline === true ? userId : null);
        });
    }
    return () => { active = false; };
  }, [userId]);

  function refreshProspects() {
    setProspectRefresh(version => version + 1);
  }

  async function handleContactClick(contactId: string) {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          creator:profiles!contacts_created_by_fkey(id, full_name),
          assigned_rep:profiles!contacts_assigned_to_fkey(id, full_name),
          office:company_offices(id, office_name, city, state)
        `)
        .eq('id', contactId)
        .maybeSingle();

      if (error) {
        console.error('Query error:', error);
        throw error;
      }

      if (!data) {
        console.error('Contact not found');
        notify('Contact not found', { theme: 'violet', tone: 'error' });
        return;
      }

      setSelectedContact(data);
    } catch (error: any) {
      console.error('Error loading contact:', error);
      notify(`Failed to load contact: ${error.message || 'Unknown error'}`, { theme: 'violet', tone: 'error' });
    }
  }

  return (
    <div className="space-y-3">
      {canViewAllPipeline && (
        <select
          aria-label="Pipeline scope"
          value={viewMode}
          onChange={event => setViewMode(event.target.value === 'all' ? 'all' : 'my')}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-primary"
        >
          <option value="my">My Pipeline</option>
          <option value="all">All</option>
        </select>
      )}
      <PipelineStageOverview
        showAll={viewMode === 'all' && canViewAllPipeline}
        canViewLeads={canViewLeads}
        canViewProposals={canViewProposals}
        canViewSalesOrders={canViewSalesOrders}
        prospectRefresh={prospectRefresh}
        onOpenLeads={() => onNavigate('leads')}
        onOpenProposals={() => onNavigate('proposals')}
        onOpenSalesOrders={() => onNavigate('sales_orders')}
        onOpenProspect={handleContactClick}
        onAddProspect={() => setShowContactForm(true)}
      />
      {selectedContact && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-gray-50 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">Contact Details</h2>
              <button
                onClick={() => {
                  setSelectedContact(null);
                  refreshProspects();
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <ContactDetail
              contact={selectedContact}
              onBack={() => {
                setSelectedContact(null);
                refreshProspects();
              }}
              onConverted={() => {
                setSelectedContact(null);
                refreshProspects();
              }}
            />
          </div>
        </div>
      )}
      {showContactForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-full sm:max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">New Prospect</h2>
              <button
                onClick={() => setShowContactForm(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <ContactForm
                initialSalesStatus="prospect"
                onClose={() => setShowContactForm(false)}
                onSuccess={() => {
                  setShowContactForm(false);
                  refreshProspects();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
