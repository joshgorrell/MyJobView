import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Loader, CheckCircle, FileText, ChevronRight,
  AlertCircle, Home, Layers, Package, Clock, ArrowRight, Sparkles, Search,
  User, RefreshCw, ArrowLeft, Send
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface Contact {
  id: string;
  contact_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  company_name?: string;
  address?: string;
  city?: string;
  state?: string;
  source?: 'contact' | 'lead';
  contact_type?: string;
  is_prospect?: boolean;
}

interface LineItemPreview {
  description: string;
  quantity: number;
  unit: string;
  itemType: 'material' | 'labor';
  laborHours?: number | null;
}

interface RoomPreview {
  name: string;
  lineItems: LineItemPreview[];
}

interface ProposalPrefill {
  title?: string;
  contactSearchName?: string;
  taxEnvironment?: 'residential' | 'commercial';
  taxProjectType?: string;
  rooms?: RoomPreview[];
  notes?: string;
}

interface ExistingBrief {
  id: string;
  contact_id: string | null;
  lead_id?: string | null;
  raw_notes: string;
  title?: string;
  status: 'draft' | 'submitted' | 'building' | 'ready' | 'archived';
  ai_summary?: ProposalPrefill | null;
  linked_proposal_id?: string | null;
}

interface DesignBriefModalProps {
  onClose: () => void;
  contactId?: string;
  leadId?: string;
  contactName?: string;
  onProposalCreated?: (proposalId: string) => void;
  existingBrief?: ExistingBrief;
}

type Step = 'input' | 'processing' | 'preview' | 'done';

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: Event) => void) | null;
    onend: (() => void) | null;
  }
  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }
  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }
  interface SpeechRecognitionResult {
    isFinal: boolean;
    [index: number]: SpeechRecognitionAlternative;
  }
  interface SpeechRecognitionAlternative {
    transcript: string;
  }
}

export default function DesignBriefModal({
  onClose,
  contactId,
  leadId,
  contactName,
  onProposalCreated,
  existingBrief,
}: DesignBriefModalProps) {
  const { profile } = useAuth();
  const isEditing = !!existingBrief;
  const hasExistingAI = !!(existingBrief?.ai_summary);

  const [step, setStep] = useState<Step>(() => {
    if (existingBrief?.ai_summary && existingBrief.status !== 'draft') return 'preview';
    return 'input';
  });
  const [title, setTitle] = useState(existingBrief?.title || '');
  const [notes, setNotes] = useState(existingBrief?.raw_notes || '');
  const [isRecording, setIsRecording] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState(contactName || '');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [prefillResult, setPrefillResult] = useState<ProposalPrefill | null>(existingBrief?.ai_summary || null);
  const [createdProposalId, setCreatedProposalId] = useState<string | null>(existingBrief?.linked_proposal_id || null);
  const [error, setError] = useState('');
  const [contactError, setContactError] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('Analyzing your notes...');
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);
  const [briefId, setBriefId] = useState<string | null>(existingBrief?.id || null);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [openAIConfigured, setOpenAIConfigured] = useState<boolean | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(160, el.scrollHeight)}px`;
  }, [notes, interimTranscript]);

  useEffect(() => {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    setVoiceSupported(!!SpeechRecognitionClass);
  }, []);

  useEffect(() => {
    supabase
      .from('company_settings')
      .select('openai_api_key')
      .maybeSingle()
      .then(({ data }) => {
        setOpenAIConfigured(!!(data?.openai_api_key));
      });
  }, []);

  useEffect(() => {
    if (existingBrief?.contact_id) {
      loadContact(existingBrief.contact_id);
    } else if (existingBrief?.lead_id) {
      loadLead(existingBrief.lead_id);
    } else if (contactId) {
      loadContact(contactId);
    } else if (leadId) {
      loadLead(leadId);
    }
  }, [contactId, leadId, existingBrief?.contact_id, existingBrief?.lead_id]);

  const getDisplayName = useCallback((c: Contact): string => {
    return c.full_name || c.contact_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || 'Unknown';
  }, []);

  const searchContacts = useCallback(async (query: string) => {
    if (!query.trim()) {
      setContacts([]);
      setShowContactDropdown(false);
      return;
    }
    setContactsLoading(true);

    const q = query.trim();

    const [{ data: contactsData }, { data: leadsData }] = await Promise.all([
      supabase
        .from('contacts')
        .select('id, contact_name, first_name, last_name, full_name, company_name, address, city, state, contact_type, is_prospect')
        .or(`contact_name.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(10),
      supabase
        .from('leads')
        .select('id, contact_name, company_name')
        .or(`contact_name.ilike.%${q}%,company_name.ilike.%${q}%`)
        .limit(10),
    ]);

    const fromContacts: Contact[] = (contactsData || []).map(c => ({ ...c, source: 'contact' as const }));
    const fromLeads: Contact[] = (leadsData || []).map(l => ({
      id: l.id,
      contact_name: l.contact_name,
      company_name: l.company_name,
      contact_type: 'lead',
      source: 'lead' as const,
    }));

    const combined: Contact[] = [...fromContacts, ...fromLeads];
    combined.sort((a, b) => getDisplayName(a).localeCompare(getDisplayName(b)));

    setContacts(combined);
    setShowContactDropdown(combined.length > 0);
    setContactsLoading(false);
  }, [getDisplayName]);

  useEffect(() => {
    if (selectedContact) return;
    if (existingBrief?.contact_id && selectedContact) return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (contactSearch.length === 0) {
      setContacts([]);
      setShowContactDropdown(false);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      searchContacts(contactSearch);
    }, 200);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [contactSearch, selectedContact, existingBrief?.contact_id, searchContacts]);

  async function loadContact(id: string) {
    const { data } = await supabase
      .from('contacts')
      .select('id, contact_name, first_name, last_name, full_name, company_name, address, city, state')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      setSelectedContact(data);
      setContactSearch(data.full_name || data.contact_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || '');
    }
  }

  async function loadLead(id: string) {
    const { data } = await supabase
      .from('leads')
      .select('id, contact_name, company_name')
      .eq('id', id)
      .maybeSingle();
    if (data) {
      const contact: Contact = {
        id: data.id,
        contact_name: data.contact_name,
        company_name: data.company_name,
        contact_type: 'lead',
        source: 'lead',
      };
      setSelectedContact(contact);
      setContactSearch(data.contact_name || data.company_name || '');
    }
  }

  function startRecording() {
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setNotes(prev => prev + final);
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimTranscript('');
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  }

  function stopRecording() {
    recognitionRef.current?.stop();
    setIsRecording(false);
    setInterimTranscript('');
  }

  function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  async function handleSaveDraft() {
    if (!notes.trim()) return;
    setError('');
    setSavingDraft(true);

    try {
      const isLeadSelected = selectedContact?.source === 'lead';
      const payload = {
        contact_id: isLeadSelected ? null : (selectedContact?.id || null),
        lead_id: isLeadSelected ? selectedContact?.id : null,
        raw_notes: notes.trim(),
        title: title.trim() || '',
        status: 'draft' as const,
      };

      if (briefId) {
        const { error: updateError } = await supabase
          .from('design_briefs')
          .update(payload)
          .eq('id', briefId);
        if (updateError) throw updateError;
      } else {
        const { data, error: insertError } = await supabase
          .from('design_briefs')
          .insert({ ...payload, created_by: profile?.id })
          .select('id')
          .single();
        if (insertError || !data) throw insertError || new Error('Failed to save draft');
        setBriefId(data.id);
      }

      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleProcess() {
    if (!notes.trim()) {
      setError('Please enter some notes about the project.');
      return;
    }

    if (!selectedContact) {
      setContactError(true);
      setError('A customer is required. Search and select a contact, lead, or prospect above.');
      return;
    }

    setError('');
    setContactError(false);
    setIsRegenerating(hasExistingAI || !!prefillResult);
    setStep('processing');

    const processingMessages = [
      'Analyzing your notes...',
      'Matching products to your catalog...',
      'Building room layout...',
      'Generating draft proposal...',
    ];
    let msgIndex = 0;
    const msgInterval = setInterval(() => {
      msgIndex = (msgIndex + 1) % processingMessages.length;
      setProcessingMessage(processingMessages[msgIndex]);
    }, 2500);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      let currentBriefId = briefId;

      const isLeadSelected = selectedContact?.source === 'lead';
      const briefContactId = isLeadSelected ? null : (selectedContact?.id || null);
      const briefLeadId = isLeadSelected ? selectedContact?.id : null;

      if (currentBriefId) {
        const { error: updateError } = await supabase
          .from('design_briefs')
          .update({
            contact_id: briefContactId,
            lead_id: briefLeadId,
            raw_notes: notes.trim(),
            title: title.trim() || '',
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          })
          .eq('id', currentBriefId);
        if (updateError) throw updateError;
      } else {
        const { data: briefData, error: briefError } = await supabase
          .from('design_briefs')
          .insert({
            contact_id: briefContactId,
            lead_id: briefLeadId,
            raw_notes: notes.trim(),
            title: title.trim() || '',
            status: 'submitted',
            created_by: profile?.id,
            submitted_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (briefError || !briefData) throw new Error('Failed to save brief');
        currentBriefId = briefData.id;
        setBriefId(currentBriefId);
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-design-brief`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            briefId: currentBriefId,
            notes: notes.trim(),
            contactId: selectedContact?.id,
            contactName: selectedContact ? getDisplayName(selectedContact) : contactSearch,
            regenerate: isRegenerating,
          }),
        }
      );

      const result = await res.json();
      clearInterval(msgInterval);

      if (!res.ok) throw new Error(result.error || 'Processing failed');

      setPrefillResult(result.prefill);
      if (result.proposalId) {
        setCreatedProposalId(result.proposalId);
      }
      setStep('preview');
    } catch (err) {
      clearInterval(msgInterval);
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setStep('input');
    } finally {
      setIsRegenerating(false);
    }
  }

  function handleDone() {
    setStep('done');
    if (createdProposalId && onProposalCreated) {
      onProposalCreated(createdProposalId);
    }
  }

  function handleBackToEdit() {
    setStep('input');
    setError('');
  }

  const charCount = notes.length;
  const isReady = notes.trim().length > 20 && !!selectedContact;
  const alreadyProcessed = !!(prefillResult || hasExistingAI);
  const isLockedStatus = existingBrief && !['draft', 'submitted', 'building', 'ready'].includes(existingBrief.status);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col overflow-hidden max-h-[95dvh] sm:max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-gray-900 leading-tight">
              {isEditing ? 'Design Brief' : 'New Design Brief'}
            </h2>
            <p className="text-xs text-gray-500 truncate">
              {isLockedStatus
                ? `${existingBrief.status} — view only`
                : alreadyProcessed
                ? 'Edit notes and regenerate anytime'
                : 'Describe the project — AI will draft the proposal'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 rounded-xl transition-colors text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Input */}
        {step === 'input' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">

              {isLockedStatus && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  This brief is {existingBrief.status} and can no longer be edited.
                </div>
              )}

              {openAIConfigured === false && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">OpenAI key not configured</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Go to <strong>Admin &gt; Settings &gt; Integrations</strong> to add your OpenAI key.
                      You can still save a draft without it.
                    </p>
                  </div>
                </div>
              )}

              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer
                </label>
                {selectedContact && (contactId || leadId || existingBrief?.contact_id || existingBrief?.lead_id) ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-semibold">
                        {getDisplayName(selectedContact).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{getDisplayName(selectedContact)}</p>
                      {selectedContact.company_name && (
                        <p className="text-xs text-gray-500 truncate">{selectedContact.company_name}</p>
                      )}
                    </div>
                    <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={contactSearch}
                        onChange={e => {
                          setContactSearch(e.target.value);
                          if (selectedContact) setSelectedContact(null);
                          if (contactError) setContactError(false);
                        }}
                        placeholder="Search customers, contacts, or leads..."
                        disabled={!!isLockedStatus}
                        className={`w-full pl-9 pr-10 py-3 border rounded-xl text-sm focus:ring-2 focus:border-transparent outline-none disabled:bg-gray-50 ${
                          contactError
                            ? 'border-red-400 bg-red-50 focus:ring-red-400'
                            : 'border-gray-200 focus:ring-blue-500'
                        }`}
                        autoComplete="off"
                      />
                      {contactsLoading && (
                        <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                      )}
                      {selectedContact && !contactId && !leadId && (
                        <button
                          onClick={() => { setSelectedContact(null); setContactSearch(''); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {selectedContact && (
                      <div className="mt-2 flex items-center gap-2.5 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-semibold">
                            {getDisplayName(selectedContact).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-blue-900 truncate">{getDisplayName(selectedContact)}</p>
                          {selectedContact.company_name && (
                            <p className="text-xs text-blue-600 truncate">{selectedContact.company_name}</p>
                          )}
                        </div>
                        <CheckCircle className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      </div>
                    )}

                    {showContactDropdown && !selectedContact && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-56 overflow-y-auto">
                        {contacts.length === 0 && !contactsLoading && contactSearch.length > 0 && (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-2 px-1 text-sm text-gray-400">
                              <User className="w-4 h-4 flex-shrink-0" />
                              No results for "{contactSearch}"
                            </div>
                            <a
                              href="/contacts"
                              onClick={onClose}
                              className="flex items-center gap-2 w-full px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-medium rounded-lg transition-colors"
                            >
                              <User className="w-4 h-4 flex-shrink-0" />
                              Add "{contactSearch}" as a new contact
                              <ArrowRight className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                            </a>
                          </div>
                        )}
                        {contacts.map(c => {
                          const name = getDisplayName(c);
                          const badge = c.source === 'lead'
                            ? { label: 'Lead', cls: 'bg-amber-100 text-amber-700' }
                            : c.is_prospect
                            ? { label: 'Prospect', cls: 'bg-blue-100 text-blue-700' }
                            : { label: 'Customer', cls: 'bg-green-100 text-green-700' };
                          return (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedContact(c);
                                setContactSearch(name);
                                setShowContactDropdown(false);
                                setContactError(false);
                                setError('');
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-700 text-sm font-semibold">
                                  {name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                                {c.company_name && <p className="text-xs text-gray-500 truncate">{c.company_name}</p>}
                              </div>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Brief Title <span className="text-gray-400 font-normal text-xs">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Home Theater & Whole-Home Audio"
                  disabled={!!isLockedStatus}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Project Notes
                  </label>
                  <span className={`text-xs font-medium ${charCount > 50 ? 'text-green-600' : 'text-gray-400'}`}>
                    {charCount} chars
                  </span>
                </div>

                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={notes + (interimTranscript ? ' ' + interimTranscript : '')}
                    onChange={e => setNotes(e.target.value)}
                    disabled={!!isLockedStatus}
                    placeholder={`Describe the project — be as detailed as you like.\n\nTip: mention rooms, systems, products, customer preferences, and any special requests. You can also say things like "Make it similar to the Johnson proposal but swap the projector for a 75-inch TV."`}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none leading-relaxed disabled:bg-gray-50 disabled:text-gray-400 transition-colors ${
                      isRecording ? 'border-red-300 bg-red-50/50' : 'border-gray-200'
                    }`}
                    style={{ minHeight: 160 }}
                  />
                  {isRecording && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-red-500 text-white rounded-full px-2.5 py-1">
                      <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                      <span className="text-xs font-medium">Listening</span>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-400 mt-1.5">
                  More detail = better proposal. You can reference previous projects by customer name.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              {draftSaved && (
                <div className="flex items-center gap-2.5 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Draft saved — you can close and come back later
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-6 max-w-xs">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-40" />
                <div className="relative w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
                  <Sparkles className="w-9 h-9 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {isRegenerating ? 'Regenerating Brief' : 'Building Your Brief'}
                </h3>
                <p className="text-sm text-gray-500 animate-pulse">{processingMessage}</p>
              </div>
              <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
                <Loader className="w-3.5 h-3.5 animate-spin" />
                Usually takes 10–20 seconds
              </p>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && prefillResult && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-green-800">Brief processed successfully</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {createdProposalId
                      ? 'Draft proposal created and design team notified.'
                      : 'Brief saved. A proposal will be built once a customer is linked.'}
                  </p>
                </div>
                <button
                  onClick={handleBackToEdit}
                  className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 border border-green-300 bg-white hover:bg-green-50 px-2.5 py-1.5 rounded-lg transition-colors flex-shrink-0 whitespace-nowrap"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>

              {prefillResult.title && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Project Title</p>
                  <p className="text-base font-semibold text-gray-900">{prefillResult.title}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                {prefillResult.taxEnvironment && (
                  <div className="flex items-center gap-1.5">
                    <Home className="w-4 h-4 text-gray-400" />
                    <span className="capitalize">{prefillResult.taxEnvironment}</span>
                  </div>
                )}
                {prefillResult.taxProjectType && (
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span>{prefillResult.taxProjectType.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>

              {prefillResult.rooms && prefillResult.rooms.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                    Rooms & Items ({prefillResult.rooms.length} area{prefillResult.rooms.length !== 1 ? 's' : ''})
                  </p>
                  <div className="space-y-2">
                    {prefillResult.rooms.map((room, ri) => (
                      <div key={ri} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <Layers className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-800 flex-1">{room.name}</span>
                          <span className="text-xs text-gray-400">
                            {room.lineItems.length} item{room.lineItems.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {room.lineItems.map((item, li) => (
                            <div key={li} className="flex items-center gap-3 px-4 py-2.5">
                              {item.itemType === 'labor' ? (
                                <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                              ) : (
                                <Package className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                              )}
                              <span className="text-sm text-gray-700 flex-1">{item.description}</span>
                              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                                {item.quantity} {item.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {prefillResult.notes && (
                <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-medium text-amber-800 mb-1">Designer Notes</p>
                  <p className="text-sm text-amber-700">{prefillResult.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-xs">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Brief Submitted!</h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  The design team has been notified and will review the draft proposal shortly.
                  You'll receive a notification when it's ready to send to the customer.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 flex-shrink-0 bg-white safe-area-bottom">

          {step === 'input' && !isLockedStatus && (
            <div className="flex flex-col gap-2.5">
              {/* Primary CTA */}
              <button
                onClick={handleProcess}
                disabled={!isReady || openAIConfigured === false}
                title={openAIConfigured === false ? 'OpenAI API key not configured — go to Admin > Integrations' : undefined}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {alreadyProcessed ? (
                  <RefreshCw className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {alreadyProcessed ? 'Regenerate with AI' : 'Build with AI'}
                {!alreadyProcessed && <ArrowRight className="w-4 h-4" />}
              </button>

              {/* Secondary row: voice + save draft + cancel */}
              <div className="flex items-center gap-2">
                {voiceSupported && (
                  <button
                    onClick={toggleRecording}
                    className={`flex items-center justify-center gap-2 flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                      isRecording
                        ? 'bg-red-50 text-red-600 border-red-200 animate-pulse'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <MicOff className="w-4 h-4" />
                        Stop
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Voice
                      </>
                    )}
                  </button>
                )}

                <button
                  onClick={handleSaveDraft}
                  disabled={savingDraft || !notes.trim()}
                  className="flex items-center justify-center gap-2 flex-1 py-3 rounded-xl text-sm font-medium border border-gray-200 bg-gray-50 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 transition-colors"
                >
                  {savingDraft ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : draftSaved ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : null}
                  {draftSaved ? 'Saved!' : isEditing && briefId ? 'Save' : 'Save Draft'}
                </button>

                <button
                  onClick={onClose}
                  className="flex items-center justify-center py-3 px-4 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'input' && isLockedStatus && (
            <button
              onClick={onClose}
              className="w-full py-3 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              Close
            </button>
          )}

          {step === 'preview' && (
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleDone}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white text-sm font-semibold rounded-xl transition-colors"
              >
                <Send className="w-4 h-4" />
                Submit to Design Team
              </button>
              <div className="flex items-center gap-2">
                {createdProposalId && (
                  <button
                    onClick={() => {
                      if (onProposalCreated && createdProposalId) {
                        onProposalCreated(createdProposalId);
                      }
                      onClose();
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Open Draft Proposal
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="flex items-center justify-center py-3 px-4 rounded-xl text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {(step === 'processing' || step === 'done') && (
            <button
              onClick={onClose}
              disabled={step === 'processing'}
              className="w-full py-3 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {step === 'done' ? 'Close' : 'Please wait...'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
