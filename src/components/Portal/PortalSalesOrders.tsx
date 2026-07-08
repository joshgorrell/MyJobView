import { useState, useEffect } from 'react';
import { FileText, ArrowLeft, CheckCircle, Clock, ChevronRight, DollarSign, Layers, Receipt } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { PortalProposalDetail } from './PortalProposalDetail';
import { PortalSalesOrderBillingView } from './PortalSalesOrderBillingView';

interface SalesOrder {
  id: string;
  proposal_id: string | null;
  order_number: string;
  status: string;
  contract_total: number;
  payment_terms: string | null;
  notes: string | null;
  created_at: string;
  proposal: {
    title: string;
    proposal_number: string;
  } | null;
}

type DetailTab = 'scope' | 'billing';

interface PortalSalesOrdersProps {
  isEmbedded?: boolean;
}

export function PortalSalesOrders({ isEmbedded = false }: PortalSalesOrdersProps = {}) {
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('scope');

  useEffect(() => {
    loadSalesOrders();
  }, []);

  async function loadSalesOrders() {
    try {
      const impersonatingContactId = localStorage.getItem('admin_impersonating_contact');
      let contactId: string | null = null;

      if (impersonatingContactId) {
        contactId = impersonatingContactId;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('contact_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!profile?.contact_id) return;
        contactId = profile.contact_id;
      }

      if (!contactId) return;

      const { data, error } = await supabase
        .from('sales_orders')
        .select(`
          id,
          proposal_id,
          order_number,
          status,
          contract_total,
          payment_terms,
          notes,
          created_at,
          proposal:proposals!proposal_id(
            title,
            proposal_number
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders((data || []) as SalesOrder[]);
    } catch (error) {
      console.error('Error loading sales orders:', error);
    } finally {
      setLoading(false);
    }
  }

  function openOrder(order: SalesOrder) {
    setSelectedOrder(order);
    setActiveTab('scope');
  }

  function closeDetail() {
    setSelectedOrder(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  // Detail view
  if (selectedOrder) {
    const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
      { id: 'scope', label: 'Scope of Work', icon: <Layers className="w-4 h-4" /> },
      { id: 'billing', label: 'Billing', icon: <Receipt className="w-4 h-4" /> },
    ];

    return (
      <div>
        {/* Back + tab header */}
        <div className="mb-6">
          <button
            onClick={closeDetail}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Projects
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedOrder.order_number}</h2>
              {selectedOrder.proposal && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedOrder.proposal.title}</p>
              )}
            </div>
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
              <CheckCircle className="w-3.5 h-3.5" />
              Approved
            </span>
          </div>
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'scope' && selectedOrder.proposal_id ? (
          <PortalProposalDetail
            proposalId={selectedOrder.proposal_id}
            onBack={closeDetail}
            backLabel="Projects"
            overrideDisplayNumber={selectedOrder.order_number}
            hideExpiration={true}
          />
        ) : activeTab === 'scope' ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No scope document is linked to this project.</p>
          </div>
        ) : null}

        {activeTab === 'billing' && (
          <PortalSalesOrderBillingView
            salesOrderId={selectedOrder.id}
            contractTotal={selectedOrder.contract_total}
          />
        )}
      </div>
    );
  }

  const content = (
    <>
      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center">
          <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
          <p className="text-gray-600">
            Approved proposals will appear here once your project has been confirmed.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => openOrder(order)}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md hover:border-blue-200 transition-all relative group"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-green-500" />
              <div className="p-6 pl-7">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {order.order_number}
                      </h3>
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approved
                      </span>
                    </div>
                    {order.proposal && (
                      <p className="text-gray-600 mb-2">{order.proposal.title}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(order.created_at).toLocaleDateString()}
                      </span>
                      {order.proposal && (
                        <span className="text-gray-400">Proposal {order.proposal.proposal_number}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-left sm:text-right">
                      <p className="text-sm text-gray-500 flex items-center gap-1 sm:justify-end">
                        <DollarSign className="w-3.5 h-3.5" />
                        Contract Total
                      </p>
                      <p className="text-xl sm:text-2xl font-bold text-gray-900">
                        {formatCurrency(order.contract_total)}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                  </div>
                </div>

                {order.payment_terms && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium text-gray-700">Payment Terms: </span>
                      {order.payment_terms}
                    </p>
                  </div>
                )}

                {order.notes && (
                  <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-600">{order.notes}</p>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">Approved proposals and confirmed projects</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">My Projects</p>
              <p className="text-blue-300 text-xs">Approved proposals and confirmed projects</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {content}
      </main>
    </div>
  );
}
