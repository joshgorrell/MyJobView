import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { History, ChevronLeft, ChevronRight } from 'lucide-react';

interface TaxSnapshot {
  id: string;
  transaction_type: string;
  state: string;
  environment: string | null;
  project_type: string | null;
  taxable_subtotal: number | null;
  sales_tax: number | null;
  calculated_at: string;
  tax_calculation_status: string | null;
  collection_status: string | null;
}

const PAGE_SIZE = 20;

export default function SalesTaxHistory() {
  const [snapshots, setSnapshots] = useState<TaxSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    loadSnapshots();
  }, [page]);

  async function loadSnapshots() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      const orgId = profileData?.organization_id;
      if (!orgId) {
        setLoading(false);
        return;
      }

      const [dataRes, countRes] = await Promise.all([
        supabase
          .from('tax_snapshots')
          .select('id, transaction_type, state, environment, project_type, taxable_subtotal, sales_tax, calculated_at, tax_calculation_status, collection_status')
          .eq('organization_id', orgId)
          .order('calculated_at', { ascending: false })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
        supabase
          .from('tax_snapshots')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId),
      ]);

      if (dataRes.error) throw dataRes.error;
      setSnapshots(dataRes.data || []);
      setTotal(countRes.count || 0);
    } catch (error) {
      console.error('Error loading tax history:', error);
    } finally {
      setLoading(false);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <History className="w-5 h-5 text-gray-600" />
          Tax Calculation History
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Recent sales tax calculations across proposals and invoices
        </p>
      </div>

      {snapshots.length === 0 ? (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-12 text-center">
          <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No tax calculation history yet.</p>
          <p className="text-sm text-gray-400 mt-1">
            Tax snapshots are created automatically when proposals and invoices are calculated.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">State</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Environment</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project Type</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Amount</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sales Tax</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {snapshots.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(s.calculated_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 capitalize">
                        {s.transaction_type?.replace(/_/g, ' ') || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{s.state || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
                        {s.environment || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {s.project_type ? s.project_type.replace(/_/g, ' ') : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {s.taxable_subtotal != null
                          ? `$${Number(s.taxable_subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                        {s.sales_tax != null
                          ? `$${Number(s.sales_tax).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3">
                        {s.tax_calculation_status ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.tax_calculation_status === 'calculated'
                              ? 'bg-green-100 text-green-800'
                              : s.tax_calculation_status === 'review'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {s.tax_calculation_status.replace(/_/g, ' ')}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
