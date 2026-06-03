import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, GripVertical } from 'lucide-react';

interface Task {
  id?: string;
  title: string;
  description: string;
  estimated_hours: number;
}

interface ServiceWorkOrderTaskManagerProps {
  workOrderId?: string;
  workOrderGroupId?: string;
  isGroupWorkOrder?: boolean;
  onTasksChange?: () => void;
}

export default function ServiceWorkOrderTaskManager({
  workOrderId,
  workOrderGroupId,
  isGroupWorkOrder,
  onTasksChange
}: ServiceWorkOrderTaskManagerProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState<Task>({
    title: '',
    description: '',
    estimated_hours: 0
  });

  useEffect(() => {
    if (workOrderId) {
      loadTasks();
    }
  }, [workOrderId]);

  async function loadTasks() {
    if (!workOrderId) return;

    const { data, error } = await supabase
      .from('work_order_tasks')
      .select('*')
      .eq('work_order_id', workOrderId)
      .order('sort_order');

    if (!error && data) {
      setTasks(data);
    }
  }

  async function handleAddTask() {
    if (!newTask.title.trim() || !workOrderId) return;

    const { error } = await supabase
      .from('work_order_tasks')
      .insert({
        work_order_id: workOrderId,
        title: newTask.title,
        description: newTask.description,
        estimated_hours: newTask.estimated_hours,
        status: 'pending',
        sort_order: tasks.length,
        shared_task: isGroupWorkOrder || false
      });

    if (!error) {
      setNewTask({ title: '', description: '', estimated_hours: 0 });
      setShowAddTask(false);
      loadTasks();
      onTasksChange?.();
    }
  }

  async function handleDeleteTask(taskId: string) {
    const { error } = await supabase
      .from('work_order_tasks')
      .delete()
      .eq('id', taskId);

    if (!error) {
      loadTasks();
      onTasksChange?.();
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-gray-700">Tasks (Optional)</h4>
        {workOrderId && (
          <button
            onClick={() => setShowAddTask(!showAddTask)}
            className="flex items-center gap-1 px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
          >
            {showAddTask ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddTask ? 'Cancel' : 'Add Task'}
          </button>
        )}
      </div>

      {showAddTask && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <input
            type="text"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            placeholder="Task title"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <textarea
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            placeholder="Task description (optional)"
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <div className="flex gap-2">
            <input
              type="number"
              step="0.5"
              min="0"
              value={newTask.estimated_hours || ''}
              onChange={(e) => setNewTask({ ...newTask, estimated_hours: parseFloat(e.target.value) || 0 })}
              placeholder="Est. hours"
              className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            <button
              onClick={handleAddTask}
              disabled={!newTask.title.trim()}
              className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Add Task
            </button>
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="space-y-2">
          {tasks.map((task, index) => (
            <div
              key={task.id}
              className="flex items-start gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg"
            >
              <GripVertical className="w-4 h-4 text-gray-400 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{task.title}</p>
                {task.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{task.description}</p>
                )}
                {task.estimated_hours > 0 && (
                  <p className="text-xs text-gray-500 mt-0.5">{task.estimated_hours}h estimated</p>
                )}
              </div>
              <button
                onClick={() => task.id && handleDeleteTask(task.id)}
                className="p-1 hover:bg-gray-200 rounded"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!showAddTask && tasks.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No tasks added. Tasks are optional - sometimes just a description is enough.
        </p>
      )}

      {isGroupWorkOrder && tasks.length > 0 && (
        <p className="text-xs text-blue-600">
          These tasks are shared across all technicians assigned to this work order group.
        </p>
      )}
    </div>
  );
}
