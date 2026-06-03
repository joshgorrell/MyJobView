import { useState, useEffect, useRef } from 'react';
import { CreditCard, Upload, X, Save, User, Mail, Phone, Linkedin, Globe, MapPin, Send, Check, Edit3, Eye, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard, CompanySettings, CompanyOffice } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

export function MyCardView() {
  const { user } = useAuth();
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const [contactPhone, setContactPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  useEffect(() => {
    loadCard();
    loadCompanyInfo();
  }, [user]);

  async function loadCard() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('business_cards')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setCard(data);
        setFullName(data.full_name);
        setTitle(data.title);
        setEmail(data.email);
        setPhone(data.phone);
        setLinkedinUrl(data.linkedin_url || '');
        setBio(data.bio || '');
        setPhotoUrl(data.photo_url || '');
      }
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

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/photo-${Date.now()}.${fileExt}`;

      if (photoUrl) {
        const oldFileName = photoUrl.split('/').pop();
        if (oldFileName) {
          await supabase.storage
            .from('business_card_photos')
            .remove([`${user.id}/${oldFileName}`]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('business_card_photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('business_card_photos')
        .getPublicUrl(fileName);

      setPhotoUrl(publicUrl);
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Failed to upload photo');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function removePhoto() {
    if (!photoUrl || !user) return;

    try {
      const fileName = photoUrl.split('/').pop();
      if (fileName) {
        await supabase.storage
          .from('business_card_photos')
          .remove([`${user.id}/${fileName}`]);
      }
      setPhotoUrl('');
    } catch (error) {
      console.error('Error removing photo:', error);
      alert('Failed to remove photo');
    }
  }

  async function saveCard() {
    if (!user) return;

    setSaving(true);
    try {
      const cardData = {
        user_id: user.id,
        full_name: fullName,
        title: title,
        email: email,
        phone: phone,
        linkedin_url: linkedinUrl || null,
        bio: bio || null,
        photo_url: photoUrl || null,
        updated_at: new Date().toISOString()
      };

      if (card) {
        const { error } = await supabase
          .from('business_cards')
          .update(cardData)
          .eq('id', card.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('business_cards')
          .insert({
            ...cardData,
            slug: `${fullName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
            is_active: true
          });

        if (error) throw error;
      }

      alert('Business card saved successfully!');
      setIsEditing(false);
      await loadCard();
    } catch (error) {
      console.error('Error saving card:', error);
      alert('Failed to save business card');
    } finally {
      setSaving(false);
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
    return <div className="text-center py-8 text-gray-300">Loading your business card...</div>;
  }

  if (!card && !isEditing) {
    return (
      <div className="max-w-4xl mx-auto text-center py-12">
        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-8">
          <CreditCard className="w-16 h-16 text-gray-500 mx-auto mb-4" />
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">No Business Card Yet</h2>
          <p className="text-gray-400 mb-6">Create your digital business card to share with customers</p>
          <button
            onClick={() => setIsEditing(true)}
            className="px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg font-semibold hover:from-cyan-600 hover:to-purple-700 transition-all"
          >
            Create Business Card
          </button>
        </div>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
              <CreditCard className="w-6 h-6" />
              {card ? 'Edit Business Card' : 'Create Business Card'}
            </h2>
            <p className="text-gray-400">Update your card information</p>
          </div>
          {card && (
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Profile Photo
            </label>

            {photoUrl && (
              <div className="mb-3 flex items-center gap-3 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                <img
                  src={photoUrl}
                  alt="Profile"
                  className="w-20 h-20 rounded-full object-cover"
                />
                <button
                  onClick={() => setConfirmModal({ title: 'Remove Photo', message: 'Are you sure you want to remove your photo?', onConfirm: removePhoto })}
                  className="ml-auto p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Remove photo"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                className="hidden"
                id="photo-upload"
              />
              <label
                htmlFor="photo-upload"
                className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  uploading
                    ? 'border-gray-600 bg-gray-800/50 cursor-not-allowed'
                    : 'border-gray-600 hover:border-purple-500 hover:bg-purple-500/10'
                }`}
              >
                <Upload className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-300">
                  {uploading ? 'Uploading...' : 'Upload Photo'}
                </span>
              </label>
              <p className="text-xs text-gray-500">
                Square image recommended. Max 5MB.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Job Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="e.g., Sales Manager"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Phone *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="(555) 123-4567"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="https://linkedin.com/in/yourprofile"
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                placeholder="Tell people about yourself and what you do..."
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={saveCard}
              disabled={saving || !fullName || !title || !email || !phone}
              className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-lg hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Business Card'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <CreditCard className="w-6 h-6" />
            My Business Card
          </h2>
          <p className="text-gray-400">Manage and share your card</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => window.open(`/card/${card.slug}`, '_blank')}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg hover:from-cyan-600 hover:to-blue-700 transition-all font-medium shadow-lg shadow-cyan-500/20"
          >
            <Eye className="w-4 h-4" />
            View Live Card
          </button>
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>

      <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-8">
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
          <div className="p-4 bg-gray-800/30 rounded-lg border border-gray-700">
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
      </div>

      <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-8">
        <h3 className="text-xl font-bold text-white mb-2">Send Card via Text</h3>
        <p className="text-gray-400 mb-6">
          Send your business card to a customer via SMS
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

      <ConfirmModal
        isOpen={confirmModal !== null}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        onConfirm={() => { confirmModal?.onConfirm(); setConfirmModal(null); }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
