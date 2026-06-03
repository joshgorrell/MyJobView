import { useState, useEffect } from 'react';
import { X, AlertCircle, Clock, Users, Building2, Check, Calendar, ChevronDown, ChevronUp, Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Lead } from '../../lib/types';

interface Competitor {
  id: string;
  name: string;
  website?: string;
  notes?: string;
}

interface ConvertLeadToProspectModalProps {
  lead: Lead;
  onClose: () => void;
  onSuccess: (contactId: string) => void;
}

export function ConvertLeadToProspectModal({ lead, onClose, onSuccess }: ConvertLeadToProspectModalProps) {
  const [competitorId, setCompetitorId] = useState<string>('');
  const [relationshipType, setRelationshipType] = useState<'current_supplier' | 'past_supplier' | 'alternate_supplier' | 'evaluating'>('evaluating');
  const [relationshipStrength, setRelationshipStrength] = useState<'weak' | 'moderate' | 'strong' | 'entrenched'>('moderate');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [newCompetitorName, setNewCompetitorName] = useState('');
  const [showNewCompetitor, setShowNewCompetitor] = useState(false);
  const [electricianName, setElectricianName] = useState('');
  const [electricianNotes, setElectricianNotes] = useState('');
  const [duplicateContact, setDuplicateContact] = useState<any>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Follow-up scheduling state
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<string>('');
  const [followUpType, setFollowUpType] = useState<'call' | 'email' | 'meeting' | 'site_visit' | 'other'>('call');
  const [followUpNotes, setFollowUpNotes] = useState('');

  useEffect(() => {
    loadCompetitors();
    checkForDuplicates();
  }, []);

  async function loadCompetitors() {
    try {
      const { data } = await supabase
        .from('competitors')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (data) setCompetitors(data);
    } catch (error) {
      console.error('Error loading competitors:', error);
    }
  }

  async function checkForDuplicates() {
    if (!lead.email && !lead.phone) return;

    try {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .or(`email.ilike.${lead.email},phone.eq.${lead.phone}`)
        .limit(1)
        .maybeSingle();

      if (data) {
        setDuplicateContact(data);
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
    }
  }

  async function handleCreateCompetitor() {
    if (!newCompetitorName.trim()) {
      setError('Competitor name is required');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('competitors')
        .insert({
          name: newCompetitorName.trim()
        })
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setCompetitors([...competitors, data]);
        setCompetitorId(data.id);
        setShowNewCompetitor(false);
        setNewCompetitorName('');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to create competitor');
    }
  }

  function setQuickFollowUpDate(months: number) {
    const date = new Date();
    if (months === 12) {
      // "Next year" - set to January 1st of next year
      date.setFullYear(date.getFullYear() + 1, 0, 1);
    } else {
      date.setMonth(date.getMonth() + months);
    }
    setFollowUpDate(date.toISOString().split('T')[0]);
    setShowFollowUp(true);
  }

  async function handleConvert() {
    if (!confirmed) {
      setError('Please confirm that you understand this lead will be removed');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { data, error } = await supabase.rpc('convert_lead_to_prospect', {
        p_lead_id: lead.id,
        p_competitor_id: competitorId || null,
        p_relationship_type: competitorId ? relationshipType : null,
        p_relationship_strength: competitorId ? relationshipStrength : null,
        p_follow_up_date: followUpDate ? new Date(followUpDate).toISOString() : null,
        p_follow_up_type: followUpDate ? followUpType : null,
        p_follow_up_notes: followUpDate ? followUpNotes : null
      });

      if (error) throw error;

      if (data?.success) {
        // Save electrician info if provided
        if (electricianName.trim() && data.contact_id) {
          await supabase
            .from('contacts')
            .update({
              electrician_name: electricianName.trim(),
              electrician_notes: electricianNotes.trim() || null,
            })
            .eq('id', data.contact_id);
        }
        onSuccess(data.contact_id);
      } else {
        throw new Error(data?.message || 'Conversion failed');
      }
    } catch (error: any) {
      setError(error.message || 'Failed to downgrade lead');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
          <div className="flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold">Downgrade Lead to Prospect</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Explanation Callout */}
          <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Understanding Leads vs Prospects
            </h3>
            <div className="text-sm text-blue-800 space-y-2">
              <p><strong>Leads</strong> are HOT opportunities ready to buy NOW (from kiosk, ready to act immediately)</p>
              <p><strong>Prospects</strong> are FUTURE opportunities that need nurturing over time</p>
              <p className="pt-2 border-t border-blue-200">Use this when someone expresses interest but timing isn't right. This moves them into long-term follow-up mode and removes them from your active leads queue.</p>
            </div>
          </div>

          {/* Data Transfer Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Data to be Transferred
            </h3>
            <div className="text-sm text-gray-700 space-y-1">
              <div><span className="font-medium">Name:</span> {lead.contact_name || 'Not provided'}</div>
              <div><span className="font-medium">Company:</span> {lead.company_name || 'Not provided'}</div>
              <div><span className="font-medium">Email:</span> {lead.email || 'Not provided'}</div>
              <div><span className="font-medium">Phone:</span> {lead.phone || 'Not provided'}</div>
              {lead.opportunity_description && (
                <div><span className="font-medium">Notes:</span> {lead.opportunity_description.substring(0, 100)}{lead.opportunity_description.length > 100 ? '...' : ''}</div>
              )}
            </div>
          </div>

          {/* Duplicate Warning */}
          {duplicateContact && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium text-amber-900 mb-1">Duplicate Contact Detected</h3>
                  <p className="text-sm text-amber-800">
                    A contact with matching email or phone already exists: <span className="font-medium">{duplicateContact.full_name}</span>
                  </p>
                  <p className="text-sm text-amber-800 mt-1">
                    The lead data will be merged into this existing contact record.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Competitor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Current Competitor (Optional)
            </label>
            <div className="space-y-3">
              <select
                value={competitorId}
                onChange={(e) => setCompetitorId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">No competitor selected</option>
                {competitors.map((competitor) => (
                  <option key={competitor.id} value={competitor.id}>
                    {competitor.name}
                  </option>
                ))}
              </select>

              {!showNewCompetitor && (
                <button
                  type="button"
                  onClick={() => setShowNewCompetitor(true)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  + Add New Competitor
                </button>
              )}

              {showNewCompetitor && (
                <div className="bg-gray-50 p-3 rounded-lg space-y-2">
                  <input
                    type="text"
                    value={newCompetitorName}
                    onChange={(e) => setNewCompetitorName(e.target.value)}
                    placeholder="Competitor name"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleCreateCompetitor}
                      className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowNewCompetitor(false);
                        setNewCompetitorName('');
                      }}
                      className="px-3 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Competitor Relationship Details */}
          {competitorId && (
            <div className="space-y-4 border-l-4 border-blue-500 pl-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Relationship Type
                </label>
                <select
                  value={relationshipType}
                  onChange={(e) => setRelationshipType(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="current_supplier">Current Supplier</option>
                  <option value="past_supplier">Past Supplier</option>
                  <option value="alternate_supplier">Alternate Supplier</option>
                  <option value="evaluating">Evaluating</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Relationship Strength
                </label>
                <select
                  value={relationshipStrength}
                  onChange={(e) => setRelationshipStrength(e.target.value as any)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="weak">Weak</option>
                  <option value="moderate">Moderate</option>
                  <option value="strong">Strong</option>
                  <option value="entrenched">Entrenched</option>
                </select>
              </div>
            </div>
          )}

          {/* Electrician Information */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-4 h-4 text-sky-500" />
              <span className="text-sm font-medium text-gray-700">Electrician Used (Optional)</span>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={electricianName}
                onChange={(e) => setElectricianName(e.target.value)}
                placeholder="e.g. ABC Electric"
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent"
              />
              {electricianName.trim() && (
                <input
                  type="text"
                  value={electricianNotes}
                  onChange={(e) => setElectricianNotes(e.target.value)}
                  placeholder="Notes (e.g. mostly commercial, long-term relationship)"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-400 focus:border-transparent"
                />
              )}
            </div>
          </div>

          {/* Follow-Up Scheduling Section */}
          <div className="border-2 border-blue-200 rounded-lg">
            <button
              type="button"
              onClick={() => setShowFollowUp(!showFollowUp)}
              className="w-full p-4 flex items-center justify-between hover:bg-blue-50 transition-colors rounded-t-lg"
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-600" />
                <span className="font-medium text-gray-900">Schedule Follow-Up (Optional)</span>
              </div>
              {showFollowUp ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>

            {showFollowUp && (
              <div className="p-4 space-y-4 border-t border-blue-200">
                {/* Quick Select Buttons */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quick Select
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setQuickFollowUpDate(3)}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                    >
                      3 Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickFollowUpDate(6)}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                    >
                      6 Months
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickFollowUpDate(12)}
                      className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium text-sm"
                    >
                      Next Year
                    </button>
                  </div>
                </div>

                {/* Custom Date Picker */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Date
                  </label>
                  <input
                    type="date"
                    value={followUpDate}
                    onChange={(e) => setFollowUpDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* Connection Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Connection Type
                  </label>
                  <select
                    value={followUpType}
                    onChange={(e) => setFollowUpType(e.target.value as any)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="meeting">Meeting</option>
                    <option value="site_visit">Site Visit</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Follow-Up Notes
                  </label>
                  <textarea
                    value={followUpNotes}
                    onChange={(e) => setFollowUpNotes(e.target.value)}
                    placeholder="e.g., Call Denzel in Q1 2026 when budget opens"
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Confirmation Checkbox */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                {confirmed && (
                  <Check className="w-4 h-4 text-white absolute left-0.5 pointer-events-none" />
                )}
              </div>
              <span className="text-sm text-gray-700">
                I understand that this lead will be downgraded to a prospect for future follow-up and removed from the active leads queue. All data will be transferred, and this action cannot be undone.
              </span>
            </label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-800">{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={loading || !confirmed}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Downgrading...' : 'Downgrade to Prospect'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
