import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, Plus, Edit2, Trash2, Check, X } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface Contract {
  id: string;
  name: string;
  content: string;
  description?: string;
  contract_type: 'security' | 'sales';
  is_default: boolean;
  created_at: string;
}

export default function ContractManagement() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'security' | 'sales'>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadContracts();
  }, []);

  async function loadContracts() {
    try {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(contract: Contract) {
    setEditingContract(contract);
    setShowModal(true);
  }

  function handleAdd() {
    setEditingContract(null);
    setShowModal(true);
  }

  async function handleDelete(id: string) {
    try {
      const { error } = await supabase
        .from('contracts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setContracts(contracts.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting contract:', error);
      alert('Failed to delete contract');
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const { error } = await supabase
        .from('contracts')
        .update({ is_default: true })
        .eq('id', id);

      if (error) throw error;
      await loadContracts();
    } catch (error) {
      console.error('Error setting default contract:', error);
      alert('Failed to set default contract');
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading contracts...</div>;
  }

  const filteredContracts = filterType === 'all'
    ? contracts
    : contracts.filter(c => c.contract_type === filterType);

  return (
    <div className="p-4 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contract Management</h1>
          <p className="text-gray-600 mt-1">Manage security and sales contract templates</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Contract
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilterType('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filterType === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Contracts
        </button>
        <button
          onClick={() => setFilterType('security')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filterType === 'security'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Security Contracts
        </button>
        <button
          onClick={() => setFilterType('sales')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filterType === 'sales'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Sales Contracts
        </button>
      </div>

      {filteredContracts.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">
            {contracts.length === 0 ? 'No contracts created yet' : `No ${filterType} contracts found`}
          </p>
          {contracts.length === 0 && (
            <button
              onClick={handleAdd}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Create your first contract
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contract Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredContracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{contract.name}</span>
                      </div>
                      {contract.description && (
                        <p className="text-sm text-gray-500 ml-7">{contract.description}</p>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      contract.contract_type === 'security'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {contract.contract_type === 'security' ? 'Security' : 'Sales'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {contract.is_default ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <Check className="w-3 h-3" />
                        Default
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetDefault(contract.id)}
                        className="text-sm text-gray-500 hover:text-blue-600"
                      >
                        Set as default
                      </button>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {new Date(contract.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(contract)}
                        className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(contract.id)}
                        className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {showModal && (
        <ContractModal
          contract={editingContract}
          onClose={() => {
            setShowModal(false);
            setEditingContract(null);
          }}
          onSave={() => {
            loadContracts();
            setShowModal(false);
            setEditingContract(null);
          }}
        />
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="Delete Contract"
        message="Are you sure you want to delete this contract?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteId) handleDelete(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

function ContractModal({
  contract,
  onClose,
  onSave
}: {
  contract: Contract | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [formData, setFormData] = useState({
    name: contract?.name || '',
    description: contract?.description || '',
    content: contract?.content || '',
    contract_type: contract?.contract_type || 'sales' as 'security' | 'sales',
    is_default: contract?.is_default || false
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      if (contract) {
        const { error } = await supabase
          .from('contracts')
          .update({
            name: formData.name,
            description: formData.description,
            content: formData.content,
            contract_type: formData.contract_type,
            is_default: formData.is_default,
            updated_at: new Date().toISOString()
          })
          .eq('id', contract.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('contracts')
          .insert({
            name: formData.name,
            description: formData.description,
            content: formData.content,
            contract_type: formData.contract_type,
            is_default: formData.is_default
          });

        if (error) throw error;
      }

      onSave();
    } catch (error) {
      console.error('Error saving contract:', error);
      alert('Failed to save contract');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {contract ? 'Edit Contract' : 'New Contract'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract Type
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contract_type"
                  value="sales"
                  checked={formData.contract_type === 'sales'}
                  onChange={(e) => setFormData({ ...formData, contract_type: 'sales' })}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Sales Contract</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contract_type"
                  value="security"
                  checked={formData.contract_type === 'security'}
                  onChange={(e) => setFormData({ ...formData, contract_type: 'security' })}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Security Contract</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Standard Services Agreement"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (Optional)
            </label>
            <input
              type="text"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this contract"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_default" className="text-sm text-gray-700">
              Set as default contract for new proposals
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contract Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Enter contract terms and conditions..."
              rows={20}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              You can use basic formatting. This will appear at the bottom of proposals.
            </p>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : contract ? 'Update Contract' : 'Create Contract'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
