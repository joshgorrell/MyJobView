import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronRight, ListChecks, X, Edit2 } from 'lucide-react';

interface ProposalTask {
  id: string;
  proposal_id: string;
  line_item_id: string | null;
  source_default_task_id: string | null;
  title: string;
  description: string | null;
  labor_phase_id: string | null;
  sort_order: number;
}

interface LineItemInfo {
  id: string;
  description: string;
}

interface LaborPhase {
  id: string;
  name: string;
}

interface ProposalTasksPanelProps {
  proposalId: string;
  lineItems: LineItemInfo[];
  onClose: () => void;
}

export default function ProposalTasksPanel({ proposalId, lineItems, onClose }: ProposalTasksPanelProps) {
  const [tasks, setTasks] = useState<ProposalTask[]>([]);
  const [laborPhases, setLaborPhases] = useState<LaborPhase[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editLaborPhaseId, setEditLaborPhaseId] = useState('');
  const [showAddGeneral, setShowAddGeneral] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskLineItemId, setNewTaskLineItemId] = useState<string | null>(null);
  const [showAddForItem, setShowAddForItem] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('proposal_tasks')
        .select('*')
        .eq('proposal_id', proposalId)
        .order('sort_order');

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('Error loading proposal tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    loadTasks();
    supabase
      .from('labor_phases')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setLaborPhases(data || []));
  }, [loadTasks]);

  const tasksByLineItem = () => {
    const grouped: Record<string, ProposalTask[]> = {};
    const general: ProposalTask[] = [];
    tasks.forEach(task => {
      if (task.line_item_id) {
        if (!grouped[task.line_item_id]) grouped[task.line_item_id] = [];
        grouped[task.line_item_id].push(task);
      } else {
        general.push(task);
      }
    });
    return { grouped, general };
  };

  const { grouped, general } = tasksByLineItem();

  const handleSaveTask = async (taskId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('proposal_tasks')
        .update({
          title: editTitle,
          description: editDescription || null,
          labor_phase_id: editLaborPhaseId || null,
        })
        .eq('id', taskId);

      if (error) throw error;
      setEditingTaskId(null);
      await loadTasks();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      const { error } = await supabase
        .from('proposal_tasks')
        .delete()
        .eq('id', taskId);

      if (error) throw error;
      await loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
      alert('Failed to delete task');
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSaving(true);
    try {
      const maxSort = tasks.length > 0 ? Math.max(...tasks.map(t => t.sort_order)) : -1;
      const { error } = await supabase
        .from('proposal_tasks')
        .insert({
          proposal_id: proposalId,
          line_item_id: newTaskLineItemId,
          title: newTaskTitle.trim(),
          sort_order: maxSort + 1,
        });

      if (error) throw error;
      setNewTaskTitle('');
      setShowAddGeneral(false);
      setShowAddForItem(null);
      await loadTasks();
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Failed to add task');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (taskId: string, direction: 'up' | 'down', taskList: ProposalTask[]) => {
    const index = taskList.findIndex(t => t.id === taskId);
    if (index < 0) return;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= taskList.length) return;

    const taskA = taskList[index];
    const taskB = taskList[swapIndex];

    try {
      await Promise.all([
        supabase.from('proposal_tasks').update({ sort_order: taskB.sort_order }).eq('id', taskA.id),
        supabase.from('proposal_tasks').update({ sort_order: taskA.sort_order }).eq('id', taskB.id),
      ]);
      await loadTasks();
    } catch (error) {
      console.error('Error reordering tasks:', error);
    }
  };

  const startEdit = (task: ProposalTask) => {
    setEditingTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditLaborPhaseId(task.labor_phase_id || '');
  };

  const laborPhaseName = (phaseId: string | null) => {
    if (!phaseId) return null;
    return laborPhases.find(p => p.id === phaseId)?.name;
  };

  const lineItemDescription = (itemId: string) => {
    return lineItems.find(li => li.id === itemId)?.description || 'Unknown Item';
  };

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const renderTask = (task: ProposalTask, taskList: ProposalTask[], index: number) => {
    const isEditing = editingTaskId === task.id;
    const phaseName = laborPhaseName(task.labor_phase_id);

    return (
      <div
        key={task.id}
        className="bg-gray-750 border border-gray-600 rounded-lg p-3 group"
      >
        <div className="flex items-start gap-2">
          <GripVertical className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />

          {isEditing ? (
            <div className="flex-1 space-y-2">
              <input
                type="text"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                placeholder="Task title"
                autoFocus
              />
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={2}
                className="w-full bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                placeholder="Description (optional)"
              />
              <div className="flex gap-2">
                <select
                  value={editLaborPhaseId}
                  onChange={e => setEditLaborPhaseId(e.target.value)}
                  className="bg-gray-700 border border-gray-500 rounded px-2 py-1 text-sm text-white"
                >
                  <option value="">No labor phase</option>
                  {laborPhases.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => handleSaveTask(task.id)}
                  disabled={saving || !editTitle.trim()}
                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-600"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingTaskId(null)}
                  className="px-3 py-1 bg-gray-600 text-gray-200 rounded text-sm hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm text-white font-medium">{task.title}</span>
                {phaseName && (
                  <span className="px-1.5 py-0.5 bg-blue-900 bg-opacity-40 text-blue-300 text-xs rounded">
                    {phaseName}
                  </span>
                )}
              </div>
              {task.description && (
                <p className="text-xs text-gray-400 mt-1">{task.description}</p>
              )}
              <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(task)}
                  className="text-gray-400 hover:text-blue-400 p-1"
                  title="Edit task"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="text-gray-400 hover:text-red-400 p-1"
                  title="Delete task"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleReorder(task.id, 'up', taskList)}
                  disabled={index === 0}
                  className="text-gray-400 hover:text-gray-200 p-1 disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                </button>
                <button
                  onClick={() => handleReorder(task.id, 'down', taskList)}
                  disabled={index === taskList.length - 1}
                  className="text-gray-400 hover:text-gray-200 p-1 disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAddTaskForm = (lineItemId: string | null) => {
    const isAdding = lineItemId === null ? showAddGeneral : showAddForItem === lineItemId;
    if (!isAdding) return null;

    return (
      <div className="bg-gray-700 border border-gray-600 rounded-lg p-3 mt-2">
        <input
          type="text"
          value={newTaskTitle}
          onChange={e => setNewTaskTitle(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newTaskTitle.trim()) {
              setNewTaskLineItemId(lineItemId);
              handleAddTask();
            }
          }}
          className="w-full bg-gray-800 border border-gray-500 rounded px-2 py-1.5 text-sm text-white"
          placeholder="Enter task title..."
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={() => {
              setNewTaskLineItemId(lineItemId);
              handleAddTask();
            }}
            disabled={saving || !newTaskTitle.trim()}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-600"
          >
            Add Task
          </button>
          <button
            onClick={() => {
              setShowAddGeneral(false);
              setShowAddForItem(null);
              setNewTaskTitle('');
            }}
            className="px-3 py-1 bg-gray-600 text-gray-200 rounded text-sm hover:bg-gray-500"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-white">Proposal Tasks</h2>
            <span className="text-sm text-gray-400">({tasks.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-gray-400 text-center py-8">Loading tasks...</p>
          ) : tasks.length === 0 && !showAddGeneral ? (
            <div className="text-center py-12">
              <ListChecks className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No tasks yet</p>
              <p className="text-xs text-gray-500 mt-1">
                Tasks are created automatically when items with labor are added.
                You can also add tasks manually.
              </p>
            </div>
          ) : (
            <>
              {/* Tasks grouped by line item */}
              {Object.entries(grouped).map(([itemId, itemTasks]) => {
                const desc = lineItemDescription(itemId);
                const isExpanded = expandedItems.has(itemId);

                return (
                  <div key={itemId} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleExpand(itemId)}
                        className="text-gray-400 hover:text-white"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <span className="text-sm font-medium text-gray-300 truncate flex-1">{desc}</span>
                      <span className="text-xs text-gray-500">({itemTasks.length})</span>
                      <button
                        onClick={() => {
                          setShowAddForItem(showAddForItem === itemId ? null : itemId);
                          setNewTaskLineItemId(itemId);
                        }}
                        className="text-blue-400 hover:text-blue-300 p-1"
                        title="Add task for this item"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="ml-6 space-y-2">
                        {itemTasks.map((task, index) => renderTask(task, itemTasks, index))}
                        {renderAddTaskForm(itemId)}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* General tasks (no line item) */}
              {(general.length > 0 || showAddGeneral) && (
                <div className="space-y-2 pt-2 border-t border-gray-700">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">General Tasks</span>
                    <span className="text-xs text-gray-500">({general.length})</span>
                  </div>
                  <div className="ml-6 space-y-2">
                    {general.map((task, index) => renderTask(task, general, index))}
                    {renderAddTaskForm(null)}
                  </div>
                </div>
              )}

              {/* Add general task button */}
              {!showAddGeneral && (
                <button
                  onClick={() => {
                    setShowAddGeneral(true);
                    setNewTaskLineItemId(null);
                  }}
                  className="w-full p-2 border border-dashed border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-900 hover:bg-opacity-20 transition-colors flex items-center justify-center gap-1.5 text-gray-400 hover:text-blue-400 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Add General Task
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
