import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown, User, Loader2 } from 'lucide-react';

interface ContactOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface ContactSearchSelectProps {
  contacts: ContactOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  darkMode?: boolean;
  onSearch?: (query: string) => void;
  searching?: boolean;
}

export function ContactSearchSelect({
  contacts,
  value,
  onChange,
  placeholder = 'Search or select customer...',
  required = false,
  disabled = false,
  className = '',
  darkMode = true,
  onSearch,
  searching = false,
}: ContactSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = contacts.find(c => c.id === value) || null;

  const filtered = onSearch
    ? contacts
    : query.trim()
      ? contacts.filter(c =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          (c.sublabel && c.sublabel.toLowerCase().includes(query.toLowerCase()))
        )
      : contacts;

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSelect(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) {
        handleSelect(filtered[highlighted].id);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  const base = darkMode
    ? 'bg-gray-800 border-gray-700 text-white placeholder-gray-500 focus:ring-cyan-500'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:ring-blue-500';

  const dropdownBase = darkMode
    ? 'bg-gray-800 border-gray-700'
    : 'bg-white border-gray-200';

  const itemBase = darkMode
    ? 'text-white hover:bg-gray-700'
    : 'text-gray-900 hover:bg-blue-50';

  const itemHighlight = darkMode ? 'bg-gray-700' : 'bg-blue-50';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger / Search Input */}
      <div
        className={`flex items-center w-full min-h-[42px] px-3 border rounded-lg cursor-text transition-all ${base} ${open ? (darkMode ? 'ring-2 ring-cyan-500 border-transparent' : 'ring-2 ring-blue-500 border-transparent') : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Search className={`w-4 h-4 flex-shrink-0 mr-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />

        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              const val = e.target.value;
              setQuery(val);
              if (onSearch) {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => onSearch(val), 300);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={selected ? selected.label : placeholder}
            className={`flex-1 bg-transparent outline-none text-sm ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
            disabled={disabled}
          />
        ) : (
          <span className={`flex-1 text-sm truncate ${selected ? (darkMode ? 'text-white' : 'text-gray-900') : (darkMode ? 'text-gray-500' : 'text-gray-400')}`}>
            {selected ? selected.label : placeholder}
          </span>
        )}

        <div className="flex items-center gap-1 ml-1">
          {selected && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className={`p-0.5 rounded transition-colors ${darkMode ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
              tabIndex={-1}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${darkMode ? 'text-gray-500' : 'text-gray-400'} ${open ? 'rotate-180' : ''}`} />
        </div>

        {/* Hidden native input for form required validation */}
        {required && (
          <input
            type="text"
            required
            value={value}
            onChange={() => {}}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        )}
      </div>

      {/* Dropdown */}
      {open && !disabled && (
        <div
          ref={listRef}
          className={`absolute z-50 w-full mt-1 border rounded-lg shadow-xl max-h-56 overflow-y-auto ${dropdownBase}`}
        >
          {searching ? (
            <div className={`flex items-center gap-2 px-3 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </div>
          ) : filtered.length === 0 ? (
            <div className={`flex items-center gap-2 px-3 py-3 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              <User className="w-4 h-4" />
              No contacts found
            </div>
          ) : (
            filtered.map((contact, i) => (
              <button
                key={contact.id}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(contact.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors flex flex-col gap-0.5 ${itemBase} ${i === highlighted ? itemHighlight : ''}`}
              >
                <span className="text-sm font-medium truncate">{contact.label}</span>
                {contact.sublabel && (
                  <span className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{contact.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
