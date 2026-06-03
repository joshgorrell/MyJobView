import { useEffect, useState } from 'react';
import { Mail, Phone, Linkedin, Globe, Send, User, Building2, Check, MapPin, Edit3, Download, QrCode, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard, CompanySettings, CompanyOffice } from '../../lib/types';
import { UserBusinessCardEditor } from './UserBusinessCardEditor';

interface BusinessCardPageProps {
  slug: string;
  isOwnCard?: boolean;
  onCardUpdated?: () => void;
}

export function BusinessCardPage({ slug, isOwnCard = false, onCardUpdated }: BusinessCardPageProps) {
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [contactPhone, setContactPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  useEffect(() => {
    if (slug === 'temp' && isOwnCard) {
      setShowEditor(true);
      setLoading(false);
    } else {
      loadBusinessCard();
      loadCompanyInfo();
    }
  }, [slug, isOwnCard]);

  async function loadBusinessCard() {
    try {
      const query = supabase
        .from('business_cards')
        .select('*')
        .eq('slug', slug);

      if (!isOwnCard) {
        query.eq('is_active', true);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      setCard(data);
    } catch (error) {
      console.error('Error loading business card:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanyInfo() {
    try {
      const [settingsResult, officesResult] = await Promise.all([
        supabase.from('company_settings').select('*').maybeSingle(),
        supabase.from('company_offices').select('*').order('display_order', { ascending: true })
      ]);

      if (settingsResult.data) setCompanySettings(settingsResult.data);
      if (officesResult.data) setOffices(officesResult.data);
    } catch (error) {
      console.error('Error loading company info:', error);
    }
  }

  async function downloadVCard() {
    if (!card) return;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-vcard`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName: card.full_name,
            title: card.title,
            email: card.email,
            phone: card.phone,
            company: companySettings?.company_name,
            website: companySettings?.website,
            linkedinUrl: card.linkedin_url,
            photoUrl: card.photo_url,
            bio: card.bio,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate vCard');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.full_name.replace(/\s+/g, '_')}.vcf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading vCard:', error);
      alert('Failed to download contact card');
    }
  }

  async function generateQRCode() {
    if (!card) return;

    setLoadingQR(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-qr-vcard`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fullName: card.full_name,
            title: card.title,
            email: card.email,
            phone: card.phone,
            company: companySettings?.company_name,
            website: companySettings?.website,
            linkedinUrl: card.linkedin_url,
            photoUrl: card.photo_url,
            bio: card.bio,
          }),
        }
      );

      if (!response.ok) throw new Error('Failed to generate QR code');

      const data = await response.json();
      setQrCode(data.qrCode);
      setShowQRModal(true);
    } catch (error) {
      console.error('Error generating QR code:', error);
      alert('Failed to generate QR code');
    } finally {
      setLoadingQR(false);
    }
  }

  async function handleSendCard(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;

    setSending(true);

    try {
      const { data: capture, error: captureError } = await supabase
        .from('contact_captures')
        .insert([
          {
            business_card_id: card.id,
            contact_phone: contactPhone,
            contact_name: contactName || null,
            captured_by: card.user_id,
          },
        ])
        .select()
        .single();

      if (captureError) throw captureError;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-business-card`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          captureId: capture.id,
          cardSlug: card.slug,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to send SMS');
      }

      setSent(true);
      setContactPhone('');
      setContactName('');

      setTimeout(() => setSent(false), 5000);
    } catch (error) {
      console.error('Error sending card:', error);
      alert('Failed to send business card. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return (
      <div className={isOwnCard ? "text-center py-12" : "min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center"}>
        <div className="text-gray-300 text-lg">Loading...</div>
      </div>
    );
  }

  if (!card && slug !== 'temp') {
    if (isOwnCard) {
      return (
        <div className="text-center py-12">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Card Not Found</h2>
          <p className="text-gray-300">Unable to load your business card.</p>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8 max-w-md text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Card Not Found</h2>
          <p className="text-gray-300">This business card doesn't exist or has been deactivated.</p>
        </div>
      </div>
    );
  }

  if (slug === 'temp' && isOwnCard && !card) {
    return (
      <div>
        {showEditor && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
            <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-xl w-full max-w-4xl my-2 sm:my-8">
              <div className="flex justify-between items-center p-4 border-b border-gray-700">
                <h2 className="text-xl font-bold text-white">Create Business Card</h2>
                <button
                  onClick={() => {
                    setShowEditor(false);
                    if (onCardUpdated) onCardUpdated();
                  }}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-4 sm:px-8 pb-4 sm:pb-8 pt-4">
                <UserBusinessCardEditor />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={isOwnCard ? "p-0" : "min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 py-12"}>
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 overflow-hidden">
          {companySettings?.company_logo_url && (
            <div className="bg-white py-6 px-4 sm:py-8 sm:px-8 flex justify-center border-b border-gray-700">
              <img
                src={companySettings.company_logo_url}
                alt={companySettings.company_name}
                className="h-12 sm:h-16 w-auto object-contain max-w-[200px] sm:max-w-md"
              />
            </div>
          )}

          <div className="relative h-24 sm:h-32 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600">
            <div className="absolute -bottom-12 sm:-bottom-16 left-4 sm:left-8">
              {card.photo_url ? (
                <img
                  src={card.photo_url}
                  alt={card.full_name}
                  className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-gray-900 object-cover shadow-lg shadow-purple-500/50"
                />
              ) : (
                <div className="w-24 h-24 sm:w-32 sm:h-32 rounded-full border-4 border-gray-900 bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/50">
                  <User className="w-12 h-12 sm:w-16 sm:h-16 text-white" />
                </div>
              )}
            </div>
          </div>

          <div className="pt-16 sm:pt-20 px-4 sm:px-8 pb-6 sm:pb-8">
            <div className="mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                {card.full_name}
              </h1>
              <p className="text-lg sm:text-xl text-gray-300">{card.title}</p>
              {companySettings?.company_name && (
                <p className="text-base sm:text-lg text-gray-400 mt-1">{companySettings.company_name}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <a
                href={`mailto:${card.email}`}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
              >
                <div className="p-2 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg">
                  <Mail className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">Email</p>
                  <p className="text-sm text-white truncate group-hover:text-cyan-400 transition-colors">
                    {card.email}
                  </p>
                </div>
              </a>

              <a
                href={`tel:${card.phone}`}
                className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
              >
                <div className="p-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400">Phone</p>
                  <p className="text-sm text-white truncate group-hover:text-purple-400 transition-colors">
                    {card.phone}
                  </p>
                </div>
              </a>

              {card.linkedin_url && (
                <a
                  href={card.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg">
                    <Linkedin className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">LinkedIn</p>
                    <p className="text-sm text-white truncate group-hover:text-blue-400 transition-colors">
                      View Profile
                    </p>
                  </div>
                </a>
              )}

              {companySettings?.website && (
                <a
                  href={companySettings.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-purple-500/50 transition-all group"
                >
                  <div className="p-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg">
                    <Globe className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-400">Website</p>
                    <p className="text-sm text-white truncate group-hover:text-green-400 transition-colors">
                      {companySettings.website.replace(/^https?:\/\/(www\.)?/, '')}
                    </p>
                  </div>
                </a>
              )}
            </div>

            {card.bio && (
              <div className="mb-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-300 mb-2">About</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{card.bio}</p>
              </div>
            )}

            {offices.length > 0 && (
              <div className="mb-6 p-4 bg-gray-800/30 rounded-lg border border-gray-700">
                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2 mb-3">
                  <MapPin className="w-4 h-4" />
                  Office Locations
                </h4>
                <div className="space-y-3">
                  {offices.map((office) => (
                    <div key={office.id} className="text-sm text-gray-400 pl-6 border-l-2 border-gray-700">
                      <p className="font-medium text-white">{office.office_name}</p>
                      {office.phone && (
                        <a href={`tel:${office.phone}`} className="hover:text-cyan-400 block">
                          {office.phone}
                        </a>
                      )}
                      {office.address_line1 && (
                        <p>
                          {office.address_line1}
                          {office.address_line2 && `, ${office.address_line2}`}
                        </p>
                      )}
                      {(office.city || office.state || office.zip) && (
                        <p>
                          {office.city && `${office.city}, `}
                          {office.state && `${office.state} `}
                          {office.zip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!isOwnCard && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={downloadVCard}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-medium"
                >
                  <Download className="w-4 h-4" />
                  Save Contact
                </button>
                <button
                  onClick={generateQRCode}
                  disabled={loadingQR}
                  className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition-all font-medium disabled:opacity-50"
                >
                  <QrCode className="w-4 h-4" />
                  {loadingQR ? 'Generating...' : 'QR Code'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Share This Card</h2>
          <p className="text-gray-400 mb-6">
            Send this digital business card directly to a contact's phone via SMS
          </p>

          {sent ? (
            <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 flex items-center gap-3">
              <div className="p-2 bg-green-500 rounded-lg">
                <Check className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-green-400 font-semibold">Card Sent Successfully!</p>
                <p className="text-green-300 text-sm">The contact will receive it shortly.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSendCard} className="space-y-4">

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contact Name (Optional)
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
                  placeholder="John Doe"
                  disabled={sending}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Contact Phone Number *
                </label>
                <input
                  type="tel"
                  required
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent placeholder-gray-500"
                  placeholder="+1 (555) 123-4567"
                  disabled={sending}
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-blue-500/50 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {sending ? (
                  <>Sending...</>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Card
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {isOwnCard && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowEditor(true)}
              className="text-sm text-gray-500 hover:text-cyan-400 transition-colors flex items-center gap-1 mx-auto"
            >
              <Edit3 className="w-3 h-3" />
              Edit my card
            </button>
          </div>
        )}
      </div>

      {showQRModal && qrCode && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-6 sm:p-8 max-w-md w-full">
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3 className="text-lg sm:text-xl font-bold text-white">Scan to Save Contact</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="bg-white p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
              <img src={qrCode} alt="QR Code" className="w-full h-auto" />
            </div>
            <p className="text-gray-400 text-xs sm:text-sm text-center mb-4">
              Scan this QR code with your phone camera to save the contact information
            </p>
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = qrCode;
                link.download = `${card?.full_name.replace(/\s+/g, '_')}_QR.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <Download className="w-4 h-4" />
              Download QR Code
            </button>
          </div>
        </div>
      )}

      {showEditor && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 rounded-xl w-full max-w-4xl my-2 sm:my-8">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">Edit Business Card</h2>
              <button
                onClick={() => {
                  setShowEditor(false);
                  loadBusinessCard();
                  if (onCardUpdated) onCardUpdated();
                }}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 sm:px-8 pb-4 sm:pb-8 pt-4">
              <UserBusinessCardEditor />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
