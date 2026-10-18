export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export function ReviewFilterBar({
  options,
  active,
  onChange,
}: {
  options: FilterOption[];
  active: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            active === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
          }`}
        >
          {opt.label}
          {opt.count !== undefined && (
            <span className={`ml-1.5 text-xs ${active === opt.value ? 'text-blue-200' : 'text-gray-500'}`}>
              {opt.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
