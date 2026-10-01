import { useState } from 'react';
export type ScopeTask = {
  id: string; title: string; description: string | null; estimated_hours: number | null;
  room_name?: string | null; phase_name?: string | null; status?: string; sort_order?: number;
};
export function TaskGroups<T extends ScopeTask>({ tasks, renderActions, renderDetails }: {
  tasks: T[]; renderActions?: (task: T) => React.ReactNode; renderDetails?: (task: T) => React.ReactNode;
}) {
  const [groupBy, setGroupBy] = useState<'room' | 'phase'>('room');
  const groups = new Map<string, T[]>();
  for (const task of tasks) {
    const key = (groupBy === 'room' ? task.room_name : task.phase_name) || (groupBy === 'room' ? 'General / Unassigned' : 'No labor phase');
    groups.set(key, [...(groups.get(key) || []), task]);
  }
  const total = (rows: T[]) => rows.reduce((sum, row) => sum + (row.estimated_hours || 0), 0).toFixed(1);
  const missing = tasks.filter(task => task.estimated_hours == null || task.estimated_hours === 0).length;
  return <div className="space-y-3">
    <div className="flex flex-wrap justify-between items-center gap-3 text-sm text-primary"><p>{tasks.length} tasks · {total(tasks)}h estimated{missing > 0 && <span className="text-muted"> · {missing} not estimated</span>}</p><label>Group by <select value={groupBy} onChange={event => setGroupBy(event.target.value as 'room' | 'phase')} className="bg-surface text-primary p-2 border border-subtle rounded-lg"><option value="room">Room / Area</option><option value="phase">Labor Phase</option></select></label></div>
    {[...groups].map(([name, rows]) => <section key={name} className="border border-subtle rounded-lg overflow-hidden bg-surface">
      <h3 className="font-semibold text-primary p-3 border-b border-subtle flex flex-wrap justify-between gap-2"><span>{name}</span><span className="text-sm text-muted font-normal">{rows.length} tasks · {total(rows)}h</span></h3>
      <div className="divide-y divide-subtle">{rows.map(task => <details key={task.id} className="p-3">
        <summary className="cursor-pointer flex flex-wrap items-center justify-between gap-2 min-h-11 text-primary"><span className="font-medium">{task.title}</span><span className="text-xs text-muted">{(groupBy === 'room' ? task.phase_name : task.room_name) || 'Unassigned'} · {task.estimated_hours == null || task.estimated_hours === 0 ? 'Not estimated' : `${task.estimated_hours}h`}{task.status && ` · ${task.status}`}</span></summary>
        {task.description && <p className="whitespace-pre-wrap text-sm text-secondary py-2">{task.description}</p>}
        {renderDetails?.(task)}{renderActions?.(task)}
      </details>)}</div>
    </section>)}
    {!tasks.length && <p className="text-sm text-muted">No structured tasks yet.</p>}
  </div>;
}
