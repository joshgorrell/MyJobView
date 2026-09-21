import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Search, ChevronLeft, BookOpen, Settings, CheckCircle, AlertTriangle, Circle, ArrowLeft } from 'lucide-react';
import StateDetailPanel from './StateDetailPanel';

interface StateIndexRow {
  state_code: string;
  state_name: string;
  library_status: 'verified' | 'needs_review' | 'not_researched';
}

interface NexusRow {
  state: string;
  nexus_status: string;
}

interface Props {
  selectedState?: string | null;
  onStateClick?: (code: string) => void;
  onBack?: () => void;
}

export default function StateLibraryBrowser({ selectedState, onStateClick, onBack }: Props) {
  const [states, setStates] = useState<StateIndexRow[]>([]);
  const [nexusMap, setNexusMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [statesRes, nexusRes] = await Promise.all([
        supabase.from('state_library_index').select('state_code, state_name, library_status').order('state_code'),
        supabase.from('dealer_nexus_states').select('state, nexus_status').eq('is_current', true),
      ]);

      if (statesRes.error) throw statesRes.error;
      if (nexusRes.error) throw nexusRes.error;

      setStates(statesRes.data || []);
      const map: Record<string, string> = {};
      for (const n of nexusRes.data || []) {
        map[n.state] = n.nexus_status;
      }
      setNexusMap(map);
    } catch (error) {
      console.error('Error loading state library:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (selectedState) {
    const stateInfo = states.find(s => s.state_code === selectedState);
    return (
      <StateDetailPanel
        stateCode={selectedState}
        stateName={stateInfo?.state_name || selectedState}
        libraryStatus={stateInfo?.library_status || 'not_researched'}
        nexusStatus={nexusMap[selectedState]}
        onBack={onBack || (() => {})}
      />
    );
  }

  const filtered = states.filter(s =>
    search === '' ||
    s.state_name.toLowerCase().includes(search.toLowerCase()) ||
    s.state_code.toLowerCase().includes(search.toLowerCase())
  );

  function getCollectionBadge(status: string | undefined) {
    if (!status) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
          Not Configured
        </span>
      );
    }
    if (status === 'yes') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          Collecting
        </span>
      );
    }
    if (status === 'no') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          Not Collecting
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        Unknown
      </span>
    );
  }

  function getLibraryBadge(status: string) {
    switch (status) {
      case 'verified':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" /> Verified
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <AlertTriangle className="w-3 h-3" /> Needs Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            <Circle className="w-3 h-3" /> Not Researched
          </span>
        );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">State Tax Library</h2>
          <p className="text-sm text-gray-600 mt-1">
            All 50 states and their MJV rule library status
          </p>
        </div>
        <div className="relative w-64">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search states..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Collection Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MJV Rule Library</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.map((s) => (
                <tr
                  key={s.state_code}
                  onClick={() => onStateClick?.(s.state_code)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center w-10 h-7 rounded text-xs font-bold bg-gray-100 text-gray-700">
                        {s.state_code}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{s.state_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-3">{getCollectionBadge(nexusMap[s.state_code])}</td>
                  <td className="px-6 py-3">{getLibraryBadge(s.library_status)}</td>
                  <td className="px-6 py-3 text-right">
                    <ArrowLeft className="w-4 h-4 text-gray-400 rotate-180" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
