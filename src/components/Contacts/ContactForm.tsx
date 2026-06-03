import { useState, useEffect, useRef } from 'react';
import { X, AtSign, AlertCircle, Upload, Scan, FileText, CircleUser as UserCircle2, Zap, Users, TrendingUp, UserCheck, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';
import { QuickActionModal } from '../Shared/QuickActionModal';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { generateUniqueUsername } from '../../lib/username';
import { formatPhoneNumber } from '../../lib/utils';
import { CompanyOffice } from '../../lib/types';
import { offlineSupabaseInsert } from '../../lib/offlineSupport';
import { CameraCapture } from './CameraCapture';
import { processBusinessCard } from '../../lib/ocrService';
import { AddressAutocomplete } from '../Shared/AddressAutocomplete';
import { lookupTaxRateByZip } from '../../lib/taxCalculations';
import { CompetitorSelector } from './CompetitorSelector';

interface ContactFormProps {
  onClose: () => void;
  onSuccess: () => void;
  initialSalesStatus?: 'customer' | 'prospect' | 'lead';
}

const DRAFT_KEY = 'contact_form_draft';

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(data: object) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
  } catch {}
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

export function ContactForm({ onClose, onSuccess, initialSalesStatus }: ContactFormProps) {
  const { profile } = useAuth();

  const draft = loadDraft();

  const [formData, setFormData] = useState(draft?.formData ?? {
    contact_type: 'person' as 'person' | 'business',
    company_name: '',
    first_name: '',
    last_name: '',
    title: '',
    username: '',
    email: '',
    phone: '',
    business_phone: '',
    notes: '',
    tags: '',
    office_id: '',
    street_address: '',
    city: '',
    state: '',
    zip_code: '',
    country: 'USA',
    is_tax_exempt: false,
    tax_exemption_reason: '',
    tax_rate: '',
    tax_jurisdiction_id: '',
    default_payment_terms: 'Net 10',
    accepts_po: false,
  });
  const [businessCardPhoto, setBusinessCardPhoto] = useState<File | null>(null);
  const [businessCardPhotoPreview, setBusinessCardPhotoPreview] = useState<string | null>(null);
  const [taxCertificateFile, setTaxCertificateFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [salesStatus, setSalesStatus] = useState<'customer' | 'prospect' | 'lead'>(draft?.salesStatus ?? initialSalesStatus ?? 'customer');
  const [leadDestination, setLeadDestination] = useState<'fishbowl' | 'assign'>(draft?.leadDestination ?? 'fishbowl');
  const [assignedTo, setAssignedTo] = useState<string>(draft?.assignedTo ?? '');
  const [opportunityDetails, setOpportunityDetails] = useState(draft?.opportunityDetails ?? '');
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>(draft?.priority ?? 'medium');
  const [salesRepId, setSalesRepId] = useState<string>(draft?.salesRepId ?? '');
  const [salesReps, setSalesReps] = useState<Array<{ id: string; full_name: string }>>([]);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showCamera, setShowCamera] = useState(false);
  const [processingOCR, setProcessingOCR] = useState(false);
  const [ocrConfidence, setOcrConfidence] = useState<any>(null);
  const [lookingUpTaxRate, setLookingUpTaxRate] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState<string[]>(draft?.selectedCompetitorIds ?? []);
  const [electricianName, setElectricianName] = useState(draft?.electricianName ?? '');
  const [electricianNotes, setElectricianNotes] = useState(draft?.electricianNotes ?? '');
  const [hasDraft, setHasDraft] = useState(!!draft);
  const [showTaxSection, setShowTaxSection] = useState(false);
  const [showBillingSection, setShowBillingSection] = useState(false);
  const [showBusinessCardSection, setShowBusinessCardSection] = useState(false);

  type DuplicateMatch = {
    id: string;
    displayName: string;
    source: 'contact' | 'lead';
    matchReason: string;
  };
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateMatch[]>([]);
  const [duplicateDismissed, setDuplicateDismissed] = useState(false);
  const prevContactTypeRef = useRef(formData.contact_type);

  useEffect(() => {
    saveDraft({
      formData,
      salesStatus,
      leadDestination,
      assignedTo,
      opportunityDetails,
      priority,
      salesRepId,
      selectedCompetitorIds,
      electricianName,
      electricianNotes,
    });
  }, [formData, salesStatus, leadDestination, assignedTo, opportunityDetails, priority, salesRepId, selectedCompetitorIds, electricianName, electricianNotes]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    async function fetchSalesReps() {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');

      if (data) {
        setSalesReps(data);
      }
    }

    async function fetchOffices() {
      const { data } = await supabase
        .from('company_offices')
        .select('*')
        .order('display_order');

      if (data) {
        setOffices(data);
      }
    }

    async function loadDefaultTaxRate() {
      try {
        const { data, error } = await supabase
          .from('tax_jurisdictions')
          .select('id, combined_rate')
          .eq('is_default', true)
          .eq('is_active', true)
          .single();

        if (error) throw error;

        if (data?.combined_rate) {
          setFormData(prev => ({
            ...prev,
            tax_rate: data.combined_rate.toString(),
            tax_jurisdiction_id: data.id || '',
          }));
        }
      } catch (error) {
        console.error('Error loading default tax rate:', error);
      }
    }

    fetchSalesReps();
    fetchOffices();
    loadDefaultTaxRate();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    async function lookupTaxRate() {
      if (formData.zip_code && formData.zip_code.length >= 5 && !formData.is_tax_exempt && navigator.onLine) {
        setLookingUpTaxRate(true);
        try {
          const jurisdiction = await lookupTaxRateByZip(formData.zip_code);
          if (jurisdiction && jurisdiction.combined_rate) {
            let jurisdictionId = '';
            const { data: dbJurisdiction } = await supabase
              .from('tax_jurisdictions')
              .select('id')
              .eq('zip_code', formData.zip_code)
              .eq('is_active', true)
              .maybeSingle();
            if (dbJurisdiction?.id) {
              jurisdictionId = dbJurisdiction.id;
            } else {
              const { data: defaultJ } = await supabase
                .from('tax_jurisdictions')
                .select('id')
                .eq('is_default', true)
                .eq('is_active', true)
                .maybeSingle();
              jurisdictionId = defaultJ?.id || '';
            }
            setFormData(prev => ({
              ...prev,
              tax_rate: jurisdiction.combined_rate.toString(),
              tax_jurisdiction_id: jurisdictionId,
            }));
          }
        } catch (error) {
          console.error('Failed to lookup tax rate from TaxJar API:', error);
        } finally {
          setLookingUpTaxRate(false);
        }
      }
    }

    const timeoutId = setTimeout(lookupTaxRate, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.zip_code, formData.is_tax_exempt]);

  // Check username availability in real-time
  useEffect(() => {
    async function checkUsername() {
      if (!formData.username || !navigator.onLine) {
        setUsernameAvailable(null);
        return;
      }

      setCheckingUsername(true);
      try {
        const { data, error } = await supabase
          .from('contacts')
          .select('username')
          .eq('username', formData.username)
          .maybeSingle();

        setUsernameAvailable(!data);
      } catch (error) {
        console.error('Error checking username:', error);
        setUsernameAvailable(null);
      } finally {
        setCheckingUsername(false);
      }
    }

    const timeoutId = setTimeout(checkUsername, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.username]);

  // Reset duplicates when contact type changes
  useEffect(() => {
    if (prevContactTypeRef.current !== formData.contact_type) {
      setDuplicateMatches([]);
      setDuplicateDismissed(false);
      prevContactTypeRef.current = formData.contact_type;
    }
  }, [formData.contact_type]);

  // Name-based duplicate detection (debounced)
  useEffect(() => {
    let cancelled = false;

    async function checkNameDuplicates() {
      if (!navigator.onLine) return;

      const isPerson = formData.contact_type === 'person';
      const fullName = isPerson
        ? `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim()
        : formData.company_name.trim();

      if (isPerson && (!formData.first_name.trim() || !formData.last_name.trim())) return;
      if (!isPerson && !formData.company_name.trim()) {
        setDuplicateMatches([]);
        return;
      }

      const nameLower = fullName.toLowerCase();
      const newMatches: DuplicateMatch[] = [];

      try {
        if (isPerson) {
          const [contactsRes, leadsRes] = await Promise.all([
            supabase
              .from('contacts')
              .select('id, first_name, last_name, contact_name, contact_type')
              .ilike('contact_name', nameLower),
            supabase
              .from('leads')
              .select('id, contact_name')
              .ilike('contact_name', nameLower),
          ]);

          if (cancelled) return;

          (contactsRes.data ?? []).forEach((c) => {
            const cn = (c.contact_name ?? '').toLowerCase();
            if (cn === nameLower) {
              newMatches.push({ id: c.id, displayName: c.contact_name ?? fullName, source: 'contact', matchReason: 'name' });
            }
          });
          (leadsRes.data ?? []).forEach((l) => {
            const ln = (l.contact_name ?? '').toLowerCase();
            if (ln === nameLower && !newMatches.find((m) => m.id === l.id && m.source === 'lead')) {
              newMatches.push({ id: l.id, displayName: l.contact_name ?? fullName, source: 'lead', matchReason: 'name' });
            }
          });
        } else {
          const [contactsRes, leadsRes] = await Promise.all([
            supabase
              .from('contacts')
              .select('id, company_name, contact_name, contact_type')
              .ilike('company_name', nameLower),
            supabase
              .from('leads')
              .select('id, contact_name, company_name')
              .ilike('company_name', nameLower),
          ]);

          if (cancelled) return;

          (contactsRes.data ?? []).forEach((c) => {
            const cn = (c.company_name ?? '').toLowerCase();
            if (cn === nameLower) {
              newMatches.push({ id: c.id, displayName: c.company_name ?? c.contact_name ?? fullName, source: 'contact', matchReason: 'company name' });
            }
          });
          (leadsRes.data ?? []).forEach((l) => {
            const ln = (l.company_name ?? '').toLowerCase();
            if (ln === nameLower && !newMatches.find((m) => m.id === l.id && m.source === 'lead')) {
              newMatches.push({ id: l.id, displayName: l.company_name ?? l.contact_name ?? fullName, source: 'lead', matchReason: 'company name' });
            }
          });
        }
      } catch {
        // silently ignore errors — duplicate check is advisory only
      }

      if (!cancelled) {
        setDuplicateMatches((prev) => {
          const nonNameMatches = prev.filter((m) => m.matchReason !== 'name' && m.matchReason !== 'company name');
          const merged = [...nonNameMatches];
          newMatches.forEach((nm) => {
            if (!merged.find((m) => m.id === nm.id && m.source === nm.source)) {
              merged.push(nm);
            }
          });
          return merged;
        });
        if (newMatches.length > 0) setDuplicateDismissed(false);
      }
    }

    const t = setTimeout(checkNameDuplicates, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [formData.first_name, formData.last_name, formData.company_name, formData.contact_type]);

  async function handleEmailBlur() {
    const email = formData.email.trim();
    if (!email || !navigator.onLine) return;

    try {
      const [contactsRes, leadsRes] = await Promise.all([
        supabase.from('contacts').select('id, contact_name, company_name').ilike('email', email),
        supabase.from('leads').select('id, contact_name').ilike('email', email),
      ]);

      const additions: DuplicateMatch[] = [];
      (contactsRes.data ?? []).forEach((c) => {
        additions.push({ id: c.id, displayName: c.contact_name ?? c.company_name ?? email, source: 'contact', matchReason: 'email' });
      });
      (leadsRes.data ?? []).forEach((l) => {
        additions.push({ id: l.id, displayName: l.contact_name ?? email, source: 'lead', matchReason: 'email' });
      });

      if (additions.length > 0) {
        setDuplicateMatches((prev) => {
          const merged = [...prev];
          additions.forEach((a) => {
            if (!merged.find((m) => m.id === a.id && m.source === a.source)) merged.push(a);
          });
          return merged;
        });
        setDuplicateDismissed(false);
      }
    } catch {
      // advisory only
    }
  }

  async function handlePhoneBlur() {
    const phone = formData.phone.trim();
    if (!phone || !navigator.onLine) return;

    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 7) return;

    try {
      const [contactsRes, leadsRes] = await Promise.all([
        supabase.from('contacts').select('id, contact_name, company_name').ilike('phone', `%${digitsOnly.slice(-10)}%`),
        supabase.from('leads').select('id, contact_name').ilike('phone', `%${digitsOnly.slice(-10)}%`),
      ]);

      const additions: DuplicateMatch[] = [];
      (contactsRes.data ?? []).forEach((c) => {
        additions.push({ id: c.id, displayName: c.contact_name ?? c.company_name ?? phone, source: 'contact', matchReason: 'phone' });
      });
      (leadsRes.data ?? []).forEach((l) => {
        additions.push({ id: l.id, displayName: l.contact_name ?? phone, source: 'lead', matchReason: 'phone' });
      });

      if (additions.length > 0) {
        setDuplicateMatches((prev) => {
          const merged = [...prev];
          additions.forEach((a) => {
            if (!merged.find((m) => m.id === a.id && m.source === a.source)) merged.push(a);
          });
          return merged;
        });
        setDuplicateDismissed(false);
      }
    } catch {
      // advisory only
    }
  }

  function navigateToDuplicate(match: DuplicateMatch) {
    if (match.source === 'contact') {
      window.location.hash = `#contact/${match.id}`;
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('leadId', match.id);
      window.history.pushState({}, '', url.toString());
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  }

  async function handleUsernameBlur() {
    // If username field is empty, auto-generate one
    if (!formData.username && navigator.onLine) {
      const displayName = formData.contact_type === 'business'
        ? formData.company_name
        : `${formData.first_name} ${formData.last_name}`.trim();

      if (displayName) {
        setCheckingUsername(true);
        try {
          const uniqueUsername = await generateUniqueUsername(displayName, supabase);
          setFormData(prev => ({ ...prev, username: uniqueUsername }));
          setUsernameAvailable(true);
        } catch (error) {
          console.error('Error generating username:', error);
        } finally {
          setCheckingUsername(false);
        }
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate required fields based on contact type
    if (formData.contact_type === 'person') {
      if (!formData.first_name || formData.first_name.trim() === '') {
        alert('First name is required for person contacts.');
        return;
      }
      if (!formData.last_name || formData.last_name.trim() === '') {
        alert('Last name is required for person contacts.');
        return;
      }
    } else if (formData.contact_type === 'business') {
      if (!formData.company_name || formData.company_name.trim() === '') {
        alert('Company name is required for business contacts.');
        return;
      }
    }

    // Validate required zip code
    if (!formData.zip_code || formData.zip_code.trim() === '') {
      alert('Zip code is required to create a contact.');
      return;
    }

    // Validate office is selected
    if (!formData.office_id) {
      alert('Office Location is required. Please select an office.');
      return;
    }

    // Validate tax rate and jurisdiction are provided if not tax exempt
    if (!formData.is_tax_exempt && (!formData.tax_rate || formData.tax_rate === '')) {
      alert('Tax rate is required. Please wait for the automatic lookup to complete or enter it manually.');
      return;
    }
    if (!formData.is_tax_exempt && (!formData.tax_jurisdiction_id || formData.tax_jurisdiction_id === '')) {
      alert('A sales tax jurisdiction is required. Please enter a valid ZIP code so the jurisdiction can be determined automatically.');
      return;
    }

    // Validate sales rep is selected
    if (!salesRepId) {
      alert('Sales Rep is required. Please select a sales rep.');
      return;
    }

    // Check if username is taken before submitting
    if (usernameAvailable === false) {
      alert('Username is already taken. Please choose a different username or clear the field to auto-generate one.');
      return;
    }

    setLoading(true);

    try {
      let username = formData.username;
      if (!username) {
        const displayName = formData.contact_type === 'business'
          ? formData.company_name
          : `${formData.first_name} ${formData.last_name}`.trim();
        username = await generateUniqueUsername(displayName, supabase);
      }

      const fullName = formData.contact_type === 'business'
        ? formData.company_name
        : `${formData.first_name} ${formData.last_name}`.trim();

      let businessCardPhotoUrl = null;

      if (businessCardPhoto && navigator.onLine) {
        setUploadingPhoto(true);
        const fileExt = businessCardPhoto.name.split('.').pop();
        const fileName = `${profile?.id}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('contact-business-cards')
          .upload(filePath, businessCardPhoto);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('contact-business-cards')
          .getPublicUrl(filePath);

        businessCardPhotoUrl = urlData.publicUrl;
        setUploadingPhoto(false);
      }

      const resolvedContactType =
        salesStatus === 'prospect' ? 'prospect' :
        salesStatus === 'lead' ? 'lead' :
        formData.contact_type;

      const contactData = {
        contact_type: resolvedContactType,
        is_prospect: resolvedContactType === 'prospect',
        company_name: formData.company_name || null,
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        contact_name: fullName,
        title: formData.title || null,
        username: username,
        email: formData.email || null,
        phone: formData.phone || null,
        business_phone: formData.business_phone || null,
        notes: formData.notes || null,
        business_card_photo: businessCardPhotoUrl,
        office_id: formData.office_id,
        street_address: formData.street_address || null,
        city: formData.city || null,
        state: formData.state || null,
        zip_code: formData.zip_code || null,
        country: formData.country || null,
        is_tax_exempt: formData.is_tax_exempt,
        tax_exemption_reason: formData.tax_exemption_reason || null,
        tax_rate: formData.tax_rate ? parseFloat(formData.tax_rate) : null,
        tax_jurisdiction_id: formData.tax_jurisdiction_id || null,
        default_payment_terms: formData.default_payment_terms || 'Net 10',
        accepts_po: formData.accepts_po,
        electrician_name: salesStatus === 'prospect' && electricianName.trim() ? electricianName.trim() : null,
        electrician_notes: salesStatus === 'prospect' && electricianNotes.trim() ? electricianNotes.trim() : null,
        assigned_to: salesRepId || null,
        created_by: profile?.id,
      };

      const result = await offlineSupabaseInsert('contacts', contactData);

      if (result.error) throw result.error;
      const contact = Array.isArray(result.data) ? result.data[0] : result.data;

      // Add competitor relationships if this is a prospect
      if (salesStatus === 'prospect' && selectedCompetitorIds.length > 0 && contact) {
        const competitorRelationships = selectedCompetitorIds.map((competitorId) => ({
          prospect_id: contact.id,
          competitor_id: competitorId,
          relationship_type: 'current_supplier' as const,
          created_by: profile?.id,
        }));

        const { error: relationshipsError } = await supabase
          .from('prospect_competitor_relationships')
          .insert(competitorRelationships);

        if (relationshipsError) {
          console.error('Error creating competitor relationships:', relationshipsError);
          // Don't fail the entire operation, just log the error
        }
      }

      // Upload tax exemption certificate if provided
      if (taxCertificateFile && contact && navigator.onLine) {
        try {
          const fileExt = taxCertificateFile.name.split('.').pop();
          const fileName = `${contact.id}/${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage
            .from('tax-certificates')
            .upload(fileName, taxCertificateFile);

          if (uploadError) throw uploadError;

          const certificateRecord = {
            contact_id: contact.id,
            certificate_number: 'Pending Review',
            certificate_type: 'resale',
            issuing_authority: 'To Be Determined',
            issuing_state: 'TX',
            issue_date: new Date().toISOString().split('T')[0],
            certificate_file_path: fileName,
            certificate_file_name: taxCertificateFile.name,
            is_active: true,
          };

          const { error: certError } = await supabase
            .from('tax_exemption_certificates')
            .insert(certificateRecord);

          if (certError) throw certError;
        } catch (certError) {
          console.error('Error uploading tax certificate:', certError);
          alert('Contact created but failed to upload tax certificate. Please add it later from the contact details page.');
        }
      }

      if (formData.tags && contact) {
        const tags = formData.tags
          .split(/[\s,]+/)
          .filter((tag) => tag.startsWith('#'))
          .map((tag) => tag.substring(1).toLowerCase());

        if (tags.length > 0) {
          const tagInserts = tags.map((tag) => ({
            contact_id: contact.id,
            tag,
          }));

          await offlineSupabaseInsert('contact_tags', tagInserts);
        }
      }

      if (salesStatus === 'lead') {
        const leadData: any = {
          company_name: formData.company_name || null,
          contact_name: fullName,
          username: username,
          email: formData.email || null,
          phone: formData.phone || null,
          opportunity_description: opportunityDetails || formData.notes || null,
          created_by: profile?.id,
          priority: priority,
        };

        if (leadDestination === 'assign' && assignedTo) {
          leadData.assigned_to = assignedTo;
          leadData.status = 'claimed';
          leadData.is_fishbowl = false;
          leadData.claimed_at = new Date().toISOString();
        } else {
          leadData.status = 'unclaimed';
          leadData.is_fishbowl = true;
        }

        const leadResult = await offlineSupabaseInsert('leads', leadData);
        if (leadResult.error) throw leadResult.error;
      }

      clearDraft();
      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 900));
      onSuccess();
      onClose();

      // Navigate to the contact detail page
      if (contact?.id) {
        window.location.hash = `#contact/${contact.id}`;
      }
    } catch (error: any) {
      console.error('Error creating contact:', error);
      const errorMessage = error?.message || 'Unknown error';
      alert(`Failed to create contact: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
    <QuickActionModal
      title="New Contact"
      subtitle={isOffline ? 'Offline — will sync when reconnected' : 'Add a person or business to your contacts'}
      icon={<UserCircle2 className="w-5 h-5 text-white" />}
      accentColor="from-blue-600 to-cyan-700"
      onClose={onClose}
      showSuccess={showSuccess}
      successMessage="Contact Created!"
    >
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {hasDraft && (
            <div className="flex items-center justify-between px-3 py-2 bg-blue-950/40 border border-blue-700/50 rounded-lg text-sm">
              <span className="text-blue-300">Draft restored from your last session.</span>
              <button
                type="button"
                onClick={() => {
                  clearDraft();
                  setHasDraft(false);
                  setFormData({
                    contact_type: 'person',
                    company_name: '', first_name: '', last_name: '', title: '', username: '',
                    email: '', phone: '', business_phone: '', notes: '', tags: '', office_id: '',
                    street_address: '', city: '', state: '', zip_code: '', country: 'USA',
                    is_tax_exempt: false, tax_exemption_reason: '', tax_rate: '',
                    default_payment_terms: 'Net 10', accepts_po: false,
                  });
                  setSalesStatus('customer');
                  setLeadDestination('fishbowl');
                  setAssignedTo('');
                  setOpportunityDetails('');
                  setPriority('medium');
                  setSalesRepId('');
                  setSelectedCompetitorIds([]);
                  setElectricianName('');
                  setElectricianNotes('');
                }}
                className="text-blue-400 hover:text-blue-200 text-xs underline ml-3 shrink-0"
              >
                Clear draft
              </button>
            </div>
          )}
          {/* Contact Type Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contact Type <span className="text-red-400">*</span>
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contact_type"
                  value="person"
                  checked={formData.contact_type === 'person'}
                  onChange={(e) => setFormData({ ...formData, contact_type: 'person' })}
                  className="w-4 h-4 text-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Person</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="contact_type"
                  value="business"
                  checked={formData.contact_type === 'business'}
                  onChange={(e) => setFormData({ ...formData, contact_type: 'business' })}
                  className="w-4 h-4 text-blue-500 focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Business</span>
              </label>
            </div>
          </div>

          {/* Conditional Fields Based on Contact Type */}
          {formData.contact_type === 'person' ? (
            <>
              {/* Person Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                  placeholder="Acme Corp"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                  placeholder="CEO"
                />
              </div>
            </>
          ) : (
            <>
              {/* Business Fields */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.company_name}
                  onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                  placeholder="Acme Corp"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Contact First Name
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                    placeholder="John"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Contact Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Contact Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                  placeholder="Account Manager"
                />
              </div>
            </>
          )}

          {/* Duplicate Warning Banner */}
          {duplicateMatches.length > 0 && !duplicateDismissed && (
            <div className="rounded-xl border border-amber-600/60 bg-amber-950/40 p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold text-amber-300">
                    {duplicateMatches.length === 1
                      ? 'Possible duplicate found'
                      : `${duplicateMatches.length} possible duplicates found`}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDuplicateDismissed(true)}
                  className="p-1 text-amber-500 hover:text-amber-300 hover:bg-amber-900/50 rounded transition-colors flex-shrink-0"
                  aria-label="Dismiss warning"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-amber-400/80 mb-3">
                A record with the same information already exists. You can still proceed, but review these first:
              </p>
              <ul className="space-y-2">
                {duplicateMatches.map((match, idx) => (
                  <li
                    key={`${match.source}-${match.id}-${idx}`}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-amber-900/30 border border-amber-700/40 rounded-lg"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${
                        match.source === 'contact'
                          ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                          : 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                      }`}>
                        {match.source === 'contact' ? 'Contact' : 'Lead'}
                      </span>
                      <span className="text-sm text-gray-200 font-medium truncate">{match.displayName}</span>
                      <span className="text-xs text-gray-500 flex-shrink-0">matched by {match.matchReason}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigateToDuplicate(match)}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-200 font-medium flex-shrink-0 hover:underline transition-colors"
                    >
                      View
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Username (@ mention name)
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <AtSign className="w-4 h-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={formData.username}
                onChange={(e) => {
                  setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '') });
                  setUsernameAvailable(null);
                }}
                onBlur={handleUsernameBlur}
                className={`w-full pl-10 pr-10 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500 ${
                  usernameAvailable === false ? 'border-red-500' :
                  usernameAvailable === true ? 'border-green-500' :
                  'border-gray-600'
                }`}
                placeholder={formData.first_name ? `${formData.first_name}${formData.last_name}`.toLowerCase().replace(/[^a-z0-9]/g, '') : 'johndoe'}
              />
              {checkingUsername && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
              )}
              {!checkingUsername && usernameAvailable === true && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
              {!checkingUsername && usernameAvailable === false && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
            <p className="text-xs mt-1">
              {checkingUsername ? (
                <span className="text-blue-400">Checking availability...</span>
              ) : usernameAvailable === false ? (
                <span className="text-red-400">Username already taken. Clear field and tab out to auto-generate an alternative.</span>
              ) : usernameAvailable === true ? (
                <span className="text-green-400">Username available!</span>
              ) : (
                <span className="text-gray-500">Leave blank to auto-generate from contact name. Used for @mentions in discussions.</span>
              )}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Email
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              onBlur={handleEmailBlur}
              className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
              placeholder="john@acme.com"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Cell Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: formatPhoneNumber(e.target.value) })}
                onBlur={handlePhoneBlur}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Business Phone
              </label>
              <input
                type="tel"
                value={formData.business_phone}
                onChange={(e) => setFormData({ ...formData, business_phone: formatPhoneNumber(e.target.value) })}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                placeholder="+1 (555) 987-6543"
              />
            </div>
          </div>

          {/* Prospect quick-entry: competitor + electrician shown early */}
          {initialSalesStatus === 'prospect' && (
            <div className="space-y-3 rounded-xl border border-blue-700/50 bg-blue-950/20 p-4">
              <CompetitorSelector
                selectedCompetitorIds={selectedCompetitorIds}
                onChange={setSelectedCompetitorIds}
              />
              <div className="border-t border-blue-800/40 pt-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-medium text-sky-200">Electrician Used (Optional)</span>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Electrician / Company Name</label>
                  <input
                    type="text"
                    value={electricianName}
                    onChange={(e) => setElectricianName(e.target.value)}
                    placeholder="e.g. ABC Electric"
                    className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1">Electrician Notes (Optional)</label>
                  <input
                    type="text"
                    value={electricianNotes}
                    onChange={(e) => setElectricianNotes(e.target.value)}
                    placeholder="e.g. Mostly commercial, long-term relationship"
                    className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Street Address
            </label>
            <AddressAutocomplete
              value={formData.street_address}
              onChange={(address, components) => {
                setFormData(prev => ({
                  ...prev,
                  street_address: address,
                  city: components?.city || prev.city,
                  state: components?.state || prev.state,
                  zip_code: components?.zip || prev.zip_code
                }));
              }}
              placeholder="123 Main St"
              className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div className="sm:col-span-2 md:col-span-1">
              <label className="block text-sm font-medium text-gray-300 mb-1">
                City
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                placeholder="City"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                State
              </label>
              <input
                type="text"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                placeholder="CA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                ZIP Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                placeholder="90210"
                required
              />
              {lookingUpTaxRate && (
                <p className="text-xs text-blue-600 mt-1">Looking up tax rate...</p>
              )}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setShowTaxSection(v => !v)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3 className="text-base font-semibold text-white group-hover:text-blue-300 transition-colors">Tax Information</h3>
              {showTaxSection
                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                : <ChevronRight className="w-4 h-4 text-gray-400" />
              }
            </button>
            {!showTaxSection && (
              <p className="text-xs text-gray-500 mt-1">Tax exempt status, exemption reason, certificate upload</p>
            )}
          </div>
          {showTaxSection && (
          <div className="-mt-2">
            <div className="pt-3">

            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_tax_exempt}
                  onChange={(e) => setFormData({
                    ...formData,
                    is_tax_exempt: e.target.checked,
                    tax_rate: e.target.checked ? '0' : formData.tax_rate
                  })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-300">Tax Exempt</span>
              </label>

              {formData.is_tax_exempt ? (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Exemption Reason
                    </label>
                    <input
                      type="text"
                      value={formData.tax_exemption_reason}
                      onChange={(e) => setFormData({ ...formData, tax_exemption_reason: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                      placeholder="Non-profit, Government entity, etc."
                    />
                  </div>

                  <div className="bg-amber-950/40 border border-amber-700/50 rounded-lg p-4">
                    <div className="flex items-start gap-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-300">Tax Exemption Certificate Upload</p>
                        <p className="text-xs text-amber-400 mt-1">
                          Upload certificate now or later. Without a valid certificate on file, sales tax will be applied to all transactions.
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-400 mb-2">
                        Certificate File (Optional)
                      </label>
                      {taxCertificateFile ? (
                        <div className="flex items-center gap-2 p-3 bg-gray-800 border border-gray-600 rounded-lg">
                          <FileText className="w-4 h-4 text-blue-400" />
                          <span className="text-sm text-gray-300 flex-1">{taxCertificateFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setTaxCertificateFile(null)}
                            className="p-1 text-red-400 hover:bg-red-900/30 rounded transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center px-4 py-6 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-500 transition-colors bg-gray-800/50">
                          <Upload className="w-6 h-6 text-gray-500 mb-2" />
                          <span className="text-sm text-gray-400">Click to upload certificate</span>
                          <span className="text-xs text-gray-500 mt-1">PDF, JPG, PNG (Max 10MB)</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                if (file.size > 10 * 1024 * 1024) {
                                  alert('File size must be less than 10MB');
                                  return;
                                }
                                setTaxCertificateFile(file);
                              }
                            }}
                          />
                        </label>
                      )}
                      <p className="text-xs text-gray-500 mt-2">
                        Certificate details can be added later in the Tax Exemption Manager or contact details page.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Tax Rate <span className="text-red-500">*</span>
                    {lookingUpTaxRate && (
                      <span className="ml-2 text-xs text-blue-600 animate-pulse">Looking up by zip code...</span>
                    )}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.tax_rate ? parseFloat(formData.tax_rate) * 100 : ''}
                    onChange={(e) => setFormData({ ...formData, tax_rate: e.target.value ? (parseFloat(e.target.value) / 100).toString() : '' })}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                    placeholder="8.25"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    {formData.tax_rate ?
                      `Rate: ${(parseFloat(formData.tax_rate) * 100).toFixed(2)}%. ${formData.zip_code && formData.zip_code.length >= 5 ? 'Auto-populated from zip code.' : 'Using company default.'}` :
                      'Enter as percentage (e.g., 8.25 for 8.25%). Will auto-populate from zip code when entered.'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>
          )}

          {/* Billing Information Section */}
          <div className="border-t border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setShowBillingSection(v => !v)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3 className="text-base font-semibold text-white group-hover:text-blue-300 transition-colors">Billing Information</h3>
              {showBillingSection
                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                : <ChevronRight className="w-4 h-4 text-gray-400" />
              }
            </button>
            {!showBillingSection && (
              <p className="text-xs text-gray-500 mt-1">Payment terms, purchase order acceptance</p>
            )}
          </div>
          {showBillingSection && (
          <div className="-mt-2">
            <div className="space-y-4">
              {/* Default Payment Terms */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Default Payment Terms <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.default_payment_terms}
                  onChange={(e) => setFormData({ ...formData, default_payment_terms: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
                  required
                >
                  <option value="Net 10">Net 10 (Default)</option>
                  <option value="Net 30">Net 30</option>
                  <option value="Due on Receipt">Due on Receipt</option>
                  <option value="COD">COD (Cash on Delivery)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Will be used as default when creating proposals and invoices for this customer.
                </p>
              </div>

              {/* Purchase Order Acceptance */}
              <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.accepts_po}
                    onChange={(e) => setFormData({ ...formData, accepts_po: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 mt-0.5"
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium text-white block">Accepts Purchase Orders</span>
                    <p className="text-xs text-gray-400 mt-1">
                      Enable this to allow the customer to submit purchase orders for proposal approval.
                    </p>
                  </div>
                </label>

                {formData.accepts_po && (
                  <div className="mt-4 space-y-2">
                    {(() => {
                      const missingFields: string[] = [];
                      if (!formData.company_name) missingFields.push('Company Name');
                      if (!formData.street_address) missingFields.push('Street Address');
                      if (!formData.city) missingFields.push('City');
                      if (!formData.state) missingFields.push('State');
                      if (!formData.zip_code) missingFields.push('ZIP Code');
                      if (!formData.default_payment_terms) missingFields.push('Payment Terms');

                      if (missingFields.length > 0) {
                        return (
                          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-amber-300">Incomplete Billing Information</p>
                              <p className="text-xs text-amber-400 mt-1">
                                To enable PO acceptance, complete these required fields: {missingFields.join(', ')}
                              </p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-start gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-green-900">Billing information complete</p>
                            <p className="text-xs text-green-700 mt-1">
                              This customer can submit purchase orders for proposal approval.
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Additional notes about this contact..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tags
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500"
              placeholder="#enterprise #referral"
            />
            <p className="text-xs text-gray-400 mt-1">Separate tags with spaces. Use # prefix.</p>
          </div>

          {offices.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Office Location <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.office_id}
                onChange={(e) => setFormData({ ...formData, office_id: e.target.value })}
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white ${!formData.office_id ? 'border-red-500' : 'border-gray-600'}`}
                required
              >
                <option value="">-- Select an Office --</option>
                {offices.map((office) => (
                  <option key={office.id} value={office.id}>
                    {office.office_name}
                  </option>
                ))}
              </select>
              {!formData.office_id && (
                <p className="text-xs text-red-500 mt-1">Office Location is required.</p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Sales Rep <span className="text-red-500">*</span>
            </label>
            <select
              value={salesRepId}
              onChange={(e) => setSalesRepId(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-800 text-white ${!salesRepId ? 'border-red-500' : 'border-gray-600'}`}
              required
            >
              <option value="">-- Select a Sales Rep --</option>
              {salesReps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.full_name}
                </option>
              ))}
            </select>
            {!salesRepId && (
              <p className="text-xs text-red-500 mt-1">Sales Rep is required.</p>
            )}
          </div>

          <div className="border-t border-gray-700 pt-4">
            <button
              type="button"
              onClick={() => setShowBusinessCardSection(v => !v)}
              className="flex items-center justify-between w-full text-left group"
            >
              <h3 className="text-base font-semibold text-white group-hover:text-blue-300 transition-colors">Business Card Photo</h3>
              {showBusinessCardSection
                ? <ChevronDown className="w-4 h-4 text-gray-400" />
                : <ChevronRight className="w-4 h-4 text-gray-400" />
              }
            </button>
            {!showBusinessCardSection && (
              <p className="text-xs text-gray-500 mt-1">Upload or scan a card to auto-fill contact details</p>
            )}
          </div>
          {showBusinessCardSection && (
          <div className="-mt-2">

            {processingOCR && (
              <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg mb-3 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                Reading card... This may take a few seconds
              </div>
            )}

            <div className="flex items-start gap-4">
              {businessCardPhotoPreview ? (
                <div className="relative">
                  <img
                    src={businessCardPhotoPreview}
                    alt="Business card preview"
                    className="w-48 h-32 object-cover rounded-lg border border-gray-300"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBusinessCardPhoto(null);
                      setBusinessCardPhotoPreview(null);
                      setOcrConfidence(null);
                    }}
                    className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCamera(true)}
                    className="flex flex-col items-center justify-center px-6 py-4 border-2 border-blue-500 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                  >
                    <Scan className="w-6 h-6 mb-1" />
                    <span className="text-sm">Scan Card</span>
                  </button>

                  <label className="flex flex-col items-center justify-center px-6 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <Upload className="w-6 h-6 text-gray-400 mb-1" />
                    <span className="text-sm text-gray-600">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setBusinessCardPhoto(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBusinessCardPhotoPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);

                          setProcessingOCR(true);
                          try {
                            const result = await processBusinessCard(file);
                            setFormData(prev => ({
                              ...prev,
                              first_name: result.firstName || prev.first_name,
                              last_name: result.lastName || prev.last_name,
                              title: result.title || prev.title,
                              company_name: result.companyName || prev.company_name,
                              email: result.email || prev.email,
                              phone: result.phone || prev.phone,
                            }));
                            setOcrConfidence(result.fieldConfidence);
                          } catch (error) {
                            console.error('OCR failed:', error);
                          } finally {
                            setProcessingOCR(false);
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              )}
              <div className="flex-1">
                <p className="text-xs text-gray-600">
                  Scan or upload a business card to auto-fill contact details
                </p>
                {ocrConfidence && (
                  <div className="mt-2 text-xs text-gray-500">
                    <p className="font-medium mb-1">Auto-filled fields (review for accuracy):</p>
                    {Object.entries(ocrConfidence).filter(([_, conf]: any) => conf > 0).map(([field, conf]: any) => (
                      <div key={field} className="flex items-center gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          conf > 90 ? 'bg-green-500' : conf > 70 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></span>
                        <span>{field}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Sales Status Selector */}
          <div className="border-t border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Sales Status <span className="text-red-400">*</span>
            </label>
            {initialSalesStatus === 'prospect' ? (
              <div className="p-3 rounded-xl border-2 border-blue-500 bg-blue-950/40 flex items-center gap-3">
                <Users className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <span className="font-semibold text-sm text-blue-300">Prospect</span>
                  <p className="text-xs text-gray-500 leading-tight mt-0.5">Being pursued — no interest expressed yet</p>
                </div>
                <span className="ml-auto text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full flex-shrink-0">Locked</span>
              </div>
            ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setSalesStatus('customer')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  salesStatus === 'customer'
                    ? 'border-green-500 bg-green-950/40'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-800/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <UserCheck className={`w-4 h-4 ${salesStatus === 'customer' ? 'text-green-400' : 'text-gray-400'}`} />
                  <span className={`font-semibold text-sm ${salesStatus === 'customer' ? 'text-green-300' : 'text-gray-300'}`}>Customer</span>
                </div>
                <p className="text-xs text-gray-500 leading-tight">Has purchased or has an active project</p>
              </button>

              <button
                type="button"
                onClick={() => setSalesStatus('prospect')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  salesStatus === 'prospect'
                    ? 'border-blue-500 bg-blue-950/40'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-800/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users className={`w-4 h-4 ${salesStatus === 'prospect' ? 'text-blue-400' : 'text-gray-400'}`} />
                  <span className={`font-semibold text-sm ${salesStatus === 'prospect' ? 'text-blue-300' : 'text-gray-300'}`}>Prospect</span>
                </div>
                <p className="text-xs text-gray-500 leading-tight">Being pursued — no interest expressed yet</p>
              </button>

              <button
                type="button"
                onClick={() => setSalesStatus('lead')}
                className={`p-3 rounded-xl border-2 text-left transition-all ${
                  salesStatus === 'lead'
                    ? 'border-amber-500 bg-amber-950/40'
                    : 'border-gray-700 hover:border-gray-500 bg-gray-800/40'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className={`w-4 h-4 ${salesStatus === 'lead' ? 'text-amber-400' : 'text-gray-400'}`} />
                  <span className={`font-semibold text-sm ${salesStatus === 'lead' ? 'text-amber-300' : 'text-gray-300'}`}>Lead</span>
                </div>
                <p className="text-xs text-gray-500 leading-tight">Expressed interest — requesting quote or info</p>
              </button>
            </div>
            )}

            {/* Prospect-only: competitor tracking & electrician (shown here only when not locked as prospect, since it appears near the top in that case) */}
            {salesStatus === 'prospect' && !initialSalesStatus && (
              <div className="mt-4 space-y-3">
                <div className="p-4 bg-blue-950/20 border border-blue-800/40 rounded-lg">
                  <CompetitorSelector
                    selectedCompetitorIds={selectedCompetitorIds}
                    onChange={setSelectedCompetitorIds}
                  />
                </div>

                <div className="p-4 bg-sky-950/20 border border-sky-800/40 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-sky-400" />
                    <span className="text-sm font-medium text-sky-200">Electrician Used (Optional)</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Electrician / Company Name</label>
                    <input
                      type="text"
                      value={electricianName}
                      onChange={(e) => setElectricianName(e.target.value)}
                      placeholder="e.g. ABC Electric"
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Notes (Optional)</label>
                    <input
                      type="text"
                      value={electricianNotes}
                      onChange={(e) => setElectricianNotes(e.target.value)}
                      placeholder="e.g. Mostly commercial, long-term relationship"
                      className="w-full px-3 py-2 border border-gray-600 rounded-lg text-sm bg-gray-800 text-white placeholder-gray-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Lead-only: fishbowl / assignment options */}
            {salesStatus === 'lead' && (
              <div className="mt-4 space-y-3 p-4 bg-amber-950/20 border border-amber-800/40 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Opportunity Details
                  </label>
                  <textarea
                    value={opportunityDetails}
                    onChange={(e) => setOpportunityDetails(e.target.value)}
                    rows={2}
                    className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-800 text-white placeholder-gray-500 resize-none text-sm"
                    placeholder="What are they interested in? Any details for the sales rep..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['urgent', 'high', 'medium', 'low'] as const).map((p) => {
                      const colors = {
                        urgent: { border: 'border-red-500', bg: 'bg-red-950/40', text: 'text-red-400', label: 'Urgent', hint: 'Within hours' },
                        high:   { border: 'border-orange-500', bg: 'bg-orange-950/40', text: 'text-orange-400', label: 'High', hint: 'Within 1 day' },
                        medium: { border: 'border-yellow-500', bg: 'bg-yellow-950/40', text: 'text-yellow-400', label: 'Medium', hint: 'Within 3 days' },
                        low:    { border: 'border-green-500', bg: 'bg-green-950/40', text: 'text-green-400', label: 'Low', hint: 'Within 1 week' },
                      };
                      const c = colors[p];
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPriority(p)}
                          className={`p-2 rounded-lg border-2 text-left transition-all ${
                            priority === p ? `${c.border} ${c.bg}` : 'border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <AlertCircle className={`w-3.5 h-3.5 ${c.text}`} />
                            <span className={`font-semibold text-sm ${c.text}`}>{c.label}</span>
                          </div>
                          <p className="text-xs text-gray-400">{c.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={leadDestination === 'fishbowl'}
                      onChange={() => setLeadDestination('fishbowl')}
                      className="w-4 h-4 text-amber-500 focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-300">Send to Fishbowl</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={leadDestination === 'assign'}
                      onChange={() => setLeadDestination('assign')}
                      className="w-4 h-4 text-amber-500 focus:ring-2 focus:ring-amber-500"
                    />
                    <span className="text-sm text-gray-300">Assign to Sales Rep</span>
                  </label>
                </div>

                {leadDestination === 'assign' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Assign To</label>
                    <select
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      required={salesStatus === 'lead' && leadDestination === 'assign'}
                      className="w-full px-4 py-2 border border-gray-600 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-gray-800 text-white"
                    >
                      <option value="">Select a sales rep...</option>
                      {salesReps.map((rep) => (
                        <option key={rep.id} value={rep.id}>{rep.full_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-700 text-white rounded-lg hover:opacity-90 transition-opacity font-medium disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Contact'}
            </button>
          </div>
        </form>
    </QuickActionModal>

      {showCamera && (
        <CameraCapture
          onCapture={async (file) => {
            setBusinessCardPhoto(file);
            const reader = new FileReader();
            reader.onloadend = () => {
              setBusinessCardPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);

            setShowCamera(false);
            setProcessingOCR(true);

            try {
              const result = await processBusinessCard(file);
              setFormData(prev => ({
                ...prev,
                first_name: result.firstName || prev.first_name,
                last_name: result.lastName || prev.last_name,
                title: result.title || prev.title,
                company_name: result.companyName || prev.company_name,
                email: result.email || prev.email,
                phone: result.phone || prev.phone,
              }));
              setOcrConfidence(result.fieldConfidence);
            } catch (error) {
              console.error('OCR failed:', error);
              alert('Could not read text from card. Photo saved - please enter details manually.');
            } finally {
              setProcessingOCR(false);
            }
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </>
  );
}
