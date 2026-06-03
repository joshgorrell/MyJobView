import { getIcon } from '../../lib/iconMap';
import { Menu, ChevronDown, ChevronRight, Star } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useToast } from '../Shared/Toast';

interface DepartmentNavigationProps {
  activeModule: string;
  onModuleChange: (moduleKey: string) => void;
}

export function DepartmentNavigation({ activeModule, onModuleChange }: DepartmentNavigationProps) {
  const toast = useToast();
  const { mainDepartments, getUserModules, starredModules, starModule, unstarModule, loading } = useDepartments();
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(new Set());
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdown) {
        const dropdownEl = dropdownRefs.current.get(openDropdown);
        if (dropdownEl && !dropdownEl.contains(event.target as Node)) {
          // Clear any pending hover timeouts
          if (closeTimeoutRef.current) {
            clearTimeout(closeTimeoutRef.current);
            closeTimeoutRef.current = null;
          }
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [openDropdown]);

  // Auto-expand department containing active module
  useEffect(() => {
    mainDepartments.forEach(dept => {
      const modules = getUserModules(dept.id);
      if (modules.some(m => m.module_key === activeModule)) {
        setExpandedDepartments(prev => new Set(prev).add(dept.id));
      }
    });
  }, [activeModule, mainDepartments]);

  const renderIcon = (iconName: string, className: string = "w-4 h-4 sm:w-5 sm:h-5") => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className={className} /> : <Menu className={className} />;
  };

  const getColorClass = (isActive: boolean) => {
    return isActive
      ? 'text-blue-500 border-b-2 border-blue-500'
      : 'text-gray-400 hover:text-white';
  };

  const getBgColorClass = () => {
    return 'bg-blue-500/10 hover:bg-blue-500/20';
  };

  const getActiveTextColorClass = () => {
    return 'text-blue-500';
  };

  const toggleDepartment = (deptId: string) => {
    setExpandedDepartments(prev => {
      const next = new Set(prev);
      if (next.has(deptId)) {
        next.delete(deptId);
      } else {
        next.add(deptId);
      }
      return next;
    });
  };

  const handleDepartmentClick = (dept: any) => {
    const modules = getUserModules(dept.id);
    if (modules.length > 0) {
      toggleDepartment(dept.id);
    }
  };

  const handleModuleClick = (moduleKey: string) => {
    onModuleChange(moduleKey);
    // Clear any pending hover timeouts
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    setOpenDropdown(null);
  };

  const handleStarToggle = async (e: React.MouseEvent, moduleId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isStarred = starredModules.some(sm => sm.id === moduleId);

    try {
      if (isStarred) {
        await unstarModule(moduleId);
      } else {
        // Let starModule auto-calculate the next available order
        await starModule(moduleId);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update starred modules');
    }
  };

  const handleMouseEnter = (deptId: string) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const modules = getUserModules(deptId);
    if (modules.length > 0) {
      setOpenDropdown(deptId);
    }
  };

  const handleMouseLeave = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 200);
  };

  const isModuleStarred = (moduleId: string) => {
    return starredModules.some(sm => sm.id === moduleId);
  };

  if (loading) {
    return <div className="text-gray-400 text-sm">Loading departments...</div>;
  }

  return (
    <nav className="hidden md:flex flex-wrap gap-2 sm:gap-4">
      {mainDepartments.map((dept) => {
        const modules = getUserModules(dept.id);
        const isExpanded = expandedDepartments.has(dept.id);
        const hasActiveModule = modules.some(m => m.module_key === activeModule);
        const isOpen = openDropdown === dept.id;

        return (
          <div
            key={dept.id}
            className="relative"
            onMouseEnter={() => handleMouseEnter(dept.id)}
            onMouseLeave={handleMouseLeave}
            ref={(el) => {
              if (el) dropdownRefs.current.set(dept.id, el);
              else dropdownRefs.current.delete(dept.id);
            }}
          >
            <button
              onClick={() => {
                if (modules.length > 0) {
                  setOpenDropdown(isOpen ? null : dept.id);
                }
              }}
              className={`px-3 sm:px-4 py-2 sm:py-3 font-medium transition-all relative whitespace-nowrap flex-shrink-0 rounded-t-lg ${getColorClass(hasActiveModule)}`}
              title={dept.description}
            >
              <div className="flex items-center gap-1 sm:gap-2">
                {renderIcon(dept.icon)}
                <span className="text-sm sm:text-base">{dept.display_name}</span>
                {modules.length > 0 && (
                  <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                )}
              </div>
            </button>

            {modules.length > 0 && isOpen && (
              <div className="absolute top-full left-0 mt-0 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 min-w-[240px] z-50 max-h-[calc(100vh-120px)] overflow-y-auto">
                {modules.map((module) => {
                  const starred = isModuleStarred(module.id);
                  return (
                    <div
                      key={module.id}
                      className={`flex items-center group ${
                        activeModule === module.module_key
                          ? `${getBgColorClass()}`
                          : 'hover:bg-gray-700'
                      }`}
                    >
                      <button
                        onClick={() => handleModuleClick(module.module_key)}
                        className={`flex-1 px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-3 ${
                          activeModule === module.module_key
                            ? getActiveTextColorClass()
                            : 'text-gray-300 group-hover:text-white'
                        }`}
                        title={module.description || ''}
                      >
                        {renderIcon(module.icon, "w-4 h-4")}
                        <span className="flex-1">{module.display_name}</span>
                      </button>
                      <button
                        onClick={(e) => handleStarToggle(e, module.id)}
                        className={`px-3 py-2.5 transition-colors ${
                          starred
                            ? 'text-yellow-400 hover:text-yellow-300'
                            : 'text-gray-500 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                        }`}
                        title={starred ? 'Remove from Quick Access' : 'Add to Quick Access'}
                      >
                        <Star className={`w-4 h-4 ${starred ? 'fill-current' : ''}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
