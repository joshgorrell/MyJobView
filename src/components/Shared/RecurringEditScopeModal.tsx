import { X, CalendarDays, ArrowRight, LayoutList } from 'lucide-react';

export type RecurringEditScope = 'this' | 'this_and_future' | 'all';

interface RecurringEditScopeModalProps {
  action: 'edit' | 'delete';
  onSelect: (scope: RecurringEditScope) => void;
  onClose: () => void;
}

export function RecurringEditScopeModal({ action, onSelect, onClose }: RecurringEditScopeModalProps) {
  const verb = action === 'delete' ? 'Delete' : 'Edit';
  const pastVerb = action === 'delete' ? 'deleted' : 'edited';

  const options: { scope: RecurringEditScope; icon: React.ReactNode; title: string; description: string }[] = [
    {
      scope: 'this',
      icon: <CalendarDays className="w-5 h-5 text-blue-600" />,
      title: `${verb} this event`,
      description: 'Only this single occurrence will be ' + pastVerb + '. All other events in the series remain unchanged.',
    },
    {
      scope: 'this_and_future',
      icon: <ArrowRight className="w-5 h-5 text-amber-600" />,
      title: `${verb} this and future events`,
      description: 'This event and all upcoming pending events in the series will be ' + pastVerb + '. Past events remain untouched.',
    },
    {
      scope: 'all',
      icon: <LayoutList className="w-5 h-5 text-gray-600" />,
      title: `${verb} all events`,
      description: 'Every event in the entire series will be ' + pastVerb + ', including future pending instances.',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{verb} recurring event</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {options.map(opt => (
            <button
              key={opt.scope}
              type="button"
              onClick={() => onSelect(opt.scope)}
              className="w-full flex items-start gap-3 px-4 py-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-left transition-colors group"
            >
              <div className="mt-0.5 shrink-0">{opt.icon}</div>
              <div>
                <p className="text-sm font-medium text-gray-900 group-hover:text-blue-800">{opt.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="px-6 pb-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
