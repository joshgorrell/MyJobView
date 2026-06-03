import React, { useState } from 'react';
import { DispatchScheduler } from './DispatchScheduler';
import { ScheduleListView } from './ScheduleListView';
import { ScheduleTimelineView } from './ScheduleTimelineView';
import { MobileTechView } from './MobileTechView';
import { CrewScheduleView } from './CrewScheduleView';
import { ResourceAvailabilityCalendar } from './ResourceAvailabilityCalendar';
import { TechMap } from './TechMap';
import { AppointmentsCalendar } from '../Appointments/AppointmentsCalendar';
import {
  Calendar,
  CalendarDays,
  List,
  GitBranch,
  Smartphone,
  Users,
  UserCheck,
  Map
} from 'lucide-react';

type ViewType =
  | 'scheduler'
  | 'calendar'
  | 'list'
  | 'timeline'
  | 'mobile'
  | 'crew'
  | 'availability'
  | 'map';

interface DispatchViewProps {
  initialView?: string;
}

export function DispatchView({ initialView = 'calendar' }: DispatchViewProps) {
  const [activeView, setActiveView] = useState<ViewType>((initialView as ViewType) || 'calendar');

  const views = [
    {
      id: 'calendar' as ViewType,
      name: 'Calendar',
      icon: CalendarDays,
      description: 'Google Calendar-style day, week, and month view'
    },
    {
      id: 'scheduler' as ViewType,
      name: 'Dispatch Scheduler',
      icon: Calendar,
      description: 'Multi-view scheduler with capacity tracking'
    },
    {
      id: 'list' as ViewType,
      name: 'List View',
      icon: List,
      description: 'Printable agenda and route planning'
    },
    {
      id: 'timeline' as ViewType,
      name: 'Timeline',
      icon: GitBranch,
      description: 'Gantt chart for multi-day jobs'
    },
    {
      id: 'crew' as ViewType,
      name: 'Crew Schedule',
      icon: Users,
      description: 'Team and group scheduling'
    },
    {
      id: 'availability' as ViewType,
      name: 'Availability',
      icon: UserCheck,
      description: 'PTO and resource calendar'
    },
    {
      id: 'map' as ViewType,
      name: 'Tech Map',
      icon: Map,
      description: 'GPS tracking and routing'
    },
    {
      id: 'mobile' as ViewType,
      name: 'Mobile View',
      icon: Smartphone,
      description: 'Tech field view (mobile optimized)'
    }
  ];

  function renderView() {
    switch (activeView) {
      case 'calendar':
        return <AppointmentsCalendar key="calendar" />;
      case 'scheduler':
        return <DispatchScheduler key="scheduler" />;
      case 'list':
        return <ScheduleListView key="list" />;
      case 'timeline':
        return <ScheduleTimelineView key="timeline" />;
      case 'mobile':
        return <MobileTechView key="mobile" />;
      case 'crew':
        return <CrewScheduleView key="crew" />;
      case 'availability':
        return <ResourceAvailabilityCalendar key="availability" />;
      case 'map':
        return <TechMap key="map" />;
      default:
        return <AppointmentsCalendar key="calendar" />;
    }
  }

  return (
    <div className="space-y-4">
      {/* View Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {views.map((view) => {
            const Icon = view.icon;
            const isActive = activeView === view.id;

            return (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
                title={view.description}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                <span className="text-xs font-medium text-center leading-tight">
                  {view.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active View */}
      {renderView()}
    </div>
  );
}
