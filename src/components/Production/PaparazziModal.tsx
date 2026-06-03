import React, { useState, useEffect } from 'react';
import { X, Camera, Search, Loader, CheckCircle, AlertCircle, User } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PaparazziModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Contact {
  id: string;
  full_name: string;
  company_name: string;
}

interface Project {
  id: string;
  name: string;
}

export default function PaparazziModal({ isOpen, onClose }: PaparazziModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');

  const [description, setDescription] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [sendToSelf, setSendToSelf] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const characterLimit = 500;

  useEffect(() => {
    if (isOpen) {
      loadContacts();
      loadCurrentUser();
      resetForm();
    }
  }, [isOpen]);

  const loadCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email) {
      setCurrentUserEmail(user.email);
    }
  };

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredContacts(contacts);
    } else {
      const filtered = contacts.filter(contact => {
        const searchLower = searchTerm.toLowerCase();
        return (
          contact.full_name?.toLowerCase().includes(searchLower) ||
          contact.company_name?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredContacts(filtered);
    }
  }, [searchTerm, contacts]);

  useEffect(() => {
    if (selectedContact) {
      loadProjects(selectedContact.id);
      loadContactDetails(selectedContact.id);
    } else {
      setProjects([]);
      setSelectedProject('');
      setCustomerPhone('');
      setCustomerEmail('');
    }
  }, [selectedContact]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, company_name')
        .order('full_name');

      if (error) throw error;
      setContacts(data || []);
      setFilteredContacts(data || []);
    } catch (err) {
      console.error('Error loading contacts:', err);
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async (contactId: string) => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name')
        .eq('contact_id', contactId)
        .order('name');

      if (error) throw error;
      setProjects(data || []);
    } catch (err) {
      console.error('Error loading projects:', err);
    }
  };

  const loadContactDetails = async (contactId: string) => {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('phone, email')
        .eq('id', contactId)
        .single();

      if (error) throw error;
      if (data) {
        setCustomerPhone(data.phone || '');
        setCustomerEmail(data.email || '');
      }
    } catch (err) {
      console.error('Error loading contact details:', err);
    }
  };

  const resetForm = () => {
    setSearchTerm('');
    setSelectedContact(null);
    setSelectedProject('');
    setDescription('');
    setCustomerPhone('');
    setCustomerEmail('');
    setSendToSelf(false);
    setSuccess(false);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedContact) {
      setError('Please select a customer');
      return;
    }

    if (!description.trim()) {
      setError('Please describe the work completed');
      return;
    }

    if (description.length > characterLimit) {
      setError(`Description must be ${characterLimit} characters or less`);
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, full_name')
        .eq('id', user.id)
        .single();

      if (!profile) throw new Error('Profile not found');

      // Try to get company settings - first with organization_id, then without (for backward compatibility)
      let settings = null;
      let settingsError = null;

      // Try with organization_id first
      const { data: settingsWithOrg, error: errorWithOrg } = await supabase
        .from('company_settings')
        .select('photographer_email')
        .eq('organization_id', profile.organization_id)
        .maybeSingle();

      if (settingsWithOrg) {
        settings = settingsWithOrg;
      } else {
        // If no match with organization_id, try getting any settings record (single-tenant mode)
        const { data: anySettings, error: errorAny } = await supabase
          .from('company_settings')
          .select('photographer_email')
          .limit(1)
          .maybeSingle();

        if (anySettings) {
          settings = anySettings;
        } else {
          settingsError = errorAny || errorWithOrg;
        }
      }

      if (settingsError) {
        console.error('Error fetching company settings:', settingsError);
        setError('Unable to load company settings. Please contact your administrator.');
        return;
      }

      if (!settings) {
        console.error('No company settings found');
        setError('Company settings not found. Please contact your administrator.');
        return;
      }

      if (!sendToSelf && (!settings.photographer_email || settings.photographer_email.trim() === '')) {
        setError('Photographer email not configured. Please add it in Company Settings.');
        return;
      }

      const requestData = {
        organization_id: profile.organization_id,
        contact_id: selectedContact.id,
        project_id: selectedProject || null,
        requested_by: user.id,
        description: description.trim(),
        customer_name: selectedContact.full_name || selectedContact.company_name,
        customer_phone: customerPhone.trim() || null,
        customer_email: customerEmail.trim() || null,
        status: 'pending'
      };

      const { data: request, error: insertError } = await supabase
        .from('paparazzi_requests')
        .insert(requestData)
        .select()
        .single();

      if (insertError) throw insertError;

      const projectName = selectedProject
        ? projects.find(p => p.id === selectedProject)?.name
        : undefined;

      const emailPayload = {
        requestId: request.id,
        description: description.trim(),
        customerName: selectedContact.full_name || selectedContact.company_name,
        customerPhone: customerPhone.trim(),
        customerEmail: customerEmail.trim(),
        projectName,
        requesterName: profile.full_name || 'Team Member',
        sendToSelf,
        recipientEmail: sendToSelf ? currentUserEmail : undefined
      };

      const { data: functionData } = await supabase.functions.invoke('send-paparazzi-request', {
        body: emailPayload
      });

      if (!functionData?.success) {
        console.error('Email sending failed, but request was created');
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);

    } catch (err: any) {
      console.error('Error submitting paparazzi request:', err);
      setError(err.message || 'Failed to submit request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[95vh] sm:max-h-[95vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <Camera className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
            <h2 className="text-lg sm:text-xl font-semibold">Request Paparazzi Photos</h2>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors ml-2 flex-shrink-0"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {success ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle className="h-12 w-12 sm:h-16 sm:w-16 text-green-500" />
              <h3 className="text-lg sm:text-xl font-semibold text-gray-900 text-center px-2">
                {sendToSelf ? 'Request Confirmed!' : 'Request Sent!'}
              </h3>
              <p className="text-sm sm:text-base text-gray-600 text-center px-4">
                {sendToSelf
                  ? 'Details have been sent to your email. Good luck with the photos - make us proud!'
                  : 'The photographer has been notified and will contact the customer to schedule the photo shoot.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

              {/* Customer Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Customer <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                    <input
                      type="text"
                      value={selectedContact ? (selectedContact.full_name || selectedContact.company_name) : searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setSelectedContact(null);
                        setShowContactDropdown(true);
                      }}
                      onFocus={() => setShowContactDropdown(true)}
                      placeholder="Search for a customer..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      disabled={loading}
                    />
                  </div>

                  {showContactDropdown && !selectedContact && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-[400px] overflow-y-auto">
                      {loading ? (
                        <div className="p-4 text-center text-gray-500">
                          <Loader className="h-5 w-5 animate-spin mx-auto" />
                        </div>
                      ) : filteredContacts.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No customers found
                        </div>
                      ) : (
                        filteredContacts.map(contact => (
                          <button
                            key={contact.id}
                            type="button"
                            onClick={() => {
                              setSelectedContact(contact);
                              setShowContactDropdown(false);
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-purple-50 transition-colors border-b border-gray-100 last:border-b-0"
                          >
                            <div className="font-medium text-gray-900">
                              {contact.full_name || contact.company_name}
                            </div>
                            {contact.company_name && contact.full_name && (
                              <div className="text-sm text-gray-500">{contact.company_name}</div>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Project Selection */}
              {selectedContact && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Project (Optional)
                  </label>
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  >
                    <option value="">No project selected</option>
                    {projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Description */}
              {selectedContact && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      What cool work was completed? <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe the impressive work that should be photographed. Include details that will help the photographer understand what to highlight..."
                      rows={4}
                      maxLength={characterLimit}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                    />
                    <div className="flex justify-between items-center mt-1">
                      <p className="text-xs text-gray-500">
                        Be specific about what makes this work special
                      </p>
                      <p className={`text-xs ${description.length > characterLimit - 50 ? 'text-orange-500' : 'text-gray-500'}`}>
                        {description.length} / {characterLimit}
                      </p>
                    </div>
                  </div>

                  {/* Send to Self Toggle */}
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <label className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <User className="h-5 w-5 text-gray-500 flex-shrink-0" />
                        <span className="text-sm font-medium text-gray-700">I'll be taking the photos myself</span>
                      </div>
                      <div className="relative flex-shrink-0 ml-4">
                        <input
                          type="checkbox"
                          checked={sendToSelf}
                          onChange={(e) => setSendToSelf(e.target.checked)}
                          className="sr-only"
                        />
                        <div className={`w-11 h-6 rounded-full transition-colors duration-200 ${sendToSelf ? 'bg-blue-500' : 'bg-gray-200'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${sendToSelf ? 'translate-x-5' : 'translate-x-0'}`} />
                        </div>
                      </div>
                    </label>
                    {sendToSelf && (
                      <div className="px-4 pb-3 border-t border-gray-100 bg-amber-50">
                        <p className="text-xs text-amber-700 mt-2 leading-relaxed italic">
                          We don't pay our staff to take pictures - so if you take pictures yourself, please do a good job but it's all on you!
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Customer Contact Info */}
                  <div className={`rounded-lg p-4 space-y-4 ${sendToSelf ? 'bg-gray-50 border border-gray-200 opacity-60' : 'bg-yellow-50 border border-yellow-200'}`}>
                    <div className="flex items-start space-x-2">
                      <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${sendToSelf ? 'text-gray-400' : 'text-yellow-600'}`} />
                      <p className={`text-sm ${sendToSelf ? 'text-gray-500' : 'text-yellow-800'}`}>
                        {sendToSelf
                          ? 'Customer contact info will be included in the details sent to you.'
                          : 'The photographer will use this information to contact the customer directly to schedule the photo shoot.'}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Phone
                      </label>
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder="(555) 555-5555"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Customer Email
                      </label>
                      <input
                        type="email"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        placeholder="customer@example.com"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="w-full sm:w-auto px-4 py-2.5 sm:py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !selectedContact || !description.trim()}
              className="w-full sm:w-auto px-6 py-2.5 sm:py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 font-medium"
            >
              {submitting ? (
                <>
                  <Loader className="h-5 w-5 animate-spin" />
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  <span>Send Request</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
