import React, { useState, lazy, Suspense } from 'react';
import { LayoutDashboard, Map, Shield, History } from 'lucide-react';
import TaxRateManagement from './TaxRateManagement';
import TaxExemptionManager from './TaxExemptionManager';
import SalesTaxOverview from './SalesTaxOverview';
import StateLibraryBrowser from './StateLibraryBrowser';
import SalesTaxHistory from './SalesTaxHistory';

type TabType = 'overview' | 'states' | 'exemptions' | 'history';

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center gap-2 whitespace-nowrap transition-colors ${
        active
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );
}

export default function SalesTaxManagement() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedState, setSelectedState] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="no-print">
        <h1 className="text-3xl font-bold text-gray-900">Sales Tax Management</h1>
        <p className="text-gray-600 mt-1">
          Manage tax rates, state rules, exemptions, and calculation history
        </p>
      </div>

      <div className="border-b border-gray-200 no-print">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          <TabButton
            active={activeTab === 'overview'}
            onClick={() => setActiveTab('overview')}
            icon={LayoutDashboard}
            label="Overview"
          />
          <TabButton
            active={activeTab === 'states'}
            onClick={() => { setActiveTab('states'); setSelectedState(null); }}
            icon={Map}
            label="States"
          />
          <TabButton
            active={activeTab === 'exemptions'}
            onClick={() => setActiveTab('exemptions')}
            icon={Shield}
            label="Exemptions"
          />
          <TabButton
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            icon={History}
            label="History"
          />
        </nav>
      </div>

      <div>
        {activeTab === 'overview' && <SalesTaxOverview onNavigate={setActiveTab} />}
        {activeTab === 'states' && (
          selectedState ? (
            <StateLibraryBrowser
              selectedState={selectedState}
              onBack={() => setSelectedState(null)}
            />
          ) : (
            <StateLibraryBrowser onStateClick={(code) => setSelectedState(code)} />
          )
        )}
        {activeTab === 'exemptions' && <TaxExemptionManager />}
        {activeTab === 'history' && <SalesTaxHistory />}
      </div>
    </div>
  );
}
