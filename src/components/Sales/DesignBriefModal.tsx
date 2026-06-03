import { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Mic, MicOff, Send, Loader, CheckCircle, FileText, ChevronRight,
  AlertCircle, Home, Layers, Package, Clock, ArrowRight, Sparkles, Search,
  User, Save, RefreshCw, ArrowLeft
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
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const name = data.full_name || data.contact_name || [data.first_name, data.last_name].filter(Boolean).join(' ') || '';
      setSelectedContact(data);
      setContactSearch(name);
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
    if (!notes.trim()) {
      setError('Please enter some notes before saving.');
      return;
    }

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
      setError('A customer is required. Select an existing contact from the dropdown, or add a new contact first.');
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
  const isReady = notes.trim().length > 20;
  const alreadyProcessed = !!(prefillResult || hasExistingAI);

  const isLockedStatus = existingBrief && !['draft', 'submitted', 'building', 'ready'].includes(existingBrief.status);

  const getSubtitle = () => {
    if (!isEditing) return 'Save as draft or submit directly to the design team';
    if (existingBrief.status === 'draft') return 'Draft — save your progress or submit to the design team';
    if (existingBrief.status === 'archived') return 'Archived brief — view only';
    if (alreadyProcessed) return 'Edit notes and regenerate with AI anytime';
    return 'Submitted — edit your notes and regenerate if needed';
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {isEditing ? 'Design Brief' : 'New Design Brief'}
              </h2>
              <p className="text-xs text-gray-500">{getSubtitle()}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step: Input */}
        {step === 'input' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">

              {isLockedStatus && (
                <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  This brief is {existingBrief.status} and can no longer be edited.
                </div>
              )}

              {openAIConfigured === false && (
                <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">OpenAI API key not configured</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      AI generation requires an OpenAI key. Go to{' '}
                      <strong>Admin &gt; Settings &gt; Integrations &gt; OpenAI</strong> to add your key.
                      You can still save a draft without it.
                    </p>
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Brief Title <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Home Theater & Whole-Home Audio"
                  disabled={!!isLockedStatus}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:bg-gray-50 disabled:text-gray-400"
                />
              </div>

              {/* Customer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Customer <span className="text-gray-400 font-normal">(required)</span>
                </label>
                {selectedContact && (contactId || leadId || existingBrief?.contact_id || existingBrief?.lead_id) ? (
                  <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-semibold">
                        {getDisplayName(selectedContact).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{getDisplayName(selectedContact)}</p>
                      {selectedContact.company_name && (
                        <p className="text-xs text-gray-500">{selectedContact.company_name}</p>
                      )}
                    </div>
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
                        className={`w-full pl-9 pr-10 py-2.5 border rounded-xl text-sm focus:ring-2 focus:border-transparent outline-none disabled:bg-gray-50 ${
                          contactError
                            ? 'border-red-400 bg-red-50 focus:ring-red-400'
                            : 'border-gray-200 focus:ring-blue-500'
                        }`}
                        autoComplete="off"
                      />
                      {contactsLoading && (
                        <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                      )}
                      {selectedContact && (
                        <button
                          onClick={() => { setSelectedContact(null); setContactSearch(''); }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {selectedContact && (
                      <div className="mt-1.5 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
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
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-52 overflow-y-auto">
                        {contacts.length === 0 && !contactsLoading && contactSearch.length > 0 && (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-2 px-1 py-1 text-sm text-gray-400">
                              <User className="w-4 h-4 flex-shrink-0" />
                              No contacts found for "{contactSearch}"
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
                              className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-0"
                            >
                              <div className="w-7 h-7 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-blue-700 text-xs font-semibold">
                                  {name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                                {c.company_name && <p className="text-xs text-gray-500 truncate">{c.company_name}</p>}
                              </div>
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>
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

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-700">
                    Project Notes
                  </label>
                  {voiceSupported && !isLockedStatus && (
                    <button
                      onClick={toggleRecording}
                      className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
                        isRecording
                          ? 'bg-red-100 text-red-600 border border-red-200 animate-pulse'
                          : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 border border-gray-200'
                      }`}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="w-3.5 h-3.5" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          Voice Input
                        </>
                      )}
                    </button>
                  )}
                </div>

                <div className="relative">
                  <textarea
                    ref={notesRef}
                    value={notes + (interimTranscript ? ' ' + interimTranscript : '')}
                    onChange={e => setNotes(e.target.value)}
                    disabled={!!isLockedStatus}
                    placeholder="Describe the customer's project in detail. Include rooms, systems, products, and any customer preferences or special requests.

Example: 'Client is John Smith at 123 Main St. He wants a home theater in his basement family room — 4K projector, 140 inch screen, 7.2 surround sound with in-ceiling speakers. Also wants whole-home audio in the kitchen and master bedroom. They have a new construction home going in next spring.'"
                    rows={8}
                    className={`w-full px-4 py-3 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none leading-relaxed disabled:bg-gray-50 disabled:text-gray-400 ${
                      isRecording ? 'border-red-300 bg-red-50' : 'border-gray-200'
                    }`}
                  />
                  {isRecording && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-red-500">
                      <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-xs font-medium">Listening...</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-1.5">
                  <p className="text-xs text-gray-400">
                    The more detail you provide, the better the proposal will be
                  </p>
                  <span className={`text-xs ${charCount > 50 ? 'text-green-600' : 'text-gray-400'}`}>
                    {charCount} characters
                  </span>
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              {draftSaved && (
                <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Draft saved — you can close and come back later
                </div>
              )}

              {!isLockedStatus && !alreadyProcessed && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <p className="text-xs font-medium text-blue-800 mb-1.5">Two ways to proceed</p>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Save className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-700">
                        <strong>Save Draft</strong> — keep working on this over multiple sessions. Designers can see it but won't start until you submit.
                      </p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-blue-700">
                        <strong>Generate with AI</strong> — AI builds the proposal structure and notifies the design team to refine and finalize.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {!isLockedStatus && alreadyProcessed && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                  <p className="text-xs font-medium text-amber-800 mb-1.5 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5" />
                    AI has already processed this brief
                  </p>
                  <p className="text-xs text-amber-700">
                    You can update your notes and click <strong>Regenerate with AI</strong> — the AI will reprocess and create a fresh proposal structure. Any previous AI output will be replaced.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-6 max-w-sm">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-40" />
                <div className="relative w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
                  <Sparkles className="w-9 h-9 text-white" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {isRegenerating ? 'Regenerating Your Brief' : 'Building Your Brief'}
                </h3>
                <p className="text-sm text-gray-500 animate-pulse">{processingMessage}</p>
              </div>
              <div className="flex items-center gap-2 justify-center text-xs text-gray-400">
                <Loader className="w-3.5 h-3.5 animate-spin" />
                This usually takes 10–20 seconds
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && prefillResult && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800">Brief processed successfully</p>
                  <p className="text-xs text-green-600 mt-0.5">
                    {createdProposalId
                      ? 'A draft proposal has been created and the design team has been notified.'
                      : 'The brief has been saved. A proposal will be built once a customer is linked.'}
                  </p>
                </div>
                <button
                  onClick={handleBackToEdit}
                  className="flex items-center gap-1.5 text-xs text-green-700 hover:text-green-900 border border-green-300 hover:border-green-400 bg-white hover:bg-green-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
                  title="Edit notes and regenerate"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Edit & Regenerate
                </button>
              </div>

              {prefillResult.title && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Project Title</p>
                  <p className="text-base font-semibold text-gray-900">{prefillResult.title}</p>
                </div>
              )}

              <div className="flex items-center gap-4 text-sm text-gray-600">
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
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                    Rooms & Items ({prefillResult.rooms.length} area{prefillResult.rooms.length !== 1 ? 's' : ''})
                  </p>
                  <div className="space-y-3">
                    {prefillResult.rooms.map((room, ri) => (
                      <div key={ri} className="border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                          <Layers className="w-4 h-4 text-gray-500" />
                          <span className="text-sm font-medium text-gray-800">{room.name}</span>
                          <span className="ml-auto text-xs text-gray-400">
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
            <div className="text-center space-y-4 max-w-sm">
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
        <div className="border-t border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            {step === 'done' ? 'Close' : draftSaved ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center gap-3">
            {step === 'input' && !isLockedStatus && (
              <>
                {!alreadyProcessed && (
                  <button
                    onClick={handleSaveDraft}
                    disabled={savingDraft || !notes.trim()}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    {savingDraft ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : draftSaved ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {draftSaved ? 'Saved!' : isEditing && briefId ? 'Save Changes' : 'Save Draft'}
                  </button>
                )}

                <button
                  onClick={handleProcess}
                  disabled={!isReady || openAIConfigured === false}
                  title={openAIConfigured === false ? 'OpenAI API key not configured — go to Admin > Integrations' : undefined}
                  className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
                >
                  {alreadyProcessed ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {alreadyProcessed ? 'Regenerate with AI' : 'Generate with AI'}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </>
            )}

            {step === 'preview' && (
              <>
                {createdProposalId && (
                  <button
                    onClick={() => {
                      if (onProposalCreated && createdProposalId) {
                        onProposalCreated(createdProposalId);
                      }
                      onClose();
                    }}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                    Open Draft Proposal
                  </button>
                )}
                <button
                  onClick={handleDone}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Submit to Design Team
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
