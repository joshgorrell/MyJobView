import { useState, useEffect } from 'react';
import { Plus, Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Adjustment {
  id: string;
  adjustment_number: string;
  warehouse_name: string;
  adjustment_date: string;
  reason: string;
  items_count: number;
  created_by_name: string;
}

export function StockAdjustments() {
  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdjustments();
  }, []);

  async function loadAdjustments() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('stock_adjustments')
        .select(`
          *,
          warehouses!inner (
            name
          ),
          profiles:created_by (
            full_name
          ),
          stock_adjustment_items (
            id
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedAdjustments = (data || []).map((adj: any) => ({
        id: adj.id,
        adjustment_number: adj.adjustment_number,
        warehouse_name: adj.warehouses.name,
        adjustment_date: adj.adjustment_date,
        reason: adj.reason,
        items_count: adj.stock_adjustment_items?.length || 0,
        created_by_name: adj.profiles?.full_name || 'Unknown',
      }));

      setAdjustments(formattedAdjustments);
    } catch (error) {
      console.error('Error loading adjustments:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-sm text-gray-600">Loading adjustments...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">Stock Adjustments</h2>
          <p className="text-gray-300">Correct inventory counts and track changes</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Adjustment
        </button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Adjustment #</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Warehouse</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Items</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">Created By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {adjustments.map((adj) => (
              <tr key={adj.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{adj.adjustment_number}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(adj.adjustment_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{adj.warehouse_name}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {adj.reason.replace('_', ' ')}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{adj.items_count}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{adj.created_by_name}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {adjustments.length === 0 && (
          <div className="text-center py-12">
            <Edit3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-300">No stock adjustments yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
