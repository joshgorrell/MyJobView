import { DailyLaunchpad, DailyLaunchpadButton } from './DailyLaunchpad';
import { Plus, Menu, X, ChevronDown, UserPlus, MessageSquare, TrendingUp, Wrench, CheckSquare, Camera, Sparkles, Clock } from 'lucide-react';
import { getIcon } from '../../lib/iconMap';
import { FlowWaveIcon } from '../Flow/FlowWaveIcon';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useDepartments } from '../../contexts/DepartmentContext';
import { formatRoleName } from '../../lib/utils';
import { NotificationBell } from '../Notifications/NotificationBell';
import { TimeButton } from './QuickClockButton';
import { supabase } from '../../lib/supabase';

interface HeaderProps {
  onCreateContact: () => void;
  onCreateLead: () => void;
  onCreateInternalChat?: () => void;
  onCreateFlowUpdate?: () => void;
  onCreateServiceRequest: () => void;
  onCreateTask: () => void;
  onCreateJobMedia?: () => void;
  onCreateProjectTime?: () => void;
  onLeadClick: (leadId: string) => void;
  onTaskClick?: (taskId: string) => void;
  onMessageClick?: (threadId: string) => void;
  onProposalClick?: (proposalId: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isAdmin: boolean;
  onMenuToggle?: () => void;
  onNavigate?: (tab: string, params?: Record<string, string>) => void;
  onOpenAIAssistant?: () => void;
}

export function Header({ onCreateContact, onCreateLead, onCreateInternalChat, onCreateFlowUpdate, onCreateServiceRequest, onCreateTask, onCreateJobMedia, onCreateProjectTime, onLeadClick, onTaskClick, onMessageClick, onProposalClick, activeTab, onTabChange, isAdmin, onMenuToggle, onNavigate, onOpenAIAssistant }: HeaderProps) {
  const { profile } = useAuth();
  const [businessCardPhoto, setBusinessCardPhoto] = useState<string | null>(null);
  const { mainDepartments, footerDepartments, getUserModules, starredModules, loading: deptLoading } = useDepartments();
  const [commandCenterOpen,setCommandCenterOpen] = useState(()=>new URLSearchParams(window.location.search).get('commandCenter')==='1');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedMobileItems, setExpandedMobileItems] = useState<Set<string>>(new Set());
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [headerLogoUrl, setHeaderLogoUrl] = useState<string | null>(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const createMenuRef = useRef<HTMLDivElement>(null);

  const loading = deptLoading;
  const initials = profile?.full_name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || '?';
  const avatar = (
    <button
      type="button"
      onClick={() => {
        sessionStorage.setItem('mjv-preferences-tab', 'business-card');
        window.dispatchEvent(new Event('mjv-open-profile-settings'));
        onTabChange('preferences');
        setMobileMenuOpen(false);
      }}
      className="relative w-11 h-11 md:w-9 md:h-9 flex-shrink-0 rounded-full border border-subtle bg-elevated text-brand font-semibold text-xs flex items-center justify-center overflow-hidden hover:ring-2 hover:ring-blue-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      aria-label="Open profile and preferences"
      title={profile?.full_name ? `${profile.full_name} — Preferences` : 'Preferences'}
    >
      <span aria-hidden="true">{initials}</span>
      {(profile?.avatar_url || businessCardPhoto) && (
        <img
          key={profile?.avatar_url || businessCardPhoto}
          src={profile.avatar_url || businessCardPhoto || ''}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={event => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </button>
  );

  useEffect(() => {
    async function loadOrgLogo() {
      if (!profile?.organization_id) return;
      try {
        const [orgRes, settingsRes] = await Promise.all([
          supabase
            .from('organizations')
            .select('header_logo_url')
            .eq('id', profile.organization_id)
            .maybeSingle(),
          supabase
            .from('company_settings')
            .select('company_logo_url')
            .maybeSingle(),
        ]);
        if (orgRes.data?.header_logo_url) {
          setHeaderLogoUrl(orgRes.data.header_logo_url);
        }
        if (settingsRes.data?.company_logo_url) {
          setCompanyLogoUrl(settingsRes.data.company_logo_url);
        }
      } catch {
        // silently fall back to default logo
      }
    }
    loadOrgLogo();
  }, [profile?.organization_id]);

  useEffect(() => {
    if (!profile?.id || profile.avatar_url) {
      setBusinessCardPhoto(null);
      return;
    }
    let cancelled = false;
    supabase.from('business_cards').select('photo_url').eq('user_id', profile.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setBusinessCardPhoto(data?.photo_url || null); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.avatar_url]);

  // Close create menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setShowCreateMenu(false);
      }
    }

    if (showCreateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCreateMenu]);

  const renderIcon = (iconName: string, className: string = "w-5 h-5") => {
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className={className} /> : <Menu className={className} />;
  };

  const toggleMobileExpand = (itemKey: string) => {
    const newExpanded = new Set(expandedMobileItems);
    if (newExpanded.has(itemKey)) {
      newExpanded.delete(itemKey);
    } else {
      newExpanded.add(itemKey);
    }
    setExpandedMobileItems(newExpanded);
  };

  const handleMenuClick = (key: string) => {
    onTabChange(key);
    setMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <header className="theme-chrome theme-header bg-canvas border-b border-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="text-muted">Loading...</div>
          </div>
        </div>
        {commandCenterOpen && <DailyLaunchpad onClose={()=>setCommandCenterOpen(false)} onNavigate={onNavigate} />}
    </header>
    );
  }

  return (
    <header className="theme-chrome theme-header bg-canvas border-b border-subtle">
      <div className="navigation-header-content w-full px-2 sm:px-4 lg:px-8">
        <div className="relative flex h-14 w-full items-center justify-between gap-2 sm:gap-4">
          {/* Menu Button and Logo - Left Side */}
          <div className="flex min-w-0 items-center gap-1 sm:gap-3">
            {onMenuToggle && (
              <button
                onClick={onMenuToggle}
                className="hidden md:block shrink-0 p-2 text-secondary hover:text-primary hover:bg-elevated rounded-lg transition-colors"
                title="Toggle menu"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => onTabChange('feed')}
              className="flex min-w-0 items-center hover:opacity-80 transition-opacity"
              aria-label="Open Flow"
            >
              <img
                src={headerLogoUrl || companyLogoUrl || '/el_logo_color_(2).png'}
                alt="Logo"
                className="h-8 w-auto max-w-full md:max-w-[160px] object-contain"
              />
            </button>
          </div>

          {/* User Info - Center (Desktop/iPad only) */}
          <div className="hidden md:block flex-1 min-w-0" />

          {/* Desktop Actions */}
          <div className="hidden md:flex shrink-0 items-center gap-3">
            <DailyLaunchpadButton onOpen={()=>setCommandCenterOpen(true)} /><TimeButton onNavigate={onNavigate} />

            <div className="relative" ref={createMenuRef}>
              <button
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg hover:shadow-purple-500/50 transition-all font-medium flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Create
                <ChevronDown className={`w-4 h-4 transition-transform ${showCreateMenu ? 'rotate-180' : ''}`} />
              </button>

              {showCreateMenu && (
                <div className="absolute top-full right-0 mt-2 w-56 max-h-[70vh] overflow-y-auto bg-canvas border border-purple-500/30 rounded-lg shadow-xl z-50">
                  <button
                    onClick={() => {
                      onCreateContact();
                      setShowCreateMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <UserPlus className="w-4 h-4 text-blue-400" />
                    <div>
                      <div className="font-medium">New Contact</div>
                      <div className="text-xs text-muted">Add a person or company</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onCreateLead();
                      setShowCreateMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <div>
                      <div className="font-medium">New Lead</div>
                      <div className="text-xs text-muted">Create sales opportunity</div>
                    </div>
                  </button>

                  {onCreateInternalChat && <button
                    onClick={() => {
                      onCreateInternalChat?.();
                      setShowCreateMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <MessageSquare className="w-4 h-4 text-purple-400" />
                    <div>
                      <div className="font-medium">Internal chat</div>
                      <div className="text-xs text-muted">Teammates, departments or everyone</div>
                    </div>
                  </button>}

                  {onCreateFlowUpdate && <button
                    onClick={() => { onCreateFlowUpdate(); setShowCreateMenu(false); }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <FlowWaveIcon className="w-4 h-4 text-lg" />
                    <div><div className="font-medium">Activity update</div><div className="text-xs text-muted">Share a customer or job update</div></div>
                  </button>}

                  <button
                    onClick={() => {
                      onCreateServiceRequest();
                      setShowCreateMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <Wrench className="w-4 h-4 text-orange-400" />
                    <div>
                      <div className="font-medium">Work Order Request</div>
                      <div className="text-xs text-muted">Request service or project work</div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      onCreateTask();
                      setShowCreateMenu(false);
                    }}
                    className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                  >
                    <CheckSquare className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="font-medium">New Task</div>
                      <div className="text-xs text-muted">Create a task or reminder</div>
                    </div>
                  </button>

                  {onCreateProjectTime && (
                    <button
                      onClick={() => {
                        onCreateProjectTime();
                        setShowCreateMenu(false);
                      }}
                      className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                    >
                      <Clock className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="font-medium">Add Project Time</div>
                        <div className="text-xs text-muted">Log time against a project</div>
                      </div>
                    </button>
                  )}

                  {onCreateJobMedia && (
                    <button
                      onClick={() => {
                        onCreateJobMedia();
                        setShowCreateMenu(false);
                      }}
                      className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3"
                    >
                      <Camera className="w-4 h-4 text-pink-400" />
                      <div>
                        <div className="font-medium">New Job Pic</div>
                        <div className="text-xs text-muted">Upload photo or video</div>
                      </div>
                    </button>
                  )}

                  {onOpenAIAssistant && (
                    <button
                      onClick={() => {
                        onOpenAIAssistant();
                        setShowCreateMenu(false);
                      }}
                      className="w-full px-4 py-3 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 border-t border-subtle/50"
                    >
                      <Sparkles className="w-4 h-4 text-blue-400" />
                      <div>
                        <div className="font-medium">AI Assistant</div>
                        <div className="text-xs text-muted">Ask anything or create with AI</div>
                      </div>
                    </button>
                  )}
                </div>
              )}
            </div>

            <NotificationBell
              onLeadClick={onLeadClick}
              onTaskClick={onTaskClick}
              onMessageClick={onMessageClick}
              onProposalClick={onProposalClick}
              onTabChange={onTabChange}
            />
            {avatar}
          </div>

          {/* Mobile Actions */}
          <div className="md:hidden ml-auto flex shrink-0 items-center gap-0 sm:gap-2">
            <DailyLaunchpadButton onOpen={()=>setCommandCenterOpen(true)} /><TimeButton onNavigate={onNavigate} />
            <NotificationBell
              onTabChange={(tab) => { onTabChange(tab); setMobileMenuOpen(false); }}
              onLeadClick={(leadId) => {
                onLeadClick(leadId);
                setMobileMenuOpen(false);
              }}
              onTaskClick={(taskId) => {
                onTaskClick?.(taskId);
                setMobileMenuOpen(false);
              }}
              onMessageClick={(threadId) => {
                onMessageClick?.(threadId);
                setMobileMenuOpen(false);
              }}
              onProposalClick={(proposalId) => {
                onProposalClick?.(proposalId);
                setMobileMenuOpen(false);
              }}
            />
            {avatar}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="w-11 h-11 flex items-center justify-center text-muted hover:text-primary hover:bg-surface rounded-lg transition-colors"
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu — full-screen overlay with departments, favorites and quick actions */}
        {mobileMenuOpen && createPortal(
          <div className="theme-chrome mobile-navigation-panel md:hidden fixed inset-0 z-50 bg-canvas overflow-y-auto">
            {/* Header row with user info + close button */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-subtle sticky top-0 bg-canvas z-10">
              {profile && (
                <div className="text-xs text-muted">
                  {profile.full_name} • {formatRoleName(profile.role)}
                </div>
              )}
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 text-muted hover:text-primary transition-colors rounded-lg hover:bg-surface"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-6">
              {onMenuToggle && (
                <button
                  onClick={() => { setMobileMenuOpen(false); onMenuToggle(); }}
                  className="w-full px-3 py-2.5 text-sm text-secondary hover:bg-surface rounded-lg flex items-center gap-3"
                >
                  <Menu className="w-4 h-4" />
                  Browse departments
                </button>
              )}
              {/* Favorites */}
              {starredModules.length > 0 && (
                <div>
                  <div className="px-1 mb-2 font-semibold uppercase text-xs text-muted tracking-wider">
                    Favorites
                  </div>
                  <div className="space-y-1">
                    {starredModules.map((module) => (
                      <button
                        key={module.id}
                        onClick={() => handleMenuClick(module.module_key)}
                        className={`w-full px-3 py-2.5 text-sm font-medium transition-all flex items-center gap-3 rounded-lg ${
                          activeTab === module.module_key
                            ? 'bg-blue-500/20 text-blue-400'
                            : 'text-secondary hover:bg-surface hover:text-primary'
                        }`}
                      >
                        {module.module_key === 'feed' ? <FlowWaveIcon className="w-4 h-4 text-lg" /> : renderIcon(module.icon, "w-4 h-4")}
                        <span>{module.display_name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div>
                <div className="px-1 mb-2 font-semibold uppercase text-xs text-muted tracking-wider">
                  Quick Actions
                </div>
                <div className="space-y-1">
                  <button
                    onClick={() => { onCreateContact(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <UserPlus className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">New Contact</div>
                      <div className="text-xs text-muted">Add a person or company</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { onCreateLead(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <TrendingUp className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">New Lead</div>
                      <div className="text-xs text-muted">Create sales opportunity</div>
                    </div>
                  </button>

                  {onCreateInternalChat && <button
                    onClick={() => { onCreateInternalChat?.(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <MessageSquare className="w-4 h-4 text-blue-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">Internal chat</div>
                      <div className="text-xs text-muted">Teammates, departments or everyone</div>
                    </div>
                  </button>}

                  {onCreateFlowUpdate && <button
                    onClick={() => { onCreateFlowUpdate(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <FlowWaveIcon className="w-4 h-4 text-lg" />
                    <div><div className="text-sm font-medium">Activity update</div><div className="text-xs text-muted">Share a customer or job update</div></div>
                  </button>}

                  <button
                    onClick={() => { onCreateServiceRequest(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <Wrench className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">Work Order Request</div>
                      <div className="text-xs text-muted">Request service or project work</div>
                    </div>
                  </button>

                  <button
                    onClick={() => { onCreateTask(); setMobileMenuOpen(false); }}
                    className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                  >
                    <CheckSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">New Task</div>
                      <div className="text-xs text-muted">Create a task or reminder</div>
                    </div>
                  </button>

                  {onCreateProjectTime && (
                    <button
                      onClick={() => { onCreateProjectTime(); setMobileMenuOpen(false); }}
                      className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                    >
                      <Clock className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">Add Project Time</div>
                        <div className="text-xs text-muted">Log time against a project</div>
                      </div>
                    </button>
                  )}

                  {onCreateJobMedia && (
                    <button
                      onClick={() => { onCreateJobMedia(); setMobileMenuOpen(false); }}
                      className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                    >
                      <Camera className="w-4 h-4 text-pink-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">New Job Pic</div>
                        <div className="text-xs text-muted">Upload photo or video</div>
                      </div>
                    </button>
                  )}

                  {onOpenAIAssistant && (
                    <button
                      onClick={() => { onOpenAIAssistant(); setMobileMenuOpen(false); }}
                      className="w-full px-3 py-2.5 text-left text-secondary hover:bg-surface hover:text-primary transition-colors flex items-center gap-3 rounded-lg"
                    >
                      <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium">AI Assistant</div>
                        <div className="text-xs text-muted">Ask anything or create with AI</div>
                      </div>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>, document.body
        )}
      </div>
      {commandCenterOpen && <DailyLaunchpad onClose={()=>setCommandCenterOpen(false)} onNavigate={onNavigate} />}
    </header>
  );
}
