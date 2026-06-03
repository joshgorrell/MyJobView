import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Mail, Phone, Building2, Tag, Calendar, User, TrendingUp, CreditCard as Edit2, Save, X, Trash2, AlertCircle, Camera, Image as ImageIcon, MapPin, CheckCircle2, MessageSquare, Hash, Users, Send, Shield, Eye, DollarSign, Clock, FileText, Wrench, ListTodo, Plus, Video, Receipt, Target, Sparkles, UserCheck, RefreshCw, Flame, Thermometer, ExternalLink, Navigation, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Contact, ContactTag, Profile, CompanyOffice, Task, DiscussionPost } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { formatPhoneNumber } from '../../lib/utils';
import { offlineSupabaseUpdate, offlineSupabaseDelete, offlineSupabaseInsert } from '../../lib/offlineSupport';
import { lookupTaxRateByZip } from '../../lib/taxCalculations';
import { ContactHistory } from './ContactHistory';
import CreateProposalModal from '../Proposals/CreateProposalModal';
import DesignBriefModal from '../Sales/DesignBriefModal';
import { CreateWorkOrderModal } from '../Production/CreateWorkOrderModal';
import { TaskForm } from '../Tasks/TaskForm';
import { CreateInvoiceModal } from '../Invoices/CreateInvoiceModal';
import { CreateInvoiceFromWorkOrderModal } from '../Invoices/CreateInvoiceFromWorkOrderModal';
import { InvoiceDetailModal } from '../Invoices/InvoiceDetailModal';
import { ApplyBulkPaymentModal } from '../Invoices/ApplyBulkPaymentModal';
import ConnectionForm from '../Connections/ConnectionForm';
import { PortalPreviewModal } from '../Shared/PortalPreviewModal';
import { CreateAppointmentModal } from '../Appointments/CreateAppointmentModal';
import { CompetitorSelector } from './CompetitorSelector';
import ConfirmModal from '../ui/ConfirmModal';

interface Connection {
  id: string;
  contact_id: string;
  connection_type: string;
  connection_date: string;
  notes: string;
  follow_up_needed: boolean;
  follow_up_description: string | null;
  reminder_date: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  profile: Profile;
}

interface Appointment {
  id: string;
  title: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  appointment_type?: string;
  location?: string;
  notes?: string;
  is_private?: boolean;
  all_day?: boolean;
  assigned_technician?: string;
  technician?: {
    full_name: string;
  };
  project?: {
    project_name: string;
    project_number: string;
  };
  created_at: string;
}

interface ContactDetailProps {
  contact: Contact;
  canEdit?: boolean;
  onBack: () => void;
  onConverted: () => void;
  onNavigateToProposal?: (proposalId: string) => void;
}

export function ContactDetail({ contact, canEdit = true, onBack, onConverted, onNavigateToProposal }: ContactDetailProps) {
  const { profile } = useAuth();
  const [tags, setTags] = useState<ContactTag[]>([]);
  const [creator, setCreator] = useState<Profile | null>(null);
  const [assignedTo, setAssignedTo] = useState<Profile | null>(null);
  const [salesReps, setSalesReps] = useState<Profile[]>([]);
  const [offices, setOffices] = useState<CompanyOffice[]>([]);
  const [contactOffice, setContactOffice] = useState<CompanyOffice | null>(null);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({
    contact_type: (contact as any).contact_type || 'person',
    company_name: contact.company_name || '',
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    title: contact.title || '',
    email: contact.email || '',
    phone: contact.phone || '',
    business_phone: contact.business_phone || '',
    notes: contact.notes || '',
    office_id: contact.office_id || '',
    assigned_to: (contact as any).assigned_to || '',
    street_address: (contact as any).street_address || '',
    city: (contact as any).city || '',
    state: (contact as any).state || '',
    zip_code: (contact as any).zip_code || '',
    country: (contact as any).country || 'USA',
    is_tax_exempt: (contact as any).is_tax_exempt || false,
    tax_exemption_reason: (contact as any).tax_exemption_reason || '',
    tax_rate: (contact as any).tax_rate || '',
    tax_jurisdiction_id: (contact as any).tax_jurisdiction_id || '',
    default_payment_terms: (contact as any).default_payment_terms || '',
    is_prospect: (contact as any).is_prospect || false,
    electrician_name: (contact as any).electrician_name || '',
    electrician_notes: (contact as any).electrician_notes || '',
  });
  const [businessCardPhoto, setBusinessCardPhoto] = useState<File | null>(null);
  const [businessCardPhotoPreview, setBusinessCardPhotoPreview] = useState<string | null>((contact as any).business_card_photo);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showFullCardImage, setShowFullCardImage] = useState(false);
  const [convertData, setConvertData] = useState({
    opportunity_description: '',
    assignment: 'fishbowl' as 'fishbowl' | string,
    priority: 'medium' as 'urgent' | 'high' | 'medium' | 'low',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [mentions, setMentions] = useState<DiscussionPost[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [sendingPortalInvite, setSendingPortalInvite] = useState(false);
  const [portalAccessEnabled, setPortalAccessEnabled] = useState((contact as any).portal_access_enabled || false);
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'photos' | 'appointments' | 'portal'>('overview');
  const [showCreateProposal, setShowCreateProposal] = useState(false);
  const [showDesignBrief, setShowDesignBrief] = useState(false);
  const [showCreateWorkOrder, setShowCreateWorkOrder] = useState(false);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateInvoice, setShowCreateInvoice] = useState(false);
  const [showCreateInvoiceFromWO, setShowCreateInvoiceFromWO] = useState(false);
  const [viewingInvoiceId, setViewingInvoiceId] = useState<string | null>(null);
  const [showApplyPayment, setShowApplyPayment] = useState(false);
  const [unbilledWorkOrdersCount, setUnbilledWorkOrdersCount] = useState(0);
  const [showUnbilledWorkOrderAlert, setShowUnbilledWorkOrderAlert] = useState(false);
  const [jobPhotos, setJobPhotos] = useState<any[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<any | null>(null);
  const [punchlistAccess, setPunchlistAccess] = useState<any>(null);
  const [grantingPunchlistAccess, setGrantingPunchlistAccess] = useState(false);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionTarget, setConversionTarget] = useState<'lead' | 'customer' | 'prospect'>('lead');
  const [showPortalPreview, setShowPortalPreview] = useState(false);
  const [convertingContact, setConvertingContact] = useState(false);
  const [showLogConnection, setShowLogConnection] = useState(false);
  const [competitorRelationships, setCompetitorRelationships] = useState<any[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [showCreateAppointment, setShowCreateAppointment] = useState(false);
  const [editCompetitorIds, setEditCompetitorIds] = useState<string[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [lookingUpTaxRate, setLookingUpTaxRate] = useState(false);
  const [taxJurisdictionName, setTaxJurisdictionName] = useState<string>('');
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editing) return;
    editingRef.current = editing;
  }, [editing]);

  useEffect(() => {
    if (contact.tax_jurisdiction_id) {
      supabase
        .from('tax_jurisdictions')
        .select('jurisdiction_name')
        .eq('id', contact.tax_jurisdiction_id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.jurisdiction_name) setTaxJurisdictionName(data.jurisdiction_name);
        });
    }
  }, [contact.tax_jurisdiction_id]);

  useEffect(() => {
    async function lookupTaxRate() {
      if (!editing) return;
      if (editData.zip_code && editData.zip_code.length >= 5 && !editData.is_tax_exempt && navigator.onLine) {
        setLookingUpTaxRate(true);
        try {
          const jurisdiction = await lookupTaxRateByZip(editData.zip_code);
          if (jurisdiction && jurisdiction.combined_rate) {
            let jurisdictionId = '';
            const { data: dbJurisdiction } = await supabase
              .from('tax_jurisdictions')
              .select('id')
              .eq('zip_code', editData.zip_code)
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
            setEditData(prev => ({
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
  }, [editData.zip_code, editData.is_tax_exempt, editing]);

  useEffect(() => {
    loadDetails();
    loadSalesReps();
    loadOffices();
    loadTasks();
    loadMentions();
    loadConnections();
    loadPunchlistAccess();
    loadCompetitorRelationships();
    loadAppointments();
    if (activeTab === 'photos') {
      loadJobPhotos();
    }
  }, [contact.id, activeTab]);

  async function loadDetails() {
    const { data: tagsData } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);

    if (tagsData) setTags(tagsData);

    if (contact.created_by) {
      const { data: creatorData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', contact.created_by)
        .maybeSingle();

      if (creatorData) setCreator(creatorData);
    }

    const contactAssignedTo = (contact as any).assigned_to;
    if (contactAssignedTo) {
      const { data: assignedData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', contactAssignedTo)
        .maybeSingle();

      if (assignedData) setAssignedTo(assignedData);
    }

    if (contact.office_id) {
      const { data: officeData } = await supabase
        .from('company_offices')
        .select('*')
        .eq('id', contact.office_id)
        .maybeSingle();

      if (officeData) setContactOffice(officeData);
    }
  }

  async function loadOffices() {
    const { data } = await supabase
      .from('company_offices')
      .select('*')
      .order('display_order');

    if (data) setOffices(data);
  }

  async function loadSalesReps() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['sales', 'admin'])
      .eq('is_active', true)
      .order('full_name');

    if (data) setSalesReps(data);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from('tasks')
      .select('*, profiles(full_name)')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false });

    if (data) setTasks(data);
  }

  async function loadMentions() {
    const { data } = await supabase
      .from('discussion_posts')
      .select('*, profiles(full_name, username)')
      .contains('mentions', [contact.id])
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) setMentions(data);
  }

  async function loadConnections() {
    const { data } = await supabase
      .from('connections')
      .select('*, profile:profiles!connections_created_by_fkey(id, full_name, username)')
      .eq('contact_id', contact.id)
      .order('connection_date', { ascending: false });

    if (data) setConnections(data as Connection[]);
  }

  async function loadJobPhotos() {
    try {
      const { data, error } = await supabase
        .from('job_photos')
        .select(`
          *,
          technician:profiles!job_photos_technician_id_fkey(full_name),
          project:projects(name)
        `)
        .eq('contact_id', contact.id)
        .order('taken_at', { ascending: false });

      if (error) throw error;
      setJobPhotos(data || []);
    } catch (error) {
      console.error('Error loading job photos:', error);
    }
  }

  async function loadCompetitorRelationships() {
    try {
      const { data, error } = await supabase
        .from('prospect_competitor_relationships')
        .select(`
          *,
          competitors:competitor_id(
            id,
            name,
            website,
            notes
          )
        `)
        .eq('prospect_id', contact.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCompetitorRelationships(data || []);

      // Also set the edit state with current competitor IDs
      const competitorIds = (data || []).map((rel: any) => rel.competitor_id);
      setEditCompetitorIds(competitorIds);
    } catch (error) {
      console.error('Error loading competitor relationships:', error);
    }
  }

  async function loadAppointments() {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          technician:profiles!appointments_assigned_technician_fkey(full_name),
          project:projects(project_name, project_number)
        `)
        .eq('contact_id', contact.id)
        .order('appointment_date', { ascending: false })
        .order('start_time', { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error loading appointments:', error);
    }
  }

  function getConnectionIcon(type: string) {
    switch (type) {
      case 'meeting': return User;
      case 'call': return Phone;
      case 'email': return Mail;
      case 'casual_conversation': return MessageSquare;
      default: return Building2;
    }
  }

  function getConnectionLabel(type: string) {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  const getContactType = (): 'customer' | 'prospect' | 'lead' => {
    const contactAny = contact as any;
    if (contactAny.contact_type === 'lead') return 'lead';
    if (contactAny.contact_type === 'prospect') return 'prospect';
    return 'customer';
  };

  async function handleTemperatureChange(newTemperature: string) {
    const oldTemperature = contact.temperature || 'warm';

    if (oldTemperature === newTemperature) {
      return; // No change needed
    }

    try {
      // Update the contact temperature
      await offlineSupabaseUpdate('contacts', { temperature: newTemperature }, contact.id);

      // Log the activity
      const temperatureLabels: Record<string, string> = {
        cold: 'Cold',
        warm: 'Warm',
        hot: 'Hot',
        on_fire: 'On Fire'
      };

      await supabase.from('activity_feed').insert({
        user_id: profile?.id,
        type: 'contact_updated',
        metadata: {
          contact_id: contact.id,
          contact_name: contact.full_name || contact.company_name,
          field_changed: 'temperature',
          old_value: temperatureLabels[oldTemperature] || oldTemperature,
          new_value: temperatureLabels[newTemperature] || newTemperature,
          description: `Changed temperature from ${temperatureLabels[oldTemperature] || oldTemperature} to ${temperatureLabels[newTemperature] || newTemperature}`
        }
      });

      // Update the contact object in-place
      (contact as any).temperature = newTemperature;

      // Force a re-render by updating editData state
      setEditData(prev => ({ ...prev }));

      // Show success feedback
      const tempLabel = temperatureLabels[newTemperature] || newTemperature;
      alert(`Temperature updated to ${tempLabel}`);

    } catch (error) {
      console.error('Error updating temperature:', error);
      alert('Failed to update temperature. Please try again.');
    }
  }

  async function handleConvertContact(target: 'lead' | 'customer' | 'prospect') {
    setConvertingContact(true);
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      const currentType = getContactType();
      const contactAny = contact as any;

      if (target === 'prospect') {
        updateData.contact_type = 'prospect';
      } else if (target === 'lead') {
        updateData.contact_type = 'lead';
      } else if (target === 'customer') {
        // Preserve original entity shape (person vs business); default to 'person'
        const originalEntityType = (contactAny.contact_type === 'business') ? 'business' : 'person';
        updateData.contact_type = originalEntityType;
      }

      // Log conversion in connections
      const conversionNotes: Record<string, string> = {
        prospect: `Converted from ${currentType} to prospect - moved to nurturing pipeline`,
        lead: `Converted from ${currentType} to lead - actively interested!`,
        customer: `Converted from ${currentType} to customer - deal closed!`,
      };
      await supabase.from('connections').insert({
        contact_id: contact.id,
        connection_type: 'conversion',
        connection_date: new Date().toISOString(),
        notes: conversionNotes[target],
        created_by: profile?.id,
      });

      const result = await offlineSupabaseUpdate('contacts', updateData, contact.id);
      if (result.error) throw result.error;

      alert(`Contact successfully converted to ${target}!`);
      setShowConversionModal(false);
      onConverted();
    } catch (error) {
      console.error('Error converting contact:', error);
      alert('Failed to convert contact');
    } finally {
      setConvertingContact(false);
    }
  }

  async function handleUpdate() {
    if (!editData.office_id) {
      alert('Office Location is required. Please select an office.');
      return;
    }
    if (!editData.is_tax_exempt && (!editData.tax_jurisdiction_id || editData.tax_jurisdiction_id === '')) {
      alert('A sales tax jurisdiction is required. Please enter a valid ZIP code so the jurisdiction can be determined automatically.');
      return;
    }
    try {
      const fullName = `${editData.first_name} ${editData.last_name}`.trim();
      let businessCardPhotoUrl = businessCardPhotoPreview;

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

      const updateData = {
        contact_type: editData.contact_type,
        company_name: editData.company_name || null,
        first_name: editData.first_name || null,
        last_name: editData.last_name || null,
        contact_name: fullName,
        title: editData.title || null,
        email: editData.email || null,
        phone: editData.phone || null,
        business_phone: editData.business_phone || null,
        notes: editData.notes || null,
        business_card_photo: businessCardPhotoUrl,
        office_id: editData.office_id,
        assigned_to: editData.assigned_to === '' ? null : editData.assigned_to,
        street_address: editData.street_address || null,
        city: editData.city || null,
        state: editData.state || null,
        zip_code: editData.zip_code || null,
        country: editData.country || null,
        is_tax_exempt: editData.is_tax_exempt,
        tax_exemption_reason: editData.tax_exemption_reason || null,
        tax_rate: editData.tax_rate ? parseFloat(editData.tax_rate) : null,
        tax_jurisdiction_id: editData.tax_jurisdiction_id || null,
        default_payment_terms: editData.default_payment_terms || null,
        is_prospect: editData.is_prospect,
        electrician_name: editData.electrician_name || null,
        electrician_notes: editData.electrician_notes || null,
        updated_at: new Date().toISOString(),
      };

      console.log('Updating contact with data:', updateData);

      const result = await offlineSupabaseUpdate('contacts', updateData, contact.id);
      console.log('Update result:', result);

      if (result.error) {
        console.error('Update error:', result.error);
        throw result.error;
      }

      // Update competitor relationships if this is a prospect
      if (editData.is_prospect) {
        // Get current competitor IDs from relationships
        const currentCompetitorIds = competitorRelationships.map((rel: any) => rel.competitor_id);

        // Find IDs to add (in editCompetitorIds but not in currentCompetitorIds)
        const idsToAdd = editCompetitorIds.filter((id) => !currentCompetitorIds.includes(id));

        // Find IDs to remove (in currentCompetitorIds but not in editCompetitorIds)
        const idsToRemove = currentCompetitorIds.filter((id: string) => !editCompetitorIds.includes(id));

        // Add new relationships
        if (idsToAdd.length > 0) {
          const newRelationships = idsToAdd.map((competitorId) => ({
            prospect_id: contact.id,
            competitor_id: competitorId,
            relationship_type: 'current_supplier' as const,
            created_by: profile?.id,
          }));

          const { error: addError } = await supabase
            .from('prospect_competitor_relationships')
            .insert(newRelationships);

          if (addError) {
            console.error('Error adding competitor relationships:', addError);
          }
        }

        // Remove old relationships
        if (idsToRemove.length > 0) {
          const relationshipsToDelete = competitorRelationships
            .filter((rel: any) => idsToRemove.includes(rel.competitor_id))
            .map((rel: any) => rel.id);

          const { error: deleteError } = await supabase
            .from('prospect_competitor_relationships')
            .delete()
            .in('id', relationshipsToDelete);

          if (deleteError) {
            console.error('Error removing competitor relationships:', deleteError);
          }
        }
      }

      alert('Contact updated successfully!');
      setEditing(false);
      onBack();
    } catch (error) {
      console.error('Error updating contact:', error);
      alert('Failed to update contact');
    }
  }

  async function handleTogglePortalAccess() {
    if (!contact.email) {
      alert('Contact must have an email address to enable portal access');
      return;
    }

    try {
      const newValue = !portalAccessEnabled;
      const { error } = await supabase
        .from('contacts')
        .update({ portal_access_enabled: newValue })
        .eq('id', contact.id);

      if (error) throw error;

      setPortalAccessEnabled(newValue);
      alert(newValue ? 'Portal access enabled' : 'Portal access disabled');
    } catch (error) {
      console.error('Error toggling portal access:', error);
      alert('Failed to update portal access');
    }
  }

  async function handleSendPortalInvite() {
    if (!contact.email) {
      alert('Contact must have an email address to send portal invite');
      return;
    }

    if (!portalAccessEnabled && !punchlistAccess?.has_access) {
      alert('Please enable portal access or grant trial access first');
      return;
    }

    try {
      setSendingPortalInvite(true);

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-portal-magic-link`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ email: contact.email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send portal invite');
      }

      alert('Portal login link sent successfully!');
    } catch (error: any) {
      console.error('Error sending portal invite:', error);
      alert(error.message || 'Failed to send portal invite');
    } finally {
      setSendingPortalInvite(false);
    }
  }

  function handleViewAsCustomer() {
    if (!portalAccessEnabled && !punchlistAccess?.has_access) {
      alert('Portal access must be enabled or trial access granted for this contact first');
      return;
    }

    setShowPortalPreview(true);
  }

  async function loadPunchlistAccess() {
    try {
      const { data, error } = await supabase.rpc('get_punchlist_access_info', {
        p_contact_id: contact.id
      });

      if (error) throw error;

      if (data && data.length > 0) {
        setPunchlistAccess(data[0]);
      } else {
        setPunchlistAccess(null);
      }
    } catch (error) {
      console.error('Error loading punchlist access:', error);
    }
  }

  async function handleGrantPunchlistAccess() {
    try {
      setGrantingPunchlistAccess(true);

      const { data, error } = await supabase.rpc('grant_punchlist_access_directly', {
        p_contact_id: contact.id,
        p_days: 90
      });

      if (error) throw error;

      const result = data[0];

      if (result.is_renewal) {
        alert('Punchlist access renewed for 90 days!');
      } else {
        alert('Punchlist access granted for 90 days!');
      }

      // Reload access info
      await loadPunchlistAccess();
    } catch (error: any) {
      console.error('Error granting punchlist access:', error);
      alert(error.message || 'Failed to grant punchlist access');
    } finally {
      setGrantingPunchlistAccess(false);
    }
  }

  async function handleDelete() {
    try {
      // Check if there are any leads converted from this contact
      const { data: relatedLeads, error: checkError } = await supabase
        .from('leads')
        .select('id, status, contact_name')
        .eq('converted_from_contact_id', contact.id);

      if (checkError) throw checkError;

      // Build warning message based on what will be deleted
      let warningMessage = `Are you sure you want to delete ${contact.full_name || contact.contact_name}?\n\n`;

      if ((contact as any).contact_type === 'lead') {
        warningMessage += 'This contact is classified as a Lead.\n';
      }

      if (relatedLeads && relatedLeads.length > 0) {
        const activeLeads = relatedLeads.filter(l => !['closed_won', 'closed_lost'].includes(l.status));
        if (activeLeads.length > 0) {
          warningMessage += `\nThis will also delete ${activeLeads.length} active lead${activeLeads.length > 1 ? 's' : ''} in the pipeline.\n`;
        }
        if (relatedLeads.length > activeLeads.length) {
          const closedCount = relatedLeads.length - activeLeads.length;
          warningMessage += `${closedCount} closed lead${closedCount > 1 ? 's' : ''} will also be removed.\n`;
        }
      }

      warningMessage += '\nThis action cannot be undone.';

      setConfirmModal({
        title: 'Delete Contact',
        message: warningMessage,
        onConfirm: async () => {
          try {
            // First delete any related leads
            if (relatedLeads && relatedLeads.length > 0) {
              const { error: deleteLeadsError } = await supabase
                .from('leads')
                .delete()
                .eq('converted_from_contact_id', contact.id);

              if (deleteLeadsError) throw deleteLeadsError;
            }

            // Then delete the contact
            const result = await offlineSupabaseDelete('contacts', contact.id);
            if (result.error) throw result.error;

            onBack();
          } catch (error) {
            console.error('Error deleting contact:', error);
            alert('Failed to delete contact. Please try again or contact support if the issue persists.');
          }
        }
      });
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert('Failed to delete contact. Please try again or contact support if the issue persists.');
    }
  }

  async function handleConvertToLead() {
    try {
      const isFishbowl = convertData.assignment === 'fishbowl';
      const assignedTo = isFishbowl ? null : convertData.assignment;

      const leadData = {
        company_name: contact.company_name,
        contact_name: contact.contact_name,
        username: contact.username,
        email: contact.email,
        phone: contact.phone,
        opportunity_description: convertData.opportunity_description || contact.notes,
        status: isFishbowl ? 'unclaimed' : 'claimed',
        assigned_to: assignedTo,
        created_by: profile?.id,
        is_fishbowl: isFishbowl,
        claimed_at: isFishbowl ? null : new Date().toISOString(),
        qbo_customer_id: contact.qbo_customer_id,
        converted_from_contact_id: contact.id,
        priority: convertData.priority,
      };

      const leadResult = await offlineSupabaseInsert('leads', leadData);
      if (leadResult.error) throw leadResult.error;
      const lead = Array.isArray(leadResult.data) ? leadResult.data[0] : leadResult.data;

      if (tags.length > 0 && lead) {
        const leadTags = tags.map(tag => ({
          lead_id: lead.id,
          tag: tag.tag,
        }));
        await offlineSupabaseInsert('lead_tags', leadTags);
      }

      if (lead) {
        await offlineSupabaseInsert('feed_events', {
          event_type: 'lead_created',
          lead_id: lead.id,
          user_id: profile?.id,
          metadata: {
            company_name: contact.company_name,
            contact_name: contact.contact_name,
            is_fishbowl: isFishbowl,
            converted_from_contact: true,
          },
        });
      }

      if (isFishbowl) {
        const { data: allSalesReps } = await supabase
          .from('profiles')
          .select('id, email, email_leads, notify_on_fishbowl')
          .eq('role', 'sales')
          .eq('is_active', true);

        if (allSalesReps && allSalesReps.length > 0) {
          const repsToNotify = allSalesReps.filter(rep => rep.notify_on_fishbowl !== false);

          if (repsToNotify.length > 0) {
            const notifications = repsToNotify.map((rep) => ({
              user_id: rep.id,
              type: 'fishbowl_lead',
              lead_id: lead.id,
              title: 'New Lead in Fishbowl',
              body: `${contact.contact_name}${contact.company_name ? ` from ${contact.company_name}` : ''} is available to claim`,
            }));

            await supabase.from('notifications').insert(notifications);
          }
        }
      } else if (assignedTo) {
        const { data: assignedUser } = await supabase
          .from('profiles')
          .select('notify_on_lead_assigned')
          .eq('id', assignedTo)
          .single();

        if (assignedUser?.notify_on_lead_assigned !== false) {
          await supabase.from('notifications').insert([
            {
              user_id: assignedTo,
              type: 'lead_assigned',
              lead_id: lead.id,
              title: 'New Lead Assigned',
              body: `You've been assigned ${contact.contact_name}${contact.company_name ? ` from ${contact.company_name}` : ''}`,
            },
          ]);
        }
      }

      alert('Contact converted to lead successfully!');
      onConverted();
    } catch (error) {
      console.error('Error converting to lead:', error);
      alert('Failed to convert contact to lead');
    }
  }

  async function checkUnbilledWorkOrders() {
    try {
      // Query for completed work orders that haven't been invoiced
      const { data: unbilledWOs, error } = await supabase
        .from('work_orders')
        .select('id')
        .eq('contact_id', contact.id)
        .eq('status', 'completed')
        .eq('is_billable', true)
        .is('invoice_id', null);

      if (error) throw error;

      const count = unbilledWOs?.length || 0;
      setUnbilledWorkOrdersCount(count);

      if (count > 0) {
        setShowUnbilledWorkOrderAlert(true);
      } else {
        setShowCreateInvoice(true);
      }
    } catch (error) {
      console.error('Error checking unbilled work orders:', error);
      // If there's an error checking, just open the regular invoice modal
      setShowCreateInvoice(true);
    }
  }

  function handleCreateInvoiceClick() {
    checkUnbilledWorkOrders();
  }

  function handleUseWorkOrders() {
    setShowUnbilledWorkOrderAlert(false);
    setShowCreateInvoiceFromWO(true);
  }

  function handleCreateBlankInvoice() {
    setShowUnbilledWorkOrderAlert(false);
    setShowCreateInvoice(true);
  }

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 sm:mb-6 touch-manipulation"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm sm:text-base">Back to Contacts</span>
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-0 sm:justify-between">
            <div className="flex-1 w-full sm:w-auto">
              {editing ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3 sm:gap-4">
                    <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                      <input
                        type="radio"
                        name="contact_type"
                        value="person"
                        checked={editData.contact_type === 'person'}
                        onChange={(e) => setEditData({ ...editData, contact_type: 'person' })}
                        className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Person</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer touch-manipulation">
                      <input
                        type="radio"
                        name="contact_type"
                        value="business"
                        checked={editData.contact_type === 'business'}
                        onChange={(e) => setEditData({ ...editData, contact_type: 'business' })}
                        className="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Business</span>
                    </label>
                  </div>
                  {editData.contact_type === 'person' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={editData.first_name}
                          onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                          className="text-lg sm:text-xl font-bold text-gray-900 px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="First Name"
                        />
                        <input
                          type="text"
                          value={editData.last_name}
                          onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                          className="text-lg sm:text-xl font-bold text-gray-900 px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Last Name"
                        />
                      </div>
                      <input
                        type="text"
                        value={editData.title}
                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        className="text-base text-gray-600 w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Title"
                      />
                      <input
                        type="text"
                        value={editData.company_name}
                        onChange={(e) => setEditData({ ...editData, company_name: e.target.value })}
                        className="text-lg text-gray-600 w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Company Name (Optional)"
                      />
                    </>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={editData.company_name}
                        onChange={(e) => setEditData({ ...editData, company_name: e.target.value })}
                        className="text-lg sm:text-xl font-bold text-gray-900 w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Company Name"
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input
                          type="text"
                          value={editData.first_name}
                          onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                          className="text-base text-gray-600 px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Contact First Name (Optional)"
                        />
                        <input
                          type="text"
                          value={editData.last_name}
                          onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                          className="text-base text-gray-600 px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="Contact Last Name (Optional)"
                        />
                      </div>
                      <input
                        type="text"
                        value={editData.title}
                        onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                        className="text-base text-gray-600 w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Contact Title (Optional)"
                      />
                    </>
                  )}
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words">{contact.full_name || contact.contact_name}</h1>
                    {(() => {
                      const contactType = getContactType();
                      if (contactType === 'lead') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                            <Sparkles className="w-3 h-3" />
                            Lead
                          </span>
                        );
                      } else if (contactType === 'prospect') {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                            <Target className="w-3 h-3" />
                            Prospect
                          </span>
                        );
                      } else {
                        return (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                            <UserCheck className="w-3 h-3" />
                            Customer
                          </span>
                        );
                      }
                    })()}
                    {contact.email && (profile?.can_send_portal_invites || profile?.role === 'admin') && (
                      <>
                        {portalAccessEnabled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-700 rounded-full">
                            <Shield className="w-3 h-3" />
                            Portal
                          </span>
                        )}
                        {punchlistAccess?.has_access && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
                            <ListTodo className="w-3 h-3" />
                            Trial ({punchlistAccess.days_remaining}d)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {contact.title && (
                    <p className="text-base text-gray-600 mt-1">{contact.title}</p>
                  )}
                  {contact.company_name && (
                    <p className="text-lg text-gray-600 mt-1">{contact.company_name}</p>
                  )}
                </>
              )}
              <p className="text-xs sm:text-sm text-gray-500 mt-2">@{contact.username}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto justify-end">
              {editing ? (
                <>
                  <button
                    onClick={() => {
                      setEditing(false);
                      setEditData({
                        contact_type: (contact as any).contact_type || 'person',
                        company_name: contact.company_name || '',
                        first_name: contact.first_name || '',
                        last_name: contact.last_name || '',
                        title: contact.title || '',
                        email: contact.email || '',
                        phone: contact.phone || '',
                        business_phone: contact.business_phone || '',
                        notes: contact.notes || '',
                        office_id: contact.office_id || '',
                        assigned_to: (contact as any).assigned_to || '',
                        street_address: (contact as any).street_address || '',
                        city: (contact as any).city || '',
                        state: (contact as any).state || '',
                        zip_code: (contact as any).zip_code || '',
                        country: (contact as any).country || 'USA',
                        is_tax_exempt: (contact as any).is_tax_exempt || false,
                        tax_exemption_reason: (contact as any).tax_exemption_reason || '',
                        tax_rate: (contact as any).tax_rate || '',
                        default_payment_terms: (contact as any).default_payment_terms || '',
                      });
                    }}
                    className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors touch-manipulation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors touch-manipulation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                  <button
                    onClick={handleUpdate}
                    disabled={uploadingPhoto}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 touch-manipulation"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {uploadingPhoto ? 'Uploading...' : 'Save'}
                  </button>
                </>
              ) : canEdit ? (
                <>
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors touch-manipulation"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 overflow-x-auto">
          <div className="flex gap-1 px-4 sm:px-6 min-w-max">
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors touch-manipulation whitespace-nowrap ${
                activeTab === 'overview'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" />
                Overview
              </div>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors touch-manipulation whitespace-nowrap ${
                activeTab === 'history'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                History
              </div>
            </button>
            <button
              onClick={() => setActiveTab('photos')}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors touch-manipulation whitespace-nowrap ${
                activeTab === 'photos'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Job Photos ({jobPhotos.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('appointments')}
              className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors touch-manipulation whitespace-nowrap ${
                activeTab === 'appointments'
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Appointments ({appointments.length})
              </div>
            </button>
            {!editing && contact.email && (profile?.can_send_portal_invites || profile?.role === 'admin') && (
              <button
                onClick={() => setActiveTab('portal')}
                className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium border-b-2 transition-colors touch-manipulation whitespace-nowrap ${
                  activeTab === 'portal'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Portal
                </div>
              </button>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {activeTab === 'overview' ? (
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="pb-3 border-b border-gray-200">
                <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Quick Actions</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  <button
                    onClick={() => setShowCreateProposal(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="truncate">Proposal</span>
                  </button>
                  <button
                    onClick={() => setShowDesignBrief(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-blue-200 text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 hover:border-blue-300 transition-colors touch-manipulation"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span className="truncate">Design Brief</span>
                  </button>
                  <button
                    onClick={handleCreateInvoiceClick}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span className="truncate">Invoice</span>
                  </button>
                  <button
                    onClick={() => setShowApplyPayment(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-green-300 text-green-700 bg-green-50 rounded-md hover:bg-green-100 hover:border-green-400 transition-colors touch-manipulation"
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span className="truncate">Payment</span>
                  </button>
                  <button
                    onClick={() => setShowCreateWorkOrder(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span className="truncate">Work Order</span>
                  </button>
                  <button
                    onClick={() => setShowCreateAppointment(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 hover:border-blue-400 transition-colors touch-manipulation"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span className="truncate">Appointment</span>
                  </button>
                  <button
                    onClick={() => setShowCreateTask(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                  >
                    <ListTodo className="w-3.5 h-3.5" />
                    <span className="truncate">Task</span>
                  </button>
                  <button
                    onClick={() => setShowConvertForm(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 hover:border-gray-400 transition-colors touch-manipulation"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="truncate">Lead</span>
                  </button>
                </div>
              </div>

              {/* Prospect Statistics */}
              {(() => {
                const contactType = getContactType();
                if (contactType === 'prospect') {
                  const lastConnection = connections.length > 0 ? connections[0] : null;
                  const totalConnections = connections.length;
                  const scheduledConnections = connections.filter(c => !c.completed_at && c.reminder_date).length;

                  const daysSinceLastContact = lastConnection
                    ? Math.floor((new Date().getTime() - new Date(lastConnection.connection_date).getTime()) / (1000 * 60 * 60 * 24))
                    : null;

                  const nextScheduled = connections.find(c => !c.completed_at && c.reminder_date);

                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <Target className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900 mb-1">Prospect Nurturing Stats</h4>
                          <p className="text-xs text-gray-600">Tracking engagement for this potential future customer</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-2xl font-bold text-blue-600">{totalConnections}</div>
                          <div className="text-xs text-gray-600">Total Connections</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-2xl font-bold text-gray-900">
                            {daysSinceLastContact !== null ? daysSinceLastContact : '-'}
                          </div>
                          <div className="text-xs text-gray-600">Days Since Last Contact</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-2xl font-bold text-green-600">{scheduledConnections}</div>
                          <div className="text-xs text-gray-600">Scheduled Touchpoints</div>
                        </div>
                        <div className="bg-white rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-900 mb-1">Next Contact</div>
                          <div className="text-xs text-gray-600">
                            {nextScheduled
                              ? new Date(nextScheduled.reminder_date!).toLocaleDateString()
                              : 'None scheduled'}
                          </div>
                        </div>
                      </div>

                      {canEdit && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setShowLogConnection(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Log Connection
                          </button>
                          <button
                            onClick={() => {
                              setConversionTarget('lead');
                              setShowConversionModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            Convert to Lead
                          </button>
                          <button
                            onClick={() => {
                              setConversionTarget('customer');
                              setShowConversionModal(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Convert to Customer
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

              {/* Temperature Management - For Leads Only (Prospects don't have temperature tracking) */}
              {canEdit && (() => {
                const contactType = getContactType();
                if (contactType === 'lead') {
                  const temperature = contact.temperature || 'warm';
                  const getTemperatureConfig = (temp: string) => {
                    switch (temp) {
                      case 'on_fire':
                        return { label: 'On Fire', icon: Flame, bgColor: 'bg-orange-50', borderColor: 'border-orange-300', textColor: 'text-orange-700', btnColor: 'bg-orange-600 hover:bg-orange-700' };
                      case 'hot':
                        return { label: 'Hot', icon: Thermometer, bgColor: 'bg-red-50', borderColor: 'border-red-300', textColor: 'text-red-700', btnColor: 'bg-red-600 hover:bg-red-700' };
                      case 'warm':
                        return { label: 'Warm', icon: Thermometer, bgColor: 'bg-yellow-50', borderColor: 'border-yellow-300', textColor: 'text-yellow-700', btnColor: 'bg-yellow-600 hover:bg-yellow-700' };
                      case 'cold':
                        return { label: 'Cold', icon: Thermometer, bgColor: 'bg-blue-50', borderColor: 'border-blue-300', textColor: 'text-blue-700', btnColor: 'bg-blue-600 hover:bg-blue-700' };
                      default:
                        return { label: 'Warm', icon: Thermometer, bgColor: 'bg-yellow-50', borderColor: 'border-yellow-300', textColor: 'text-yellow-700', btnColor: 'bg-yellow-600 hover:bg-yellow-700' };
                    }
                  };
                  const tempConfig = getTemperatureConfig(temperature);
                  const TempIcon = tempConfig.icon;

                  return (
                    <div className={`${tempConfig.bgColor} border-2 ${tempConfig.borderColor} rounded-lg p-4 shadow-sm`}>
                      <div className="flex items-start gap-3">
                        <TempIcon className={`w-5 h-5 ${tempConfig.textColor} flex-shrink-0 mt-0.5`} />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">
                            Lead Temperature: {tempConfig.label}
                          </h4>
                          <p className="text-xs text-gray-700 mb-3">
                            Adjust the temperature to prioritize immediate opportunities. Higher temperature indicates more interest and urgency. Leads are HOT opportunities ready to buy NOW.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleTemperatureChange('cold')}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${temperature === 'cold' ? 'bg-blue-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                              <Thermometer className="w-3.5 h-3.5" />
                              Cold
                            </button>
                            <button
                              onClick={() => handleTemperatureChange('warm')}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${temperature === 'warm' ? 'bg-yellow-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                            >
                              <Thermometer className="w-3.5 h-3.5" />
                              Warm
                            </button>
                            <button
                              onClick={() => handleTemperatureChange('hot')}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${temperature === 'hot' ? 'bg-red-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                              <Thermometer className="w-3.5 h-3.5" />
                              Hot
                            </button>
                            <button
                              onClick={() => handleTemperatureChange('on_fire')}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors ${temperature === 'on_fire' ? 'bg-orange-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                            >
                              <Flame className="w-3.5 h-3.5" />
                              On Fire
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Lead Conversion Actions */}
              {canEdit && (() => {
                const contactType = getContactType();
                const hasProspectPermission = (profile as any)?.can_view_prospects ?? false;

                if (contactType === 'lead' && hasProspectPermission) {
                  return (
                    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-4 shadow-sm">
                      <div className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h4 className="text-sm font-medium text-gray-900 mb-2">
                            Lead Management
                          </h4>
                          <p className="text-xs text-gray-700 mb-3">
                            Convert this lead based on their current status and readiness to buy.
                          </p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => {
                                setConversionTarget('prospect');
                                setShowConversionModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                              <Target className="w-3.5 h-3.5" />
                              Convert to Prospect
                            </button>
                            <button
                              onClick={() => {
                                setConversionTarget('customer');
                                setShowConversionModal(true);
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              Convert to Customer
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Competitor Information - For Prospects */}
              {!editing && getContactType() === 'prospect' && canEdit && (profile?.can_view_prospects || profile?.role === 'admin') && (
                <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Building2 className="w-5 h-5 text-orange-700 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        Competitors {competitorRelationships.length > 0 && `(${competitorRelationships.length})`}
                      </h4>
                      {competitorRelationships.length > 0 ? (
                        <>
                          <p className="text-xs text-gray-700 mb-3">
                            Currently using competitor services. This is an opportunity to win their business.
                          </p>
                          <div className="space-y-2 mb-3">
                            {competitorRelationships.map((rel) => (
                              <div key={rel.id} className="bg-white rounded-md p-3 border border-orange-200 flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-900">
                                    {rel.competitors?.name || 'Unknown Competitor'}
                                  </p>
                                  {rel.competitors?.website && (
                                    <a
                                      href={rel.competitors.website}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-600 hover:text-blue-700 mt-1 inline-flex items-center gap-1"
                                    >
                                      Visit website
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                <button
                                  onClick={() => setConfirmModal({
                                    title: 'Remove Competitor',
                                    message: `Remove ${rel.competitors?.name} from competitors?`,
                                    onConfirm: async () => {
                                      try {
                                        const { error } = await supabase
                                          .from('prospect_competitor_relationships')
                                          .delete()
                                          .eq('id', rel.id);

                                        if (error) throw error;
                                        await loadCompetitorRelationships();
                                      } catch (error) {
                                        console.error('Error removing competitor:', error);
                                        alert('Failed to remove competitor');
                                      }
                                    }
                                  })}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-700 mb-3">
                          No competitors tracked yet. Add competitors to help understand the competitive landscape.
                        </p>
                      )}

                      <button
                        onClick={() => setEditing(true)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-orange-700 hover:text-orange-800 hover:bg-orange-100 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Manage Competitors
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Electrician Information - For Prospects (read-only view) */}
              {!editing && getContactType() === 'prospect' && canEdit && (profile?.can_view_prospects || profile?.role === 'admin') && (
                <div className="bg-sky-50 border-2 border-sky-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <Zap className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Electrician Used</h4>
                      {(contact as any).electrician_name ? (
                        <div className="bg-white rounded-md p-3 border border-sky-200">
                          <p className="text-sm font-semibold text-gray-900">{(contact as any).electrician_name}</p>
                          {(contact as any).electrician_notes && (
                            <p className="text-xs text-gray-500 mt-1">{(contact as any).electrician_notes}</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mb-3">No electrician tracked yet.</p>
                      )}
                      <button
                        onClick={() => setEditing(true)}
                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-sky-700 hover:text-sky-800 hover:bg-sky-100 rounded-lg transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        {(contact as any).electrician_name ? 'Edit Electrician' : 'Add Electrician'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Portal Status - Only show if applicable */}
              {!editing && contact.email && (profile?.can_send_portal_invites || profile?.role === 'admin') && (portalAccessEnabled || punchlistAccess?.has_access) && (
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Shield className={`w-4 h-4 flex-shrink-0 ${portalAccessEnabled || punchlistAccess?.has_access ? 'text-green-600' : 'text-gray-400'}`} />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900">Portal Access Active</p>
                        <p className="text-xs text-gray-600">
                          {punchlistAccess?.has_access ? `Trial - ${punchlistAccess.days_remaining} days left` : 'Full Access'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('portal')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
                    >
                      Manage →
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200">Contact Information</h3>

              {editing ? (
                <>
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
                    <input
                      type="email"
                      value={editData.email}
                      onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      placeholder="Email"
                    />
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <input
                        type="tel"
                        value={editData.phone}
                        onChange={(e) => setEditData({ ...editData, phone: formatPhoneNumber(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Cell Phone"
                      />
                      <input
                        type="tel"
                        value={editData.business_phone}
                        onChange={(e) => setEditData({ ...editData, business_phone: formatPhoneNumber(e.target.value) })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Business Phone"
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={editData.street_address}
                        onChange={(e) => setEditData({ ...editData, street_address: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Street Address"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={editData.city}
                          onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="City"
                        />
                        <input
                          type="text"
                          value={editData.state}
                          onChange={(e) => setEditData({ ...editData, state: e.target.value })}
                          className="px-3 py-2 border border-gray-300 rounded-lg"
                          placeholder="State"
                        />
                      </div>
                      <input
                        type="text"
                        value={editData.zip_code}
                        onChange={(e) => setEditData({ ...editData, zip_code: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="ZIP Code"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {contact.email && (
                    <div className="flex items-start gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-gray-500">Email</p>
                        <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline text-sm break-all">
                          {contact.email}
                        </a>
                      </div>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Cell</p>
                        <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline text-sm">
                          {contact.phone}
                        </a>
                      </div>
                    </div>
                  )}
                  {contact.business_phone && (
                    <div className="flex items-start gap-2">
                      <Phone className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs text-gray-500">Business</p>
                        <a href={`tel:${contact.business_phone}`} className="text-blue-600 hover:underline text-sm">
                          {contact.business_phone}
                        </a>
                      </div>
                    </div>
                  )}
                  {((contact as any).street_address || (contact as any).city || (contact as any).state || (contact as any).zip_code) && (() => {
                    const parts = [
                      (contact as any).street_address,
                      (contact as any).city,
                      (contact as any).state,
                      (contact as any).zip_code,
                    ].filter(Boolean);
                    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
                    return (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">Address</p>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                              title="Open in Google Maps"
                            >
                              <Navigation className="w-3 h-3" />
                              Navigate
                            </a>
                          </div>
                          <div className="text-xs text-gray-900">
                            {(contact as any).street_address && <div>{(contact as any).street_address}</div>}
                            {((contact as any).city || (contact as any).state || (contact as any).zip_code) && (
                              <div>
                                {(contact as any).city && `${(contact as any).city}`}
                                {(contact as any).state && `, ${(contact as any).state}`}
                                {(contact as any).zip_code && ` ${(contact as any).zip_code}`}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {!contact.email && !contact.phone && !contact.business_phone && !(contact as any).street_address && (
                    <p className="text-xs text-gray-500">No contact information available</p>
                  )}
                </>
              )}
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200">Details</h3>

              <div className="flex items-start gap-2">
                <Calendar className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Created</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(contact.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {creator && (
                <div className="flex items-start gap-2">
                  <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Created By</p>
                    <p className="text-sm font-medium text-gray-900">{creator.full_name}</p>
                  </div>
                </div>
              )}

              {editing ? (
                (profile?.role === 'admin' || (profile as any)?.can_edit_contact_assignments) && salesReps.length > 0 && (
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-1">Assigned Sales Rep</p>
                      <select
                        value={editData.assigned_to}
                        onChange={(e) => setEditData({ ...editData, assigned_to: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Unassigned</option>
                        {salesReps.map((rep) => (
                          <option key={rep.id} value={rep.id}>
                            {rep.full_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )
              ) : (
                assignedTo && (
                  <div className="flex items-start gap-2">
                    <User className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Assigned To</p>
                      <p className="text-sm font-medium text-gray-900">{assignedTo.full_name}</p>
                    </div>
                  </div>
                )
              )}

              {editing ? (
                offices.length > 0 && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-gray-500 mb-1">
                        Office Location <span className="text-red-500">*</span>
                      </p>
                      <select
                        value={editData.office_id}
                        onChange={(e) => setEditData({ ...editData, office_id: e.target.value })}
                        className={`w-full px-3 py-2 border rounded-lg text-sm ${!editData.office_id ? 'border-red-300' : 'border-gray-300'}`}
                        required
                      >
                        <option value="">-- Select an Office --</option>
                        {offices.map((office) => (
                          <option key={office.id} value={office.id}>
                            {office.office_name}
                          </option>
                        ))}
                      </select>
                      {!editData.office_id && (
                        <p className="text-xs text-red-500 mt-1">Office Location is required.</p>
                      )}
                    </div>
                  </div>
                )
              ) : (
                contactOffice && (
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Office Location</p>
                      <p className="text-sm font-medium text-gray-900">{contactOffice.office_name}</p>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Prospect Status */}
            {editing && (profile?.can_view_prospects || profile?.role === 'admin') && (
              <div className="space-y-2 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editData.is_prospect}
                    onChange={(e) => setEditData({ ...editData, is_prospect: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <Target className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-700">
                    Mark as Prospect
                  </span>
                </label>
                <p className="ml-6 text-xs text-gray-500">
                  Prospects are potential customers being evaluated. This enables competitor tracking for this contact.
                </p>

                {/* Competitor Selection - Only show when marked as prospect */}
                {editData.is_prospect && (
                  <div className="mt-3 ml-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                    <CompetitorSelector
                      selectedCompetitorIds={editCompetitorIds}
                      onChange={setEditCompetitorIds}
                    />
                  </div>
                )}

                {/* Electrician fields - Only show when marked as prospect */}
                {editData.is_prospect && (
                  <div className="mt-3 ml-6 p-4 bg-sky-50 border border-sky-200 rounded-lg space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-sky-600" />
                      <span className="text-sm font-medium text-sky-800">Electrician Used</span>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Electrician / Company Name</label>
                      <input
                        type="text"
                        value={editData.electrician_name}
                        onChange={(e) => setEditData({ ...editData, electrician_name: e.target.value })}
                        placeholder="e.g. ABC Electric"
                        className="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Notes (Optional)</label>
                      <input
                        type="text"
                        value={editData.electrician_notes}
                        onChange={(e) => setEditData({ ...editData, electrician_notes: e.target.value })}
                        placeholder="e.g. Mostly commercial, long-term relationship"
                        className="w-full px-3 py-2 border border-sky-200 rounded-lg text-sm focus:ring-2 focus:ring-sky-400 focus:border-transparent bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tax Information & Payment Terms */}
            <div className="space-y-3">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200">Financial</h3>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editData.is_tax_exempt}
                      onChange={(e) => setEditData({
                        ...editData,
                        is_tax_exempt: e.target.checked,
                        tax_rate: e.target.checked ? '0' : editData.tax_rate
                      })}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-xs font-medium text-gray-700">Tax Exempt</span>
                  </label>
                  {editData.is_tax_exempt && (
                    <input
                      type="text"
                      value={editData.tax_exemption_reason}
                      onChange={(e) => setEditData({ ...editData, tax_exemption_reason: e.target.value })}
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                      placeholder="Reason"
                    />
                  )}
                </div>
                {!editData.is_tax_exempt && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Tax Rate (%) {lookingUpTaxRate && <span className="text-gray-400 font-normal">— looking up...</span>}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={editData.tax_rate ? (parseFloat(editData.tax_rate) * 100).toString() : ''}
                      onChange={(e) => {
                        const percentValue = e.target.value;
                        const decimalValue = percentValue ? (parseFloat(percentValue) / 100).toString() : '';
                        setEditData({ ...editData, tax_rate: decimalValue });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="9.35"
                    />
                    {!editData.tax_jurisdiction_id && !lookingUpTaxRate && (
                      <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Enter a ZIP code to auto-assign a jurisdiction
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Payment Terms</label>
                  <select
                    value={editData.default_payment_terms}
                    onChange={(e) => setEditData({ ...editData, default_payment_terms: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">None</option>
                    <option value="Net 10">Net 10</option>
                    <option value="Net 30">Net 30</option>
                    <option value="Due on receipt">Due on receipt</option>
                  </select>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <DollarSign className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Tax Status</p>
                    {(contact as any).is_tax_exempt ? (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Exempt</span>
                        {(contact as any).tax_exemption_reason && (
                          <p className="text-xs text-gray-700 mt-1">{(contact as any).tax_exemption_reason}</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Taxable</span>
                        {(contact as any).tax_rate && (
                          <p className="text-xs font-medium text-gray-900 mt-1">
                            {((contact as any).tax_rate * 100).toFixed(2)}%
                          </p>
                        )}
                        {taxJurisdictionName && (
                          <p className="text-xs text-gray-500 mt-0.5">{taxJurisdictionName}</p>
                        )}
                        {!(contact as any).tax_jurisdiction_id && (
                          <p className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No jurisdiction set
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                {(contact as any).default_payment_terms && (
                  <div className="flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Payment Terms</p>
                      <p className="text-sm font-medium text-gray-900">{(contact as any).default_payment_terms}</p>
                    </div>
                  </div>
                )}
              </>
            )}
            </div>
          </div>

          {tags.length > 0 && (
            <div className="border-t border-gray-200 pt-3 mt-4">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200 mb-2">Tags</h3>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs"
                  >
                    <Tag className="w-3 h-3" />
                    {tag.tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(editing ? editData.notes : contact.notes) && (
            <div className="border-t border-gray-200 pt-3 mt-4">
              <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200 mb-2">Notes</h3>
              {editing ? (
                <textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none text-sm"
                  placeholder="Notes"
                />
              ) : (
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
              )}
            </div>
          )}

          <div className="border-t border-gray-200 pt-3 mt-4">
            <h3 className="text-xs font-medium text-gray-700 uppercase tracking-wide pb-1.5 border-b border-gray-200 mb-2">Business Card Photo</h3>
            {editing ? (
              <div className="flex items-start gap-4">
                {businessCardPhotoPreview ? (
                  <div className="relative">
                    <img
                      src={businessCardPhotoPreview}
                      alt="Business card"
                      className="w-64 h-40 object-cover rounded-lg border border-gray-300"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBusinessCardPhoto(null);
                        setBusinessCardPhotoPreview(null);
                      }}
                      className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center w-64 h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                    <Camera className="w-10 h-10 text-gray-400 mb-2" />
                    <span className="text-sm text-gray-600">Upload Business Card</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setBusinessCardPhoto(file);
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            setBusinessCardPhotoPreview(reader.result as string);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <div>
                {(contact as any).business_card_photo ? (
                  <div className="space-y-2">
                    <img
                      src={(contact as any).business_card_photo}
                      alt="Business card"
                      className="w-64 h-40 object-cover rounded-lg border border-gray-300 cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setShowFullCardImage(true)}
                    />
                    <button
                      onClick={() => setShowFullCardImage(true)}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                    >
                      <ImageIcon className="w-4 h-4" />
                      View Full Size
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <ImageIcon className="w-5 h-5" />
                    <span>No business card scanned</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Task History */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide pb-2 border-b border-gray-200 mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              Task History ({tasks.length})
            </h3>
            {tasks.length > 0 ? (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div key={task.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{task.title}</p>
                        {task.description && (
                          <p className="text-gray-300">{task.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                          <span className={`px-2 py-0.5 rounded-full ${
                            task.status === 'completed' ? 'bg-green-100 text-green-700' :
                            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                            task.status === 'cancelled' ? 'bg-gray-100 text-gray-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                            {task.status}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full ${
                            task.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                            task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                            task.priority === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {task.priority}
                          </span>
                          {task.profiles && (
                            <span>Created by {task.profiles.full_name}</span>
                          )}
                          {task.due_date && (
                            <span>Due: {new Date(task.due_date).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No tasks associated with this contact</p>
            )}
          </div>

          {/* Connection History */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide pb-2 border-b border-gray-200 mb-3 flex items-center gap-2">
              <Users className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              Connection History ({connections.length})
            </h3>
            {connections.length > 0 ? (
              <div className="space-y-2">
                {connections.map((connection) => {
                  const Icon = getConnectionIcon(connection.connection_type);
                  return (
                    <div key={connection.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg flex-shrink-0">
                          <Icon className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-gray-900">
                              {getConnectionLabel(connection.connection_type)}
                            </span>
                            <span className="text-xs text-gray-500">
                              {new Date(connection.connection_date).toLocaleDateString()}
                            </span>
                            {connection.completed_at && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                                Completed
                              </span>
                            )}
                          </div>
                          {connection.profile && (
                            <p className="text-xs text-gray-500 mb-1">
                              By {connection.profile.full_name}
                            </p>
                          )}
                          {connection.notes && (
                            <p className="text-sm text-gray-700 mt-2">{connection.notes}</p>
                          )}
                          {connection.follow_up_needed && connection.follow_up_description && (
                            <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                              <p className="text-xs font-medium text-blue-900 mb-1">Follow-up Required</p>
                              <p className="text-sm text-blue-800">{connection.follow_up_description}</p>
                              {connection.reminder_date && (
                                <p className="text-xs text-blue-600 mt-1">
                                  Reminder: {new Date(connection.reminder_date).toLocaleString()}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No connection history for this contact</p>
            )}
          </div>

          {/* Account Credits */}
          <ContactAccountCredits contactId={contact.id} />

          {/* Mentions & Hashtags */}
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide pb-2 border-b border-gray-200 mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              Mentions in Discussions ({mentions.length})
            </h3>
            {mentions.length > 0 ? (
              <div className="space-y-2">
                {mentions.map((post) => (
                  <div key={post.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {post.profiles && (
                            <span className="text-sm font-medium text-gray-900">
                              @{post.profiles.username}
                            </span>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(post.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 break-words">{post.content}</p>
                        {post.hashtags && post.hashtags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {post.hashtags.map((tag, idx) => (
                              <span key={idx} className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full flex items-center gap-1">
                                <Hash className="w-3 h-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm">No mentions found in discussions</p>
            )}
          </div>
            </div>
          ) : activeTab === 'history' ? (
            <ContactHistory
              contactId={contact.id}
              onNavigateToProposal={onNavigateToProposal}
            />
          ) : activeTab === 'appointments' ? (
            <div className="space-y-6">
              {/* Header with Schedule Button */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Appointments</h3>
                <button
                  onClick={() => setShowCreateAppointment(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Schedule Appointment
                </button>
              </div>

              {appointments.length > 0 ? (
                <>
                  {/* Upcoming Appointments */}
                  {(() => {
                    const now = new Date();
                    const upcomingAppointments = appointments.filter(apt => {
                      const aptDate = new Date(apt.appointment_date);
                      return aptDate >= now || apt.status === 'scheduled' || apt.status === 'confirmed';
                    });

                    if (upcomingAppointments.length > 0) {
                      return (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Upcoming Appointments ({upcomingAppointments.length})
                          </h4>
                          <div className="space-y-3">
                            {upcomingAppointments.map((appointment) => (
                              <div key={appointment.id} className="p-4 bg-blue-50 rounded-lg border border-blue-200 hover:border-blue-300 transition-colors">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h5 className="font-medium text-gray-900">{appointment.title}</h5>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        appointment.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                                        appointment.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                                        appointment.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {appointment.status}
                                      </span>
                                      {appointment.appointment_type && (
                                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                                          {appointment.appointment_type.replace('_', ' ')}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        <span>{new Date(appointment.appointment_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                      </div>
                                      {!appointment.all_day && (
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-4 h-4" />
                                          <span>{appointment.start_time} - {appointment.end_time}</span>
                                        </div>
                                      )}
                                      {appointment.all_day && (
                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">All Day</span>
                                      )}
                                      {appointment.technician && (
                                        <div className="flex items-center gap-1.5">
                                          <User className="w-4 h-4" />
                                          <span>{appointment.technician.full_name}</span>
                                        </div>
                                      )}
                                    </div>

                                    {appointment.location && (
                                      <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-2">
                                        <MapPin className="w-4 h-4" />
                                        <span>{appointment.location}</span>
                                      </div>
                                    )}

                                    {appointment.project && (
                                      <div className="mt-2 text-xs text-gray-500">
                                        Project: {appointment.project.project_number} - {appointment.project.project_name}
                                      </div>
                                    )}

                                    {appointment.notes && (
                                      <p className="mt-2 text-sm text-gray-700">{appointment.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Past Appointments */}
                  {(() => {
                    const now = new Date();
                    const pastAppointments = appointments.filter(apt => {
                      const aptDate = new Date(apt.appointment_date);
                      return aptDate < now && apt.status !== 'scheduled' && apt.status !== 'confirmed';
                    });

                    if (pastAppointments.length > 0) {
                      return (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            Past Appointments ({pastAppointments.length})
                          </h4>
                          <div className="space-y-3">
                            {pastAppointments.map((appointment) => (
                              <div key={appointment.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <h5 className="font-medium text-gray-900">{appointment.title}</h5>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        appointment.status === 'completed' ? 'bg-green-100 text-green-700' :
                                        appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                      }`}>
                                        {appointment.status}
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                                      <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        <span>{new Date(appointment.appointment_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                      </div>
                                      {!appointment.all_day && (
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="w-4 h-4" />
                                          <span>{appointment.start_time} - {appointment.end_time}</span>
                                        </div>
                                      )}
                                      {appointment.technician && (
                                        <div className="flex items-center gap-1.5">
                                          <User className="w-4 h-4" />
                                          <span>{appointment.technician.full_name}</span>
                                        </div>
                                      )}
                                    </div>

                                    {appointment.location && (
                                      <div className="flex items-center gap-1.5 text-sm text-gray-600 mt-2">
                                        <MapPin className="w-4 h-4" />
                                        <span>{appointment.location}</span>
                                      </div>
                                    )}

                                    {appointment.notes && (
                                      <p className="mt-2 text-sm text-gray-700">{appointment.notes}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No appointments scheduled</p>
                  <button
                    onClick={() => setShowCreateAppointment(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Schedule First Appointment
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'portal' ? (
            <div className="space-y-6">
              {/* Customer Portal Access Section */}
              {profile?.can_send_portal_invites && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 sm:p-6 border border-blue-100">
                  <div className="flex flex-col gap-4 sm:gap-6">
                    <div className="flex items-start gap-3">
                      <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${portalAccessEnabled || punchlistAccess?.has_access ? 'bg-green-100' : 'bg-gray-200'}`}>
                        <Shield className={`w-5 sm:w-6 h-5 sm:h-6 ${portalAccessEnabled || punchlistAccess?.has_access ? 'text-green-700' : 'text-gray-500'}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900">Customer Portal Access</h3>
                        <p className="text-xs sm:text-sm text-gray-600 mt-1">
                          {portalAccessEnabled ? (
                            'Customer can view projects, invoices, and communicate online'
                          ) : punchlistAccess?.has_access ? (
                            <span className="text-blue-600">Customer has trial access ({punchlistAccess.days_remaining} days remaining)</span>
                          ) : (
                            'Enable portal access for this customer to view their information'
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="flex items-center gap-2 sm:gap-3 cursor-pointer group touch-manipulation">
                        <span className="text-xs sm:text-sm font-medium text-gray-700">Portal Status:</span>
                        <span className={`text-xs sm:text-sm font-semibold transition-colors ${portalAccessEnabled ? 'text-green-700' : punchlistAccess?.has_access ? 'text-blue-700' : 'text-gray-600'}`}>
                          {portalAccessEnabled ? 'Active' : punchlistAccess?.has_access ? `Trial (${punchlistAccess.days_remaining}d)` : 'Inactive'}
                        </span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={portalAccessEnabled}
                            onChange={handleTogglePortalAccess}
                            className="sr-only"
                          />
                          <div className={`w-12 sm:w-14 h-6 sm:h-7 rounded-full transition-all ${
                            portalAccessEnabled ? 'bg-green-500' : 'bg-gray-300 group-hover:bg-gray-400'
                          }`}>
                            <div className={`absolute top-1 left-1 w-4 sm:w-5 h-4 sm:h-5 bg-white rounded-full shadow-sm transition-transform ${
                              portalAccessEnabled ? 'translate-x-6 sm:translate-x-7' : ''
                            }`}></div>
                          </div>
                        </div>
                      </label>

                      {(portalAccessEnabled || punchlistAccess?.has_access) && (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                          <button
                            onClick={() => setConfirmModal({ title: 'Send Portal Invite', message: `Send portal login link to ${contact.email}?`, onConfirm: handleSendPortalInvite })}
                            disabled={sendingPortalInvite}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md touch-manipulation"
                          >
                            <Send className="w-4 h-4" />
                            {sendingPortalInvite ? 'Sending...' : 'Send Login Link'}
                          </button>
                          {profile?.role === 'admin' && (
                            <button
                              onClick={handleViewAsCustomer}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all shadow-sm touch-manipulation"
                              title="View portal as this customer"
                            >
                              <Eye className="w-4 h-4" />
                              Preview Portal
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Punchlist / Test & Tune Trial Section (Admin Only) */}
              {profile?.role === 'admin' && (
                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg p-4 sm:p-6 border border-purple-100">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${punchlistAccess?.has_access ? 'bg-blue-100' : 'bg-gray-200'}`}>
                        <ListTodo className={`w-5 sm:w-6 h-5 sm:h-6 ${punchlistAccess?.has_access ? 'text-blue-700' : 'text-gray-500'}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900">Test & Tune Trial Access</h3>
                        {punchlistAccess?.has_access ? (
                          <div className="text-xs sm:text-sm text-gray-600 mt-1">
                            <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                              <CheckCircle2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
                              Active Trial
                            </span>
                            {punchlistAccess.days_remaining !== null && (
                              <span className="text-gray-600"> • {punchlistAccess.days_remaining} days remaining</span>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs sm:text-sm text-gray-600 mt-1">
                            Grant 90-day trial access to the punchlist portal
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setConfirmModal({ title: 'Grant Punchlist Access', message: 'Grant 90-day Test & Tune punchlist access to this contact?', onConfirm: handleGrantPunchlistAccess })}
                      disabled={grantingPunchlistAccess}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs sm:text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-sm hover:shadow-md touch-manipulation w-full sm:w-auto whitespace-nowrap"
                    >
                      {punchlistAccess?.has_access ? (
                        <>
                          <Plus className="w-4 h-4" />
                          {grantingPunchlistAccess ? 'Processing...' : 'Extend 90 Days'}
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          {grantingPunchlistAccess ? 'Processing...' : 'Grant 90-Day Access'}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Job Photos & Videos</h3>
                <span className="text-sm text-gray-500">{jobPhotos.length} total</span>
              </div>

              {jobPhotos.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <Camera className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No photos yet</h3>
                  <p className="text-gray-600">Photos and videos for this contact will appear here</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {jobPhotos.map((photo) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-500 transition-all cursor-pointer"
                      onClick={() => setSelectedPhoto(photo)}
                    >
                      <img
                        src={photo.thumbnail_url || photo.photo_url}
                        alt={photo.caption || 'Job photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />

                      {photo.media_type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-12 h-12 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <Video className="w-6 h-6 text-white fill-white" />
                          </div>
                        </div>
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                          {photo.caption && (
                            <div className="text-sm font-medium mb-1 line-clamp-2">
                              {photo.caption}
                            </div>
                          )}
                          <div className="text-xs text-gray-300">
                            {new Date(photo.taken_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-4 sm:px-6 pb-4 pt-2 border-t border-gray-100 mt-2">
          <p className="text-xs text-gray-400">
            Contact record created {new Date(contact.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}{' '}
            at {new Date(contact.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {selectedPhoto && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/10 rounded-lg"
          >
            <X className="w-6 h-6" />
          </button>

          <div className="max-w-6xl w-full max-h-[90vh] overflow-auto">
            {selectedPhoto.media_type === 'video' ? (
              <video
                src={selectedPhoto.photo_url}
                controls
                className="w-full h-auto rounded-lg"
                autoPlay
              />
            ) : (
              <img
                src={selectedPhoto.photo_url}
                alt={selectedPhoto.caption || 'Job photo'}
                className="w-full h-auto rounded-lg"
              />
            )}
            <div className="mt-4 bg-white rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Uploaded By:</span>
                  <span className="ml-2 font-medium">
                    {(selectedPhoto.technician as any)?.full_name || 'Unknown'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Date Taken:</span>
                  <span className="ml-2 font-medium">
                    {new Date(selectedPhoto.taken_at).toLocaleDateString()}
                  </span>
                </div>
                {selectedPhoto.project && (
                  <div>
                    <span className="text-gray-500">Project:</span>
                    <span className="ml-2 font-medium">{(selectedPhoto.project as any)?.name}</span>
                  </div>
                )}
              </div>
              {selectedPhoto.caption && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <span className="text-gray-500">Caption:</span>
                  <p className="mt-1 text-gray-900">{selectedPhoto.caption}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showConvertForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-full sm:max-w-lg">
            <div className="p-6 border-b border-gray-200">
              <h3 className="text-xl font-bold text-gray-900">Convert to Lead</h3>
              <p className="text-gray-300">
                Convert this contact into an active lead
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Opportunity / Description
                </label>
                <textarea
                  value={convertData.opportunity_description}
                  onChange={(e) => setConvertData({ ...convertData, opportunity_description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  placeholder="What is the opportunity with this customer?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Priority *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setConvertData({ ...convertData, priority: 'urgent' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      convertData.priority === 'urgent'
                        ? 'border-red-500 bg-red-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-red-600" />
                      <span className="font-semibold text-red-700">🔴 Urgent</span>
                    </div>
                    <p className="text-xs text-gray-600">Follow up within hours</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertData({ ...convertData, priority: 'high' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      convertData.priority === 'high'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-orange-600" />
                      <span className="font-semibold text-orange-700">🟠 High</span>
                    </div>
                    <p className="text-xs text-gray-600">Follow up within 1 day</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertData({ ...convertData, priority: 'medium' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      convertData.priority === 'medium'
                        ? 'border-yellow-500 bg-yellow-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-yellow-600" />
                      <span className="font-semibold text-yellow-700">🟡 Medium</span>
                    </div>
                    <p className="text-xs text-gray-600">Follow up within 3 days</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConvertData({ ...convertData, priority: 'low' })}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      convertData.priority === 'low'
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <AlertCircle className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-700">🟢 Low</span>
                    </div>
                    <p className="text-xs text-gray-600">Follow up within 1 week</p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Assignment
                </label>
                <select
                  value={convertData.assignment}
                  onChange={(e) => setConvertData({ ...convertData, assignment: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="fishbowl">Send to Fishbowl (All reps notified)</option>
                  {salesReps.map((rep) => (
                    <option key={rep.id} value={rep.id}>
                      Assign to {rep.full_name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowConvertForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConvertToLead}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                >
                  Convert to Lead
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                  <Trash2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Delete Contact</h3>
                  <p className="text-sm text-gray-600">This action cannot be undone</p>
                </div>
              </div>

              <p className="text-gray-700 mb-6">
                Are you sure you want to delete <strong>{contact.contact_name}</strong>?
                All associated data including tags will be permanently removed.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
                >
                  Delete Contact
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFullCardImage && (contact as any).business_card_photo && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center p-4 z-50" onClick={() => setShowFullCardImage(false)}>
          <div className="relative max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowFullCardImage(false)}
              className="absolute -top-10 right-0 p-2 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={(contact as any).business_card_photo}
              alt="Business card full size"
              className="w-full h-auto rounded-lg shadow-2xl"
            />
          </div>
        </div>
      )}

      {showCreateProposal && (
        <CreateProposalModal
          onClose={() => setShowCreateProposal(false)}
          onCreated={(proposalId) => {
            setShowCreateProposal(false);
            if (onNavigateToProposal) {
              onNavigateToProposal(proposalId);
            } else {
              setActiveTab('history');
            }
          }}
          contactId={contact.id}
        />
      )}

      {showDesignBrief && (
        <DesignBriefModal
          onClose={() => setShowDesignBrief(false)}
          contactId={contact.id}
          contactName={contact.contact_name}
          onProposalCreated={(proposalId) => {
            setShowDesignBrief(false);
            if (onNavigateToProposal) {
              onNavigateToProposal(proposalId);
            }
          }}
        />
      )}

      {showCreateWorkOrder && (
        <CreateWorkOrderModal
          onClose={() => setShowCreateWorkOrder(false)}
          onSuccess={() => {
            setShowCreateWorkOrder(false);
            setActiveTab('history');
          }}
          contactId={contact.id}
        />
      )}

      {showCreateTask && (
        <TaskForm
          onClose={() => setShowCreateTask(false)}
          onSuccess={() => {
            setShowCreateTask(false);
            setActiveTab('history');
          }}
          contactId={contact.id}
        />
      )}

      {showCreateAppointment && (
        <CreateAppointmentModal
          contactId={contact.id}
          onClose={() => setShowCreateAppointment(false)}
          onSuccess={() => {
            setShowCreateAppointment(false);
            loadAppointments();
            setActiveTab('appointments');
          }}
        />
      )}

      {showCreateInvoice && (
        <CreateInvoiceModal
          contactId={contact.id}
          onClose={() => setShowCreateInvoice(false)}
          onSuccess={(invoiceId: string) => {
            setShowCreateInvoice(false);
            setActiveTab('history');
            setViewingInvoiceId(invoiceId);
          }}
        />
      )}

      {showCreateInvoiceFromWO && (
        <CreateInvoiceFromWorkOrderModal
          onClose={() => setShowCreateInvoiceFromWO(false)}
          onSuccess={(invoiceId: string) => {
            setShowCreateInvoiceFromWO(false);
            setActiveTab('history');
            setViewingInvoiceId(invoiceId);
          }}
          preSelectedContactId={contact.id}
        />
      )}

      {viewingInvoiceId && (
        <InvoiceDetailModal
          invoiceId={viewingInvoiceId}
          onClose={() => setViewingInvoiceId(null)}
        />
      )}

      {showApplyPayment && (
        <ApplyBulkPaymentModal
          contactId={contact.id}
          contactName={(contact as any).contact_name || `${(contact as any).first_name || ''} ${(contact as any).last_name || ''}`.trim() || 'Customer'}
          onClose={() => setShowApplyPayment(false)}
          onSuccess={() => setShowApplyPayment(false)}
        />
      )}

      {showUnbilledWorkOrderAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                  <Receipt className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">Unbilled Work Orders Found</h3>
                  <p className="text-gray-600">
                    This customer has {unbilledWorkOrdersCount} unbilled work order{unbilledWorkOrdersCount !== 1 ? 's' : ''}.
                    Would you like to create an invoice from these work orders instead?
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCreateBlankInvoice}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  No, create blank invoice
                </button>
                <button
                  onClick={handleUseWorkOrders}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Yes, use work orders
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Conversion Confirmation Modal */}
      {showConversionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                  conversionTarget === 'lead' ? 'bg-amber-100' : conversionTarget === 'prospect' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  {conversionTarget === 'lead' ? (
                    <Sparkles className="w-6 h-6 text-amber-600" />
                  ) : conversionTarget === 'prospect' ? (
                    <Target className="w-6 h-6 text-blue-600" />
                  ) : (
                    <UserCheck className="w-6 h-6 text-green-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Convert to {conversionTarget === 'lead' ? 'Lead' : conversionTarget === 'prospect' ? 'Prospect' : 'Customer'}?
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {conversionTarget === 'lead' ? (
                      <>Converting this {getContactType()} to a <strong className="text-amber-600">lead</strong> will mark them as actively interested — they expressed interest or are requesting a quote.</>
                    ) : conversionTarget === 'prospect' ? (
                      <>Converting this {getContactType()} to a <strong className="text-blue-600">prospect</strong> will move them to the nurturing pipeline. Prospects are contacts you are pursuing who have not yet expressed interest.</>
                    ) : (
                      <>Converting this {getContactType()} to a <strong className="text-green-700">customer</strong> will mark them as an active paying customer and update all related records.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConversionModal(false)}
                  disabled={convertingContact}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleConvertContact(conversionTarget)}
                  disabled={convertingContact}
                  className={`flex-1 px-4 py-2 text-white rounded-lg font-medium disabled:opacity-50 ${
                    conversionTarget === 'lead' ? 'bg-amber-600 hover:bg-amber-700' : conversionTarget === 'prospect' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  {convertingContact ? 'Converting...' : 'Convert'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Log Connection Modal */}
      {showLogConnection && (
        <ConnectionForm
          contactId={contact.id}
          onClose={() => setShowLogConnection(false)}
          onSuccess={() => {
            setShowLogConnection(false);
            loadConnections();
          }}
        />
      )}

      {/* Portal Preview Modal */}
      {showPortalPreview && (
        <PortalPreviewModal
          contactId={contact.id}
          contactName={contact.contact_name}
          onClose={() => setShowPortalPreview(false)}
        />
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

interface AccountCredit {
  id: string;
  amount: number;
  amount_applied: number;
  amount_remaining: number;
  status: string;
  notes: string | null;
  created_at: string;
  sales_order_id: string | null;
  source_invoice_id: string | null;
  sales_order?: { order_number: string } | null;
  source_invoice?: { invoice_number: string } | null;
}

function ContactAccountCredits({ contactId }: { contactId: string }) {
  const [credits, setCredits] = useState<AccountCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('customer_account_credits')
          .select(`
            id, amount, amount_applied, amount_remaining, status, notes, created_at,
            sales_order_id, source_invoice_id,
            sales_order:sales_orders(order_number),
            source_invoice:invoices(invoice_number)
          `)
          .eq('contact_id', contactId)
          .order('created_at', { ascending: false });
        setCredits((data as AccountCredit[]) || []);
      } catch {
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [contactId]);

  if (loading) return null;

  const openCredits = credits.filter(c => c.status === 'open');
  const otherCredits = credits.filter(c => c.status !== 'open');
  const totalAvailable = openCredits.reduce((s, c) => s + (c.amount_remaining || 0), 0);

  if (credits.length === 0) return null;

  function fmt(n: number) {
    return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  const displayedOther = showAll ? otherCredits : [];

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-xs sm:text-sm font-medium text-gray-700 uppercase tracking-wide pb-2 border-b border-gray-200 mb-3 flex items-center gap-2">
        <DollarSign className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-green-600" />
        Account Credits
        {totalAvailable > 0 && (
          <span className="ml-auto text-sm font-semibold text-green-700 normal-case tracking-normal">
            ${fmt(totalAvailable)} available
          </span>
        )}
      </h3>

      {openCredits.length === 0 && (
        <p className="text-sm text-gray-500">No open credits on account.</p>
      )}

      <div className="space-y-2">
        {openCredits.map(credit => (
          <div key={credit.id} className="p-3 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-green-800">
                    ${fmt(credit.amount_remaining)} remaining
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                    Open
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Issued {new Date(credit.created_at).toLocaleDateString()}
                  {credit.amount_applied > 0 && (
                    <> · ${fmt(credit.amount_applied)} of ${fmt(credit.amount)} applied</>
                  )}
                </div>
                {credit.source_invoice && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    From Invoice #{credit.source_invoice.invoice_number}
                    {credit.sales_order && (
                      <> · SO #{credit.sales_order.order_number}</>
                    )}
                  </div>
                )}
                {credit.notes && (
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">{credit.notes}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-base font-bold text-green-700">${fmt(credit.amount)}</div>
                <div className="text-xs text-gray-400">original</div>
              </div>
            </div>
          </div>
        ))}

        {otherCredits.length > 0 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mt-1"
          >
            {showAll ? 'Hide' : `Show ${otherCredits.length} applied/voided credit${otherCredits.length > 1 ? 's' : ''}`}
          </button>
        )}

        {displayedOther.map(credit => (
          <div key={credit.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 opacity-70">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700">${fmt(credit.amount)}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    credit.status === 'fully_applied'
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-200 text-gray-500 border border-gray-300'
                  }`}>
                    {credit.status === 'fully_applied' ? 'Applied' : 'Voided'}
                  </span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(credit.created_at).toLocaleDateString()}
                  {credit.source_invoice && (
                    <> · Invoice #{credit.source_invoice.invoice_number}</>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
