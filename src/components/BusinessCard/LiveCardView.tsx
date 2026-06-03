import { useState, useEffect } from 'react';
import { User, Mail, Phone, Linkedin, Globe, MapPin, QrCode, Download, X, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard, CompanySettings, CompanyOffice } from '../../lib/types';

interface LiveCardViewProps {
  cardId: string;
  onClose: () => void;
}

export function LiveCardView({ cardId, onClose }: LiveCardViewProps) {
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loadingQR, setLoadingQR] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadCard();
    loadCompanyInfo();
  }, [cardId]);

  async function loadCard() {
    try {
      const { data, error } = await supabase
        .from('business_cards')
        .select('*')
        .eq('id', cardId)
        .single();

      if (error) throw error;
      setCard(data);
    } catch (error) {
      console.error('Error loading card:', error);
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

  async function copyVCard() {
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
      const text = await blob.text();

      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Error copying vCard:', error);
      alert('Failed to copy contact card');
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-gray-300 text-lg">Loading...</div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8 max-w-md text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Card Not Found</h2>
          <p className="text-gray-300 mb-4">Unable to load business card.</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center z-50 overflow-y-auto p-4">
      <div className="w-full max-w-4xl my-8">
        <div className="flex justify-end mb-4">
          <button
            onClick={onClose}
            className="p-2 bg-gray-800/80 backdrop-blur-sm text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-gray-900/90 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 overflow-hidden">
          <div className="relative h-20 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 flex items-center justify-center">
            <p className="text-white text-sm font-medium tracking-wide flex items-center gap-3">
              <span>Home Theater</span>
              <span className="text-cyan-200">•</span>
              <span>Commercial A/V</span>
              <span className="text-cyan-200">•</span>
              <span>Security Systems</span>
            </p>
          </div>

          <div className="p-8">
            <div className="flex items-start gap-6 mb-8">
            {card.photo_url ? (
              <img
                src={card.photo_url}
                alt={card.full_name}
                className="w-24 h-24 rounded-full object-cover shadow-lg shadow-purple-500/30 flex-shrink-0"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 flex-shrink-0">
                <User className="w-12 h-12 text-white" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              {companySettings?.company_logo_url && (
                <img
                  src={companySettings.company_logo_url}
                  alt={companySettings.company_name}
                  className="h-10 w-auto object-contain mb-4"
                />
              )}
              <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-1">
                {card.full_name}
              </h1>
              <p className="text-lg text-gray-300 mb-1">{card.title}</p>
              {companySettings?.company_name && (
                <p className="text-sm text-gray-400">{companySettings.company_name}</p>
              )}
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={generateQRCode}
              disabled={loadingQR}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition-all font-medium disabled:opacity-50"
            >
              <QrCode className="w-5 h-5" />
              {loadingQR ? 'Generating...' : 'Show QR Code'}
            </button>
            <button
              onClick={copyVCard}
              className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all font-medium"
            >
              {copied ? (
                <>
                  <Check className="w-5 h-5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-5 h-5" />
                  Copy vCard
                </>
              )}
            </button>
          </div>
          </div>
        </div>
      </div>

      {showQRModal && qrCode && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/30 p-8 max-w-md w-full">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">Scan to Save Contact</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="bg-white p-4 rounded-lg mb-6">
              <img src={qrCode} alt="QR Code" className="w-full h-auto" />
            </div>
            <p className="text-gray-400 text-sm text-center mb-4">
              Scan this QR code with your phone camera to save the contact information
            </p>
            <button
              onClick={() => {
                const link = document.createElement('a');
                link.href = qrCode;
                link.download = `${card.full_name.replace(/\s+/g, '_')}_QR.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg hover:shadow-purple-500/50 transition-all flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download QR Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
