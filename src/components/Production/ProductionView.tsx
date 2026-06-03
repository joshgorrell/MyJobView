import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { WorkOrdersList } from './WorkOrdersList';
import { WorkOrderDetail } from './WorkOrderDetail';
import { ChangeOrdersView } from './ChangeOrdersView';
import { TechnicianWorkCenter } from './TechnicianWorkCenter';
import { VIPProgramView } from './VIPProgramView';
import { ProductionManagerDashboard } from './ProductionManagerDashboard';
import { PartsRequestQueue } from './PartsRequestQueue';
import { QuickStatsBar } from './QuickStatsBar';
import {
  ClipboardList,
  FileEdit,
  Package,
  CheckSquare,
  Wrench,
  Star,
  LayoutDashboard,
  ShoppingCart,
  Award
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface ProductionViewProps {
  initialView?: string;
}

interface TabBadges {
  partsQueue: number;
  myWork: number;
}

export function ProductionView({ initialView }: ProductionViewProps) {
  const { profile } = useAuth();
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);
  const [badges, setBadges] = useState<TabBadges>({
    partsQueue: 0,
    myWork: 0
  });

  const isTech = profile?.role === 'technician' || profile?.role === 'field_tech' || profile?.role === 'lead_technician';
  const isManager = profile?.role === 'admin' || profile?.role === 'office_manager' || profile?.role === 'production_manager';
  const isDispatcher = profile?.role === 'dispatcher';
  const isProjectManager = profile?.role === 'project_manager';

  const defaultView = isTech ? 'my_work' : isManager ? 'dashboard' : 'work_orders';
  const [activeView, setActiveView] = useState(initialView || defaultView);

  useEffect(() => {
    loadBadges();

    const channel = supabase
      .channel('production-badges')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'parts_requests'
      }, loadBadges)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_orders'
      }, loadBadges)
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [profile?.id]);

  async function loadBadges() {
    try {
      const queries = [];

      queries.push(
        supabase
          .from('parts_requests')
          .select('id')
          .eq('status', 'pending')
      );

      if (isTech) {
        queries.push(
          supabase
            .from('work_orders')
            .select('id')
            .eq('assigned_to', profile?.id)
            .in('status', ['assigned', 'in_progress'])
        );
      }

      const results = await Promise.all(queries);

      setBadges({
        partsQueue: results[0].data?.length || 0,
        myWork: results[1]?.data?.length || 0
      });
    } catch (error) {
      console.error('Error loading badges:', error);
    }
  }

  const views = [
    {
      id: 'dashboard',
      name: 'Dashboard',
      icon: LayoutDashboard,
      show: isManager || isDispatcher,
      badge: 0
    },
    {
      id: 'my_work',
      name: 'My Work',
      icon: Wrench,
      show: isTech,
      badge: badges.myWork
    },
    {
      id: 'work_orders',
      name: 'Work Orders',
      icon: ClipboardList,
      show: true,
      badge: 0
    },
    {
      id: 'parts_queue',
      name: 'Parts Queue',
      icon: ShoppingCart,
      show: isManager || isDispatcher || isProjectManager,
      badge: badges.partsQueue
    },
    {
      id: 'change_orders',
      name: 'Change Orders',
      icon: FileEdit,
      show: !isTech,
      badge: 0
    },
    {
      id: 'materials',
      name: 'Materials',
      icon: Package,
      show: !isTech,
      badge: 0
    },
    {
      id: 'punch_lists',
      name: 'Punch Lists',
      icon: CheckSquare,
      show: !isTech,
      badge: 0
    },
    {
      id: 'vip_program',
      name: 'VIP 90-Day',
      icon: Star,
      show: true,
      badge: 0
    }
  ].filter(view => view.show);

  return (
    <div className="h-full flex flex-col">
      {/* Navigation Tabs */}
      {!selectedWorkOrderId && (
        <div className="border-b border-gray-200 bg-white">
          <div className="px-6">
            <nav className="flex gap-1 overflow-x-auto">
              {views.map(view => {
                const Icon = view.icon;
                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveView(view.id)}
                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap relative ${
                      activeView === view.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {view.name}
                    {view.badge > 0 && (
                      <span className="absolute -top-1 -right-1 px-2 py-0.5 bg-orange-500 text-white text-xs font-bold rounded-full min-w-[1.25rem] text-center">
                        {view.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Active View Content */}
      <div className="flex-1 overflow-auto">
        {selectedWorkOrderId ? (
          <div className="p-6">
            <WorkOrderDetail
              workOrderId={selectedWorkOrderId}
              onBack={() => setSelectedWorkOrderId(null)}
            />
          </div>
        ) : (
          <div className="p-6">
            {activeView === 'dashboard' && <ProductionManagerDashboard />}
            {activeView === 'my_work' && <TechnicianWorkCenter />}
            {activeView === 'work_orders' && (
              <WorkOrdersList onSelectWorkOrder={setSelectedWorkOrderId} />
            )}
            {activeView === 'parts_queue' && <PartsRequestQueue />}
            {activeView === 'change_orders' && <ChangeOrdersView />}
            {activeView === 'materials' && (
              <div className="text-center text-gray-500 py-12">
                <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Materials Tracking
                </h3>
                <p className="text-gray-300">Coming soon</p>
              </div>
            )}
            {activeView === 'punch_lists' && (
              <div className="text-center text-gray-500 py-12">
                <CheckSquare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Punch Lists
                </h3>
                <p className="text-gray-300">Coming soon</p>
              </div>
            )}
            {activeView === 'vip_program' && <VIPProgramView />}
          </div>
        )}
      </div>
    </div>
  );
}
