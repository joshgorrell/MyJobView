import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, DollarSign, Calendar, Plus } from 'lucide-react';

interface ProjectInvoicesProps {
  projectId: string;
}

export default function ProjectInvoices({ projectId }: ProjectInvoicesProps) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInvoices();
  }, [projectId]);

  async function loadInvoices() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('project_id', projectId)
        .order('invoice_date', { ascending: false });

      if (error) throw error;

      setInvoices(data || []);
    } catch (error) {
      console.error('Error loading invoices:', error);
    } finally {
      setLoading(false);
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'partial':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'overdue':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'sent':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-400">Loading invoices...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Invoices</h2>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg">
            <Plus size={18} />
            Create Invoice
          </button>
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No invoices created yet
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-lg font-semibold text-white">
                        Invoice #{invoice.invoice_number}
                      </h3>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium border ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-1">
                        <Calendar size={14} />
                        <span>
                          {new Date(invoice.invoice_date).toLocaleDateString()}
                        </span>
                      </div>
                      {invoice.due_date && (
                        <div className="flex items-center gap-1">
                          <span>Due:</span>
                          <span>
                            {new Date(invoice.due_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm text-gray-400 mb-1">Total</div>
                    <div className="text-2xl font-bold text-white">
                      ${invoice.total?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                </div>

                {/* Payment Details */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-700">
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Subtotal</div>
                    <div className="text-sm text-white font-semibold">
                      ${invoice.subtotal?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Paid</div>
                    <div className="text-sm text-green-400 font-semibold">
                      ${invoice.amount_paid?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-400 mb-1">Due</div>
                    <div className="text-sm text-yellow-400 font-semibold">
                      ${invoice.amount_due?.toFixed(2) || '0.00'}
                    </div>
                  </div>
                </div>

                {invoice.notes && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-sm text-gray-400">{invoice.notes}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
