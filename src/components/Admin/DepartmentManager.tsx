import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Layers, Plus, Edit2, Save, X, GripVertical, ChevronDown, ChevronRight, Eye, EyeOff, Package } from 'lucide-react';
import { getIcon } from '../../lib/iconMap';

const AVAILABLE_ICONS = [
  'Activity', 'Award', 'BarChart3', 'BookOpen', 'Briefcase', 'Building2',
  'Calendar', 'CheckSquare', 'CreditCard', 'DollarSign', 'FileSpreadsheet',
  'FileText', 'Fish', 'Flag', 'FolderKanban', 'Lightbulb', 'Mail',
  'MapPin', 'MessageCircle', 'Package', 'RefreshCw', 'Settings',
  'Shield', 'TrendingUp', 'User', 'Users', 'Warehouse', 'Wrench'
];

interface Department {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
}

interface DepartmentModule {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  parent_module_id: string | null;
  children?: DepartmentModule[];
}

interface DepartmentWithModules extends Department {
  modules: DepartmentModule[];
}

export function DepartmentManager() {
  const [departments, setDepartments] = useState<DepartmentWithModules[]>([]);
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [editingModule, setEditingModule] = useState<DepartmentModule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    display_name: '',
    module_key: '',
    icon: 'Package',
    description: '',
    sort_order: 10,
    is_active: true,
    parent_module_id: null as string | null,
    department_id: ''
  });

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      const { data: depts, error: deptsError } = await supabase
        .from('departments')
        .select('*')
        .order('sort_order');

      if (deptsError) throw deptsError;

      const { data: modules, error: modulesError } = await supabase
        .from('department_modules')
        .select('*')
        .order('sort_order');

      if (modulesError) throw modulesError;

      const deptsWithModules = (depts || []).map(dept => {
        const deptModules = (modules || []).filter(m => m.department_id === dept.id);

        const modulesMap = new Map<string, DepartmentModule>();
        deptModules.forEach(mod => {
          modulesMap.set(mod.id, { ...mod, children: [] });
        });

        const rootModules: DepartmentModule[] = [];
        modulesMap.forEach(mod => {
          if (mod.parent_module_id && modulesMap.has(mod.parent_module_id)) {
            const parent = modulesMap.get(mod.parent_module_id)!;
            if (!parent.children) parent.children = [];
            parent.children.push(mod);
          } else if (!mod.parent_module_id) {
            rootModules.push(mod);
          }
        });

        rootModules.forEach(mod => {
          if (mod.children) {
            mod.children.sort((a, b) => a.sort_order - b.sort_order);
          }
        });

        return {
          ...dept,
          modules: rootModules
        };
      });

      setDepartments(deptsWithModules);
      setExpandedDepts(new Set(deptsWithModules.map(d => d.id)));
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDepartment = (deptId: string) => {
    const newExpanded = new Set(expandedDepts);
    if (newExpanded.has(deptId)) {
      newExpanded.delete(deptId);
    } else {
      newExpanded.add(deptId);
    }
    setExpandedDepts(newExpanded);
  };

  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const handleCreate = (departmentId: string) => {
    const dept = departments.find(d => d.id === departmentId);
    const maxOrder = Math.max(0, ...(dept?.modules.map(m => m.sort_order) || [0]));

    setFormData({
      display_name: '',
      module_key: '',
      icon: 'Package',
      description: '',
      sort_order: maxOrder + 10,
      is_active: true,
      parent_module_id: null,
      department_id: departmentId
    });
    setIsCreating(true);
    setEditingModule(null);
  };

  const handleEdit = (module: DepartmentModule) => {
    setFormData({
      display_name: module.display_name,
      module_key: module.module_key,
      icon: module.icon,
      description: module.description || '',
      sort_order: module.sort_order,
      is_active: module.is_active,
      parent_module_id: module.parent_module_id,
      department_id: module.department_id
    });
    setEditingModule(module);
    setIsCreating(false);
  };

  const handleSave = async () => {
    try {
      const moduleData = {
        display_name: formData.display_name,
        module_key: formData.module_key,
        icon: formData.icon,
        description: formData.description || null,
        sort_order: formData.sort_order,
        is_active: formData.is_active,
        parent_module_id: formData.parent_module_id,
        department_id: formData.department_id
      };

      if (editingModule) {
        const { error } = await supabase
          .from('department_modules')
          .update(moduleData)
          .eq('id', editingModule.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('department_modules')
          .insert([moduleData]);

        if (error) throw error;
      }

      await loadDepartments();
      setEditingModule(null);
      setIsCreating(false);
    } catch (error) {
      console.error('Error saving module:', error);
      alert('Failed to save module');
    }
  };

  const handleToggleActive = async (module: DepartmentModule) => {
    try {
      const { error } = await supabase
        .from('department_modules')
        .update({ is_active: !module.is_active })
        .eq('id', module.id);

      if (error) throw error;
      await loadDepartments();
    } catch (error) {
      console.error('Error toggling module:', error);
    }
  };

  const renderIcon = (iconName: string) => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className="w-4 h-4" /> : <Package className="w-4 h-4" />;
  };

  const renderModule = (module: DepartmentModule, depth: number = 0) => {
    const hasChildren = module.children && module.children.length > 0;
    const isExpanded = expandedModules.has(module.id);

    return (
      <div key={module.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded border border-gray-200 mb-2"
          style={{ marginLeft: `${depth * 24}px` }}
        >
          <GripVertical className="w-4 h-4 text-gray-400 cursor-move" />

          {hasChildren && (
            <button
              onClick={() => toggleModule(module.id)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          )}

          <div className="flex items-center gap-2 flex-1">
            <div className={`${module.is_active ? 'text-blue-600' : 'text-gray-400'}`}>
              {renderIcon(module.icon)}
            </div>
            <span className={`font-medium ${module.is_active ? 'text-gray-900' : 'text-gray-400'}`}>
              {module.display_name}
            </span>
            <span className="text-xs text-gray-500">({module.module_key})</span>
            <span className="text-xs text-gray-500">Order: {module.sort_order}</span>
            {!module.is_active && (
              <EyeOff className="w-4 h-4 text-gray-400" />
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleToggleActive(module)}
              className={`p-1.5 rounded ${module.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
              title={module.is_active ? 'Disable' : 'Enable'}
            >
              {module.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => handleEdit(module)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            >
              <Edit2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {module.children!.map(child => renderModule(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-600">Loading departments...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Department Manager</h3>
          <p className="text-sm text-gray-600">Organize modules within departments</p>
        </div>
      </div>

      <div className="space-y-4">
        {departments.map(dept => {
          const isDeptExpanded = expandedDepts.has(dept.id);

          return (
            <div key={dept.id} className="bg-white rounded-lg border-2 border-gray-200">
              <div className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200">
                <button
                  onClick={() => toggleDepartment(dept.id)}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  {isDeptExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                  <div className="text-blue-600">
                    {renderIcon(dept.icon)}
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900">{dept.display_name}</h4>
                    <p className="text-xs text-gray-500">{dept.description}</p>
                  </div>
                  <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded ml-auto">
                    {dept.modules.length} modules
                  </span>
                </button>
                <button
                  onClick={() => handleCreate(dept.id)}
                  className="ml-4 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  Add Module
                </button>
              </div>

              {isDeptExpanded && (
                <div className="p-4">
                  {dept.modules.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No modules in this department</div>
                  ) : (
                    <div>
                      {dept.modules.map(module => renderModule(module))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {(isCreating || editingModule) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {isCreating ? 'Create Module' : 'Edit Module'}
              </h3>
              <button
                onClick={() => { setIsCreating(false); setEditingModule(null); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="My Module"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Module Key (unique identifier)</label>
                <input
                  type="text"
                  value={formData.module_key}
                  onChange={(e) => setFormData({ ...formData, module_key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="my_module"
                  disabled={!!editingModule}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => setFormData({ ...formData, department_id: e.target.value, parent_module_id: null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select Department</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.display_name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
                  <select
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {AVAILABLE_ICONS.map(icon => (
                      <option key={icon} value={icon}>{icon}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Brief description of this module"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Module (optional)</label>
                <select
                  value={formData.parent_module_id || ''}
                  onChange={(e) => setFormData({ ...formData, parent_module_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">None (Top Level)</option>
                  {departments.find(d => d.id === formData.department_id)?.modules
                    .filter(m => !m.parent_module_id && m.id !== editingModule?.id)
                    .map(mod => (
                      <option key={mod.id} value={mod.id}>{mod.display_name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm font-medium text-gray-700">Active</span>
                </label>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => { setIsCreating(false); setEditingModule(null); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Save className="w-4 h-4" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
