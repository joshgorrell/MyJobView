import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
  Users, Wrench, Wifi, WifiOff, Clock, CalendarDays,
  AlertTriangle, CheckCircle2, Activity, TrendingUp,
  ClipboardList, FolderKanban, FileText, Bell, MapPin,
  Timer, CircleDot, ArrowRight, Zap, Shield, Sparkles,
  Radio, Flame, Target
} from 'lucide-react';

interface TechOnDuty {
  id: string;
  name: string;
  clockInTime: string;
  status: 'available' | 'on_job' | 'traveling';
  currentJob: string | null;
  jobTitle: string | null;
}

interface WorkOrderItem {
  id: string;
  work_order_number: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  assigned_to_name: string | null;
  contact_name: string | null;
  start_date: string | null;
  scheduled_start_time: string | null;
  needs_info: boolean;
  blocked_reason: string | null;
}

interface ServiceRequestItem {
  id: string;
  service_request_number: string;
  description: string;
  status: string;
  created_at: string;
  contact_name: string | null;
}

interface PunchlistItem {
  id: string;
  description: string;
  status: string;
  created_at: string;
  project_name: string | null;
  contact_name: string | null;
}

interface AppointmentItem {
  id: string;
  title: string;
  appointment_date: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  contact_name: string | null;
  location: string | null;
}

interface ActivityItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  created_at: string;
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  contact_name: string | null;
  target_completion_date: string | null;
}

export default function TVDashboard() {
  const [techs, setTechs] = useState<TechOnDuty[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrderItem[]>([]);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequestItem[]>([]);
  const [punchlistItems, setPunchlistItems] = useState<PunchlistItem[]>([]);
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [orgName, setOrgName] = useState('');
  const [orgLogo, setOrgLogo] = useState('');
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dataFlash, setDataFlash] = useState<string>('');

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const flashUpdate = (section: string) => {
    setDataFlash(section);
    setTimeout(() => setDataFlash(''), 800);
  };

  const loadOrg = useCallback(async () => {
    const { data } = await supabase.from('organizations').select('name, logo_url').limit(1).maybeSingle();
    if (data) {
      setOrgName(data.name || '');
      setOrgLogo(data.logo_url || '');
    }
  }, []);

  const loadTechs = useCallback(async () => {
    try {
      const { data: clockData, error: clockError } = await supabase
        .from('daily_clock_entries')
        .select(`
          technician_id,
          clock_in,
          profiles:technician_id (
            id,
            first_name,
            last_name
          )
        `)
        .is('clock_out', null)
        .order('clock_in', { ascending: false });

      if (clockError) {
        console.error('Error loading clock data:', clockError);
        throw clockError;
      }

      const { data: activeWOs } = await supabase
        .from('work_orders')
        .select('id, work_order_number, title, assigned_to, status')
        .in('status', ['in_progress', 'traveling', 'on_site']);

      const techMap = new Map<string, TechOnDuty>();
      clockData?.forEach((entry: any) => {
        // Only include entries that have valid profile data
        if (entry.profiles && entry.technician_id && !techMap.has(entry.technician_id)) {
          const firstName = entry.profiles.first_name || '';
          const lastName = entry.profiles.last_name || '';
          const name = `${firstName} ${lastName}`.trim();

          // Skip if name is empty (invalid profile)
          if (!name) {
            console.warn('Skipping clock entry with missing profile name:', entry.technician_id);
            return;
          }

          const wo = activeWOs?.find(w => w.assigned_to === entry.technician_id);
          techMap.set(entry.technician_id, {
            id: entry.technician_id,
            name: name,
            clockInTime: entry.clock_in,
            status: wo ? (wo.status === 'traveling' ? 'traveling' : 'on_job') : 'available',
            currentJob: wo?.work_order_number || null,
            jobTitle: wo?.title || null,
          });
        }
      });
      setTechs(Array.from(techMap.values()));
      setIsConnected(true);
      setLastUpdate(new Date());
      flashUpdate('techs');
    } catch (error) {
      console.error('Error in loadTechs:', error);
      setIsConnected(false);
    }
  }, []);

  const loadWorkOrders = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('work_orders')
        .select('id, work_order_number, title, status, priority, type, assigned_to_name, contact_id, start_date, scheduled_start_time, needs_info, blocked_reason, contacts(full_name)')
        .not('status', 'in', '("completed","cancelled","archived")')
        .order('start_date', { ascending: true })
        .limit(15);

      setWorkOrders((data || []).map((wo: any) => ({
        id: wo.id,
        work_order_number: wo.work_order_number,
        title: wo.title,
        status: wo.status,
        priority: wo.priority,
        type: wo.type,
        assigned_to_name: wo.assigned_to_name,
        contact_name: wo.contacts?.full_name || null,
        start_date: wo.start_date,
        scheduled_start_time: wo.scheduled_start_time,
        needs_info: wo.needs_info,
        blocked_reason: wo.blocked_reason,
      })));
      setIsConnected(true);
      flashUpdate('workorders');
    } catch { setIsConnected(false); }
  }, []);

  const loadServiceRequests = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('service_requests')
        .select('id, service_request_number, description, status, created_at, contacts(full_name)')
        .in('status', ['pending', 'in_progress', 'dispatched'])
        .order('created_at', { ascending: false })
        .limit(12);

      setServiceRequests((data || []).map((sr: any) => ({
        id: sr.id,
        service_request_number: sr.service_request_number,
        description: sr.description,
        status: sr.status,
        created_at: sr.created_at,
        contact_name: sr.contacts?.full_name || null,
      })));
      flashUpdate('service');
    } catch { /* silent */ }
  }, []);

  const loadPunchlist = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('punchlist_tasks')
        .select('id, description, status, created_at, projects(name), contacts(full_name)')
        .in('status', ['pending', 'submitted', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10);

      setPunchlistItems((data || []).map((item: any) => ({
        id: item.id,
        description: item.description,
        status: item.status,
        created_at: item.created_at,
        project_name: item.projects?.name || null,
        contact_name: item.contacts?.full_name || null,
      })));
      flashUpdate('punchlist');
    } catch { /* silent */ }
  }, []);

  const loadAppointments = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('appointments')
        .select('id, title, appointment_date, start_time, end_time, status, location, contacts(full_name)')
        .gte('appointment_date', today)
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(8);

      setAppointments((data || []).map((a: any) => ({
        id: a.id,
        title: a.title,
        appointment_date: a.appointment_date,
        start_time: a.start_time,
        end_time: a.end_time,
        status: a.status,
        contact_name: a.contacts?.full_name || null,
        location: a.location,
      })));
      flashUpdate('appointments');
    } catch { /* silent */ }
  }, []);

  const loadActivities = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, type, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      setActivities((data || []).map((n: any) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        created_at: n.created_at,
      })));
      flashUpdate('activity');
    } catch { /* silent */ }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('projects')
        .select('id, name, status, target_completion_date, contacts(full_name)')
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false })
        .limit(8);

      setProjects((data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        contact_name: p.contacts?.full_name || null,
        target_completion_date: p.target_completion_date,
      })));
      flashUpdate('projects');
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadOrg();
    loadTechs();
    loadWorkOrders();
    loadServiceRequests();
    loadPunchlist();
    loadAppointments();
    loadActivities();
    loadProjects();

    const fallback = setInterval(() => {
      loadTechs();
      loadWorkOrders();
      loadServiceRequests();
      loadPunchlist();
      loadAppointments();
      loadActivities();
      loadProjects();
    }, 30000);

    const channels = [
      supabase.channel('tv-clock').on('postgres_changes', { event: '*', schema: 'public', table: 'daily_clock_entries' }, () => loadTechs()).subscribe(),
      supabase.channel('tv-wo').on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadWorkOrders()).subscribe(),
      supabase.channel('tv-sr').on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => loadServiceRequests()).subscribe(),
      supabase.channel('tv-punch').on('postgres_changes', { event: '*', schema: 'public', table: 'punchlist_tasks' }, () => loadPunchlist()).subscribe(),
      supabase.channel('tv-appt').on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => loadAppointments()).subscribe(),
      supabase.channel('tv-notif').on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => loadActivities()).subscribe(),
      supabase.channel('tv-projects').on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => loadProjects()).subscribe(),
    ];

    return () => {
      clearInterval(fallback);
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [loadOrg, loadTechs, loadWorkOrders, loadServiceRequests, loadPunchlist, loadAppointments, loadActivities, loadProjects]);

  const timeAgo = (dateStr: string) => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  const formatTime12 = (time: string | null) => {
    if (!time) return '';
    const [h, m] = time.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  const clockedInDuration = (clockIn: string) => {
    const diff = Math.floor((Date.now() - new Date(clockIn).getTime()) / 60000);
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const priorityColor = (p: string) => {
    switch (p?.toLowerCase()) {
      case 'urgent': case 'emergency': return 'text-red-400 bg-red-500/20 border-red-500/50 shadow-red-500/20';
      case 'high': return 'text-orange-400 bg-orange-500/20 border-orange-500/50 shadow-orange-500/20';
      case 'medium': return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/50 shadow-yellow-500/20';
      default: return 'text-slate-400 bg-slate-500/20 border-slate-500/50';
    }
  };

  const statusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending': return 'bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-300 border-amber-500/60 shadow-amber-500/20';
      case 'in_progress': case 'in progress': return 'bg-gradient-to-br from-blue-500/20 to-blue-600/20 text-blue-300 border-blue-500/60 shadow-blue-500/20';
      case 'dispatched': return 'bg-gradient-to-br from-cyan-500/20 to-cyan-600/20 text-cyan-300 border-cyan-500/60 shadow-cyan-500/20';
      case 'submitted': return 'bg-gradient-to-br from-teal-500/20 to-teal-600/20 text-teal-300 border-teal-500/60 shadow-teal-500/20';
      case 'traveling': return 'bg-gradient-to-br from-sky-500/20 to-sky-600/20 text-sky-300 border-sky-500/60 shadow-sky-500/20';
      case 'on_site': return 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 text-emerald-300 border-emerald-500/60 shadow-emerald-500/20';
      case 'blocked': return 'bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-300 border-red-500/60 shadow-red-500/20';
      case 'scheduled': return 'bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 text-indigo-300 border-indigo-500/60 shadow-indigo-500/20';
      default: return 'bg-gradient-to-br from-slate-500/20 to-slate-600/20 text-slate-300 border-slate-500/60';
    }
  };

  const activityIcon = (type: string) => {
    if (type?.includes('work_order')) return <Wrench className="w-3.5 h-3.5" />;
    if (type?.includes('proposal')) return <FileText className="w-3.5 h-3.5" />;
    if (type?.includes('service')) return <Shield className="w-3.5 h-3.5" />;
    if (type?.includes('task')) return <CheckCircle2 className="w-3.5 h-3.5" />;
    return <Bell className="w-3.5 h-3.5" />;
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const todaysAppointments = appointments.filter(a => a.appointment_date === todayStr);
  const upcomingAppointments = appointments.filter(a => a.appointment_date > todayStr);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#0a0e1a] via-[#0d1224] to-[#0a0e1a] text-white overflow-hidden">
      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.8); opacity: 1; }
          100% { transform: scale(2.5); opacity: 0; }
        }
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes glow {
          0%, 100% { opacity: 0.5; box-shadow: 0 0 20px currentColor; }
          50% { opacity: 1; box-shadow: 0 0 40px currentColor; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes dataFlash {
          0%, 100% { opacity: 0; transform: scale(0.8); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
        .card-animate { animation: slideIn 0.5s cubic-bezier(0.22, 1, 0.36, 1); }
        .shimmer-bar {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent);
          background-size: 200% 100%;
          animation: shimmer 3s infinite;
        }
        .live-dot::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          background: inherit;
          animation: pulse-ring 2s cubic-bezier(0, 0, 0.2, 1) infinite;
          opacity: 0;
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .stat-glow { animation: glow 3s ease-in-out infinite; }
        .float-icon { animation: float 3s ease-in-out infinite; }
        .gradient-animate {
          background-size: 200% 200%;
          animation: gradientShift 8s ease infinite;
        }
        .data-flash {
          animation: dataFlash 0.8s ease-out;
        }
        .card-hover {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
        }
        .glass-effect {
          background: rgba(17, 24, 39, 0.5);
          backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .neon-border {
          box-shadow: 0 0 10px currentColor, inset 0 0 10px currentColor;
        }
      `}</style>

      {/* Animated Background Gradient Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-blue-600/10 via-transparent to-transparent blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-emerald-600/10 via-transparent to-transparent blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      {/* Header Bar */}
      <div className="relative h-20 bg-gradient-to-r from-slate-900/80 via-slate-800/80 to-slate-900/80 border-b border-white/10 flex items-center justify-between px-8 backdrop-blur-xl">
        <div className="absolute inset-0 shimmer-bar" />
        <div className="relative flex items-center gap-6">
          {orgLogo ? (
            <div className="glass-effect rounded-xl p-2.5 shadow-xl">
              <img src={orgLogo} alt="" className="h-10 max-w-[160px] object-contain" />
            </div>
          ) : null}
          <div>
            <h1 className="text-2xl font-black tracking-tight bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
              {orgName || 'Service'} Command Center
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-emerald-400 float-icon" />
                <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Live Operations</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center gap-8">
          <div className="flex items-center gap-3 glass-effect px-4 py-2 rounded-xl">
            <div className={`relative w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 live-dot stat-glow' : 'bg-red-500'}`} />
            <span className="text-sm font-bold text-emerald-300">{isConnected ? 'CONNECTED' : 'OFFLINE'}</span>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black font-mono tabular-nums tracking-wider text-white">
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
              {currentTime.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Bar */}
      <div className="relative h-16 bg-gradient-to-r from-slate-900/60 via-slate-800/60 to-slate-900/60 border-b border-white/5 flex items-center px-8 gap-6 backdrop-blur-xl">
        <StatPillEnhanced icon={<Users className="w-5 h-5" />} label="Techs Active" value={techs.length} color="emerald" flash={dataFlash === 'techs'} />
        <StatPillEnhanced icon={<Wrench className="w-5 h-5" />} label="Work Orders" value={workOrders.length} color="blue" flash={dataFlash === 'workorders'} />
        <StatPillEnhanced icon={<AlertTriangle className="w-5 h-5" />} label="Service Requests" value={serviceRequests.length} color="amber" flash={dataFlash === 'service'} />
        <StatPillEnhanced icon={<ClipboardList className="w-5 h-5" />} label="Punchlist" value={punchlistItems.length} color="teal" flash={dataFlash === 'punchlist'} />
        <StatPillEnhanced icon={<CalendarDays className="w-5 h-5" />} label="Today" value={todaysAppointments.length} color="sky" flash={dataFlash === 'appointments'} />
        <StatPillEnhanced icon={<FolderKanban className="w-5 h-5" />} label="Projects" value={projects.length} color="rose" flash={dataFlash === 'projects'} />
      </div>

      {/* Main Grid */}
      <div className="relative p-6 grid grid-cols-12 gap-4" style={{ height: 'calc(100vh - 9rem)' }}>
        {/* Left Column - Techs on Duty */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <PanelEnhanced title="Technicians On Duty" icon={<Users className="w-5 h-5" />} count={techs.length} accentColor="emerald">
            {techs.length > 0 ? (
              <div className="space-y-3">
                {techs.map((tech, i) => (
                  <div
                    key={tech.id}
                    className="card-animate card-hover glass-effect flex items-center gap-3 p-4 rounded-xl shadow-lg"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-base font-black shrink-0 shadow-lg ${
                      tech.status === 'on_job' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white neon-border' :
                      tech.status === 'traveling' ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white neon-border' :
                      'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white neon-border'
                    }`}>
                      {tech.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate text-white">{tech.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <Timer className="w-3.5 h-3.5" />
                        <span className="font-semibold">{clockedInDuration(tech.clockInTime)}</span>
                        {tech.currentJob && (
                          <span className="text-blue-400 font-bold ml-1">#{tech.currentJob}</span>
                        )}
                      </div>
                    </div>
                    <div className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider shadow-lg ${
                      tech.status === 'on_job' ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white' :
                      tech.status === 'traveling' ? 'bg-gradient-to-br from-sky-500 to-sky-600 text-white' :
                      'bg-gradient-to-br from-emerald-500 to-emerald-600 text-white'
                    }`}>
                      {tech.status === 'on_job' ? 'On Job' : tech.status === 'traveling' ? 'Traveling' : 'Ready'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No technicians clocked in" icon={<Users className="w-10 h-10" />} />
            )}
          </PanelEnhanced>

          {/* Today's Appointments */}
          <PanelEnhanced title="Today's Appointments" icon={<CalendarDays className="w-5 h-5" />} count={todaysAppointments.length} accentColor="sky">
            {todaysAppointments.length > 0 ? (
              <div className="space-y-2.5">
                {todaysAppointments.map((appt, i) => (
                  <div key={appt.id} className="card-animate card-hover glass-effect p-3.5 rounded-xl shadow-lg" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-bold truncate text-white">{appt.title}</div>
                        {appt.contact_name && <div className="text-xs text-slate-400 truncate mt-0.5">{appt.contact_name}</div>}
                      </div>
                      {appt.start_time && (
                        <div className="text-xs text-sky-400 font-black font-mono shrink-0 glass-effect px-2 py-1 rounded-lg">
                          {formatTime12(appt.start_time)}
                        </div>
                      )}
                    </div>
                    {appt.location && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="truncate">{appt.location}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No appointments today" icon={<CalendarDays className="w-10 h-10" />} />
            )}
          </PanelEnhanced>
        </div>

        {/* Center - Work Orders & Service Requests */}
        <div className="col-span-6 flex flex-col gap-4 min-h-0">
          {/* Work Orders */}
          <PanelEnhanced title="Active Work Orders" icon={<Wrench className="w-5 h-5" />} count={workOrders.length} accentColor="blue" className="flex-1">
            {workOrders.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {workOrders.map((wo, i) => (
                  <div
                    key={wo.id}
                    className="card-animate card-hover glass-effect p-4 rounded-xl shadow-lg"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-blue-400">#{wo.work_order_number}</span>
                          {wo.priority && (
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase border shadow-lg ${priorityColor(wo.priority)}`}>
                              {wo.priority}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-white font-semibold truncate">{wo.title}</div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border shadow-lg shrink-0 ${statusBadge(wo.status)}`}>
                        {wo.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {wo.contact_name && <span className="truncate font-semibold">{wo.contact_name}</span>}
                        {wo.assigned_to_name && wo.contact_name && <span className="text-slate-600">•</span>}
                        {wo.assigned_to_name && <span className="text-blue-400 font-semibold truncate">{wo.assigned_to_name}</span>}
                      </div>
                      {wo.scheduled_start_time && <span className="shrink-0 font-mono font-bold">{formatTime12(wo.scheduled_start_time)}</span>}
                    </div>
                    {wo.needs_info && (
                      <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-400 glass-effect px-2 py-1 rounded-lg">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span className="font-semibold">{wo.blocked_reason || 'Needs info'}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No active work orders" icon={<Wrench className="w-10 h-10" />} />
            )}
          </PanelEnhanced>

          {/* Service Requests */}
          <PanelEnhanced title="Service Requests" icon={<Flame className="w-5 h-5" />} count={serviceRequests.length} accentColor="amber">
            {serviceRequests.length > 0 ? (
              <div className="grid grid-cols-3 gap-3">
                {serviceRequests.map((sr, i) => (
                  <div
                    key={sr.id}
                    className="card-animate card-hover glass-effect p-3.5 rounded-xl shadow-lg"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black text-amber-400">SR-{sr.service_request_number}</span>
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-lg ${statusBadge(sr.status)}`}>
                        {sr.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-white font-semibold line-clamp-2 mb-2">{sr.description}</div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      {sr.contact_name && <span className="truncate font-semibold">{sr.contact_name}</span>}
                      <span className="shrink-0 font-bold">{timeAgo(sr.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No open service requests" icon={<AlertTriangle className="w-10 h-10" />} />
            )}
          </PanelEnhanced>
        </div>

        {/* Right Column - Punchlist, Projects, Activity */}
        <div className="col-span-3 flex flex-col gap-4 min-h-0">
          <PanelEnhanced title="Punchlist Items" icon={<ClipboardList className="w-5 h-5" />} count={punchlistItems.length} accentColor="teal">
            {punchlistItems.length > 0 ? (
              <div className="space-y-2.5">
                {punchlistItems.map((item, i) => (
                  <div key={item.id} className="card-animate card-hover glass-effect p-3.5 rounded-xl shadow-lg" style={{ animationDelay: `${i * 50}ms` }}>
                    <div className="text-xs text-white font-semibold line-clamp-2 mb-2">{item.description}</div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-lg ${statusBadge(item.status)}`}>
                          {item.status?.replace(/_/g, ' ')}
                        </span>
                        {item.project_name && <span className="text-[10px] text-teal-400 font-bold truncate">{item.project_name}</span>}
                      </div>
                      <span className="text-[10px] text-slate-500 font-bold shrink-0">{timeAgo(item.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No punchlist items" icon={<ClipboardList className="w-10 h-10" />} />
            )}
          </PanelEnhanced>

          <PanelEnhanced title="Active Projects" icon={<Target className="w-5 h-5" />} count={projects.length} accentColor="rose">
            {projects.length > 0 ? (
              <div className="space-y-2.5">
                {projects.map((proj, i) => (
                  <div
                    key={proj.id}
                    className="card-animate card-hover glass-effect flex items-center gap-3 p-3 rounded-xl shadow-lg"
                    style={{ animationDelay: `${i * 50}ms` }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-rose-400 to-rose-600 shrink-0 shadow-lg neon-border" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate text-white">{proj.name}</div>
                      <div className="text-[10px] text-slate-400 truncate font-semibold">
                        {proj.contact_name || 'No contact'}
                        {proj.target_completion_date && ` • Due ${new Date(proj.target_completion_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border shadow-lg shrink-0 ${statusBadge(proj.status)}`}>
                      {proj.status?.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No active projects" icon={<FolderKanban className="w-10 h-10" />} />
            )}
          </PanelEnhanced>

          {/* Live Activity Feed */}
          <PanelEnhanced title="Live Activity Feed" icon={<Sparkles className="w-5 h-5" />} accentColor="indigo">
            {activities.length > 0 ? (
              <div className="space-y-2">
                {activities.map((act, i) => (
                  <div
                    key={act.id}
                    className="card-animate card-hover flex items-start gap-3 p-3 rounded-xl glass-effect shadow-lg"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg">
                      {activityIcon(act.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-white font-semibold line-clamp-1">{act.title}</div>
                      <div className="text-[10px] text-slate-500 font-bold">{timeAgo(act.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyStateEnhanced text="No recent activity" icon={<Activity className="w-10 h-10" />} />
            )}
          </PanelEnhanced>
        </div>
      </div>
    </div>
  );
}

function PanelEnhanced({ title, icon, count, accentColor = 'slate', children, className = '' }: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  accentColor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400',
    blue: 'text-blue-400',
    amber: 'text-amber-400',
    teal: 'text-teal-400',
    sky: 'text-sky-400',
    rose: 'text-rose-400',
    slate: 'text-slate-400',
    indigo: 'text-indigo-400',
  };
  const borderMap: Record<string, string> = {
    emerald: 'border-emerald-500/30',
    blue: 'border-blue-500/30',
    amber: 'border-amber-500/30',
    teal: 'border-teal-500/30',
    sky: 'border-sky-500/30',
    rose: 'border-rose-500/30',
    slate: 'border-slate-500/30',
    indigo: 'border-indigo-500/30',
  };
  const glowMap: Record<string, string> = {
    emerald: 'shadow-emerald-500/20',
    blue: 'shadow-blue-500/20',
    amber: 'shadow-amber-500/20',
    teal: 'shadow-teal-500/20',
    sky: 'shadow-sky-500/20',
    rose: 'shadow-rose-500/20',
    slate: 'shadow-slate-500/20',
    indigo: 'shadow-indigo-500/20',
  };

  return (
    <div className={`glass-effect rounded-2xl border ${borderMap[accentColor] || 'border-white/10'} shadow-2xl ${glowMap[accentColor]} flex flex-col min-h-0 ${className}`}>
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-white/10 shrink-0 bg-gradient-to-r from-white/5 to-transparent">
        <span className={`${colorMap[accentColor] || 'text-slate-400'} float-icon`}>{icon}</span>
        <span className="text-sm font-black text-white uppercase tracking-wider">{title}</span>
        {count !== undefined && (
          <span className={`ml-auto text-sm font-black ${colorMap[accentColor]} glass-effect px-3 py-1 rounded-lg`}>{count}</span>
        )}
      </div>
      <div className="p-4 overflow-y-auto scrollbar-hide flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function StatPillEnhanced({ icon, label, value, color, flash }: { icon: React.ReactNode; label: string; value: number; color: string; flash: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-300 bg-gradient-to-br from-emerald-600/30 to-emerald-700/30 border-emerald-500/50',
    blue: 'text-blue-300 bg-gradient-to-br from-blue-600/30 to-blue-700/30 border-blue-500/50',
    amber: 'text-amber-300 bg-gradient-to-br from-amber-600/30 to-amber-700/30 border-amber-500/50',
    teal: 'text-teal-300 bg-gradient-to-br from-teal-600/30 to-teal-700/30 border-teal-500/50',
    sky: 'text-sky-300 bg-gradient-to-br from-sky-600/30 to-sky-700/30 border-sky-500/50',
    rose: 'text-rose-300 bg-gradient-to-br from-rose-600/30 to-rose-700/30 border-rose-500/50',
  };
  return (
    <div className={`flex items-center gap-3 glass-effect px-4 py-2 rounded-xl shadow-lg border ${flash ? 'data-flash' : ''}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-lg border ${colorMap[color] || 'text-slate-300 bg-slate-600/30 border-slate-500/50'}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold leading-none">{label}</div>
        <div className="text-xl font-black text-white leading-tight mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function EmptyStateEnhanced({ text, icon }: { text: string; icon: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-600">
      <div className="opacity-40 mb-3">{icon}</div>
      <span className="text-sm font-semibold">{text}</span>
    </div>
  );
}
