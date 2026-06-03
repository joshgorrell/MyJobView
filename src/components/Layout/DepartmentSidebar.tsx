import { getIcon } from '../../lib/iconMap';
import { Menu, ChevronDown, ChevronRight, Star, X, Search, ChevronsDownUp, ChevronsUpDown, Pin } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useToast } from '../Shared/Toast';
import { useTaskCount } from '../../hooks/useTaskCount';
import { useFishbowlCount } from '../../hooks/useFishbowlCount';
import { useNoContactCount } from '../../hooks/useNoContactCount';
import { usePunchlistUnseenCount } from '../../hooks/usePunchlistUnseenCount';

interface DepartmentSidebarProps {
  activeModule: string;
  onModuleChange: (moduleKey: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  isPinned?: boolean;
  onPinToggle?: () => void;
}

export function DepartmentSidebar({ activeModule, onModuleChange, isOpen: externalIsOpen, onToggle, isPinned = false, onPinToggle }: DepartmentSidebarProps) {
  const toast = useToast();
  const { mainDepartments, footerDepartments, getUserModules, starredModules, starModule, unstarModule, loading } = useDepartments();
  const taskCount = useTaskCount();
  const fishbowlCount = useFishbowlCount();
  const noContactCount = useNoContactCount();
  const punchlistUnseenCount = usePunchlistUnseenCount();
  const [internalIsOpen, setInternalIsOpen] = useState(() => {
    const saved = localStorage.getItem('departmentSidebarOpen');
    return saved !== null ? saved === 'true' : false;
  });

  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;
  const [expandedDepartments, setExpandedDepartments] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('expandedDepartments');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (externalIsOpen === undefined) {
      localStorage.setItem('departmentSidebarOpen', internalIsOpen.toString());
    }
  }, [internalIsOpen, externalIsOpen]);

  const toggleSidebar = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen(!internalIsOpen);
    }
  };

  useEffect(() => {
    localStorage.setItem('expandedDepartments', JSON.stringify([...expandedDepartments]));
  }, [expandedDepartments]);

  useEffect(() => {
    const allDepts = [...mainDepartments, ...footerDepartments];
    allDepts.forEach(dept => {
      const modules = getUserModules(dept.id);
      if (modules.some(m => m.module_key === activeModule)) {
        setExpandedDepartments(prev => new Set(prev).add(dept.id));
      }
    });
  }, [activeModule, mainDepartments, footerDepartments]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isPinned) return;
      if (isOpen && sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-sidebar-toggle]')) {
          if (onToggle) {
            onToggle();
          } else {
            setInternalIsOpen(false);
          }
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onToggle, isPinned]);

  const renderIcon = (iconName: string, className: string = "w-4 h-4") => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className={className} /> : <Menu className={className} />;
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

  const handleModuleClick = (moduleKey: string) => {
    // TV Dashboard should open in a new window for full-screen display
    if (moduleKey === 'tv_dashboard') {
      window.open('/tv-dashboard', '_blank', 'fullscreen=yes,width=1920,height=1080');
      if (!isPinned) {
        if (onToggle) {
          onToggle();
        } else {
          setInternalIsOpen(false);
        }
      }
      return;
    }

    onModuleChange(moduleKey);
    // Only close sidebar after selection if not pinned
    if (!isPinned) {
      if (onToggle) {
        onToggle();
      } else {
        setInternalIsOpen(false);
      }
    }
  };

  const handleStarToggle = async (e: React.MouseEvent, moduleId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const isStarred = starredModules.some(sm => sm.id === moduleId);

    try {
      if (isStarred) {
        await unstarModule(moduleId);
      } else {
        await starModule(moduleId);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to update starred modules');
    }
  };

  const isModuleStarred = (moduleId: string) => {
    return starredModules.some(sm => sm.id === moduleId);
  };

  const filterModules = (modules: any[]) => {
    if (!searchQuery.trim()) return modules;
    const query = searchQuery.toLowerCase();
    return modules.filter(m =>
      m.display_name.toLowerCase().includes(query) ||
      m.module_key.toLowerCase().includes(query) ||
      (m.description && m.description.toLowerCase().includes(query))
    );
  };

  const allDepartments = [...mainDepartments, ...footerDepartments];
  const filteredDepartments = allDepartments.map(dept => ({
    ...dept,
    modules: filterModules(getUserModules(dept.id))
  })).filter(dept => dept.modules.length > 0 || !searchQuery.trim());

  const allExpanded = filteredDepartments.length > 0 && filteredDepartments.every(d => expandedDepartments.has(d.id));

  const toggleAllDepartments = () => {
    if (allExpanded) {
      setExpandedDepartments(new Set());
    } else {
      setExpandedDepartments(new Set(filteredDepartments.map(d => d.id)));
    }
  };

  // Auto-expand departments with matching modules when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const deptIdsWithMatches = filteredDepartments
        .filter(dept => dept.modules.length > 0)
        .map(dept => dept.id);
      setExpandedDepartments(new Set(deptIdsWithMatches));
    }
  }, [searchQuery, filteredDepartments]);

  if (loading) {
    return null;
  }

  return (
    <>
      {isOpen && !isPinned && (
        <div
          className="fixed inset-0 bg-black/50 z-30 backdrop-blur-sm"
          onClick={toggleSidebar}
        />
      )}

      <aside
        ref={sidebarRef}
        className={`fixed top-16 left-0 h-[calc(100vh-4rem)] bg-gray-900 border-r border-gray-700 transition-transform duration-300 ease-in-out w-64 overflow-hidden shadow-2xl ${
          isPinned ? 'z-20' : 'z-40'
        } ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Departments</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleAllDepartments}
                className="p-1 hover:bg-gray-800 rounded transition-colors"
                title={allExpanded ? 'Collapse all' : 'Expand all'}
              >
                {allExpanded
                  ? <ChevronsDownUp className="w-3.5 h-3.5 text-gray-400" />
                  : <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
                }
              </button>
              {onPinToggle && (
                <button
                  onClick={onPinToggle}
                  className={`p-1 rounded transition-colors hidden sm:flex items-center justify-center ${
                    isPinned
                      ? 'text-blue-400 hover:bg-blue-500/20'
                      : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
                  }`}
                  title={isPinned ? 'Unpin menu (auto-hide)' : 'Pin menu (always visible)'}
                >
                  {isPinned
                    ? <Pin className="w-3.5 h-3.5 fill-current" />
                    : <Pin className="w-3.5 h-3.5" />
                  }
                </button>
              )}
              {!isPinned && (
                <button
                  onClick={toggleSidebar}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                  title="Close menu"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              )}
            </div>
          </div>

          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder="Search modules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredDepartments.map((dept) => {
              const modules = dept.modules;
              const isExpanded = expandedDepartments.has(dept.id);
              const hasActiveModule = modules.some(m => m.module_key === activeModule);

              return (
                <div key={dept.id}>
                  <button
                    onClick={() => toggleDepartment(dept.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                      hasActiveModule
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                    }`}
                    title={dept.description}
                  >
                    {modules.length > 0 && (
                      <ChevronRight className={`w-4 h-4 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`} />
                    )}
                    {modules.length === 0 && <div className="w-4" />}
                    {renderIcon(dept.icon, "w-4 h-4 flex-shrink-0")}
                    <span className="text-sm font-medium truncate flex-1 text-left">{dept.display_name}</span>
                    <span className="text-xs bg-gray-800 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">
                      {modules.length}
                    </span>
                  </button>

                  {isExpanded && modules.length > 0 && (
                    <div className="ml-4 mt-1 space-y-0.5">
                      {modules.map((module) => {
                        const starred = isModuleStarred(module.id);
                        const isActive = activeModule === module.module_key;

                        return (
                          <div
                            key={module.id}
                            className={`flex items-center group rounded-lg ${
                              isActive
                                ? 'bg-blue-500/20'
                                : 'hover:bg-gray-800'
                            }`}
                          >
                            <button
                              onClick={() => handleModuleClick(module.module_key)}
                              className={`flex-1 flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                                isActive
                                  ? 'text-blue-400'
                                  : 'text-gray-400 group-hover:text-gray-200'
                              }`}
                              title={module.description || ''}
                            >
                              {renderIcon(module.icon, "w-4 h-4 flex-shrink-0")}
                              <span className="text-sm truncate flex-1">{module.display_name}</span>
                              {module.module_key === 'tasks' && taskCount > 0 && (
                                <span className="flex items-center justify-center min-w-[18px] h-4 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex-shrink-0">
                                  {taskCount > 99 ? '99+' : taskCount}
                                </span>
                              )}
                              {module.module_key === 'fishbowl' && fishbowlCount > 0 && (
                                <span className="flex items-center justify-center min-w-[18px] h-4 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex-shrink-0">
                                  {fishbowlCount > 99 ? '99+' : fishbowlCount}
                                </span>
                              )}
                              {module.module_key === 'punchlist' && punchlistUnseenCount > 0 && (
                                <span className="flex items-center justify-center min-w-[18px] h-4 px-1 bg-red-500 text-white text-xs font-bold rounded-full flex-shrink-0">
                                  {punchlistUnseenCount > 99 ? '99+' : punchlistUnseenCount}
                                </span>
                              )}
                              {(module.module_key === 'service_requests' || module.module_key === 'sales_service_requests') && noContactCount > 0 && (
                                <span className="flex items-center justify-center min-w-[18px] h-4 px-1 bg-amber-500 text-white text-xs font-bold rounded-full flex-shrink-0">
                                  {noContactCount > 99 ? '99+' : noContactCount}
                                </span>
                              )}
                            </button>
                            <button
                              onClick={(e) => handleStarToggle(e, module.id)}
                              className={`px-2 py-2 transition-colors flex-shrink-0 ${
                                starred
                                  ? 'text-yellow-400 hover:text-yellow-300'
                                  : 'text-gray-600 hover:text-yellow-400 opacity-0 group-hover:opacity-100'
                              }`}
                              title={starred ? 'Remove from Quick Access' : 'Add to Quick Access'}
                            >
                              <Star className={`w-3.5 h-3.5 ${starred ? 'fill-current' : ''}`} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {searchQuery.trim() && filteredDepartments.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No modules found
              </div>
            )}
          </nav>
        </div>
      </aside>
    </>
  );
}
