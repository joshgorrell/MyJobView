import { useState, useEffect } from 'react';
import { X, Phone, Mail, MapPin, Building2, ExternalLink, FileText, Briefcase, DollarSign, CheckSquare, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface ContactQuickViewData {
  id: string;
  full_name: string;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  business_phone: string | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
}

interface RelatedCounts {
  proposals: number;
  salesOrders: number;
  invoices: number;
  workOrders: number;
}

interface ContactQuickViewModalProps {
  contactId: string;
  onClose: () => void;
  onNavigateToContact?: (contactId: string) => void;
}

export function ContactQuickViewModal({ contactId, onClose, onNavigateToContact }: ContactQuickViewModalProps) {
  const [contact, setContact] = useState<ContactQuickViewData | null>(null);
  const [counts, setCounts] = useState<RelatedCounts>({ proposals: 0, salesOrders: 0, invoices: 0, workOrders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContact();
  }, [contactId]);

  async function loadContact() {
    try {
      const [contactRes, proposalsRes, salesOrdersRes, invoicesRes, workOrdersRes] = await Promise.all([
        supabase
          .from('contacts')
          .select('id, full_name, company_name, email, phone, business_phone, street_address, city, state, zip_code')
          .eq('id', contactId)
          .maybeSingle(),
        supabase.from('proposals').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
        supabase.from('work_orders').select('id', { count: 'exact', head: true }).eq('contact_id', contactId),
      ]);

      if (contactRes.data) setContact(contactRes.data);
      setCounts({
        proposals: proposalsRes.count || 0,
        salesOrders: salesOrdersRes.count || 0,
        invoices: invoicesRes.count || 0,
        workOrders: workOrdersRes.count || 0,
      });
    } catch (err) {
      console.error('Error loading contact quick view:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleNavigate() {
    if (onNavigateToContact) {
      onNavigateToContact(contactId);
    } else {
      window.location.href = `/?tab=contacts&contactId=${contactId}`;
    }
    onClose();
  }

  const displayPhone = contact?.phone || contact?.business_phone;
  const addressParts = [contact?.street_address, contact?.city, contact?.state, contact?.zip_code].filter(Boolean);

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="bg-[#0f2347] px-5 py-4 flex items-start justify-between">
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-5 bg-white/20 rounded animate-pulse w-32 mb-1" />
            ) : (
              <h3 className="text-white font-semibold text-base leading-tight truncate">
                {contact?.full_name || 'Contact'}
              </h3>
            )}
            {contact?.company_name && (
              <p className="text-blue-200 text-sm mt-0.5 truncate flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                {contact.company_name}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-3 p-1 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="p-6 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : !contact ? (
          <div className="p-6 text-center text-gray-500 text-sm">Contact not found.</div>
        ) : (
          <>
            {/* Contact Info */}
            <div className="px-5 py-4 space-y-2.5">
              {displayPhone && (
                <a
                  href={`tel:${displayPhone}`}
                  className="flex items-center gap-3 text-sm text-gray-700 hover:text-blue-600 group"
                >
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                    <Phone className="w-4 h-4 text-blue-600" />
                  </div>
                  <span>{displayPhone}</span>
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex items-center gap-3 text-sm text-gray-700 hover:text-blue-600 group"
                >
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                    <Mail className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="truncate">{contact.email}</span>
                </a>
              )}
              {addressParts.length > 0 && (
                <div className="flex items-start gap-3 text-sm text-gray-700">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="leading-snug">{addressParts.join(', ')}</span>
                </div>
              )}
              {!displayPhone && !contact.email && addressParts.length === 0 && (
                <p className="text-sm text-gray-400 italic">No contact info on file.</p>
              )}
            </div>

            {/* Related counts */}
            <div className="px-5 pb-4 grid grid-cols-4 gap-2">
              {[
                { icon: <FileText className="w-4 h-4" />, label: 'Proposals', count: counts.proposals, color: 'text-blue-600' },
                { icon: <CheckSquare className="w-4 h-4" />, label: 'Orders', count: counts.salesOrders, color: 'text-green-600' },
                { icon: <DollarSign className="w-4 h-4" />, label: 'Invoices', count: counts.invoices, color: 'text-orange-600' },
                { icon: <Briefcase className="w-4 h-4" />, label: 'Work Orders', count: counts.workOrders, color: 'text-teal-600' },
              ].map(({ icon, label, count, color }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-2 text-center">
                  <div className={`flex justify-center mb-1 ${color}`}>{icon}</div>
                  <p className="text-lg font-bold text-gray-900 leading-none">{count}</p>
                  <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                onClick={handleNavigate}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#0f2347] text-white rounded-xl hover:bg-[#1a3460] transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4" />
                View Full Contact Page
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
