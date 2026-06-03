import { useState, useEffect } from 'react';
import { X, CheckSquare, Square, Download, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ConfirmModal from '../ui/ConfirmModal';

interface StagedCustomer {
  id: string;
  qbo_customer_id: string;
  company_name: string | null;
  given_name: string | null;
  family_name: string | null;
  display_name: string;
  primary_email: string | null;
  primary_phone: string | null;
  mobile_phone: string | null;
  billing_address: any;
  completeness_status: 'complete' | 'partial' | 'minimal';
  completeness_score: number;
  missing_fields: string[];
  import_status: 'pending' | 'imported' | 'skipped' | 'failed';
}

interface QuickBooksCustomerBrowserProps {
  onClose: () => void;
  onImportComplete: () => void;
}

export function QuickBooksCustomerBrowser({ onClose, onImportComplete }: QuickBooksCustomerBrowserProps) {
  const [customers, setCustomers] = useState<StagedCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'partial' | 'minimal'>('all');
  const [importing, setImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmImport, setConfirmImport] = useState(false);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    try {
      const { data, error } = await supabase
        .from('quickbooks_staged_customers')
        .select('*')
        .eq('import_status', 'pending')
        .order('completeness_score', { ascending: false });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error loading staged customers:', error);
      alert('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (selectedIds.size === 0) {
      alert('Please select at least one customer to import');
      return;
    }

    setImporting(true);
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quickbooks-import-staged-customers`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            customerIds: Array.from(selectedIds),
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        alert(result.message);
        setSelectedIds(new Set());
        await loadCustomers();
        onImportComplete();
      } else {
        throw new Error(result.error || 'Failed to import customers');
      }
    } catch (error) {
      console.error('Error importing customers:', error);
      alert('Failed to import customers: ' + (error as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function toggleSelect(id: string) {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredCustomers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCustomers.map(c => c.id)));
    }
  }

  const filteredCustomers = customers.filter(customer => {
    const matchesFilter = filterStatus === 'all' || customer.completeness_status === filterStatus;
    const matchesSearch = searchTerm === '' ||
      customer.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.primary_email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading customers...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">QuickBooks Customers</h2>
            <p className="text-sm text-gray-600 mt-1">Review and import customers from QuickBooks</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-between gap-4 p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search customers..."
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All ({customers.length})
            </button>
            <button
              onClick={() => setFilterStatus('complete')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === 'complete'
                  ? 'bg-green-600 text-white'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              Complete ({customers.filter(c => c.completeness_status === 'complete').length})
            </button>
            <button
              onClick={() => setFilterStatus('partial')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === 'partial'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
              }`}
            >
              Partial ({customers.filter(c => c.completeness_status === 'partial').length})
            </button>
            <button
              onClick={() => setFilterStatus('minimal')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filterStatus === 'minimal'
                  ? 'bg-red-600 text-white'
                  : 'bg-red-100 text-red-700 hover:bg-red-200'
              }`}
            >
              Minimal ({customers.filter(c => c.completeness_status === 'minimal').length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {filteredCustomers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500">No customers found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCustomers.map(customer => (
                <div
                  key={customer.id}
                  className={`border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer ${
                    selectedIds.has(customer.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => toggleSelect(customer.id)}
                >
                  <div className="flex items-start gap-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(customer.id);
                      }}
                      className="mt-1 text-gray-400 hover:text-blue-600"
                    >
                      {selectedIds.has(customer.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>

                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{customer.display_name}</h3>
                          {customer.company_name && customer.company_name !== customer.display_name && (
                            <p className="text-sm text-gray-600">{customer.company_name}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          customer.completeness_status === 'complete'
                            ? 'bg-green-100 text-green-700'
                            : customer.completeness_status === 'partial'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {customer.completeness_status} ({customer.completeness_score}%)
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                        {customer.primary_email && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-gray-600">{customer.primary_email}</span>
                          </div>
                        )}
                        {customer.primary_phone && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-gray-600">{customer.primary_phone}</span>
                          </div>
                        )}
                        {customer.billing_address?.City && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="text-gray-600">
                              {customer.billing_address.City}, {customer.billing_address.CountrySubDivisionCode}
                            </span>
                          </div>
                        )}
                      </div>

                      {customer.missing_fields && customer.missing_fields.length > 0 && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <AlertCircle className="w-4 h-4" />
                          <span>Missing: {customer.missing_fields.join(', ')}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={toggleSelectAll}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                {selectedIds.size === filteredCustomers.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-gray-600">
                {selectedIds.size} of {filteredCustomers.length} selected
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => setConfirmImport(true)}
                disabled={importing || selectedIds.size === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                {importing ? 'Importing...' : `Import ${selectedIds.size} Customer${selectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmImport}
        title="Import Customers"
        message={`Import ${selectedIds.size} selected customer(s)?`}
        variant="warning"
        confirmLabel="Import"
        onConfirm={() => {
          setConfirmImport(false);
          handleImport();
        }}
        onCancel={() => setConfirmImport(false)}
      />
    </div>
  );
}
