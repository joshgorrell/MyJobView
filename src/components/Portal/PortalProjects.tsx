import { useState, useEffect } from 'react';
import { Briefcase, ArrowLeft, Calendar, DollarSign, User, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Project {
  id: string;
  project_number: string;
  project_name: string;
  status: string;
  start_date: string | null;
  target_completion: string | null;
  job_site_address: string | null;
  contract_total: number;
  total_invoiced: number;
  total_collected: number;
  pm_name: string | null;
}

interface PortalProjectsProps {
  isEmbedded?: boolean;
}

export function PortalProjects({ isEmbedded = false }: PortalProjectsProps = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('contact_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!profile?.contact_id) return;

      const { data, error } = await supabase
        .from('projects')
        .select(`
          id,
          project_number,
          project_name,
          status,
          start_date,
          target_completion,
          job_site_address,
          contract_total,
          total_invoiced,
          total_collected,
          project_manager_id,
          profiles:project_manager_id (
            full_name
          )
        `)
        .eq('customer_id', profile.contact_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedProjects = (data || []).map((project: any) => ({
        ...project,
        pm_name: project.profiles?.full_name || null,
      }));

      setProjects(formattedProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading projects...</p>
        </div>
      </div>
    );
  }

  const content = (
    <>
      {projects.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-12 text-center">
          <Briefcase className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Projects Yet</h3>
          <p className="text-gray-600">
            You don't have any active projects at this time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sm:p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {project.project_number}
                  </h3>
                  <p className="text-gray-600">{project.project_name}</p>
                </div>
                <StatusBadge status={project.status} />
              </div>

              {project.job_site_address && (
                <div className="flex items-start gap-2 mb-4 text-sm text-gray-600">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{project.job_site_address}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Contract Total</p>
                  <p className="text-lg font-bold text-gray-900">
                    ${project.contract_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Amount Paid</p>
                  <p className="text-lg font-bold text-green-600">
                    ${project.total_collected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                {project.pm_name && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <User className="w-4 h-4" />
                    <span>Project Manager: {project.pm_name}</span>
                  </div>
                )}
                {project.start_date && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Started: {new Date(project.start_date).toLocaleDateString()}</span>
                  </div>
                )}
                {project.target_completion && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>Target: {new Date(project.target_completion).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Outstanding Balance:</span>
                  <span className="font-bold text-orange-600">
                    ${(project.contract_total - project.total_collected).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  if (isEmbedded) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">My Projects</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track your active projects</p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0f2347] text-white shadow-lg sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 sm:h-20 gap-3">
            <a
              href="/portal"
              className="flex items-center gap-1.5 px-3 py-2 text-blue-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline text-sm font-medium">Dashboard</span>
            </a>
            <img
              src="/el_logo_color_(2).png"
              alt="Electronic Life"
              className="h-8 sm:h-10 object-contain flex-shrink-0"
            />
            <div className="hidden sm:block border-l border-white/20 pl-4">
              <p className="text-white font-semibold text-sm leading-tight">My Projects</p>
              <p className="text-blue-300 text-xs">Track your active projects</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {content}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs = {
    planning: {
      label: 'Planning',
      className: 'bg-blue-100 text-blue-700',
    },
    active: {
      label: 'Active',
      className: 'bg-green-100 text-green-700',
    },
    complete: {
      label: 'Complete',
      className: 'bg-gray-100 text-gray-700',
    },
    closed: {
      label: 'Closed',
      className: 'bg-gray-100 text-gray-700',
    },
  };

  const config = configs[status as keyof typeof configs] || configs.planning;

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
