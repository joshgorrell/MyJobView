import { useEffect, useId, useRef, useState } from 'react';
import { Search } from 'lucide-react';

interface AssignmentOption {
  id: string;
  label: string;
  group: string;
}

export function AssignmentSearchSelect({ options, value, onChange }: {
  options: AssignmentOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const listId = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const filtered = options.filter(option => `${option.label} ${option.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = options.find(option => option.id === value);

  useEffect(() => {
    function outside(event: MouseEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  useEffect(() => {
    if (open) document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, open, listId]);

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={container} className="relative" onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <Search aria-hidden="true" className="absolute left-3 top-3 w-4 h-4 text-muted pointer-events-none" />
      <input
        role="combobox"
        aria-label="Assign To"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={open && filtered[highlighted] ? `${listId}-${highlighted}` : undefined}
        autoComplete="off"
        value={open ? query : selected?.label || ''}
        placeholder="Type a name or department..."
        onFocus={() => { setQuery(''); setHighlighted(0); setOpen(true); }}
        onClick={() => { if (!open) { setQuery(''); setHighlighted(0); setOpen(true); } }}
        onChange={event => { setQuery(event.target.value); setHighlighted(0); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) { setQuery(''); setHighlighted(0); setOpen(true); }
            else setHighlighted(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
          } else if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (filtered[highlighted]) select(filtered[highlighted].id);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        className="w-full pl-9 pr-3 py-2.5 bg-surface border border-subtle text-primary text-sm rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
      />
      {open && (
        <div id={listId} role="listbox" aria-label="Assignment options" className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-subtle bg-surface shadow-xl">
          {filtered.length === 0 && <p className="px-3 py-3 text-sm text-muted" role="status">No people or departments found</p>}
          {filtered.map((option, index) => (
            <div
              key={option.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={value === option.id}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => select(option.id)}
              className={`px-3 py-2 cursor-pointer text-sm text-primary ${highlighted === index ? 'bg-elevated' : 'hover:bg-elevated'}`}
            >
              <div>{option.label}</div>
              <div className="text-xs text-muted">{option.group}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
