import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { notifyTechEmergencyJob } from '../../lib/dispatchNotifications';
import {
  X,
  AlertTriangle,
  User,
  MapPin,
  FileText,
  Zap,
  Search,
  Phone
} from 'lucide-react';

interface EmergencyJobModalProps {
  onClose: () => void;
  onSuccess?: () => void;
}

interface Contact {
  id: string;
  full_name: string;
  company_name: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

interface Technician {
  id: string;
  full_name: string;
  role: string;
}

export function EmergencyJobModal({ onClose, onSuccess }: EmergencyJobModalProps) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [techs, setTechs] = useState<Technician[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [formData, setFormData] = useState({
    customer_name: '',
    customer_phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    description: '',
    assigned_to: '',
    force_assign: false
  });

  useEffect(() => {
    loadTechs();
  }, []);

  useEffect(() => {
    if (searchQuery.length >= 2) {
      searchContacts();
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  async function loadTechs() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('role', 'tech')
        .order('full_name');

      if (error) throw error;
      setTechs(data || []);
    } catch (error) {
      console.error('Error loading techs:', error);
    }
  }

  async function searchContacts() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, company_name, phone, address_line1, city, state, zip_code')
        .or(`full_name.ilike.%${searchQuery}%,company_name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`)
        .limit(10);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Error searching contacts:', error);
    }
  }

  function selectContact(contact: Contact) {
    setSelectedContact(contact);
    setFormData({
      ...formData,
      customer_name: contact.full_name,
      customer_phone: contact.phone || '',
      address: contact.address_line1 || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.zip_code || ''
    });
    setSearchQuery('');
    setSearchResults([]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!formData.assigned_to) {
      alert('Please select a technician');
      return;
    }

    if (!formData.customer_name || !formData.description) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const { data: companyData } = await supabase
        .from('company_settings')
        .select('id')
        .single();

      if (!companyData) throw new Error('Company settings not found');

      let projectId = null;
      if (selectedContact) {
        const { data: existingProject } = await supabase
          .from('projects')
          .select('id')
          .eq('contact_id', selectedContact.id)
          .eq('project_name', 'Service Work')
          .maybeSingle();

        if (existingProject) {
          projectId = existingProject.id;
        } else {
          const { data: newProject, error: projectError } = await supabase
            .from('projects')
            .insert({
              company_id: companyData.id,
              contact_id: selectedContact.id,
              project_name: 'Service Work',
              status: 'active'
            })
            .select()
            .single();

          if (projectError) throw projectError;
          projectId = newProject.id;
        }
      } else {
        const { data: genericProject, error: gpError } = await supabase
          .from('projects')
          .select('id')
          .eq('project_name', 'Emergency Service Calls')
          .maybeSingle();

        if (genericProject) {
          projectId = genericProject.id;
        } else {
          const { data: newGenericProject, error: ngpError } = await supabase
            .from('projects')
            .insert({
              company_id: companyData.id,
              project_name: 'Emergency Service Calls',
              status: 'active'
            })
            .select()
            .single();

          if (ngpError) throw ngpError;
          projectId = newGenericProject.id;
        }
      }

      const woNumber = `EMG-${Date.now().toString().slice(-8)}`;

      const { data: workOrder, error: woError } = await supabase
        .from('work_orders')
        .insert({
          company_id: companyData.id,
          project_id: projectId,
          work_order_number: woNumber,
          title: `🚨 EMERGENCY: ${formData.description.substring(0, 50)}`,
          description: formData.description,
          type: 'emergency',
          status: 'assigned',
          priority: 'high',
          assigned_to: formData.assigned_to,
          start_date: new Date().toISOString().split('T')[0],
          estimated_hours: 2,
          notes: formData.force_assign ? '⚠️ FORCE ASSIGNED - Tech may be busy' : '',
          internal_notes: `Emergency job created by ${profile?.full_name}`,
          created_by: profile?.id,
          contact_id: selectedContact?.id || null,
          billable_type: 'billable',
          address: formData.address,
          service_location_address: formData.address,
          service_location_city: formData.city,
          service_location_state: formData.state,
          service_location_zip: formData.zip
        })
        .select()
        .single();

      if (woError) throw woError;

      await notifyTechEmergencyJob(formData.assigned_to, {
        work_order_number: woNumber,
        title: workOrder.title,
        customer_name: formData.customer_name,
        address: formData.address
      });

      alert('Emergency job created and technician notified!');
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error creating emergency job:', error);
      alert('Failed to create emergency job');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 border-red-500/30">
        <div className="p-6 border-b border-gray-700 bg-red-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  Create Emergency Job
                </h3>
                <p className="text-sm text-red-300 mt-1">
                  High priority - Immediate technician dispatch
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Search Existing Customer
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, company, or phone..."
                className="w-full pl-10 pr-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>
            {searchResults.length > 0 && (
              <div className="mt-2 bg-gray-900 border border-gray-700 rounded-lg max-h-48 overflow-y-auto">
                {searchResults.map(contact => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => selectContact(contact)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors border-b border-gray-700 last:border-0"
                  >
                    <div className="font-medium text-white">{contact.full_name}</div>
                    {contact.company_name && (
                      <div className="text-sm text-gray-400">{contact.company_name}</div>
                    )}
                    {contact.phone && (
                      <div className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3" />
                        {contact.phone}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Customer Name *
              </label>
              <input
                type="text"
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                required
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={formData.customer_phone}
                onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Address *
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                State
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                maxLength={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                ZIP
              </label>
              <input
                type="text"
                value={formData.zip}
                onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Emergency Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
              rows={3}
              placeholder="Describe the emergency situation..."
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">
              Assign Technician (GO NOW) *
            </label>
            <select
              value={formData.assigned_to}
              onChange={(e) => setFormData({ ...formData, assigned_to: e.target.value })}
              required
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:ring-2 focus:ring-red-500"
            >
              <option value="">Select technician...</option>
              {techs.map(tech => (
                <option key={tech.id} value={tech.id}>{tech.full_name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <input
              type="checkbox"
              id="force_assign"
              checked={formData.force_assign}
              onChange={(e) => setFormData({ ...formData, force_assign: e.target.checked })}
              className="w-5 h-5 bg-gray-900 border-gray-700 rounded focus:ring-2 focus:ring-red-500"
            />
            <label htmlFor="force_assign" className="text-sm text-red-300 cursor-pointer">
              <strong>Force Assign</strong> - Override if technician is currently on another job
            </label>
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t border-gray-700">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-semibold"
            >
              <Zap className="w-5 h-5" />
              {loading ? 'Creating...' : 'CREATE & DISPATCH NOW'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
