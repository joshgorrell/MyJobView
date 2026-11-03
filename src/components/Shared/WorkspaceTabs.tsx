import { ReactNode, useState } from 'react';
export function WorkspaceTabs({ title, initial, tabs, onSelect }: { title: string; initial: string; onSelect?: (key: string) => void; tabs: { key: string; label: string; content: ReactNode }[] }) {
  const [selected, setSelected] = useState(initial);
  const active = tabs.find(t => t.key === selected) || tabs[0];
  if (!active) return null;
  return <section className="space-y-4 min-w-0"><h1 className="text-2xl font-bold text-primary">{title}</h1><div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={title}>{tabs.map(t => <button key={t.key} role="tab" aria-selected={active.key === t.key} onClick={() => { setSelected(t.key); onSelect?.(t.key); }} className={`px-4 py-2 rounded-lg whitespace-nowrap ${active.key === t.key ? 'bg-blue-600 text-white' : 'bg-surface text-muted'}`}>{t.label}</button>)}</div><div role="tabpanel">{active.content}</div></section>;
}
