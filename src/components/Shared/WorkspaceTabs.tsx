import { useState, type ReactNode } from 'react';

interface WorkspaceTabsProps {
  title: string;
  initial: string;
  onSelect?: (key: string) => void;
  tabs: { key: string; label: string; content: ReactNode | ((tabList: ReactNode) => ReactNode) }[];
}

export function WorkspaceTabs({ title, initial, tabs, onSelect }: WorkspaceTabsProps) {
  const [selected, setSelected] = useState(initial);
  const active = tabs.find(tab => tab.key === selected) || tabs[0];
  if (!active) return null;

  const tabList = (
    <div className="responsive-tabs flex gap-2" role="tablist" aria-label={title}>
      {tabs.map(tab => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active.key === tab.key}
          onClick={() => { setSelected(tab.key); onSelect?.(tab.key); }}
          className={`px-4 py-2 rounded-lg whitespace-nowrap ${active.key === tab.key ? 'bg-blue-600 text-white' : 'bg-surface text-muted'}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <section className="space-y-4 min-w-0">
      <h1 className="text-2xl font-bold text-primary">{title}</h1>
      {typeof active.content === 'function' ? active.content(tabList) : (
        <>
          <div className="pb-1">{tabList}</div>
          <div className="min-w-0" role="tabpanel">{active.content}</div>
        </>
      )}
    </section>
  );
}
