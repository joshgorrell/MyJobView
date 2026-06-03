import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { Copy, X, User, AlertCircle, GitBranch, ChevronDown, ChevronUp } from 'lucide-react';

interface Contact {
  id: string;
  full_name: string;
  company_name: string;
  email: string;
  zip_code: string | null;
}

interface DuplicateProposalModalProps {
  proposalId: string;
  currentContactId: string;
  currentContactName: string;
  onClose: () => void;
  onSuccess: (newProposalId: string) => void;
  onOpenRevisionManager?: () => void;
}

export function DuplicateProposalModal({
  proposalId,
  currentContactId,
  currentContactName,
  onClose,
  onSuccess,
  onOpenRevisionManager
}: DuplicateProposalModalProps) {
  const { profile } = useAuth();
  const [duplicationType, setDuplicationType] = useState<'same' | 'different'>('same');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState<string>(currentContactId);
  const [searchTerm, setSearchTerm] = useState('');
  const [includeLineItems, setIncludeLineItems] = useState(true);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentContactHasZip, setCurrentContactHasZip] = useState(true);
  const [acknowledgedWarning, setAcknowledgedWarning] = useState(false);
  const [showExplanation, setShowExplanation] = useState(false);

  useEffect(() => {
    if (duplicationType === 'different') {
      loadContacts();
    }
    // Reset warning acknowledgment when type changes
    setAcknowledgedWarning(false);
  }, [duplicationType]);

  useEffect(() => {
    loadOriginalTitle();
    checkCurrentContactZip();
  }, [proposalId, currentContactId]);

  async function checkCurrentContactZip() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('zip_code')
        .eq('id', currentContactId)
        .single();

      if (error) throw error;
      setCurrentContactHasZip(!!data?.zip_code?.trim());
    } catch (error) {
      console.error('Error checking contact ZIP code:', error);
    }
  }

  async function loadOriginalTitle() {
    try {
      const { data, error } = await supabase
        .from('proposals')
        .select('title')
        .eq('id', proposalId)
        .single();

      if (error) throw error;
      setNewTitle(`${data.title} (Copy)`);
    } catch (error) {
      console.error('Error loading proposal:', error);
    }
  }

  async function loadContacts() {
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, company_name, email, zip_code')
        .eq('company_id', profile?.company_id)
        .order('full_name');

      if (error) throw error;
      setContacts(data || []);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  }

  function handleUseRevision() {
    onClose();
    if (onOpenRevisionManager) {
      onOpenRevisionManager();
    }
  }

  async function handleDuplicate() {
    try {
      setLoading(true);
      setError(null);

      const { data: originalProposal, error: fetchError } = await supabase
        .from('proposals')
        .select(`
          *,
          proposal_line_items(*)
        `)
        .eq('id', proposalId)
        .single();

      if (fetchError) throw fetchError;

      const targetContactId = duplicationType === 'same' ? currentContactId : selectedContactId;

      if (!targetContactId) {
        throw new Error('Please select a contact');
      }

      // Validate that the target contact has a ZIP code
      const { data: targetContact, error: contactError } = await supabase
        .from('contacts')
        .select('zip_code')
        .eq('id', targetContactId)
        .single();

      if (contactError) throw contactError;

      if (!targetContact.zip_code || !targetContact.zip_code.trim()) {
        throw new Error('The selected contact does not have a ZIP code. A ZIP code is required for sales tax calculation. Please add a ZIP code to the contact first.');
      }

      const { data: newProposal, error: insertError } = await supabase
        .from('proposals')
        .insert({
          company_id: profile?.company_id,
          contact_id: targetContactId,
          title: newTitle,
          description: originalProposal.description,
          status: 'designing',
          total: originalProposal.total,
          valid_until: null,
          notes: originalProposal.notes,
          discount_amount: originalProposal.discount_amount,
          discount_type: originalProposal.discount_type,
          tax_rate: originalProposal.tax_rate,
          tax_amount: originalProposal.tax_amount,
          subtotal: originalProposal.subtotal,
          created_by: profile?.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      if (includeLineItems && originalProposal.proposal_line_items?.length > 0) {
        const lineItemsToInsert = originalProposal.proposal_line_items.map((item: any) => ({
          proposal_id: newProposal.id,
          product_id: item.product_id,
          item_type: item.item_type,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total,
          sort_order: item.sort_order,
          room_id: item.room_id,
          labor_hours: item.labor_hours,
          labor_rate: item.labor_rate,
          labor_total: item.labor_total
        }));

        const { error: lineItemsError } = await supabase
          .from('proposal_line_items')
          .insert(lineItemsToInsert);

        if (lineItemsError) throw lineItemsError;
      }

      await supabase
        .from('proposal_versions')
        .insert({
          proposal_id: newProposal.id,
          version_number: 1,
          snapshot_data: {
            title: newProposal.title,
            description: newProposal.description,
            total: newProposal.total,
            status: newProposal.status
          },
          changed_by: profile?.id,
          change_description: `Duplicated from proposal #${originalProposal.proposal_number}`
        });

      onSuccess(newProposal.id);
    } catch (error: any) {
      console.error('Error duplicating proposal:', error);
      setError(error.message || 'Failed to duplicate proposal');
    } finally {
      setLoading(false);
    }
  }

  const filteredContacts = contacts.filter(contact =>
    contact.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full border border-gray-700">
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
              <Copy className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Duplicate Proposal</h2>
              <p className="text-sm text-gray-400">Create a copy of this proposal</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[calc(100vh-12rem)] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-2 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Duplicate for:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDuplicationType('same')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  duplicationType === 'same'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <User className="w-6 h-6 text-blue-400 mb-2" />
                <div className="text-left">
                  <div className="font-medium text-white text-sm">Same Customer</div>
                  <div className="text-xs text-gray-400 mt-1">{currentContactName}</div>
                  <div className="text-xs text-amber-400 mt-1.5 leading-snug">
                    Revisions are recommended instead
                  </div>
                </div>
              </button>

              <button
                onClick={() => setDuplicationType('different')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  duplicationType === 'different'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-600 hover:border-gray-500'
                }`}
              >
                <User className="w-6 h-6 text-purple-400 mb-2" />
                <div className="text-left">
                  <div className="font-medium text-white text-sm">Different Customer</div>
                  <div className="text-xs text-gray-400 mt-1">Select from contacts</div>
                </div>
              </button>
            </div>
          </div>

          {duplicationType === 'same' && (
            <div className="p-4 md:p-5 bg-amber-500/20 border border-amber-500/50 rounded-lg space-y-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 text-amber-400 mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="font-semibold text-amber-200 text-sm md:text-base">
                      Consider Using a Revision Instead
                    </div>
                    <p className="text-amber-200/90 text-sm leading-relaxed mt-1">
                      Duplicating a proposal for the same customer can negatively impact your sales statistics.
                      Revisions track project iterations without inflating your proposal counts.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowExplanation(!showExplanation)}
                    className="flex items-center gap-2 text-amber-200 hover:text-amber-100 transition-colors text-sm font-medium w-full md:w-auto min-h-[44px] md:min-h-0 py-2"
                  >
                    {showExplanation ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        Why does this matter?
                      </>
                    )}
                  </button>

                  {showExplanation && (
                    <div className="space-y-3 text-sm text-amber-200/90 leading-relaxed">
                      <p className="font-medium text-amber-200">
                        Impact on Your Sales Statistics:
                      </p>
                      <ul className="list-disc list-inside space-y-2 ml-2">
                        <li>Proposals Created count increases</li>
                        <li>Proposals Out metric is inflated</li>
                        <li>Win Rate percentage decreases</li>
                        <li>Conversion Rate appears lower</li>
                      </ul>
                      <div className="p-3 bg-amber-500/10 rounded border border-amber-500/30 space-y-2">
                        <p className="font-medium text-amber-200">Example:</p>
                        <p>
                          If you create 3 duplicates for the same customer and only 1 gets approved:
                        </p>
                        <p className="ml-4">
                          • <span className="font-medium">With Duplicates:</span> 3 proposals created, 1 approved = 33% win rate
                        </p>
                        <p className="ml-4">
                          • <span className="font-medium">With Revisions:</span> 1 proposal with 3 revisions = 100% win rate
                        </p>
                      </div>
                      <p className="text-xs text-amber-200/80">
                        <span className="font-medium">Tip:</span> Use duplicates only for completely different projects or different customers.
                      </p>
                    </div>
                  )}

                  {onOpenRevisionManager && (
                    <button
                      onClick={handleUseRevision}
                      className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium min-h-[44px]"
                    >
                      <GitBranch className="w-4 h-4" />
                      Use Revision Instead
                    </button>
                  )}

                  <div className="flex items-start gap-3 p-3 bg-amber-500/10 rounded border border-amber-500/30">
                    <input
                      type="checkbox"
                      id="acknowledge-warning"
                      checked={acknowledgedWarning}
                      onChange={(e) => setAcknowledgedWarning(e.target.checked)}
                      className="w-5 h-5 md:w-4 md:h-4 mt-0.5 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500 cursor-pointer flex-shrink-0"
                    />
                    <label
                      htmlFor="acknowledge-warning"
                      className="text-sm leading-relaxed text-amber-200 cursor-pointer flex-1"
                    >
                      I understand this will create a separate proposal that counts individually in my sales statistics
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {duplicationType === 'same' && !currentContactHasZip && (
            <div className="p-3 bg-amber-500/20 border border-amber-500/50 rounded-lg flex items-start gap-2 text-amber-300 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium mb-1">ZIP Code Required</div>
                <div>
                  The current customer does not have a ZIP code. Please add a ZIP code to this contact before duplicating the proposal, as it's required for accurate sales tax calculation.
                </div>
              </div>
            </div>
          )}

          {duplicationType === 'different' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Select Customer
              </label>
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
              />
              <div className="max-h-48 overflow-y-auto border border-gray-600 rounded-lg">
                {filteredContacts.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-sm">
                    No contacts found
                  </div>
                ) : (
                  filteredContacts.map((contact) => (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContactId(contact.id)}
                      className={`w-full p-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700 last:border-b-0 ${
                        selectedContactId === contact.id ? 'bg-blue-500/20' : ''
                      } ${!contact.zip_code?.trim() ? 'opacity-60' : ''}`}
                      disabled={!contact.zip_code?.trim()}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium text-white">{contact.full_name}</div>
                          {contact.company_name && (
                            <div className="text-sm text-gray-400">{contact.company_name}</div>
                          )}
                          <div className="text-xs text-gray-500">{contact.email}</div>
                        </div>
                        {!contact.zip_code?.trim() && (
                          <div className="flex items-center gap-1 text-amber-500 text-xs whitespace-nowrap">
                            <AlertCircle className="w-3 h-3" />
                            No ZIP
                          </div>
                        )}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              New Proposal Title
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter proposal title"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLineItems}
                onChange={(e) => setIncludeLineItems(e.target.checked)}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-300">
                Include all line items from original proposal
              </span>
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleDuplicate}
            disabled={
              loading ||
              !newTitle.trim() ||
              (duplicationType === 'same' && !currentContactHasZip) ||
              (duplicationType === 'same' && !acknowledgedWarning)
            }
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Duplicating...
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Duplicate Proposal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
