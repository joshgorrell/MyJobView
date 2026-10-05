import { useState, useEffect, useRef } from 'react';
import { Upload, X, Save, Eye, Copy, Share2, Edit3 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { BusinessCard } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../ui/ConfirmModal';
import { getBusinessCardUrl } from '../../lib/businessCardLinks';
import { BusinessCardIdentity, BusinessCardFooter, CardBranding } from './BusinessCardIdentity';

export function UserBusinessCardEditor() {
  const { user, profile, setProfileAvatar } = useAuth();
  const [card, setCard] = useState<BusinessCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [company, setCompany] = useState<CardBranding | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [subdomain, setSubdomain] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [brandingError, setBrandingError] = useState('');
  const [brandingAttempt, setBrandingAttempt] = useState(0);

  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  useEffect(() => {
    loadCard();
  }, [user?.id]);

  useEffect(() => {
    const organizationId = profile?.organization_id;
    let cancelled = false;
    setCompany(null);
    setSubdomain(null);
    setBrandingError('');
    if (!organizationId) return;

    // A failed organization lookup must not prevent the card's branding load.
    async function loadSubdomain() {
      try {
        const { data, error } = await supabase.from('organizations')
          .select('subdomain').eq('id', organizationId).maybeSingle();
        if (error) throw error;
        if (!cancelled) setSubdomain(data?.subdomain || null);
      } catch (error) {
        console.error('Error loading business card subdomain:', error);
      }
    }

    async function loadBranding() {
      try {
        let { data, error } = await supabase.from('company_settings')
          .select('company_name, website, company_logo_url, business_card_banner_url')
          .eq('organization_id', organizationId).maybeSingle();

        // The artwork column is additive. Older schemas or column grants can
        // reject that projection; still load the core logo/name/website fields.
        if (error && ['42703', 'PGRST204', '42501'].includes(error.code)) {
          const fallback = await supabase.from('company_settings')
            .select('company_name, website, company_logo_url')
            .eq('organization_id', organizationId).maybeSingle();
          data = fallback.data ? { ...fallback.data, business_card_banner_url: null } : null;
          error = fallback.error;
        }
        if (error) throw error;
        if (!data) throw new Error('Company branding not found');
        if (!cancelled) setCompany(data);
      } catch (error) {
        console.error('Error loading business card branding:', error);
        if (!cancelled) setBrandingError('Company logo and artwork could not load.');
      }
    }

    void loadSubdomain();
    void loadBranding();
    return () => { cancelled = true; };
  }, [profile?.organization_id, brandingAttempt]);

  function getCardUrl(): string {
    return getBusinessCardUrl(card?.slug || '', subdomain);
  }

  async function copyCardLink() {
    try {
      await navigator.clipboard.writeText(getCardUrl());
      setShareMessage('Link copied');
    } catch {
      setShareMessage('Unable to copy. Open View Card to copy the address.');
    }
  }

  async function shareCardLink() {
    try {
      if (navigator.share) {
        await navigator.share({ title: card?.full_name || 'Digital business card', url: getCardUrl() });
      } else {
        await copyCardLink();
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setShareMessage('Unable to share. Try Copy Link.');
      }
    }
  }

  function resetDraft(savedCard: BusinessCard | null = card, savedPhoto = savedCard?.photo_url || profile?.avatar_url || '') {
    setFullName(savedCard?.full_name || profile?.full_name || '');
    setTitle(savedCard?.title || '');
    setEmail(savedCard?.email || profile?.email || '');
    setPhone(savedCard?.phone || '');
    setLinkedinUrl(savedCard?.linkedin_url || '');
    setBio(savedCard?.bio || '');
    setPhotoUrl(savedPhoto);
  }

  function startEditing() {
    resetDraft();
    setShareMessage(null);
    setEditing(true);
  }

  function cancelEditing() {
    resetDraft();
    setConfirmModal(null);
    setEditing(false);
  }

  async function loadCard() {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('business_cards')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      setCard(data);
      resetDraft(data);
    } catch (error) {
      console.error('Error loading card:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Please select a JPG, PNG, or WebP image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
      const fileName = `${user.id}/photo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('business-card-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('business-card-photos')
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

  function removePhoto() {
    setPhotoUrl('');
  }

  async function saveCard() {
    if (!user || saving || uploading) return;

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

      let savedCard: BusinessCard;
      if (card) {
        const { data, error } = await supabase
          .from('business_cards')
          .update(cardData)
          .eq('id', card.id)
          .select('*')
          .single();

        if (error) throw error;
        savedCard = data;
      } else {
        const { data, error } = await supabase
          .from('business_cards')
          .insert({
            ...cardData,
            slug: `${(profile?.username || fullName.split(/\s+/).map(name => name[0]).join('')).toLowerCase().replace(/[^a-z0-9-]/g, '') || 'card'}`,
            is_active: true
          })
          .select('*')
          .single();

        if (error) throw error;
        savedCard = data;
      }

      const { error: avatarError } = await supabase
        .from('profiles')
        .update({ avatar_url: photoUrl || null })
        .eq('id', user.id);
      if (avatarError) throw avatarError;
      setProfileAvatar(photoUrl || null);

      setCard(savedCard);
      resetDraft(savedCard, photoUrl);
      setEditing(false);
      setShareMessage('Business card saved');
    } catch (error) {
      console.error('Error saving card:', error);
      alert('Failed to save business card');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-center py-8 text-muted">Loading your business card...</div>;
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {brandingError && <div role="alert" className="rounded-lg border border-subtle bg-surface p-3 text-sm text-primary">
        {brandingError} <button type="button" onClick={() => setBrandingAttempt(value => value + 1)} className="ml-2 font-medium text-brand underline">Retry</button>
      </div>}
      {!editing ? (
        <section className="overflow-hidden rounded-2xl border border-subtle bg-surface shadow-sm" aria-label="Your business card">
          <div className="bg-gradient-to-br from-[#111c30] via-[#111729] to-[#090f1d]">
            <BusinessCardIdentity fullName={fullName || profile?.full_name || 'Your business card'} title={title} email={email} phone={phone} linkedinUrl={linkedinUrl} photoUrl={photoUrl} company={company} />
            <BusinessCardFooter company={company} />
          </div>
          <div className="px-5 pb-6 sm:px-8 sm:pb-8">
            {card ? (
              <div className="mt-6 border-t border-subtle pt-5">
                <p className="text-xs text-muted text-center sm:text-left break-all">{getCardUrl().replace(/^https?:\/\//, '')}</p>
                <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                  <a href={getCardUrl()} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-cyan-700"><Eye className="h-4 w-4" />View Card</a>
                  <button onClick={shareCardLink} className="inline-flex items-center justify-center gap-2 rounded-xl border border-strong px-4 py-2.5 text-sm font-medium text-primary hover:bg-elevated"><Share2 className="h-4 w-4" />Share</button>
                  <button onClick={copyCardLink} className="inline-flex items-center justify-center gap-2 rounded-xl border border-strong px-4 py-2.5 text-sm font-medium text-primary hover:bg-elevated"><Copy className="h-4 w-4" />Copy Link</button>
                </div>
              </div>
            ) : <p className="mt-5 text-center sm:text-left text-sm text-muted">Add your details to create your digital business card.</p>}
            {shareMessage && <p role="status" className="mt-3 text-sm text-brand text-center sm:text-left">{shareMessage}</p>}
            <div className="mt-5 flex justify-center sm:justify-start">
              <button onClick={startEditing} className="inline-flex items-center gap-2 py-2 text-sm text-muted hover:text-primary"><Edit3 className="h-4 w-4" />{card ? 'Edit Business Card' : 'Create Business Card'}</button>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); void saveCard(); }} className="bg-surface rounded-2xl shadow-sm border border-subtle p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-primary">{card ? 'Edit Business Card' : 'Create Business Card'}</h2>
            <p className="mt-1 text-sm text-muted">Make it yours. Save to update your card and profile photo.</p>
          </div>
          <fieldset disabled={saving || uploading} className="space-y-4 sm:space-y-6 disabled:opacity-60">
            <div>
              <label className="block text-sm font-medium text-primary mb-2">
                Profile Photo
              </label>

              {photoUrl && (
                <div className="mb-3 flex items-center gap-3 p-3 bg-elevated rounded-lg border border-strong">
                  <img
                    src={photoUrl}
                    alt="Profile"
                    className="w-20 h-20 rounded-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setConfirmModal({ title: 'Remove Photo', message: 'Are you sure you want to remove your photo?', onConfirm: removePhoto })}
                    className="ml-auto p-2 text-danger hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
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
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                  id="photo-upload"
                />
                <label
                  htmlFor="photo-upload"
                  className={`flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    uploading
                      ? 'border-strong bg-elevated cursor-not-allowed'
                      : 'border-strong hover:border-cyan-500 hover:bg-elevated'
                  }`}
                >
                  <Upload className="w-5 h-5 text-muted" />
                  <span className="text-sm font-medium text-primary">
                    {uploading ? 'Uploading...' : 'Upload Photo'}
                  </span>
                </label>
                <p className="text-xs text-muted">
                  Square JPG, PNG, or WebP recommended. Max 5MB. Save the card to update your header avatar.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Job Title *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="e.g., Sales Manager"
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary placeholder:text-muted rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-primary mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  placeholder="(555) 123-4567"
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary placeholder:text-muted rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-primary mb-1">
                  LinkedIn URL
                </label>
                <input
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  placeholder="https://linkedin.com/in/yourprofile"
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary placeholder:text-muted rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-primary mb-1">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="Tell people about yourself and what you do..."
                  className="w-full px-4 py-2 bg-elevated border border-strong text-primary placeholder:text-muted rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
              <button type="button" onClick={cancelEditing} disabled={saving || uploading} className="px-6 py-2.5 border border-strong text-primary rounded-lg hover:bg-elevated disabled:opacity-50">Cancel</button>
              <button
                type="submit"
                disabled={saving || uploading || !fullName.trim() || !title.trim() || !email.trim() || !phone.trim()}
                className="w-full sm:w-auto px-6 py-2.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Business Card'}
              </button>
            </div>
          </fieldset>
        </form>
      )}

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
