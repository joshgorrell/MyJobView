import React, { useState } from 'react';
import { LayoutDashboard, Map, Shield, History, Settings as SettingsIcon } from 'lucide-react';
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
  const [showTaxRateSettings, setShowTaxRateSettings] = useState(false);

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
            onClick={() => { setActiveTab('states'); setSelectedState(null); setShowTaxRateSettings(false); }}
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
          showTaxRateSettings ? (
            <div className="space-y-4">
              <button
                onClick={() => setShowTaxRateSettings(false)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <Map className="w-4 h-4" />
                Back to States
              </button>
              <TaxRateManagement />
            </div>
          ) : selectedState ? (
            <StateLibraryBrowser
              selectedState={selectedState}
              onBack={() => setSelectedState(null)}
            />
          ) : (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => setShowTaxRateSettings(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4" />
                  Tax Rates & Settings
                </button>
              </div>
              <StateLibraryBrowser onStateClick={(code) => setSelectedState(code)} />
            </div>
          )
        )}
        {activeTab === 'exemptions' && <TaxExemptionManager />}
        {activeTab === 'history' && <SalesTaxHistory />}
      </div>
    </div>
  );
}
