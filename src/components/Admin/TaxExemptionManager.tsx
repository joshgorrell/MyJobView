import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Shield,
  Upload,
  FileText,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Search,
  Download,
  Trash2,
  HelpCircle,
  X,
} from 'lucide-react';
import {
  TaxExemptionCertificate,
  isValidCertificate,
  EXEMPTION_CATEGORY_LABELS,
  ExemptionCategory,
  STATE_EXEMPTION_FORMS,
} from '../../lib/taxCalculations';
import ConfirmModal from '../ui/ConfirmModal';

interface Contact {
  id: string;
  full_name: string;
  company?: string;
  email?: string;
  is_tax_exempt: boolean;
}

export default function TaxExemptionManager() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [certificates, setCertificates] = useState<TaxExemptionCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [contactsResult, certificatesResult] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, full_name, company, email, is_tax_exempt')
          .eq('is_tax_exempt', true)
          .order('full_name'),
        supabase
          .from('tax_exemption_certificates')
          .select('*')
          .order('created_at', { ascending: false }),
      ]);

      if (contactsResult.error) throw contactsResult.error;
      if (certificatesResult.error) throw certificatesResult.error;

      setContacts(contactsResult.data || []);
      setCertificates(certificatesResult.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = contacts.filter(
    (c) =>
      searchTerm === '' ||
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function getContactCertificates(contactId: string) {
    return certificates.filter((c) => c.contact_id === contactId);
  }

  function getActiveCertificate(contactId: string) {
    const contactCerts = getContactCertificates(contactId);
    return contactCerts.find((c) => c.is_active && isValidCertificate(c));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-gray-900">Tax Exemption Certificates</h2>
            <button
              onClick={() => setShowHelpModal(true)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="How tax exemptions work"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Manage tax exemption certificates for tax-exempt customers
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-yellow-900">Important</h3>
            <p className="text-sm text-yellow-800 mt-1">
              A valid, non-expired certificate must be on file for any customer marked as
              tax-exempt. Certificates are automatically validated before applying exemptions.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tax-exempt contacts..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Certificate Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Expiration
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredContacts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No tax-exempt contacts found. Mark contacts as tax-exempt in the Contacts
                    module.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => {
                  const activeCert = getActiveCertificate(contact.id);
                  const allCerts = getContactCertificates(contact.id);
                  const isValid = activeCert && isValidCertificate(activeCert);

                  return (
                    <tr key={contact.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">{contact.full_name}</div>
                          {contact.company && (
                            <div className="text-sm text-gray-500">{contact.company}</div>
                          )}
                          {contact.email && (
                            <div className="text-xs text-gray-400">{contact.email}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {isValid ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Valid Certificate
                          </span>
                        ) : activeCert && !isValidCertificate(activeCert) ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            No Certificate
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {activeCert?.certificate_number || '-'}
                      </td>
                      <td className="px-6 py-4">
                        {activeCert?.expiration_date ? (
                          <div className="flex items-center gap-1 text-sm text-gray-900">
                            <Calendar className="w-4 h-4 text-gray-400" />
                            {new Date(activeCert.expiration_date).toLocaleDateString()}
                          </div>
                        ) : activeCert ? (
                          <span className="text-sm text-gray-500">No expiration</span>
                        ) : (
                          <span className="text-sm text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedContact(contact);
                            setShowUploadModal(true);
                          }}
                          className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 text-sm"
                        >
                          <Upload className="w-4 h-4" />
                          {allCerts.length > 0 ? 'Update' : 'Upload'}
                        </button>
                        {allCerts.length > 0 && (
                          <button
                            onClick={() => setSelectedContact(contact)}
                            className="text-gray-600 hover:text-gray-800 inline-flex items-center gap-1 text-sm"
                          >
                            <FileText className="w-4 h-4" />
                            View ({allCerts.length})
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showUploadModal && selectedContact && (
        <UploadCertificateModal
          contact={selectedContact}
          onClose={() => {
            setShowUploadModal(false);
            setSelectedContact(null);
          }}
          onSave={() => {
            setShowUploadModal(false);
            setSelectedContact(null);
            loadData();
          }}
        />
      )}

      {selectedContact && !showUploadModal && (
        <CertificateListModal
          contact={selectedContact}
          certificates={getContactCertificates(selectedContact.id)}
          onClose={() => setSelectedContact(null)}
          onUpdate={loadData}
        />
      )}

      {showHelpModal && <TaxExemptionHelpModal onClose={() => setShowHelpModal(false)} />}
    </div>
  );
}

function UploadCertificateModal({
  contact,
  onClose,
  onSave,
}: {
  contact: Contact;
  onClose: () => void;
  onSave: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({
    certificate_number: '',
    certificate_type: 'resale',
    exemption_category: '' as ExemptionCategory | '',
    issuing_authority: '',
    issuing_state: '',
    state_form_number: '',
    issue_date: '',
    expiration_date: '',
    buyer_name: '',
    buyer_address: '',
    notes: '',
  });
  const [file, setFile] = useState<File | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      alert('Please select a certificate file to upload.');
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profileData } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .maybeSingle();

      const fileExt = file.name.split('.').pop();
      const fileName = `${contact.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('tax-certificates')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from('tax_exemption_certificates')
        .insert([
          {
            ...formData,
            exemption_category: formData.exemption_category || null,
            state_form_number: formData.state_form_number || null,
            buyer_name: formData.buyer_name || null,
            buyer_address: formData.buyer_address || null,
            contact_id: contact.id,
            organization_id: profileData?.organization_id,
            certificate_file_path: fileName,
            certificate_file_name: file.name,
            is_active: true,
          },
        ]);

      if (insertError) throw insertError;

      onSave();
    } catch (error) {
      console.error('Error uploading certificate:', error);
      alert('Failed to upload certificate.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Upload Tax Exemption Certificate</h3>
            <p className="text-sm text-gray-600 mt-1">
              For: {contact.full_name}
              {contact.company && ` (${contact.company})`}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Certificate File *
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  id="certificate-file"
                  required
                />
                <label
                  htmlFor="certificate-file"
                  className="cursor-pointer flex flex-col items-center gap-2"
                >
                  <Upload className="w-8 h-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {file ? file.name : 'Click to upload certificate'}
                  </span>
                  <span className="text-xs text-gray-400">PDF, JPG, or PNG (Max 10MB)</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate Number *
                </label>
                <input
                  type="text"
                  required
                  value={formData.certificate_number}
                  onChange={(e) =>
                    setFormData({ ...formData, certificate_number: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                <select
                  required
                  value={formData.certificate_type}
                  onChange={(e) => setFormData({ ...formData, certificate_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="resale">Resale Certificate</option>
                  <option value="exempt_organization">Exempt Organization</option>
                  <option value="government">Government Entity</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Exemption Category</label>
                <select
                  value={formData.exemption_category}
                  onChange={(e) => setFormData({ ...formData, exemption_category: e.target.value as ExemptionCategory | '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select —</option>
                  {(Object.entries(EXEMPTION_CATEGORY_LABELS) as [ExemptionCategory, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State Form Number</label>
                <input
                  type="text"
                  value={formData.state_form_number}
                  onChange={(e) => setFormData({ ...formData, state_form_number: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder={formData.issuing_state ? (STATE_EXEMPTION_FORMS[formData.issuing_state.toUpperCase()] || '') : 'e.g., ST-28'}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Issuing Authority *
                </label>
                <input
                  type="text"
                  required
                  value={formData.issuing_authority}
                  onChange={(e) =>
                    setFormData({ ...formData, issuing_authority: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Texas Comptroller"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <input
                  type="text"
                  required
                  value={formData.issuing_state}
                  onChange={(e) => {
                    const st = e.target.value.toUpperCase().slice(0, 2);
                    const autoForm = STATE_EXEMPTION_FORMS[st] || '';
                    setFormData({
                      ...formData,
                      issuing_state: e.target.value,
                      state_form_number: formData.state_form_number || autoForm,
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="TX"
                  maxLength={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Issue Date *
                </label>
                <input
                  type="date"
                  required
                  value={formData.issue_date}
                  onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiration Date
                </label>
                <input
                  type="date"
                  value={formData.expiration_date}
                  onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Name</label>
              <input
                type="text"
                value={formData.buyer_name}
                onChange={(e) => setFormData({ ...formData, buyer_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Name on the exemption certificate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Buyer Address</label>
              <textarea
                value={formData.buyer_address}
                onChange={(e) => setFormData({ ...formData, buyer_address: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Address on the exemption certificate"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Upload Certificate
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CertificateListModal({
  contact,
  certificates,
  onClose,
  onUpdate,
}: {
  contact: Contact;
  certificates: TaxExemptionCertificate[];
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [confirmDeleteCert, setConfirmDeleteCert] = useState<TaxExemptionCertificate | null>(null);

  async function downloadCertificate(cert: TaxExemptionCertificate) {
    if (!cert.certificate_file_path) return;

    try {
      const { data, error } = await supabase.storage
        .from('tax-certificates')
        .download(cert.certificate_file_path);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = cert.certificate_file_name || 'certificate.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading certificate:', error);
      alert('Failed to download certificate.');
    }
  }

  async function deleteCertificate(cert: TaxExemptionCertificate) {
    try {
      if (cert.certificate_file_path) {
        await supabase.storage.from('tax-certificates').remove([cert.certificate_file_path]);
      }

      const { error } = await supabase
        .from('tax_exemption_certificates')
        .delete()
        .eq('id', cert.id);

      if (error) throw error;

      onUpdate();
    } catch (error) {
      console.error('Error deleting certificate:', error);
      alert('Failed to delete certificate.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold">Certificate History</h3>
          <p className="text-sm text-gray-600 mt-1">
            For: {contact.full_name}
            {contact.company && ` (${contact.company})`}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {certificates.map((cert) => {
            const isValid = isValidCertificate(cert);
            return (
              <div
                key={cert.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Certificate #{cert.certificate_number}
                    </div>
                    <div className="text-sm text-gray-500">
                      {cert.certificate_type.replace('_', ' ')}
                    </div>
                  </div>
                  {isValid ? (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Valid
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {!cert.is_active ? 'Inactive' : 'Expired'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm mb-3">
                  <div>
                    <span className="text-gray-500">Issuing Authority:</span>
                    <div className="font-medium">{cert.issuing_authority}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">State:</span>
                    <div className="font-medium">{cert.issuing_state}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Issue Date:</span>
                    <div className="font-medium">
                      {new Date(cert.issue_date).toLocaleDateString()}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">Expiration:</span>
                    <div className="font-medium">
                      {cert.expiration_date
                        ? new Date(cert.expiration_date).toLocaleDateString()
                        : 'No expiration'}
                    </div>
                  </div>
                </div>

                {cert.notes && (
                  <div className="text-sm text-gray-600 mb-3 p-2 bg-gray-50 rounded">
                    {cert.notes}
                  </div>
                )}

                <div className="flex gap-2">
                  {cert.certificate_file_path && (
                    <button
                      onClick={() => downloadCertificate(cert)}
                      className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
                  )}
                  <button
                    onClick={() => setConfirmDeleteCert(cert)}
                    className="text-red-600 hover:text-red-800 text-sm flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {certificates.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No certificates found for this contact.
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:text-gray-900">
            Close
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmDeleteCert !== null}
        title="Delete Certificate"
        message="Are you sure you want to delete this certificate?"
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (confirmDeleteCert) deleteCertificate(confirmDeleteCert);
          setConfirmDeleteCert(null);
        }}
        onCancel={() => setConfirmDeleteCert(null)}
      />
    </div>
  );
}

function TaxExemptionHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-start">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">How Tax Exemptions Work</h3>
            <p className="text-sm text-gray-600 mt-1">
              Understanding the tax exemption certificate system
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div>
            <div className="flex items-start gap-3 mb-3">
              <div className="bg-blue-100 rounded-lg p-2">
                <Shield className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">Certificate Requirements</h4>
                <p className="text-sm text-gray-600 mt-1">
                  A valid, non-expired certificate MUST be on file for any customer marked as
                  tax-exempt. Without a valid certificate, the system will automatically apply
                  sales tax.
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="font-semibold text-gray-900 mb-3">How the System Works</h4>
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-sm font-semibold">
                  1
                </div>
                <div>
                  <p className="font-medium text-gray-900">Valid Certificate on File</p>
                  <p className="text-sm text-gray-600 mt-1">
                    When a contact has a valid, non-expired certificate, NO sales tax is applied
                    to their proposals and invoices.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-yellow-100 text-yellow-600 flex items-center justify-center text-sm font-semibold">
                  2
                </div>
                <div>
                  <p className="font-medium text-gray-900">No Certificate Uploaded</p>
                  <p className="text-sm text-gray-600 mt-1">
                    If a contact is marked as tax-exempt but NO certificate has been uploaded, the
                    default sales tax rate (9.35%) is automatically applied until a valid
                    certificate is added.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-semibold">
                  3
                </div>
                <div>
                  <p className="font-medium text-gray-900">Expired Certificate</p>
                  <p className="text-sm text-gray-600 mt-1">
                    When a certificate expires, sales tax is automatically applied again until a
                    new valid certificate is uploaded. This ensures legal compliance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h4 className="font-semibold text-gray-900 mb-3">Certificate Status Indicators</h4>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 gap-1">
                  <CheckCircle className="w-3 h-3" />
                  Valid Certificate
                </span>
                <span className="text-sm text-gray-600">
                  Active certificate, not expired - NO tax applied
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Expired
                </span>
                <span className="text-sm text-gray-600">
                  Certificate has expired - sales tax IS applied
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  No Certificate
                </span>
                <span className="text-sm text-gray-600">
                  No certificate on file - sales tax IS applied
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <FileText className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Best Practices</h4>
                  <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                    <li>Upload certificates immediately when marking a contact as tax-exempt</li>
                    <li>Monitor expiration dates and request renewals in advance</li>
                    <li>Keep digital copies of all certificates for audit purposes</li>
                    <li>Verify certificate details match the issuing authority records</li>
                    <li>Review the "No Certificate" list regularly to ensure compliance</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Legal Note:</span> Tax exemption certificates are
                legal documents. Always verify the authenticity of certificates and ensure they
                are properly completed. Improper use of tax exemptions can result in penalties and
                back-taxes.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end">
          <button
            onClick={onClose}
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
