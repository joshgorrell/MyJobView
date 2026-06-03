import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  AlignLeft, Edit2, Save, X, Sparkles, RefreshCw, Copy,
  CheckCheck, AlertTriangle, Check, ShieldAlert
} from 'lucide-react';
import type { SalesOrderFull } from './SalesOrderDetail';

interface ProposalSettings {
  id: string;
  scope_of_work: string | null;
}

interface SalesOrderPrimaryScopeTabProps {
  order: SalesOrderFull;
}

export function SalesOrderPrimaryScopeTab({ order }: SalesOrderPrimaryScopeTabProps) {
  const [proposalSettings, setProposalSettings] = useState<ProposalSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [scopeText, setScopeText] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const [overrideConfirmText, setOverrideConfirmText] = useState('');
  const [pendingEditAction, setPendingEditAction] = useState<'manual' | 'ai' | null>(null);

  const [showAIModal, setShowAIModal] = useState(false);
  const [aiGenerating, setAIGenerating] = useState(false);
  const [aiGeneratedScope, setAIGeneratedScope] = useState('');
  const [aiError, setAIError] = useState('');
  const [aiCopied, setAICopied] = useState(false);
  const [aiApprovedCOCount, setAIApprovedCOCount] = useState(0);
  const [aiRooms, setAIRooms] = useState<{ name: string; itemCount: number }[]>([]);

  useEffect(() => {
    if (order.proposal_id) {
      loadSettings();
    } else {
      setLoading(false);
    }
  }, [order.proposal_id]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [editing]);

  async function loadSettings() {
    try {
      setLoading(true);
      const { data } = await supabase
        .from('proposal_settings')
        .select('id, scope_of_work')
        .eq('proposal_id', order.proposal_id)
        .maybeSingle();
      if (data) {
        setProposalSettings(data);
        setScopeText(data.scope_of_work || '');
      }
    } catch (err) {
      console.error('Error loading proposal settings:', err);
    } finally {
      setLoading(false);
    }
  }

  function requestEdit(action: 'manual' | 'ai') {
    if (proposalSettings?.scope_of_work) {
      setPendingEditAction(action);
      setOverrideConfirmText('');
      setShowOverrideConfirm(true);
    } else {
      if (action === 'manual') {
        setEditing(true);
      } else {
        openAIModal();
      }
    }
  }

  function confirmOverride() {
    setShowOverrideConfirm(false);
    setOverrideConfirmText('');
    if (pendingEditAction === 'manual') {
      setEditing(true);
    } else if (pendingEditAction === 'ai') {
      openAIModal();
    }
    setPendingEditAction(null);
  }

  function cancelOverride() {
    setShowOverrideConfirm(false);
    setOverrideConfirmText('');
    setPendingEditAction(null);
  }

  async function saveScope() {
    if (!proposalSettings?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_settings')
        .update({ scope_of_work: scopeText.trim() || null, scope_of_work_updated_at: new Date().toISOString() })
        .eq('id', proposalSettings.id);
      if (error) throw error;
      setProposalSettings(prev => prev ? { ...prev, scope_of_work: scopeText.trim() || null } : prev);
      setEditing(false);
    } catch (err) {
      console.error('Error saving primary scope:', err);
      alert('Failed to save scope');
    } finally {
      setSaving(false);
    }
  }

  async function applyAIScope() {
    if (!proposalSettings?.id) return;
    setSaving(true);
    try {
      const trimmed = aiGeneratedScope.trim();
      const { error } = await supabase
        .from('proposal_settings')
        .update({ scope_of_work: trimmed || null, scope_of_work_updated_at: new Date().toISOString() })
        .eq('id', proposalSettings.id);
      if (error) throw error;
      setProposalSettings(prev => prev ? { ...prev, scope_of_work: trimmed || null } : prev);
      setScopeText(trimmed);
      setShowAIModal(false);
      setAIGeneratedScope('');
    } catch (err) {
      console.error('Error applying AI scope:', err);
      alert('Failed to apply scope');
    } finally {
      setSaving(false);
    }
  }

  async function openAIModal() {
    setAIGeneratedScope('');
    setAIError('');
    setAICopied(false);

    const { data: roomsData } = await supabase
      .from('proposal_rooms')
      .select('id, name')
      .eq('proposal_id', order.proposal_id)
      .order('sort_order');

    const { data: itemsData } = await supabase
      .from('proposal_line_items')
      .select('room_id')
      .eq('proposal_id', order.proposal_id)
      .eq('is_hidden', false);

    const roomSummary = (roomsData || []).map(r => ({
      name: r.name,
      itemCount: (itemsData || []).filter(i => i.room_id === r.id).length,
    }));
    setAIRooms(roomSummary);

    const { data: cosData } = await supabase
      .from('change_orders')
      .select('id')
      .eq('sales_order_id', order.id)
      .eq('status', 'approved');
    setAIApprovedCOCount((cosData || []).length);

    setShowAIModal(true);
  }

  async function generateAIScope() {
    setAIGenerating(true);
    setAIError('');
    setAIGeneratedScope('');
    try {
      const [roomsRes, itemsRes, cosRes] = await Promise.all([
        supabase
          .from('proposal_rooms')
          .select('id, name, description')
          .eq('proposal_id', order.proposal_id)
          .order('sort_order'),
        supabase
          .from('proposal_line_items')
          .select('room_id, description, quantity, item_type, products(name)')
          .eq('proposal_id', order.proposal_id)
          .eq('is_hidden', false),
        supabase
          .from('change_orders')
          .select(`
            change_order_number, title, description, reason,
            change_amount, approval_date,
            change_order_line_items(
              action_type, product_name, product_description,
              new_quantity, new_unit_price, new_total, change_amount,
              install_location, item_type
            )
          `)
          .eq('sales_order_id', order.id)
          .eq('status', 'approved')
          .order('change_order_number'),
      ]);

      const rooms = roomsRes.data || [];
      const items = itemsRes.data || [];
      const cos = cosRes.data || [];

      const proposalData = {
        proposal_title: order.proposal?.title || order.order_number,
        contact_name: order.contact?.full_name || 'Customer',
        rooms: rooms.map(r => ({
          name: r.name,
          scope_of_work: r.description || null,
          items: items
            .filter(i => i.room_id === r.id)
            .map(i => ({
              product_name: (i.products as any)?.name || i.description,
              description: i.description,
              quantity: i.quantity,
              item_type: i.item_type || 'material',
            })),
        })),
        change_orders: cos.map((co: any) => ({
          change_order_number: co.change_order_number,
          title: co.title,
          description: co.description,
          reason: co.reason,
          change_amount: co.change_amount,
          approval_date: co.approval_date,
          items: (co.change_order_line_items || []).map((item: any) => ({
            action_type: item.action_type,
            product_name: item.product_name,
            product_description: item.product_description,
            new_quantity: item.new_quantity,
            new_unit_price: item.new_unit_price,
            new_total: item.new_total,
            change_amount: item.change_amount,
            install_location: item.install_location,
            item_type: item.item_type,
          })),
        })),
      };

      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-scope-of-work`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ proposalData }),
      });

      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || 'Failed to generate scope');
      setAIGeneratedScope(result.scope_of_work);
    } catch (err: any) {
      setAIError(err.message || 'Failed to generate scope of work');
    } finally {
      setAIGenerating(false);
    }
  }

  async function copyGeneratedScope() {
    await navigator.clipboard.writeText(aiGeneratedScope);
    setAICopied(true);
    setTimeout(() => setAICopied(false), 2000);
  }

  const hasExistingScope = !!proposalSettings?.scope_of_work;
  const overrideConfirmValid = overrideConfirmText.trim().toLowerCase() === 'override';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!order.proposal_id) {
    return (
      <div className="text-center py-12 text-gray-400">
        No proposal linked to this sales order.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium text-gray-400">Primary Scope of Work</h3>
          <p className="text-xs text-gray-500 mt-0.5">The overall project scope description sent with proposals</p>
        </div>
        {!editing && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => requestEdit('ai')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Scope
            </button>
            <button
              onClick={() => requestEdit('manual')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 border border-blue-700/40 rounded-lg transition-colors"
            >
              <Edit2 className="w-3.5 h-3.5" />
              {hasExistingScope ? 'Edit' : 'Add Scope'}
            </button>
          </div>
        )}
      </div>

      {hasExistingScope && !editing && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/30 border border-amber-700/40 rounded-lg">
          <ShieldAlert className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            This is the scope of work as sold on the original proposal. Any edits or AI regeneration will permanently replace it.
          </p>
        </div>
      )}

      <div className="bg-gray-800/60 border border-gray-700 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <AlignLeft className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-gray-200">Scope of Work</span>
          </div>
        </div>

        {editing ? (
          <div className="p-4 space-y-3">
            <textarea
              ref={textareaRef}
              value={scopeText}
              onChange={(e) => setScopeText(e.target.value)}
              placeholder="Describe the overall scope of work for this project..."
              rows={12}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
            />
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => { setEditing(false); setScopeText(proposalSettings?.scope_of_work || ''); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-700 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
              <button
                onClick={saveScope}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4 min-h-[120px]">
            {proposalSettings?.scope_of_work ? (
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{proposalSettings.scope_of_work}</p>
            ) : (
              <p className="text-sm text-gray-500 italic">No primary scope of work defined. Use "Add Scope" or "AI Scope" to create one.</p>
            )}
          </div>
        )}
      </div>

      {/* Override Confirmation Modal */}
      {showOverrideConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-red-700/60 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-5 border-b border-red-700/40">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-900/40 rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Override Sold Scope?</h3>
                  <p className="text-xs text-red-400 mt-0.5">This action cannot be undone</p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-4 space-y-2">
                <p className="text-sm font-semibold text-red-300">You are about to replace the original sold scope.</p>
                <ul className="space-y-1.5 text-sm text-red-400/90">
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    The current scope of work was what the customer agreed to and signed off on.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    Replacing it will permanently overwrite the original text — there is no undo.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    If changes are needed, consider creating a Change Order instead.
                  </li>
                </ul>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                  Type <span className="text-red-400 font-bold">OVERRIDE</span> to confirm
                </label>
                <input
                  type="text"
                  value={overrideConfirmText}
                  onChange={(e) => setOverrideConfirmText(e.target.value)}
                  placeholder="Type OVERRIDE"
                  className="w-full px-3 py-2.5 bg-gray-800 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter' && overrideConfirmValid) confirmOverride(); }}
                />
              </div>
            </div>

            <div className="p-5 border-t border-gray-700/50 flex items-center gap-3 justify-end">
              <button
                onClick={cancelOverride}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmOverride}
                disabled={!overrideConfirmValid}
                className="flex items-center gap-1.5 px-4 py-2 text-sm bg-red-700 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-semibold"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                Override Scope
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Scope Generator Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 rounded-xl">
                  <Sparkles className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">AI Scope of Work Generator</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Generates a professional scope document from all line items
                    {aiApprovedCOCount > 0 && ` + ${aiApprovedCOCount} approved change order${aiApprovedCOCount !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setShowAIModal(false)} className="p-2 hover:bg-gray-800 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5 space-y-4">
              {!aiGeneratedScope && !aiGenerating && !aiError && (
                <div className="space-y-4">
                  <div className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-200">What this generates:</p>
                    <ul className="space-y-1.5 text-sm text-gray-400">
                      <li className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                        Professional, customer-facing scope of work document
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                        Breakdown by area with deliverables and project approach
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                        Estimated timeline based on scope
                      </li>
                    </ul>
                  </div>

                  {aiRooms.length > 0 && (
                    <div className="bg-blue-950/40 border border-blue-800/40 rounded-xl p-4">
                      <p className="text-xs text-blue-300 font-medium mb-2 uppercase tracking-wide">Scope Summary</p>
                      <div className="space-y-1">
                        {aiRooms.map((r, i) => (
                          <div key={i} className="flex items-center justify-between text-sm">
                            <span className="text-gray-300">{r.name}</span>
                            <span className="text-gray-500 text-xs">{r.itemCount} items</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {aiApprovedCOCount > 0 && (
                    <div className="bg-amber-950/30 border border-amber-800/30 rounded-xl p-4">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-amber-300 font-medium">Approved Change Orders Will Be Included</p>
                          <p className="text-xs text-amber-400/80 mt-0.5">
                            The AI will automatically pull all {aiApprovedCOCount} approved change order{aiApprovedCOCount !== 1 ? 's' : ''} and generate a unified, revised scope that incorporates every modification.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {aiGenerating && (
                <div className="flex flex-col items-center justify-center py-16 gap-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full border-4 border-blue-900 border-t-blue-400 animate-spin" />
                    <Sparkles className="w-5 h-5 text-blue-400 absolute inset-0 m-auto" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-medium">Generating scope of work...</p>
                    <p className="text-gray-400 text-sm mt-1">Analyzing {aiRooms.length} area{aiRooms.length !== 1 ? 's' : ''}{aiApprovedCOCount > 0 ? ` and ${aiApprovedCOCount} change order${aiApprovedCOCount !== 1 ? 's' : ''}` : ''}</p>
                  </div>
                </div>
              )}

              {aiError && (
                <div className="bg-red-950/40 border border-red-700/50 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-red-300">Generation Failed</p>
                    <p className="text-xs text-red-400 mt-1">{aiError}</p>
                  </div>
                </div>
              )}

              {aiGeneratedScope && (
                <div className="space-y-3">
                  {aiApprovedCOCount > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-950/40 border border-green-800/40 rounded-lg">
                      <Check className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <p className="text-xs text-green-300">
                        Scope includes {aiApprovedCOCount} approved change order{aiApprovedCOCount !== 1 ? 's' : ''} — all modifications are integrated
                      </p>
                    </div>
                  )}
                  <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
                    <pre className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed font-sans">{aiGeneratedScope}</pre>
                  </div>
                </div>
              )}
            </div>

            <div className="p-5 border-t border-gray-700 flex items-center gap-3">
              {aiGeneratedScope && (
                <>
                  <button
                    onClick={copyGeneratedScope}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 rounded-lg transition-colors"
                  >
                    {aiCopied ? <CheckCheck className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {aiCopied ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={generateAIScope}
                    disabled={aiGenerating}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate
                  </button>
                </>
              )}
              <div className="flex-1" />
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
              {!aiGeneratedScope && !aiGenerating && (
                <button
                  onClick={generateAIScope}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Generate Scope
                </button>
              )}
              {aiGeneratedScope && (
                <button
                  onClick={applyAIScope}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors font-semibold disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving...' : 'Apply to Scope'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
