import React, { useState, useEffect } from 'react';
import { X, Plus, Building2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ChangeVendorModalProps {
  selectedItemIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

interface Vendor {
  id: string;
  vendor_name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
}

export function ChangeVendorModal({ selectedItemIds, onClose, onSuccess }: ChangeVendorModalProps) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selectedVendor, setSelectedVendor] = useState<string>('');
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newVendor, setNewVendor] = useState({
    vendor_name: '',
    contact_name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    website: '',
    notes: ''
  });

  useEffect(() => {
    loadVendors();
  }, []);

  const loadVendors = async () => {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .select('id, vendor_name, contact_name, phone, email')
        .eq('is_active', true)
        .order('vendor_name');

      if (error) throw error;
      setVendors(data || []);
    } catch (error: any) {
      console.error('Error loading vendors:', error);
      alert('Error loading vendors: ' + error.message);
    }
  };

  const handleAddVendor = async () => {
    if (!newVendor.vendor_name.trim()) {
      alert('Please enter a vendor name');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert([newVendor])
        .select()
        .single();

      if (error) throw error;

      await loadVendors();
      setSelectedVendor(data.vendor_name);
      setShowAddVendor(false);
      setNewVendor({
        vendor_name: '',
        contact_name: '',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        website: '',
        notes: ''
      });
    } catch (error: any) {
      console.error('Error adding vendor:', error);
      alert('Error adding vendor: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeVendor = async () => {
    if (!selectedVendor) {
      alert('Please select a vendor');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('product_request_items')
        .update({ vendor: selectedVendor })
        .in('id', selectedItemIds);

      if (error) throw error;

      alert(`Successfully updated vendor for ${selectedItemIds.length} item(s)!`);
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error changing vendor:', error);
      alert('Error changing vendor: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Change Vendor</h2>
            <p className="text-sm text-gray-600 mt-1">
              Updating vendor for {selectedItemIds.length} item(s)
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {!showAddVendor ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Vendor
                </label>
                <select
                  value={selectedVendor}
                  onChange={(e) => setSelectedVendor(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select a vendor --</option>
                  {vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.vendor_name}>
                      {vendor.vendor_name}
                      {vendor.contact_name && ` (${vendor.contact_name})`}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setShowAddVendor(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Add New Vendor
              </button>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangeVendor}
                  disabled={!selectedVendor || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Updating...' : 'Update Vendor'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Add New Vendor</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newVendor.vendor_name}
                    onChange={(e) => setNewVendor({ ...newVendor, vendor_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g., Home Depot"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    value={newVendor.contact_name}
                    onChange={(e) => setNewVendor({ ...newVendor, contact_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={newVendor.phone}
                    onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={newVendor.email}
                    onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address
                  </label>
                  <input
                    type="text"
                    value={newVendor.address}
                    onChange={(e) => setNewVendor({ ...newVendor, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={newVendor.city}
                    onChange={(e) => setNewVendor({ ...newVendor, city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    <input
                      type="text"
                      value={newVendor.state}
                      onChange={(e) => setNewVendor({ ...newVendor, state: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP
                    </label>
                    <input
                      type="text"
                      value={newVendor.zip}
                      onChange={(e) => setNewVendor({ ...newVendor, zip: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={newVendor.website}
                    onChange={(e) => setNewVendor({ ...newVendor, website: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="https://"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    value={newVendor.notes}
                    onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowAddVendor(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleAddVendor}
                  disabled={!newVendor.vendor_name.trim() || loading}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Adding...' : 'Add Vendor'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
