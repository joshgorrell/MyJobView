import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Send, Loader, RotateCcw, Zap, CheckCircle, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import DesignBriefModal from '../Sales/DesignBriefModal';
import { QuickActionModal } from '../Shared/QuickActionModal';

export interface ProposalLineItemPrefill {
  description: string;
  quantity: number;
  unit: string;
  itemType: 'material' | 'labor';
  laborHours?: number | null;
}

export interface ProposalRoomPrefill {
  name: string;
  lineItems: ProposalLineItemPrefill[];
}

export interface ProposalPrefill {
  title?: string;
  contactSearchName?: string;
  contactId?: string;
  leadId?: string;
  taxEnvironment?: 'residential' | 'commercial';
  taxProjectType?: string;
  rooms?: ProposalRoomPrefill[];
  notes?: string;
}

export interface ContactPrefill {
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  phone?: string;
  contactType?: 'person' | 'business';
  notes?: string;
}

export interface LeadPrefill {
  contactName?: string;
  company?: string;
  email?: string;
  phone?: string;
  description?: string;
  priority?: string;
}

export interface TaskPrefill {
  contactId?: string;
  leadId?: string;
  contactName?: string;
  title?: string;
  description?: string;
  priority?: string;
  dueDate?: string;
}

export interface ServiceRequestPrefill {
  contactId?: string;
  leadId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  jobAddress?: string;
  jobCity?: string;
  jobState?: string;
  jobZip?: string;
  jobDescription?: string;
  billableType?: 'billable' | 'warranty';
  priority?: 'normal' | 'urgent';
  estimatedDuration?: string;
  requestedDate?: string;
  requestedTime?: string;
  notes?: string;
}

export interface SecurityContractPrefill {
  contactId?: string;
  contactName?: string;
  templateId?: string;
  templateName?: string;
  serviceIds?: string[];
  termMonths?: number;
  notes?: string;
  emailOverride?: string;
}

export interface ActionPayload {
  type:
    | 'CREATE_PROPOSAL'
    | 'CREATE_CONTACT'
    | 'CREATE_LEAD'
    | 'CREATE_TASK'
    | 'CREATE_SERVICE_REQUEST'
    | 'CREATE_SECURITY_CONTRACT'
    | 'CREATE_MESSAGE'
    | 'NAVIGATE_TO'
    | 'OPEN_PROPOSAL';
  prefill?: ProposalPrefill | ContactPrefill | LeadPrefill | TaskPrefill | ServiceRequestPrefill | SecurityContractPrefill;
  tab?: string;
  proposalId?: string;
  data?: Record<string, string>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: ActionPayload;
  actionFired?: boolean;
  timestamp: Date;
}

interface AIAssistantProps {
  activeTab?: string;
  proposalId?: string;
  proposalNumber?: string;
  proposalTitle?: string;
  contactName?: string;
  contactId?: string;
  salesRepContext?: {
    repName: string;
    thisMonthTotal: number;
    ytdTotal: number;
    prevYearFull: number;
    ytdVsPriorPct: number | null;
    ytdVsPriorDir: string;
    rolling3Pct: number | null;
    rolling3Dir: string;
    rolling12Pct: number | null;
    rolling12Dir: string;
    careerAvg: number;
    annualQuota: number;
    quotaProgress: number | null;
    allTimeTotal: number;
  } | null;
  onAction?: (action: ActionPayload) => void;
  /** When provided, the floating trigger button is hidden and this callback is set to open the panel */
  onRegisterOpen?: (openFn: () => void) => void;
}

const QUICK_PROMPTS = [
  { label: 'New proposal', prompt: 'I need to create a new proposal' },
  { label: 'New contact', prompt: 'Help me add a new contact' },
  { label: 'New task', prompt: 'Create a task for me' },
  { label: 'New lead', prompt: 'I want to log a new lead' },
  { label: 'New service request', prompt: 'I need to create a service request' },
  { label: 'Security onboarding', prompt: 'I need to create a security onboarding contract for a customer' },
];

export function AIAssistant({
  activeTab,
  proposalId,
  proposalNumber,
  proposalTitle,
  contactName,
  contactId,
  salesRepContext,
  onAction,
  onRegisterOpen,
}: AIAssistantProps) {
  const { profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [checkingEnabled, setCheckingEnabled] = useState(true);
  const [showDesignBrief, setShowDesignBrief] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    checkEnabled();
  }, []);

  useEffect(() => {
    if (onRegisterOpen) onRegisterOpen(() => setIsOpen(true));
  }, [onRegisterOpen]);

  useEffect(() => {
    if (isOpen) {
      setHasUnread(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isMinimized]);

  async function checkEnabled() {
    try {
      const { data } = await supabase
        .from('company_settings')
        .select('ai_assistant_enabled, openai_api_key')
        .maybeSingle();
      setEnabled(!!(data?.ai_assistant_enabled && data?.openai_api_key));
    } catch {
      setEnabled(false);
    } finally {
      setCheckingEnabled(false);
    }
  }

  const sendMessage = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    const history = [...messages, userMessage].map(m => ({
      role: m.role,
      content: m.content,
    }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: history,
            context: { activeTab, proposalId, proposalNumber, proposalTitle, contactName, contactId, salesRepContext },
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message || '',
        action: data.action ?? undefined,
        actionFired: false,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (!isOpen || isMinimized) setHasUnread(true);
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Sorry, something went wrong: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, activeTab, proposalId, proposalNumber, proposalTitle, contactName, contactId, salesRepContext, isOpen, isMinimized]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function fireAction(msgId: string, action: ActionPayload) {
    if (!onAction) return;

    if (action.type === 'NAVIGATE_TO') {
      onAction(action);
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionFired: true } : m));
      return;
    }

    onAction(action);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, actionFired: true } : m));
    setIsMinimized(true);
  }

  function clearConversation() {
    setMessages([]);
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (checkingEnabled || !enabled) return null;

  return (
    <>
      {!isOpen && !onRegisterOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 sm:bottom-6 right-6 z-[55] w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-xl flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
          title="AI Assistant"
        >
          <Sparkles className="w-6 h-6" />
          {hasUnread && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-white" />
          )}
        </button>
      )}

      {showDesignBrief && (
        <DesignBriefModal
          onClose={() => setShowDesignBrief(false)}
          contactId={contactId}
          leadId={undefined}
          contactName={contactName}
          onProposalCreated={(proposalId) => {
            setShowDesignBrief(false);
            if (onAction) {
              onAction({ type: 'OPEN_PROPOSAL', proposalId });
            }
          }}
        />
      )}

      {isOpen && isMinimized && (
        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-[55] flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl shadow-xl"
          aria-label="Expand AI Assistant"
        >
          <Sparkles className="w-4 h-4" /> AI Assistant
          {hasUnread && <span className="w-2 h-2 rounded-full bg-red-400" />}
        </button>
      )}

      {isOpen && !isMinimized && (
        <QuickActionModal
          title="AI Assistant"
          subtitle={activeTab ? activeTab.replace(/_/g, ' ') : 'Ask anything or create with AI'}
          icon={<Sparkles className="w-5 h-5 text-white" />}
          accentColor="from-blue-600 to-cyan-700"
          onClose={() => { setIsOpen(false); setIsMinimized(false); }}

        >
          <div className="flex flex-col min-h-0">
            {messages.length > 0 && (
              <div className="flex justify-end px-4 py-2 border-b border-subtle/50">
                <button onClick={clearConversation} className="flex items-center gap-1.5 text-xs text-muted hover:text-primary" title="Clear conversation">
                  <RotateCcw className="w-3.5 h-3.5" /> Clear conversation
                </button>
              </div>
            )}
              {/* Messages area */}
              <div className="overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[200px] max-h-[min(460px,55svh)]">
                {messages.length === 0 && (
                  <div className="space-y-4">
                    <div className="text-center pt-4">
                      <div className="w-12 h-12 bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                        <Sparkles className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="text-sm font-medium text-primary">
                        Hi{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}!
                      </p>
                      <p className="text-xs text-muted mt-1 leading-relaxed px-4">
                        Describe what you need in plain English and I'll pre-fill the form for you.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {QUICK_PROMPTS.map(qp => (
                        <button
                          key={qp.label}
                          onClick={() => sendMessage(qp.prompt)}
                          className="text-left px-3 py-2.5 text-xs bg-surface hover:bg-blue-900/30 hover:text-info hover:border-blue-700 border border-subtle rounded-xl transition-colors leading-snug font-medium text-primary"
                        >
                          <Zap className="w-3 h-3 mb-1 text-blue-500" />
                          {qp.label}
                        </button>
                      ))}
                    </div>

                    <button
                      onClick={() => { setIsOpen(false); setShowDesignBrief(true); }}
                      className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-900/30 to-sky-900/30 hover:from-blue-900/50 hover:to-sky-900/50 border border-blue-700 rounded-xl transition-colors group"
                    >
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-blue-700 transition-colors">
                        <FileText className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-semibold text-info">Start a Design Brief</p>
                        <p className="text-xs text-blue-500 leading-tight mt-0.5">Capture field notes — AI builds the proposal</p>
                      </div>
                      <Sparkles className="w-4 h-4 text-blue-400 ml-auto flex-shrink-0" />
                    </button>

                    <p className="text-center text-xs text-muted px-2 leading-relaxed">
                      Try: "Create a proposal for John Smith for a home theater in his Family Room with a JVC HZ300 and 6 hours of labor"
                    </p>
                  </div>
                )}

                {messages.map(msg => (
                  <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-surface text-primary rounded-bl-sm'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {msg.action && msg.action.type !== 'NAVIGATE_TO' && onAction && (
                      <div className="mt-2">
                        {msg.actionFired ? (
                          <span className="flex items-center gap-1.5 text-xs text-green-600 font-medium px-1">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Form opened — review &amp; save when ready
                          </span>
                        ) : (
                          <button
                            onClick={() => fireAction(msg.id, msg.action!)}
                            className="flex items-center gap-1.5 text-xs px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full transition-colors font-medium shadow-sm"
                          >
                            <Zap className="w-3 h-3" />
                            {getActionLabel(msg.action.type)}
                          </button>
                        )}
                      </div>
                    )}

                    <span className="text-xs text-muted mt-1 px-1">{formatTime(msg.timestamp)}</span>
                  </div>
                ))}

                {loading && (
                  <div className="flex items-start">
                    <div className="bg-surface px-3.5 py-2.5 rounded-2xl rounded-bl-sm">
                      <div className="flex items-center gap-2">
                        <Loader className="w-3.5 h-3.5 text-muted animate-spin" />
                        <span className="text-xs text-muted">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input area */}
              <div className="border-t border-subtle p-4 sm:px-6 flex-shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you need..."
                    rows={1}
                    className="flex-1 resize-none px-3 py-2.5 text-sm border border-subtle rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none max-h-28 min-h-[40px] leading-relaxed"
                    style={{ height: 'auto' }}
                    onInput={e => {
                      const el = e.currentTarget;
                      el.style.height = 'auto';
                      el.style.height = Math.min(el.scrollHeight, 112) + 'px';
                    }}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    className="w-9 h-9 flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
              </div>
          </div>
        </QuickActionModal>
      )}
    </>
  );
}

function getActionLabel(type: string): string {
  const labels: Record<string, string> = {
    CREATE_PROPOSAL: 'Open Pre-filled Proposal Form',
    CREATE_CONTACT: 'Open Pre-filled Contact Form',
    CREATE_LEAD: 'Open Pre-filled Lead Form',
    CREATE_TASK: 'Open Pre-filled Task Form',
    CREATE_SERVICE_REQUEST: 'Open Pre-filled Service Request',
    CREATE_SECURITY_CONTRACT: 'Open Security Onboarding Form',
    CREATE_MESSAGE: 'Open Message Form',
    OPEN_PROPOSAL: 'Open Proposal',
  };
  return labels[type] ?? 'Open Form';
}
