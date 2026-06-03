import { useState, useEffect, useRef } from 'react';
import { CreditCard, Upload, X, Save, Eye, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';

export function UserBusinessCardEditor() {
  const { user } = useAuth();
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    loadCard();
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
      loadCard();
    } catch (error) {
      console.error('Error saving card:', error);
      alert('Failed to save business card');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-gray-400">Loading your business card...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {card && (
        <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start justify-between gap-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-cyan-400 mb-1">Your card is live!</p>
            <p className="text-xs sm:text-sm text-gray-400 break-all">
              Share: {window.location.origin}/card/{card.slug}
            </p>
          </div>
          <a
            href={`/card/${card.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-sm whitespace-nowrap"
          >
            <Eye className="w-4 h-4" />
            Preview
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div>
          <label className="block text-sm font-medium text-white mb-2">
            Profile Photo
          </label>

          {photoUrl && (
            <div className="mb-3 flex items-center gap-3 p-3 bg-gray-700 rounded-lg border border-gray-600">
              <img
                src={photoUrl}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover"
              />
              <button
                onClick={() => setConfirmModal({ title: 'Remove Photo', message: 'Are you sure you want to remove your photo?', onConfirm: removePhoto })}
                className="ml-auto p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
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
                  ? 'border-gray-600 bg-gray-700 cursor-not-allowed'
                  : 'border-gray-600 hover:border-cyan-500 hover:bg-gray-700'
              }`}
            >
              <Upload className="w-5 h-5 text-gray-400" />
              <span className="text-sm font-medium text-white">
                {uploading ? 'Uploading...' : 'Upload Photo'}
              </span>
            </label>
            <p className="text-xs text-gray-400">
              Square image recommended. Max 5MB.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Job Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="e.g., Sales Manager"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Email *
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Phone *
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              placeholder="(555) 123-4567"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-white mb-1">
              LinkedIn URL
            </label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/yourprofile"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-white mb-1">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={4}
              placeholder="Tell people about yourself and what you do..."
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 text-white placeholder-gray-400 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={saveCard}
            disabled={saving || !fullName || !title || !email || !phone}
            className="w-full sm:w-auto px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Business Card'}
          </button>
        </div>
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
