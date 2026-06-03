import React, { useState } from 'react';
import { DailyClock } from './DailyClock';
import { TechnicianWorkCenter } from '../Production/TechnicianWorkCenter';
import { MyTimeView } from './MyTimeView';
import { Clock, Briefcase, Calendar, User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export function TechDashboard() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'clock' | 'jobs' | 'mytime'>('clock');

  return (
    <div className="space-y-4">
      {/* Welcome Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Welcome, {profile?.full_name?.split(' ')[0]}!</h1>
            <p className="text-gray-300">
              {profile?.employment_type === 'hourly' && 'Hourly Technician'}
              {profile?.employment_type === 'job_time' && 'Job-Time Technician'}
              {profile?.employment_type === 'salary' && 'Salaried Technician'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Rewards Points</div>
            <div className="text-3xl font-bold text-blue-600">{profile?.points_earned || 0}</div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          <button
            onClick={() => setActiveTab('clock')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'clock'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Clock className="w-4 h-4" />
            Daily Clock
          </button>
          <button
            onClick={() => setActiveTab('jobs')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'jobs'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            My Jobs
          </button>
          <button
            onClick={() => setActiveTab('mytime')}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'mytime'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            My Time
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'clock' && <DailyClock />}
        {activeTab === 'jobs' && <TechnicianWorkCenter />}
        {activeTab === 'mytime' && <MyTimeView />}
      </div>
    </div>
  );
}
