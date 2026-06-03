import { useState, useEffect } from 'react';
import { X, Calendar, Users, Check, ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { ScheduleViewer } from './ScheduleViewer';

interface Technician {
  id: string;
  full_name: string;
}

interface AvailabilityBrowserModalProps {
  /** Pre-selected technician IDs (from the work order form). Empty = show all. */
  initialTechnicianIds?: string[];
  /** Called when user clicks a time slot — closes the modal */
  onSlotSelected: (date: string, startTime: string, endTime: string) => void;
  /** Called when user confirms technician selection changes */
  onTechniciansSelected?: (techIds: string[]) => void;
  onClose: () => void;
}

export function AvailabilityBrowserModal({
  initialTechnicianIds = [],
  onSlotSelected,
  onTechniciansSelected,
  onClose,
}: AvailabilityBrowserModalProps) {
  const [allTechnicians, setAllTechnicians] = useState<Technician[]>([]);
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>(initialTechnicianIds);
  const [techPickerOpen, setTechPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingSlot, setPendingSlot] = useState<{ date: string; startTime: string; endTime: string } | null>(null);

  useEffect(() => {
    loadTechnicians();
  }, []);

  async function loadTechnicians() {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['tech', 'service_manager', 'project_manager', 'office_manager', 'admin', 'manager'])
        .eq('is_active', true)
        .order('full_name');
      setAllTechnicians(data || []);
    } finally {
      setLoading(false);
    }
  }

  function toggleTech(id: string) {
    setSelectedTechIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelectedTechIds(allTechnicians.map(t => t.id));
  }

  function clearAll() {
    setSelectedTechIds([]);
  }

  function handleSlotSelected(date: string, startTime: string, endTime: string) {
    setPendingSlot({ date, startTime, endTime });
    onSlotSelected(date, startTime, endTime);
    if (onTechniciansSelected && selectedTechIds.length > 0) {
      onTechniciansSelected(selectedTechIds);
    }
    onClose();
  }

  function handleConfirmTechs() {
    if (onTechniciansSelected) {
      onTechniciansSelected(selectedTechIds);
    }
    setTechPickerOpen(false);
  }

  // IDs to actually pass to ScheduleViewer: selected subset or all if none chosen
  const viewerTechIds = selectedTechIds.length > 0
    ? selectedTechIds
    : allTechnicians.map(t => t.id);

  const selectedNames = selectedTechIds.length === 0
    ? 'All Technicians'
    : selectedTechIds.length === 1
      ? allTechnicians.find(t => t.id === selectedTechIds[0])?.full_name ?? '1 technician'
      : `${selectedTechIds.length} technicians`;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-white" style={{ isolation: 'isolate' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 bg-gray-900 text-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <div>
            <h2 className="text-base font-bold leading-tight">Browse Availability</h2>
            <p className="text-xs text-gray-400">Click any open time slot to schedule</p>
          </div>
        </div>

        {/* Technician Filter */}
        <div className="flex items-center gap-3 flex-1 justify-center max-w-md">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTechPickerOpen(v => !v)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-sm transition-colors"
            >
              <Users className="w-4 h-4 text-blue-400" />
              <span className="font-medium">{selectedNames}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${techPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {techPickerOpen && (
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-10 overflow-hidden">
                {/* Picker header */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filter Technicians</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={selectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">All</button>
                    <span className="text-gray-300">|</span>
                    <button type="button" onClick={clearAll} className="text-xs text-gray-500 hover:text-gray-700 font-medium">None</button>
                  </div>
                </div>

                {/* Tech list */}
                <div className="max-h-64 overflow-y-auto py-1">
                  {loading ? (
                    <div className="px-3 py-4 text-center text-sm text-gray-500">Loading...</div>
                  ) : allTechnicians.map(tech => (
                    <button
                      key={tech.id}
                      type="button"
                      onClick={() => toggleTech(tech.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selectedTechIds.includes(tech.id)
                          ? 'bg-blue-600 border-blue-600'
                          : 'border-gray-300'
                      }`}>
                        {selectedTechIds.includes(tech.id) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                      <span className="text-sm text-gray-800 font-medium">{tech.full_name}</span>
                    </button>
                  ))}
                </div>

                {/* Apply button */}
                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleConfirmTechs}
                    className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    Apply Filter
                  </button>
                </div>
              </div>
            )}
          </div>

          {selectedTechIds.length > 0 && (
            <span className="text-xs text-blue-300 bg-blue-900/40 px-2 py-0.5 rounded-full">
              {selectedTechIds.length} selected
            </span>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
          title="Close calendar"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar — fills remaining space */}
      <div className="flex-1 overflow-auto p-4 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <ScheduleViewer
            selectedTechnicianIds={viewerTechIds}
            selectedDate={new Date().toISOString().split('T')[0]}
            onTimeSlotClick={handleSlotSelected}
            fullScreenMode
          />
        )}
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-5 py-2 bg-gray-900 text-gray-400 text-xs flex items-center gap-4 border-t border-gray-700">
        <span>Click any open slot to select it and close this view</span>
        <span className="ml-auto flex items-center gap-2">
          Keyboard:
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">D</kbd> Day
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">W</kbd> Week
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">M</kbd> Month
          <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-300 font-mono">T</kbd> Today
        </span>
      </div>
    </div>
  );
}
