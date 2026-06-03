import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { FileText, X, Eye, EyeOff } from 'lucide-react';

interface AreaScopeEditorProps {
  roomId: string;
  roomName: string;
  currentDescription: string | null;
  currentShowScope: boolean;
  onClose: () => void;
  onSave: (description: string) => void;
}

export default function AreaScopeEditor({
  roomId,
  roomName,
  currentDescription,
  currentShowScope,
  onClose,
  onSave
}: AreaScopeEditorProps) {
  const [description, setDescription] = useState(currentDescription || '');
  const [showScope, setShowScope] = useState(currentShowScope);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_rooms')
        .update({
          description,
          show_scope: showScope
        })
        .eq('id', roomId);

      if (error) throw error;
      onSave(description);
      onClose();
    } catch (error) {
      console.error('Error saving scope of work:', error);
      alert('Failed to save scope of work');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Scope of Work</h2>
              <p className="text-sm text-gray-500">{roomName}</p>
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-blue-900 mb-2">What is this?</h4>
            <p className="text-xs text-blue-800">
              Scope of Work describes what will be done in this area. It appears on the customer's proposal
              to explain the work in detail. You can show or hide this section per area.
            </p>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">
            Scope Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the work to be performed in this area...

Example:
• Remove existing fixtures and equipment
• Install new materials per specifications
• Test all connections and functionality
• Clean and restore area to original condition"
            className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent text-gray-900 resize-none"
          />
          <p className="text-xs text-gray-500 mt-2">
            Use bullet points • or numbered lists for clarity
          </p>

          <div className="mt-4 flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <input
              type="checkbox"
              id="showScopeToggle"
              checked={showScope}
              onChange={(e) => setShowScope(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor="showScopeToggle" className="text-sm text-gray-700 cursor-pointer flex items-center gap-2">
              {showScope ? (
                <>
                  <Eye className="w-4 h-4 text-blue-600" />
                  <span>Show these notes in customer proposal</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 text-gray-400" />
                  <span>Hide these notes from customer proposal</span>
                </>
              )}
            </label>
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
            className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Scope'}
          </button>
        </div>
      </div>
    </div>
  );
}
