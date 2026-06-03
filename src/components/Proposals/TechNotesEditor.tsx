import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Wrench, X, Plus, AlertCircle } from 'lucide-react';

interface LaborPhase {
  id: string;
  name: string;
  description?: string;
}

interface LineItemPhase {
  id?: string;
  labor_phase_id: string;
  hours: number;
  tech_notes: string;
  sort_order: number;
}

interface TechNotesEditorProps {
  lineItemId: string;
  itemDescription: string;
  onClose: () => void;
  onSave: () => void;
}

export default function TechNotesEditor({
  lineItemId,
  itemDescription,
  onClose,
  onSave
}: TechNotesEditorProps) {
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [phases, setPhases] = useState<LineItemPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [lineItemId]);

  async function loadData() {
    try {
      setLoading(true);

      // Load available labor phases
      const { data: laborData, error: laborError } = await supabase
        .from('labor_phases')
        .select('*')
        .order('name');

      if (laborError) throw laborError;
      setLaborPhases(laborData || []);

      // Load existing phases for this line item
      const { data: phasesData, error: phasesError } = await supabase
        .from('proposal_line_item_labor_phases')
        .select('*')
        .eq('line_item_id', lineItemId)
        .order('sort_order');

      if (phasesError) throw phasesError;

      if (phasesData && phasesData.length > 0) {
        setPhases(phasesData);
      }
    } catch (error) {
      console.error('Error loading tech notes:', error);
    } finally {
      setLoading(false);
    }
  }

  function addPhase() {
    setPhases([...phases, {
      labor_phase_id: '',
      hours: 0,
      tech_notes: '',
      sort_order: phases.length
    }]);
  }

  function removePhase(index: number) {
    setPhases(phases.filter((_, i) => i !== index));
  }

  function updatePhase(index: number, field: keyof LineItemPhase, value: any) {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], [field]: value };
    setPhases(newPhases);
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Delete existing phases
      await supabase
        .from('proposal_line_item_labor_phases')
        .delete()
        .eq('line_item_id', lineItemId);

      // Insert new phases (only if they have data)
      const validPhases = phases
        .filter(p => p.labor_phase_id && (p.hours > 0 || p.tech_notes))
        .map((p, index) => ({
          line_item_id: lineItemId,
          labor_phase_id: p.labor_phase_id,
          hours: p.hours || 0,
          tech_notes: p.tech_notes || null,
          sort_order: index
        }));

      if (validPhases.length > 0) {
        const { error } = await supabase
          .from('proposal_line_item_labor_phases')
          .insert(validPhases);

        if (error) throw error;
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving tech notes:', error);
      alert('Failed to save tech notes');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wrench className="w-6 h-6 text-amber-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Technician Notes</h2>
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
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-900 mb-1">Internal Notes Only</h4>
                <p className="text-xs text-amber-800">
                  These notes are for technicians during installation and will appear on install reports.
                  <strong> Customers will never see these notes.</strong> Add instructions, warnings, or
                  special requirements per labor phase.
                </p>
              </div>
            </div>
          </div>

          {phases.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <Wrench className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 font-medium mb-2">No labor phases added yet</p>
              <p className="text-sm text-gray-500 mb-4">
                Add labor phases with specific hours and tech notes for this item
              </p>
              <button
                onClick={addPhase}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add First Phase
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {phases.map((phase, index) => {
                const selectedPhase = laborPhases.find(p => p.id === phase.labor_phase_id);
                return (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="flex-1 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Labor Phase
                          </label>
                          <select
                            value={phase.labor_phase_id}
                            onChange={(e) => updatePhase(index, 'labor_phase_id', e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Select Phase</option>
                            {laborPhases.map(p => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Hours
                          </label>
                          <input
                            type="number"
                            step="0.25"
                            value={phase.hours || ''}
                            onChange={(e) => updatePhase(index, 'hours', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            placeholder="0.00"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => removePhase(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg mt-7"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Technician Notes {selectedPhase && `(${selectedPhase.name})`}
                      </label>
                      <textarea
                        value={phase.tech_notes || ''}
                        onChange={(e) => updatePhase(index, 'tech_notes', e.target.value)}
                        placeholder="Special instructions, warnings, or requirements for this phase..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                      />
                    </div>
                  </div>
                );
              })}

              <button
                onClick={addPhase}
                className="w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" />
                Add Another Phase
              </button>
            </div>
          )}
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
            {saving ? 'Saving...' : 'Save Tech Notes'}
          </button>
        </div>
      </div>
    </div>
  );
}
