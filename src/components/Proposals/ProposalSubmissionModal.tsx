import { useState, useEffect } from 'react';
import { Globe, Mail, Calendar, X, FileText, CheckCircle2, Video, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ProposalSubmissionModalProps {
  proposalId: string;
  proposalNumber: string;
  currentTemplateId?: string | null;
  onConfirm: (sendToPortal: boolean, expiresAt: string, templateId: string | null, setAsDefault: boolean, includeVideos: boolean) => void;
  onCancel: () => void;
}

interface RecordingSummary {
  id: string;
  title: string;
  recording_scope: 'full_proposal' | 'area';
  room_id: string | null;
  is_portal_visible: boolean;
  duration_seconds: number | null;
}

interface ReportTemplate {
  id: string;
  name: string;
  description: string | null;
  is_personal: boolean;
  is_default: boolean;
  created_by: string;
  // Template visibility flags
  show_quantity: boolean;
  show_unit_price: boolean;
  show_line_item_total: boolean;
  show_manufacturer: boolean;
  show_sku: boolean;
  show_model_number: boolean;
  show_labor_hours: boolean;
  show_labor_rate: boolean;
  show_labor_total: boolean;
  show_area_descriptions: boolean;
  show_area_subtotals: boolean;
  show_tax_breakdown: boolean;
  show_accepted_payment_methods: boolean;
  show_payment_instructions: boolean;
}

export function ProposalSubmissionModal({ proposalId, proposalNumber, currentTemplateId, onConfirm, onCancel }: ProposalSubmissionModalProps) {
  const { profile } = useAuth();
  const [sendToPortal, setSendToPortal] = useState(true);
  const [expirationDays, setExpirationDays] = useState(30);
  const [customDate, setCustomDate] = useState('');
  const [useCustomDate, setUseCustomDate] = useState(false);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recordings, setRecordings] = useState<RecordingSummary[]>([]);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [showVideoDetails, setShowVideoDetails] = useState(false);

  const presetOptions = [
    { days: 7, label: '7 Days' },
    { days: 14, label: '14 Days' },
    { days: 30, label: '30 Days' },
    { days: 60, label: '60 Days' },
    { days: 90, label: '90 Days' },
  ];

  useEffect(() => {
    loadTemplates();
    loadRecordings();
  }, [profile]);

  async function loadRecordings() {
    if (!proposalId) return;
    const { data } = await supabase
      .from('proposal_recordings')
      .select('id, title, recording_scope, room_id, is_portal_visible, duration_seconds')
      .eq('proposal_id', proposalId)
      .order('recording_scope', { ascending: false })
      .order('sort_order');
    setRecordings(data || []);
  }

  async function loadTemplates() {
    if (!profile) return;

    try {
      setLoading(true);

      // Load available templates (company-wide + user's personal)
      const { data: templatesData, error: templatesError } = await supabase
        .from('proposal_report_templates')
        .select('*')
        .or(`is_personal.eq.false,created_by.eq.${profile.id}`)
        .order('is_default', { ascending: false })
        .order('name');

      if (templatesError) throw templatesError;

      setTemplates(templatesData || []);

      // Priority: proposal's saved template > user's default > company default > first
      if (currentTemplateId && templatesData?.some(t => t.id === currentTemplateId)) {
        setSelectedTemplateId(currentTemplateId);
      } else if (profile.default_proposal_report_template_id) {
        setSelectedTemplateId(profile.default_proposal_report_template_id);
      } else if (templatesData && templatesData.length > 0) {
        const defaultTemplate = templatesData.find(t => t.is_default && !t.is_personal);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        } else {
          setSelectedTemplateId(templatesData[0].id);
        }
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  function calculateExpirationDate() {
    if (useCustomDate && customDate) {
      return customDate;
    }
    const date = new Date();
    date.setDate(date.getDate() + expirationDays);
    return date.toISOString();
  }

  function handleSubmit() {
    const expiresAt = calculateExpirationDate();
    onConfirm(sendToPortal, expiresAt, selectedTemplateId, setAsDefault, includeVideos);
  }

  function getFormattedExpirationDate() {
    try {
      const date = new Date(calculateExpirationDate());
      return date.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Invalid date';
    }
  }

  function getTemplatePreviewText(template: ReportTemplate): string {
    const visible: string[] = [];
    const hidden: string[] = [];

    if (template.show_quantity) visible.push('Quantities');
    else hidden.push('Quantities');

    if (template.show_unit_price) visible.push('Unit Prices');
    else hidden.push('Unit Prices');

    if (template.show_line_item_total) visible.push('Line Totals');
    else hidden.push('Line Totals');

    if (template.show_labor_hours || template.show_labor_rate || template.show_labor_total) {
      visible.push('Labor Details');
    } else {
      hidden.push('Labor Details');
    }

    const result = [];
    if (visible.length > 0) {
      result.push(`Shows: ${visible.join(', ')}`);
    }
    if (hidden.length > 0) {
      result.push(`Hides: ${hidden.join(', ')}`);
    }

    return result.join(' • ') || 'Standard layout';
  }

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);
  const hasRecordings = recordings.length > 0;
  const fullProposalRecordings = recordings.filter(r => r.recording_scope === 'full_proposal');
  const areaRecordings = recordings.filter(r => r.recording_scope === 'area');

  function formatDuration(seconds: number | null): string {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
          <h2 className="text-xl font-bold text-gray-900">Submit Proposal {proposalNumber}</h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Template Selection */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <FileText size={20} />
              Choose Proposal Layout
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select how customers will view this proposal in their portal and PDF
            </p>

            {loading ? (
              <div className="text-center py-4 text-gray-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800">
                  No templates available. A default layout will be used.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                      selectedTemplateId === template.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg flex-shrink-0 ${
                        selectedTemplateId === template.id ? 'bg-blue-500' : 'bg-gray-200'
                      }`}>
                        <FileText size={20} className={
                          selectedTemplateId === template.id ? 'text-white' : 'text-gray-500'
                        } />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="font-semibold text-gray-900">{template.name}</div>
                          {template.is_personal && (
                            <span className="px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                              Personal
                            </span>
                          )}
                          {template.is_default && !template.is_personal && (
                            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                              Company Default
                            </span>
                          )}
                          {profile?.default_proposal_report_template_id === template.id && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                              <CheckCircle2 size={12} />
                              My Default
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <div className="text-sm text-gray-600 mb-2">{template.description}</div>
                        )}
                        <div className="text-xs text-gray-500">
                          {getTemplatePreviewText(template)}
                        </div>
                      </div>
                      {selectedTemplateId === template.id && (
                        <div className="flex-shrink-0">
                          <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-white rounded-full"></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Set as Default Checkbox */}
            {selectedTemplateId && profile?.default_proposal_report_template_id !== selectedTemplateId && (
              <label className="flex items-center gap-2 mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors">
                <input
                  type="checkbox"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm text-blue-900 font-medium">
                  Set as my default template for future proposals
                </span>
              </label>
            )}
          </div>

          {/* Portal Visibility Options */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3">How would you like to submit this proposal?</h3>
            <div className="space-y-3">
              <button
                onClick={() => setSendToPortal(true)}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  sendToPortal
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${sendToPortal ? 'bg-blue-500' : 'bg-gray-200'}`}>
                    <Globe size={20} className={sendToPortal ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-gray-900 mb-1">Send to Customer Portal</div>
                    <div className="text-sm text-gray-600">
                      Customer can view, approve, and ask questions through their online portal
                    </div>
                  </div>
                  {sendToPortal && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  )}
                </div>
              </button>

              <button
                onClick={() => setSendToPortal(false)}
                className={`w-full p-4 rounded-lg border-2 transition-all ${
                  !sendToPortal
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${!sendToPortal ? 'bg-blue-500' : 'bg-gray-200'}`}>
                    <Mail size={20} className={!sendToPortal ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-gray-900 mb-1">Submit Offline</div>
                    <div className="text-sm text-gray-600">
                      Proposal delivered via email, in-person, or other method (not visible in portal)
                    </div>
                  </div>
                  {!sendToPortal && (
                    <div className="flex-shrink-0">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full"></div>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Expiration Date Picker */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar size={20} />
              Set Approval Window
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              How long should this proposal remain valid for customer approval?
            </p>

            {/* Preset Options */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {presetOptions.map((option) => (
                <button
                  key={option.days}
                  onClick={() => {
                    setExpirationDays(option.days);
                    setUseCustomDate(false);
                  }}
                  className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                    expirationDays === option.days && !useCustomDate
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
              <button
                onClick={() => setUseCustomDate(true)}
                className={`px-4 py-2 rounded-lg border-2 font-medium transition-all ${
                  useCustomDate
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300'
                }`}
              >
                Custom
              </button>
            </div>

            {/* Custom Date Picker */}
            {useCustomDate && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Expiration Date
                </label>
                <input
                  type="date"
                  value={customDate ? customDate.split('T')[0] : ''}
                  onChange={(e) => setCustomDate(e.target.value ? new Date(e.target.value).toISOString() : '')}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            )}

            {/* Expiration Preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-600">Proposal will expire on:</div>
                <div className="text-sm font-semibold text-gray-900">{getFormattedExpirationDate()}</div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Customer will have {useCustomDate ? 'until this date' : `${expirationDays} days`} to review and approve
              </div>
            </div>
          </div>

          {/* Presentation Videos Section — only shown when recordings exist */}
          {hasRecordings && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Video size={20} />
                Presentation Videos
              </h3>

              <div
                className={`w-full p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  includeVideos
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => setIncludeVideos(!includeVideos)}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${includeVideos ? 'bg-blue-500' : 'bg-gray-200'}`}>
                    <Video size={20} className={includeVideos ? 'text-white' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-gray-900 mb-1">
                      Include presentation video{recordings.length > 1 ? 's' : ''} on portal
                    </div>
                    <div className="text-sm text-gray-600">
                      {fullProposalRecordings.length > 0 && areaRecordings.length > 0
                        ? `${fullProposalRecordings.length} full walkthrough + ${areaRecordings.length} area video${areaRecordings.length > 1 ? 's' : ''} will be visible to the customer`
                        : fullProposalRecordings.length > 0
                        ? `${fullProposalRecordings.length} full proposal walkthrough video${fullProposalRecordings.length > 1 ? 's' : ''} will be visible to the customer`
                        : `${areaRecordings.length} area video${areaRecordings.length > 1 ? 's' : ''} will be visible to the customer`
                      }
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border-2 ${
                      includeVideos ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {includeVideos && <div className="w-2 h-2 bg-white rounded-full" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Video details expandable */}
              {includeVideos && (
                <div className="mt-2">
                  <button
                    onClick={() => setShowVideoDetails(!showVideoDetails)}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {showVideoDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    {showVideoDetails ? 'Hide' : 'Show'} video list
                  </button>

                  {showVideoDetails && (
                    <div className="mt-2 space-y-1.5 bg-gray-50 border border-gray-200 rounded-lg p-3">
                      {recordings.map(r => (
                        <div key={r.id} className="flex items-center gap-2 text-sm">
                          <Video size={14} className={r.recording_scope === 'full_proposal' ? 'text-blue-500' : 'text-teal-500'} />
                          <span className="text-gray-800 flex-1 truncate">{r.title}</span>
                          {r.duration_seconds && (
                            <span className="text-gray-400 text-xs flex-shrink-0">{formatDuration(r.duration_seconds)}</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${
                            r.recording_scope === 'full_proposal'
                              ? 'bg-blue-100 text-blue-600'
                              : 'bg-teal-100 text-teal-600'
                          }`}>
                            {r.recording_scope === 'full_proposal' ? 'Full' : 'Area'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!includeVideos && (
                <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <EyeOff size={12} />
                  Videos will be hidden from the customer portal. You can enable them later in proposal settings.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-xl flex justify-end gap-3 sticky bottom-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedTemplateId && templates.length > 0}
            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-lg hover:from-blue-700 hover:to-cyan-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedTemplate ? `Submit with ${selectedTemplate.name}` : 'Submit Proposal'}
          </button>
        </div>
      </div>
    </div>
  );
}
