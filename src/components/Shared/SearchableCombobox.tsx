import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyMessage?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = 'Search...',
  emptyMessage = 'No results found',
  required = false,
  disabled = false,
  className = '',
  compact = false,
}: SearchableComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const selected = options.find(o => o.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    setHighlightIndex(-1);
  }, [query, open]);

  const filtered = options.filter(o => {
    if (!query) return true;
    const q = query.toLowerCase();
    return o.label.toLowerCase().includes(q) || (o.sublabel || '').toLowerCase().includes(q);
  });

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && highlightIndex < filtered.length) {
      e.preventDefault();
      handleSelect(filtered[highlightIndex].id);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  const displayValue = selected ? selected.label : '';

  if (compact) {
    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {open ? (
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="w-full pl-7 pr-6 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-xs"
              required={required}
              disabled={disabled}
            />
            {selected && (
              <button
                type="button"
                onClick={() => { handleSelect(''); }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => !disabled && setOpen(true)}
            disabled={disabled}
            className={`w-full px-2 py-1.5 border rounded-lg text-xs text-left transition-colors ${
              disabled
                ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                : 'border-gray-300 hover:border-gray-400 text-gray-700'
            } ${required && !value ? 'border-red-300' : ''}`}
          >
            {displayValue || <span className="text-gray-400">{placeholder}</span>}
            <ChevronDown className="inline ml-1 w-3 h-3 text-gray-400 float-right" />
          </button>
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">{emptyMessage}</div>
            ) : (
              filtered.map((opt, i) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  className={`w-full px-3 py-1.5 text-left text-xs border-b border-gray-50 last:border-b-0 transition-colors ${
                    i === highlightIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <div className="font-medium truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-gray-500 truncate">{opt.sublabel}</div>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {open ? (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            required={required}
            disabled={disabled}
          />
          {selected && (
            <button
              type="button"
              onClick={() => { handleSelect(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => !disabled && setOpen(true)}
          disabled={disabled}
          className={`w-full px-3 py-2 border rounded-lg text-sm text-left transition-colors flex items-center justify-between ${
            disabled
              ? 'border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
              : 'border-gray-300 hover:border-gray-400 text-gray-700'
          } ${required && !value ? 'border-red-300' : ''}`}
        >
          <span className="truncate">{displayValue || <span className="text-gray-400">{placeholder}</span>}</span>
          <ChevronDown className="flex-shrink-0 ml-2 w-4 h-4 text-gray-400" />
        </button>
      )}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">{emptyMessage}</div>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt.id)}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`w-full px-4 py-2 text-left text-sm border-b border-gray-50 last:border-b-0 transition-colors ${
                  i === highlightIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-medium truncate">{opt.label}</div>
                {opt.sublabel && (
                  <div className="text-xs text-gray-500 truncate">{opt.sublabel}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
