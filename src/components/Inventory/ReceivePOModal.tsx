import { useEffect, useState, useRef } from 'react';
import { AlertCircle, CheckCircle2, Package, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ReceivePOModalProps {
  poId: string;
  poNumber: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ReceiveItem {
  id: string;
  product_id: string | null;
  product_name: string;
  model_number: string | null;
  job_reference: string | null;
  ordered: number;
  previouslyReceived: number;
  receiveNow: number;
}

export function ReceivePOModal({ poId, poNumber, onClose, onSuccess }: ReceivePOModalProps) {
  const retry=useRef(crypto.randomUUID());
  const [items, setItems] = useState<ReceiveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadItems();
  }, [poId]);

  async function loadItems() {
    setLoading(true); setError('');
    const { data, error: queryError } = await supabase
      .from('purchase_orders')
      .select('warehouse_id, po_items(id, product_id, product_name, model_number, job_reference, quantity, quantity_received)')
      .eq('id', poId)
      .maybeSingle();
    if (queryError || !data) {
      setError('The purchase order could not be loaded.');
    } else {
      setItems((data.po_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        model_number: item.model_number,
        job_reference:item.job_reference,
        ordered: Number(item.quantity || 0),
        previouslyReceived: Number(item.quantity_received || 0),
        receiveNow: 0,
      })));
    }
    setLoading(false);
  }

  function updateQuantity(id: string, value: number) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, receiveNow: Math.max(0, value) } : item));
  }

  async function receiveItems() {
    const receiving = items.filter((item) => item.receiveNow > 0);
    if (receiving.length === 0) { setError('Enter at least one quantity to receive.'); return; }
    setSaving(true); setError('');
    try {
      const {error}=await supabase.rpc('receive_purchase_document',{p_po_id:poId,p_lines:receiving.map(i=>({id:i.id,quantity:i.receiveNow})),p_retry:retry.current});
      if(error)throw error;
      onSuccess();
    } catch (saveError) {
      console.error('Error receiving purchase order:', saveError);
      setError('Receipt was not saved. Review the quantities and try again.');
    } finally { setSaving(false); }
  }

  return <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"><div className="flex items-center justify-between p-5 border-b border-gray-200"><div><h2 className="text-xl font-bold text-gray-900">Receive Items</h2><p className="text-sm text-gray-500 mt-1">{poNumber}</p></div><button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-5 h-5" /></button></div><div className="p-5">{error && <div className="flex gap-2 items-start p-3 mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}{loading ? <div className="py-12 text-center text-gray-500">Loading items...</div> : items.length === 0 ? <div className="py-12 text-center text-gray-500"><Package className="w-10 h-10 mx-auto mb-2 text-gray-300" />No items were found on this purchase order.</div> : <><div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">Receive quantities against each job line. Partial shipments keep the remaining quantities open.</div><div className="border border-gray-200 rounded-lg overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 border-b border-gray-200"><tr><th className="px-4 py-3 text-left font-medium text-gray-600">Item</th><th className="px-4 py-3 text-center font-medium text-gray-600">Ordered</th><th className="px-4 py-3 text-center font-medium text-gray-600">Received</th><th className="px-4 py-3 text-center font-medium text-gray-600">Receive now</th></tr></thead><tbody className="divide-y divide-gray-100">{items.map((item) => <tr key={item.id}><td className="px-4 py-3"><p className="font-medium text-gray-900">{item.product_name}</p><p className="text-xs text-blue-700">{item.job_reference || 'Stock'}</p>{item.model_number && <p className="text-xs text-gray-500">{item.model_number}</p>}</td><td className="px-4 py-3 text-center text-gray-600">{item.ordered}</td><td className="px-4 py-3 text-center text-gray-600">{item.previouslyReceived}</td><td className="px-4 py-3"><input type="number" min="0" max={item.ordered-item.previouslyReceived} step="1" value={item.receiveNow} onChange={(event) => updateQuantity(item.id, Number(event.target.value) || 0)} className="w-24 mx-auto block px-2 py-1.5 border border-gray-300 rounded-lg text-center focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></td></tr>)}</tbody></table></div></>}</div><div className="flex justify-end gap-3 p-5 border-t border-gray-200"><button onClick={onClose} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium">Cancel</button><button onClick={() => void receiveItems()} disabled={loading || saving || items.length === 0} className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"><CheckCircle2 className="w-4 h-4" />{saving ? 'Saving...' : 'Receive Items'}</button></div></div></div>;
}
