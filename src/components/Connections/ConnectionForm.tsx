import React, { useState, useEffect, useRef } from 'react';
import { X, Calendar, User, Phone, Mail, MessageSquare, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string;
  company_name: string;
}

interface Connection {
  id: string;
  user_id: string;
  contact_id: string;
  connection_type: string;
  connection_date: string;
  notes: string;
  follow_up_needed: boolean;
  reminder_date: string | null;
  follow_up_description: string | null;
}

interface ConnectionFormProps {
  onClose: () => void;
  onSuccess: () => void;
  contactId?: string;
  editConnection?: Connection;
}

export default function ConnectionForm({ onClose, onSuccess, contactId, editConnection }: ConnectionFormProps) {
  const { user } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<ContactOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    contact_id: contactId || editConnection?.contact_id || '',
    connection_type: editConnection?.connection_type || 'meeting',
    connection_date: editConnection?.connection_date ? new Date(editConnection.connection_date).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
    notes: editConnection?.notes || '',
    follow_up_needed: editConnection?.follow_up_needed || false,
    reminder_date: editConnection?.reminder_date ? new Date(editConnection.reminder_date).toISOString().slice(0, 16) : '',
    follow_up_description: editConnection?.follow_up_description || '',
  });

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (contactId && contacts.length > 0) {
      const contact = contacts.find(c => c.id === contactId);
      if (contact) {
        setSearchTerm(`${contact.first_name} ${contact.last_name} - ${contact.company_name || 'N/A'}`);
      }
    }
  }, [contactId, contacts]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadContacts = async () => {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, company_name')
      .order('last_name');

    if (!error && data) {
      setContacts(data);
      setFilteredContacts(data);
    }
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setShowDropdown(true);

    if (!value.trim()) {
      setFilteredContacts(contacts);
      return;
    }

    const searchLower = value.toLowerCase();
    const filtered = contacts.filter(contact => {
      const fullName = `${contact.first_name} ${contact.last_name}`.toLowerCase();
      const company = contact.company_name?.toLowerCase() || '';
      return fullName.includes(searchLower) || company.includes(searchLower);
    });
    setFilteredContacts(filtered);
  };

  const selectContact = (contact: ContactOption) => {
    setFormData({ ...formData, contact_id: contact.id });
    setSearchTerm(`${contact.first_name} ${contact.last_name} - ${contact.company_name || 'N/A'}`);
    setShowDropdown(false);
  };

  const selectedContact = contacts.find(c => c.id === formData.contact_id);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);

    const connectionData = {
      user_id: user.id,
      contact_id: formData.contact_id,
      connection_type: formData.connection_type,
      connection_date: formData.connection_date,
      notes: formData.notes,
      follow_up_needed: formData.follow_up_needed,
      reminder_date: formData.reminder_date || null,
      follow_up_description: formData.follow_up_description || null,
    };

    let error;
    if (editConnection) {
      const result = await supabase
        .from('connections')
        .update(connectionData)
        .eq('id', editConnection.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('connections')
        .insert([connectionData]);
      error = result.error;
    }

    setLoading(false);

    if (error) {
      alert('Failed to create connection: ' + error.message);
      return;
    }

    onSuccess();
  };

  const connectionTypes = [
    { value: 'meeting', label: 'Meeting', icon: User },
    { value: 'call', label: 'Phone Call', icon: Phone },
    { value: 'email', label: 'Email', icon: Mail },
    { value: 'casual_conversation', label: 'Casual Conversation', icon: MessageSquare },
    { value: 'other', label: 'Other', icon: FileText },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl sm:text-2xl font-bold text-white">{editConnection ? 'Edit Connection' : 'New Connection'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Contact *
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search contacts by name or company..."
              required={!formData.contact_id}
              disabled={!!contactId}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {showDropdown && !contactId && filteredContacts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => selectContact(contact)}
                    className="w-full text-left px-4 py-2 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                  >
                    <div className="font-medium text-gray-900">
                      {contact.first_name} {contact.last_name}
                    </div>
                    {contact.company_name && (
                      <div className="text-sm text-gray-500">{contact.company_name}</div>
                    )}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && !contactId && filteredContacts.length === 0 && searchTerm && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4 text-center text-gray-500">
                No contacts found
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connection Type *
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {connectionTypes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData({ ...formData, connection_type: value })}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-colors ${
                    formData.connection_type === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Connection Date & Time *
            </label>
            <input
              type="datetime-local"
              value={formData.connection_date}
              onChange={(e) => setFormData({ ...formData, connection_date: e.target.value })}
              required
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={4}
              placeholder="What did you discuss? Any key takeaways?"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="follow_up_needed"
              checked={formData.follow_up_needed}
              onChange={(e) => setFormData({ ...formData, follow_up_needed: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="follow_up_needed" className="text-sm font-medium text-gray-700">
              Follow-up needed
            </label>
          </div>

          {formData.follow_up_needed && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Follow-up Description
                </label>
                <textarea
                  value={formData.follow_up_description}
                  onChange={(e) => setFormData({ ...formData, follow_up_description: e.target.value })}
                  rows={3}
                  placeholder="What needs to be done during the follow-up?"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4 inline mr-1" />
                  Reminder Date & Time
                </label>
                <input
                  type="datetime-local"
                  value={formData.reminder_date}
                  onChange={(e) => setFormData({ ...formData, reminder_date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'Saving...' : (editConnection ? 'Update Connection' : 'Save Connection')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}