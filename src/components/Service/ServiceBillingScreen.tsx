import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { formatCurrency } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';
import { X, Clock, DollarSign, Package, Plus, Trash2, CreditCard as Edit, Save, FileText, Image as ImageIcon, AlertCircle, CheckCircle, Send } from 'lucide-react';
import ConfirmModal from '../ui/ConfirmModal';

interface ServiceBillingScreenProps {
  billingQueueItemId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface LaborEntry {
  id?: string;
  tech_name: string;
  calculated_hours: number;
  labor_rate: number;
  labor_total: number;
  is_warranty: boolean;
  override_hours?: number;
  override_rate?: number;
  override_total?: number;
  notes?: string;
}

interface PartEntry {
  id?: string;
  part_name: string;
  part_sku?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_warranty: boolean;
  warranty_covered: boolean;
  notes?: string;
}

interface AdditionalCharge {
  id?: string;
  charge_type: string;
  description: string;
  amount: number;
  is_discount: boolean;
}

export function ServiceBillingScreen({ billingQueueItemId, onClose, onSuccess }: ServiceBillingScreenProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  // Job Overview Data
  const [jobData, setJobData] = useState<any>(null);
  const [workOrder, setWorkOrder] = useState<any>(null);
  const [contact, setContact] = useState<any>(null);

  // Billing Data
  const [laborEntries, setLaborEntries] = useState<LaborEntry[]>([]);
  const [partEntries, setPartEntries] = useState<PartEntry[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([]);

  // Tax Classification
  const [taxEnvironment, setTaxEnvironment] = useState<'residential' | 'commercial'>('residential');
  const [taxProjectType, setTaxProjectType] = useState('general_installation_repair');

  // UI State
  const [editingLabor, setEditingLabor] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<string | null>(null);
  const [showAddPart, setShowAddPart] = useState(false);
  const [showAddCharge, setShowAddCharge] = useState(false);

  // New entries
  const [newPart, setNewPart] = useState<PartEntry>({
    part_name: '',
    quantity: 1,
    unit_price: 0,
    total_price: 0,
    is_warranty: false,
    warranty_covered: false
  });

  const [newCharge, setNewCharge] = useState<AdditionalCharge>({
    charge_type: 'trip_fee',
    description: '',
    amount: 0,
    is_discount: false
  });

  // Company settings
  const [laborRate, setLaborRate] = useState(75); // Default, loaded from settings

  useEffect(() => {
    loadBillingData();
    loadCompanySettings();
  }, [billingQueueItemId]);

  async function loadCompanySettings() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('default_labor_rate')
        .single();

      if (data?.default_labor_rate) {
        setLaborRate(parseFloat(data.default_labor_rate));
      }
    } catch (error) {
      console.error('Error loading company settings:', error);
    }
  }

  async function loadBillingData() {
    try {
      // Load billing queue item with related data
      const { data: queueData, error: queueError } = await supabase
        .from('service_billing_queue')
        .select(`
          *,
          work_order:work_orders(*),
          contact:contacts(*),
          service_request:service_requests(*)
        `)
        .eq('id', billingQueueItemId)
        .single();

      if (queueError) throw queueError;

      setJobData(queueData);
      setWorkOrder(queueData.work_order);
      setContact(queueData.contact);

      // Load labor entries
      const { data: laborData } = await supabase
        .from('service_labor_entries')
        .select(`
          *,
          tech:profiles!tech_user_id(full_name)
        `)
        .eq('service_billing_queue_id', billingQueueItemId);

      if (laborData) {
        setLaborEntries(laborData.map(l => ({
          id: l.id,
          tech_name: l.tech?.full_name || 'Unknown Tech',
          calculated_hours: parseFloat(l.calculated_hours),
          labor_rate: parseFloat(l.labor_rate) || laborRate,
          labor_total: parseFloat(l.labor_total),
          is_warranty: l.is_warranty,
          override_hours: l.override_hours ? parseFloat(l.override_hours) : undefined,
          override_rate: l.override_rate ? parseFloat(l.override_rate) : undefined,
          override_total: l.override_total ? parseFloat(l.override_total) : undefined,
          notes: l.notes
        })));
      }

      // Load parts
      const { data: partsData } = await supabase
        .from('service_parts_used')
        .select('*')
        .eq('service_billing_queue_id', billingQueueItemId);

      if (partsData) {
        setPartEntries(partsData.map(p => ({
          id: p.id,
          part_name: p.part_name,
          part_sku: p.part_sku,
          quantity: parseFloat(p.quantity),
          unit_price: parseFloat(p.unit_price),
          total_price: parseFloat(p.total_price),
          is_warranty: p.is_warranty,
          warranty_covered: p.warranty_covered,
          notes: p.notes
        })));
      }

      // Load additional charges
      const { data: chargesData } = await supabase
        .from('service_additional_charges')
        .select('*')
        .eq('service_billing_queue_id', billingQueueItemId);

      if (chargesData) {
        setAdditionalCharges(chargesData.map(c => ({
          id: c.id,
          charge_type: c.charge_type,
          description: c.description,
          amount: parseFloat(c.amount),
          is_discount: c.is_discount
        })));
      }

    } catch (error) {
      console.error('Error loading billing data:', error);
      alert('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }

  async function handleAddPart() {
    if (!newPart.part_name.trim() || newPart.quantity <= 0) {
      alert('Please enter part name and quantity');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('service_parts_used')
        .insert({
          work_order_id: workOrder.id,
          service_billing_queue_id: billingQueueItemId,
          part_name: newPart.part_name,
          part_sku: newPart.part_sku,
          quantity: newPart.quantity,
          unit_price: newPart.unit_price,
          is_warranty: newPart.is_warranty,
          warranty_covered: newPart.warranty_covered,
          notes: newPart.notes
        })
        .select()
        .single();

      if (error) throw error;

      setPartEntries([...partEntries, {
        id: data.id,
        part_name: data.part_name,
        part_sku: data.part_sku,
        quantity: parseFloat(data.quantity),
        unit_price: parseFloat(data.unit_price),
        total_price: parseFloat(data.total_price),
        is_warranty: data.is_warranty,
        warranty_covered: data.warranty_covered,
        notes: data.notes
      }]);

      setShowAddPart(false);
      setNewPart({
        part_name: '',
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        is_warranty: false,
        warranty_covered: false
      });
    } catch (error) {
      console.error('Error adding part:', error);
      alert('Failed to add part');
    }
  }

  async function handleAddCharge() {
    if (!newCharge.description.trim() || newCharge.amount === 0) {
      alert('Please enter description and amount');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('service_additional_charges')
        .insert({
          service_billing_queue_id: billingQueueItemId,
          charge_type: newCharge.charge_type,
          description: newCharge.description,
          amount: newCharge.amount,
          is_discount: newCharge.is_discount,
          added_by: profile?.id
        })
        .select()
        .single();

      if (error) throw error;

      setAdditionalCharges([...additionalCharges, {
        id: data.id,
        charge_type: data.charge_type,
        description: data.description,
        amount: parseFloat(data.amount),
        is_discount: data.is_discount
      }]);

      setShowAddCharge(false);
      setNewCharge({
        charge_type: 'trip_fee',
        description: '',
        amount: 0,
        is_discount: false
      });
    } catch (error) {
      console.error('Error adding charge:', error);
      alert('Failed to add charge');
    }
  }

  async function handleGenerateInvoice() {
    setSaving(true);

    try {
      // Calculate totals
      const laborTotal = laborEntries.reduce((sum, l) =>
        sum + (l.override_total || l.labor_total), 0
      );
      const partsTotal = partEntries.reduce((sum, p) => sum + p.total_price, 0);
      const chargesTotal = additionalCharges.reduce((sum, c) =>
        c.is_discount ? sum - c.amount : sum + c.amount, 0
      );
      const subtotal = laborTotal + partsTotal + chargesTotal;
      const tax = subtotal * 0.08; // Example tax rate
      const total = subtotal + tax;

      // Create invoice record
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          contact_id: contact.id,
          invoice_number: `INV-${Date.now()}`, // Temporary, will be replaced by QBO
          invoice_date: new Date().toISOString().split('T')[0],
          due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          subtotal,
          tax,
          total,
          status: 'draft',
          notes: `Service for WO #${workOrder.work_order_number}`,
          tax_environment: taxEnvironment,
          tax_project_type: taxProjectType,
        })
        .select()
        .single();

      if (invoiceError) throw invoiceError;

      // Update billing queue
      await supabase
        .from('service_billing_queue')
        .update({
          status: 'invoice_created',
          invoice_id: invoice.id,
          invoiced_at: new Date().toISOString()
        })
        .eq('id', billingQueueItemId);

      // TODO: Integrate with QBO to create actual invoice
      // This would call the quickbooks-create-invoice edge function

      alert('Invoice generated successfully!');
      if (onSuccess) onSuccess();
      onClose();
    } catch (error) {
      console.error('Error generating invoice:', error);
      alert('Failed to generate invoice');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-gray-500">Loading billing data...</div>
        </div>
      </div>
    );
  }

  const laborTotal = laborEntries.reduce((sum, l) => sum + (l.override_total || l.labor_total), 0);
  const partsTotal = partEntries.reduce((sum, p) => sum + p.total_price, 0);
  const chargesTotal = additionalCharges.reduce((sum, c) => c.is_discount ? sum - c.amount : sum + c.amount, 0);
  const subtotal = laborTotal + partsTotal + chargesTotal;
  const tax = subtotal * 0.08; // Example tax rate
  const total = subtotal + tax;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              Service Billing - WO #{workOrder?.work_order_number}
            </h2>
            <p className="text-gray-300">{contact?.full_name || contact?.company_name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Job Overview */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Job Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Customer:</span>
                <span className="ml-2 font-medium">{contact?.full_name || contact?.company_name}</span>
              </div>
              <div>
                <span className="text-gray-600">Address:</span>
                <span className="ml-2 font-medium">{workOrder?.service_location_address}</span>
              </div>
              <div>
                <span className="text-gray-600">Description:</span>
                <span className="ml-2 font-medium">{workOrder?.description}</span>
              </div>
              <div>
                <span className="text-gray-600">Type:</span>
                <span className={`ml-2 font-medium ${
                  workOrder?.billable_type === 'warranty' ? 'text-blue-600' : 'text-green-600'
                }`}>
                  {workOrder?.billable_type === 'warranty' ? 'Warranty' : 'Billable'}
                </span>
              </div>
            </div>
          </div>

          {/* Labor Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Labor
            </h3>
            {laborEntries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No labor entries found</p>
            ) : (
              <div className="space-y-2">
                {laborEntries.map((labor, index) => (
                  <div key={labor.id || index} className="bg-gray-50 rounded p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{labor.tech_name}</p>
                        <p className="text-sm text-gray-600">
                          {labor.override_hours || labor.calculated_hours} hours ×
                          ${labor.override_rate || labor.labor_rate}/hr
                        </p>
                        {workOrder?.billable_type === 'warranty' && (
                          <p className="text-xs text-blue-600 font-medium">Warranty - $0 labor</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          ${workOrder?.billable_type === 'warranty' ? '0.00' : (labor.override_total || labor.labor_total).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Labor Total:</span>
              <span className="text-xl font-bold text-green-600">
                ${workOrder?.billable_type === 'warranty' ? '0.00' : laborTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Parts Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5" />
                Parts & Materials
              </h3>
              <button
                onClick={() => setShowAddPart(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Part
              </button>
            </div>

            {showAddPart && (
              <div className="bg-blue-50 rounded p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-3">Add Part</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    type="text"
                    placeholder="Part Name *"
                    value={newPart.part_name}
                    onChange={(e) => setNewPart({...newPart, part_name: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Quantity"
                    value={newPart.quantity}
                    onChange={(e) => setNewPart({...newPart, quantity: parseFloat(e.target.value) || 0})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={newPart.unit_price}
                    onChange={(e) => setNewPart({...newPart, unit_price: parseFloat(e.target.value) || 0})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddPart}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Save Part
                  </button>
                  <button
                    onClick={() => setShowAddPart(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {partEntries.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No parts used</p>
            ) : (
              <div className="space-y-2">
                {partEntries.map((part, index) => (
                  <div key={part.id || index} className="bg-gray-50 rounded p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{part.part_name}</p>
                      <p className="text-sm text-gray-600">
                        Qty: {part.quantity} × {formatCurrency(part.unit_price)}
                      </p>
                    </div>
                    <p className="font-bold text-gray-900">{formatCurrency(part.total_price)}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Parts Total:</span>
              <span className="text-xl font-bold text-green-600">{formatCurrency(partsTotal)}</span>
            </div>
          </div>

          {/* Additional Charges */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5" />
                Additional Charges
              </h3>
              <button
                onClick={() => setShowAddCharge(true)}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                Add Charge
              </button>
            </div>

            {showAddCharge && (
              <div className="bg-blue-50 rounded p-4 mb-4">
                <h4 className="font-medium text-gray-900 mb-3">Add Charge</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={newCharge.charge_type}
                    onChange={(e) => setNewCharge({...newCharge, charge_type: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="trip_fee">Trip Fee</option>
                    <option value="diagnostic_fee">Diagnostic Fee</option>
                    <option value="custom">Custom</option>
                    <option value="discount">Discount</option>
                  </select>
                  <input
                    type="text"
                    placeholder="Description *"
                    value={newCharge.description}
                    onChange={(e) => setNewCharge({...newCharge, description: e.target.value})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={newCharge.amount}
                    onChange={(e) => setNewCharge({...newCharge, amount: parseFloat(e.target.value) || 0})}
                    className="px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleAddCharge}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                  >
                    Save Charge
                  </button>
                  <button
                    onClick={() => setShowAddCharge(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {additionalCharges.length > 0 && (
              <div className="space-y-2">
                {additionalCharges.map((charge, index) => (
                  <div key={charge.id || index} className="bg-gray-50 rounded p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{charge.description}</p>
                      <p className="text-xs text-gray-500 uppercase">{charge.charge_type.replace('_', ' ')}</p>
                    </div>
                    <p className={`font-bold ${charge.is_discount ? 'text-red-600' : 'text-gray-900'}`}>
                      {charge.is_discount ? '-' : ''}${charge.amount.toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tax Classification */}
          <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
            <h3 className="font-semibold text-gray-900 mb-4">Tax Classification (Required for Invoice)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Environment *
                </label>
                <select
                  value={taxEnvironment}
                  onChange={(e) => setTaxEnvironment(e.target.value as 'residential' | 'commercial')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Project Type *
                </label>
                <select
                  value={taxProjectType}
                  onChange={(e) => setTaxProjectType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="original_construction">Original Construction</option>
                  <option value="remodel">Remodel</option>
                  <option value="general_installation_repair">General Installation/Repair or Retail</option>
                  <option value="exempt_project">Exempt Project</option>
                  <option value="design_services">Design Services</option>
                  <option value="maintenance_agreement">Maintenance Agreement</option>
                  <option value="membership">Membership</option>
                  <option value="security_monitoring">Security Monitoring</option>
                </select>
              </div>
            </div>
          </div>

          {/* Invoice Summary */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-4 text-lg">Invoice Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Labor:</span>
                <span className="font-medium">{formatCurrency(laborTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Parts:</span>
                <span className="font-medium">{formatCurrency(partsTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Additional Charges:</span>
                <span className="font-medium">{formatCurrency(chargesTotal)}</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-green-300">
                <span className="text-gray-700">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">Tax (8%):</span>
                <span className="font-medium">{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold pt-3 border-t-2 border-green-400">
                <span className="text-gray-900">Total:</span>
                <span className="text-green-600">{formatCurrency(total)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              onClick={onClose}
              className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={() => setConfirmModal({ title: 'Generate Invoice', message: 'Generate invoice for this service? This will create the invoice in QuickBooks Online.', onConfirm: handleGenerateInvoice })}
              disabled={saving}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
              {saving ? 'Generating...' : 'Generate Invoice'}
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        variant="warning"
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
