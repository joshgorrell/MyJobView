import { getIcon } from '../../lib/iconMap';
import { Menu, Star } from 'lucide-react';
import { useDepartments } from '../../contexts/DepartmentContext';
import { useTaskCount } from '../../hooks/useTaskCount';
import { useFishbowlCount } from '../../hooks/useFishbowlCount';

interface QuickAccessNavigationProps {
  activeModule: string;
  onModuleChange: (moduleKey: string) => void;
}

export function QuickAccessNavigation({ activeModule, onModuleChange }: QuickAccessNavigationProps) {
  const { starredModules, loading } = useDepartments();
  const taskCount = useTaskCount();
  const fishbowlCount = useFishbowlCount();

  const renderIcon = (iconName: string, className: string = "w-4 h-4 sm:w-5 sm:h-5") => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className={className} /> : <Menu className={className} />;
  };

  const getColorClass = (isActive: boolean) => {
    return isActive
      ? 'bg-blue-500/20 text-blue-500 border border-blue-500/50'
      : 'text-gray-400 bg-gray-800/20 border border-gray-700/30 hover:text-white hover:bg-gray-700/30';
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1 text-yellow-400">
        <Star className="w-4 h-4 fill-current" />
        <span className="text-xs font-semibold uppercase tracking-wider hidden lg:inline">Favorites</span>
      </div>
      <div className="h-6 w-px bg-gray-700 hidden lg:block"></div>

      {loading ? (
        <div className="text-gray-500 text-xs italic">Loading...</div>
      ) : starredModules.length === 0 ? (
        <div className="text-gray-500 text-xs italic">
          Click the <Star className="w-3 h-3 inline mx-1" /> on any menu item to add it here
        </div>
      ) : (
        <nav className="flex flex-wrap gap-2 sm:gap-3">
          {starredModules.map((module) => {
          const isActive = activeModule === module.module_key;

          const badgeCount =
            module.module_key === 'tasks' ? taskCount :
            module.module_key === 'fishbowl' ? fishbowlCount :
            0;
          const showBadge = badgeCount > 0;

          return (
            <button
              key={module.id}
              onClick={() => {
                // TV Dashboards should open in a new window for full-screen display
                if (module.module_key === 'tv_dashboard') {
                  window.open('/tv-dashboard', '_blank', 'fullscreen=yes,width=1920,height=1080');
                } else if (module.module_key === 'sales_tv_dashboard') {
                  window.open('/sales-tv-dashboard', '_blank', 'fullscreen=yes,width=1920,height=1080');
                } else {
                  onModuleChange(module.module_key);
                }
              }}
              className={`px-4 py-2 font-semibold transition-all relative whitespace-nowrap flex-shrink-0 rounded-lg ${getColorClass(isActive)}`}
              title={`${module.display_name} (${module.description || 'Quick access'})`}
            >
              <div className="flex items-center gap-2">
                {renderIcon(module.icon, "w-4 h-4")}
                <span className="text-sm font-semibold">{module.display_name}</span>
                {showBadge && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg">
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        </nav>
      )}
    </div>
  );
}
