import { useState, useEffect, useRef } from 'react';
import { X, Search, Building2, User, DollarSign, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CustomerOption {
  id: string;
  display_name: string;
  email: string | null;
  open_invoice_count: number;
  total_outstanding: number;
}

interface SelectCustomerModalProps {
  onSelect: (contactId: string, contactName: string) => void;
  onClose: () => void;
}

export function SelectCustomerModal({ onSelect, onClose }: SelectCustomerModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      loadTopCustomers();
    } else if (trimmed.length >= 2) {
      searchCustomers(trimmed);
    }
  }, [query]);

  async function loadTopCustomers() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select(`
          contact_id,
          amount_due,
          contacts:contact_id (
            id,
            contact_name,
            first_name,
            last_name,
            email
          )
        `)
        .in('status', ['sent', 'partial', 'overdue'])
        .order('invoice_date', { ascending: true });

      if (error) throw error;
      setResults(buildCustomerOptions(data || []));
    } catch (err) {
      console.error('Error loading customers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function searchCustomers(q: string) {
    setLoading(true);
    try {
      const { data: contactData, error: contactError } = await supabase
        .from('contacts')
        .select('id, contact_name, first_name, last_name, email')
        .or(`contact_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
        .limit(20);

      if (contactError) throw contactError;

      const contactIds = (contactData || []).map(c => c.id);
      if (contactIds.length === 0) {
        setResults([]);
        setLoading(false);
        return;
      }

      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('contact_id, amount_due')
        .in('status', ['sent', 'partial', 'overdue'])
        .in('contact_id', contactIds);

      if (invoiceError) throw invoiceError;

      const invoicesByContact: Record<string, { count: number; total: number }> = {};
      for (const inv of invoiceData || []) {
        if (!invoicesByContact[inv.contact_id]) {
          invoicesByContact[inv.contact_id] = { count: 0, total: 0 };
        }
        invoicesByContact[inv.contact_id].count += 1;
        invoicesByContact[inv.contact_id].total += inv.amount_due;
      }

      const options: CustomerOption[] = (contactData || []).map(c => {
        const name = c.contact_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
        const stats = invoicesByContact[c.id] || { count: 0, total: 0 };
        return {
          id: c.id,
          display_name: name,
          email: c.email,
          open_invoice_count: stats.count,
          total_outstanding: stats.total,
        };
      });

      options.sort((a, b) => b.total_outstanding - a.total_outstanding);
      setResults(options);
    } catch (err) {
      console.error('Error searching customers:', err);
    } finally {
      setLoading(false);
    }
  }

  function buildCustomerOptions(rows: any[]): CustomerOption[] {
    const map: Record<string, CustomerOption> = {};
    for (const row of rows) {
      const c = row.contacts;
      if (!c) continue;
      const name = c.contact_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unknown';
      if (!map[c.id]) {
        map[c.id] = { id: c.id, display_name: name, email: c.email, open_invoice_count: 0, total_outstanding: 0 };
      }
      map[c.id].open_invoice_count += 1;
      map[c.id].total_outstanding += row.amount_due;
    }
    return Object.values(map).sort((a, b) => b.total_outstanding - a.total_outstanding);
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh] sm:max-h-[70vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Apply Payment</h2>
              <p className="text-xs text-gray-500">Select a customer</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent text-sm"
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-7 h-7 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center">
              <AlertCircle className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No customers with open invoices found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {query.trim().length === 0 && (
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customers with open balances</p>
                </div>
              )}
              {results.map(customer => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelect(customer.id, customer.display_name)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-green-50 active:bg-green-100 transition-colors text-left touch-manipulation"
                >
                  <div className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
                    {customer.display_name.toLowerCase().includes('llc') || customer.display_name.toLowerCase().includes('inc') || customer.display_name.toLowerCase().includes('corp')
                      ? <Building2 className="w-4 h-4 text-gray-500" />
                      : <User className="w-4 h-4 text-gray-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">{customer.display_name}</span>
                      {customer.total_outstanding > 0 && (
                        <span className="text-sm font-bold text-red-600 shrink-0">${customer.total_outstanding.toFixed(2)}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {customer.open_invoice_count > 0 ? (
                        <span className="text-xs text-gray-500">
                          {customer.open_invoice_count} open invoice{customer.open_invoice_count !== 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No open invoices</span>
                      )}
                      {customer.email && (
                        <span className="text-xs text-gray-400 truncate">{customer.email}</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} className="bg-white" />
      </div>
    </div>
  );
}
