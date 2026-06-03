import React, { useState } from 'react';
import { RefreshCw, DollarSign, Users, Calendar, TrendingUp, TrendingDown } from 'lucide-react';
import RecurringPlans from './RecurringPlans';
import SubscriptionsList from './SubscriptionsList';
import RecurringInvoiceHistory from './RecurringInvoiceHistory';
import RecurringDashboard from './RecurringDashboard';
import { CancellationsAnalytics } from './CancellationsAnalytics';

type TabType = 'dashboard' | 'vip' | 'security' | 'history' | 'cancellations';

export default function RecurView() {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const tabs: { id: TabType; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
    { id: 'vip', label: 'VIP Plans', icon: DollarSign },
    { id: 'security', label: 'Security', icon: Users },
    { id: 'history', label: 'Billing History', icon: Calendar },
    { id: 'cancellations', label: 'Cancellations', icon: TrendingDown },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2 sm:gap-3 mb-4">
          <RefreshCw className="text-blue-400 flex-shrink-0" size={24} />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Recurring Billing</h1>
            <p className="text-gray-400 text-xs sm:text-sm hidden sm:block">Manage subscriptions and recurring revenue</p>
          </div>
        </div>

        <div className="flex gap-1 sm:gap-2 border-b border-gray-700 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 border-b-2 transition-colors whitespace-nowrap text-sm sm:text-base ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                <Icon size={16} className="sm:w-[18px] sm:h-[18px]" />
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'dashboard' && <RecurringDashboard />}
        {activeTab === 'vip' && <RecurringPlans planType="vip_plan" />}
        {activeTab === 'security' && <SubscriptionsList planType="security_contract" />}
        {activeTab === 'history' && <RecurringInvoiceHistory />}
        {activeTab === 'cancellations' && (
          <div className="p-4 sm:p-6">
            <CancellationsAnalytics />
          </div>
        )}
      </div>
    </div>
  );
}
