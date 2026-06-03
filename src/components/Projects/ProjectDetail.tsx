import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ArrowLeft, FileText, Calendar, DollarSign, MessageSquare, Settings, CheckSquare, Clock, ClipboardList } from 'lucide-react';
import ProjectOverview from './ProjectOverview';
import ProjectScope from './ProjectScope';
import ProjectAppointments from './ProjectAppointments';
import ProjectInvoices from './ProjectInvoices';
import ProjectCommunication from './ProjectCommunication';
import ProjectTasksList from './ProjectTasksList';
import ProjectHistory from './ProjectHistory';
import ProjectActivityLog from './ProjectActivityLog';

interface ProjectDetailProps {
  projectId: string;
  onBack: () => void;
}

type TabType = 'overview' | 'scope' | 'tasks' | 'appointments' | 'invoices' | 'communication' | 'history' | 'activity_log';

export default function ProjectDetail({ projectId, onBack }: ProjectDetailProps) {
  const { profile } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('overview');

  useEffect(() => {
    loadProject();
  }, [projectId]);

  async function loadProject() {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('projects')
        .select(`
          *,
          contacts(*),
          sales_orders!projects_sales_order_id_fkey(*)
        `)
        .eq('id', projectId)
        .maybeSingle();

      if (error) throw error;

      setProject(data);
    } catch (error) {
      console.error('Error loading project:', error);
    } finally {
      setLoading(false);
    }
  }

  async function updateProject(updates: any) {
    try {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);

      if (error) throw error;

      setProject((prev: any) => ({ ...prev, ...updates }));
    } catch (error) {
      console.error('Error updating project:', error);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading project...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Project not found</div>
      </div>
    );
  }

  const canLogActivity =
    profile?.role === 'admin' ||
    profile?.role === 'manager' ||
    profile?.role === 'project_manager';

  const tabs = [
    { id: 'overview' as TabType, label: 'Overview', icon: FileText },
    { id: 'scope' as TabType, label: 'Scope', icon: FileText },
    { id: 'tasks' as TabType, label: 'Tasks', icon: CheckSquare },
    { id: 'appointments' as TabType, label: 'Appointments', icon: Calendar },
    { id: 'invoices' as TabType, label: 'Invoices', icon: DollarSign },
    { id: 'communication' as TabType, label: 'Messages', icon: MessageSquare },
    { id: 'history' as TabType, label: 'History', icon: Clock },
    { id: 'activity_log' as TabType, label: 'Activity Log', icon: ClipboardList },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4"
        >
          <ArrowLeft size={20} />
          Back to Projects
        </button>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">{project.name}</h1>
            <div className="flex items-center gap-4 text-sm text-gray-400 flex-wrap">
              <span>{project.project_number}</span>
              <span>•</span>
              <span>{project.contacts?.contact_name}</span>
              {project.profiles && (
                <>
                  <span>•</span>
                  <span>PM: {project.profiles.full_name}</span>
                </>
              )}
            </div>
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <select
              value={project.status}
              onChange={(e) => updateProject({ status: e.target.value })}
              className="px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="planning">Planning</option>
              <option value="active">Active</option>
              <option value="complete">Complete</option>
              <option value="closed">Closed</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4 border-b border-gray-700 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-gray-900 text-white border-t border-l border-r border-gray-700'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'overview' && (
          <ProjectOverview project={project} onUpdate={updateProject} onRefresh={loadProject} />
        )}
        {activeTab === 'scope' && <ProjectScope project={project} />}
        {activeTab === 'tasks' && (
          <div className="p-6">
            <ProjectTasksList
              projectId={projectId}
              canEdit={profile?.role === 'admin' || profile?.role === 'project_manager' || profile?.role === 'production_manager'}
            />
          </div>
        )}
        {activeTab === 'appointments' && <ProjectAppointments projectId={projectId} />}
        {activeTab === 'invoices' && <ProjectInvoices projectId={projectId} />}
        {activeTab === 'communication' && <ProjectCommunication projectId={projectId} />}
        {activeTab === 'history' && <ProjectHistory projectId={projectId} />}
        {activeTab === 'activity_log' && (
          <ProjectActivityLog
            projectId={projectId}
            projectName={project.name}
            canLog={canLogActivity}
          />
        )}
      </div>
    </div>
  );
}
