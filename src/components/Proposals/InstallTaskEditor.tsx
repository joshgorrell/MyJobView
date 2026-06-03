import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Wrench, X, Eye, EyeOff, Lock } from 'lucide-react';

interface InstallTaskEditorProps {
  lineItemId: string;
  itemDescription: string;
  currentTaskNotes: string | null;
  currentShowTaskNotes: boolean;
  onClose: () => void;
  onSave: (taskNotes: string) => void;
}

export default function InstallTaskEditor({
  lineItemId,
  itemDescription,
  currentTaskNotes,
  currentShowTaskNotes,
  onClose,
  onSave
}: InstallTaskEditorProps) {
  const [taskNotes, setTaskNotes] = useState(currentTaskNotes || '');
  const [showTaskNotes, setShowTaskNotes] = useState(currentShowTaskNotes);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_line_items')
        .update({
          task_notes: taskNotes,
          show_task_notes: showTaskNotes
        })
        .eq('id', lineItemId);

      if (error) throw error;
      onSave(taskNotes);
      onClose();
    } catch (error) {
      console.error('Error saving install task:', error);
      alert('Failed to save install task');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6 text-orange-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Install Instructions</h2>
              <p className="text-sm text-gray-500">{itemDescription}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-orange-900 mb-1">Installation Instructions</h4>
            <p className="text-xs text-orange-800">
              These instructions are for your technicians and appear on work orders. By default they are
              <strong> internal only</strong> and hidden from the customer proposal.
            </p>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Installation Steps
          </label>
          <textarea
            value={taskNotes}
            onChange={(e) => setTaskNotes(e.target.value)}
            placeholder="Enter step-by-step installation instructions...

Example:
1. Verify existing infrastructure and power requirements
2. Mount equipment at specified location (follow diagram)
3. Make all necessary connections per wiring schematic
4. Test functionality and verify proper operation
5. Program/configure per customer specifications
6. Document serial numbers and installation details
7. Customer training required before completion"
            className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent text-gray-900 resize-none font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-2">
            Use numbered steps for clarity • Include any tools or materials needed
          </p>

          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Customer Visibility</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowTaskNotes(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  !showTaskNotes
                    ? 'bg-gray-900 border-gray-900 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Lock className="w-4 h-4" />
                Internal only
                {!showTaskNotes && <span className="ml-1 text-xs opacity-70">(default)</span>}
              </button>
              <button
                type="button"
                onClick={() => setShowTaskNotes(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                  showTaskNotes
                    ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Eye className="w-4 h-4" />
                Show on proposal
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {showTaskNotes
                ? 'These instructions will be visible to the customer on the proposal PDF.'
                : 'These instructions will only appear on internal work orders — not the customer proposal.'}
            </p>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Instructions'}
          </button>
        </div>
      </div>
    </div>
  );
}
