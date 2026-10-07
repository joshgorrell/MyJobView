import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface Department {
  id: string;
  name: string;
  display_name: string;
  description: string;
  icon: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  navigation_section: 'main' | 'footer';
}

export interface DepartmentModule {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string | null;
  icon: string;
  sort_order: number;
  is_active: boolean;
  parent_module_id: string | null;
  is_quick_access: boolean;
}

export interface StarredModule extends DepartmentModule {
  star_order: number;
  department_name: string;
  department_color: string;
}

interface DepartmentContextType {
  departments: Department[];
  modules: DepartmentModule[];
  userDepartments: Department[];
  mainDepartments: Department[];
  footerDepartments: Department[];
  starredModules: StarredModule[];
  quickAccessSuggestions: DepartmentModule[];
  getUserModules: (departmentId: string) => DepartmentModule[];
  hasAccess: (departmentName: string) => boolean;
  hasModuleAccess: (moduleKey: string) => boolean;
  starModule: (moduleId: string, order?: number) => Promise<void>;
  unstarModule: (moduleId: string) => Promise<void>;
  loading: boolean;
  refresh: () => Promise<void>;
}

const DepartmentContext = createContext<DepartmentContextType | undefined>(undefined);

export function DepartmentProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<DepartmentModule[]>([]);
  const [userDepartments, setUserDepartments] = useState<Department[]>([]);
  const [mainDepartments, setMainDepartments] = useState<Department[]>([]);
  const [footerDepartments, setFooterDepartments] = useState<Department[]>([]);
  const [starredModules, setStarredModules] = useState<StarredModule[]>([]);
  const [quickAccessSuggestions, setQuickAccessSuggestions] = useState<DepartmentModule[]>([]);
  const [roleAccess, setRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [moduleRoleAccess, setModuleRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [userOverrides, setUserOverrides] = useState<Map<string, boolean>>(new Map());
  const [moduleUserOverrides, setModuleUserOverrides] = useState<Map<string, boolean>>(new Map());
  const [adminModuleIdSet, setAdminModuleIdSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      loadDepartments();
    }
  }, [profile]);

  async function loadDepartments() {
    try {
      setLoading(true);

      if (!profile) return;

      const roleId = (profile as any).role_id;

      // Batch all queries in parallel for faster loading - INCLUDING starred modules
      const [
        deptsResult,
        modsResult,
        roleModAccessResult,
        userOverrideResult,
        userStarredResult,
        defaultStarredResult
      ] = await Promise.all([
        supabase.from('departments').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('department_modules').select('*').eq('is_active', true).order('sort_order'),
        roleId ? supabase.from('role_module_access').select('module_id, has_access').eq('role_id', roleId) : Promise.resolve({ data: null, error: null }),
        supabase.from('user_permission_overrides').select('module_id, override_type').eq('user_id', profile.id),
        // Load starred modules in parallel
        supabase
          .from('user_starred_modules')
          .select(`
            star_order,
            module:department_modules(
              id,
              department_id,
              module_key,
              display_name,
              description,
              icon,
              sort_order,
              is_active,
              parent_module_id,
              is_quick_access,
              department:departments(
                name,
                color
              )
            )
          `)
          .eq('user_id', profile.id)
          .order('star_order'),
        // Load defaults in parallel too
        supabase
          .from('default_starred_modules')
          .select(`
            default_order,
            module:department_modules(
              id,
              department_id,
              module_key,
              display_name,
              description,
              icon,
              sort_order,
              is_active,
              parent_module_id,
              is_quick_access,
              department:departments(
                name,
                color
              )
            )
          `)
          .eq('role', profile.role)
          .order('default_order')
      ]);

      if (deptsResult.error) throw deptsResult.error;
      if (modsResult.error) throw modsResult.error;

      const depts = deptsResult.data || [];
      // Keep navigation consistent with the Feedback page even before its label
      // migration is applied. Module keys/IDs continue to preserve saved bookmarks.
      const mods = (modsResult.data || []).map(module => ({
        ...module,
        display_name: module.module_key === 'reviews' ? 'Feedback' : module.display_name,
      }));

      setDepartments(depts);
      setModules(mods);

      // Build set of module IDs belonging to the admin department for fallback deny
      const adminDeptId = depts.find(d => d.name === 'admin')?.id;
      const adminModuleIds = new Set(
        adminDeptId ? mods.filter(m => m.department_id === adminDeptId).map(m => m.id) : []
      );
      setAdminModuleIdSet(adminModuleIds);

      // Build a lookup from module_key to all module rows sharing that key.
      // The same page (e.g. "invoices") can appear under multiple departments with
      // different row IDs — access must be unified across all copies.
      const modulesByKey = new Map<string, DepartmentModule[]>();
      mods.forEach(m => {
        const list = modulesByKey.get(m.module_key);
        if (list) list.push(m);
        else modulesByKey.set(m.module_key, [m]);
      });

      // Build role-based module access map keyed by module_id
      const roleModAccessMap = new Map<string, boolean>();
      roleModAccessResult.data?.forEach(item => {
        roleModAccessMap.set(item.module_id, item.has_access);
      });
      setModuleRoleAccess(roleModAccessMap);

      // Build user-specific permission overrides map keyed by module_id
      const userModAccessMap = new Map<string, boolean>();
      userOverrideResult.data?.forEach(item => {
        userModAccessMap.set(item.module_id, item.override_type === 'grant');
      });
      setModuleUserOverrides(userModAccessMap);

      // Unified access check: a module is accessible if ANY copy sharing the
      // same module_key has an override or role grant that says "yes".
      const checkModuleAccess = (mod: DepartmentModule): boolean => {
        const siblings = modulesByKey.get(mod.module_key) || [mod];
        // If any sibling has a user override, the most permissive override wins
        const overriddenSibling = siblings.find(s => userModAccessMap.has(s.id));
        if (overriddenSibling) return userModAccessMap.get(overriddenSibling.id) || false;
        // Admin sees everything (unless they have overrides)
        if (profile.role === 'admin') return true;
        // If any sibling has a role grant, use the most permissive
        const grantedSibling = siblings.find(s => roleModAccessMap.has(s.id));
        if (grantedSibling) return roleModAccessMap.get(grantedSibling.id) || false;
        // Admin-department modules default to denied for non-admin roles
        if (siblings.some(s => adminModuleIds.has(s.id))) return false;
        return false;
      };

      // Process starred modules (data already loaded in parallel)
      const userStarred = userStarredResult.data || [];
      const defaultStarred = defaultStarredResult.data || [];

      // Helper to check access inline (unified across all copies by module_key)
      const checkAccess = (moduleKey: string) => {
        const mod = mods.find(m => m.module_key === moduleKey);
        if (!mod) return false;
        return checkModuleAccess(mod);
      };

      // Use user starred if available, otherwise use defaults
      const starredSource = userStarred.length > 0 ? userStarred : defaultStarred;

      // Identify orphaned starred entries the user no longer has access to
      const orphanedIds = userStarred
        .filter(s => !s.module || !checkAccess(s.module.module_key))
        .map(s => (s as any).module?.id)
        .filter(Boolean) as string[];

      // Clean up orphaned entries in the background so the DB count stays in sync
      if (orphanedIds.length > 0) {
        supabase
          .from('user_starred_modules')
          .delete()
          .eq('user_id', profile.id)
          .in('module_id', orphanedIds)
          .then(({ error }) => {
            if (error) console.error('Error cleaning up orphaned starred modules:', error);
          });
      }

      const starred = starredSource
        .filter(s => s.module && (s.module as any).module_key !== 'messages' && checkAccess(s.module.module_key))
        .slice(0, 6)
        .map(s => ({
          ...(s.module as any),
          display_name: (s.module as any).module_key === 'reviews'
            ? 'Feedback' : (s.module as any).display_name,
          star_order: (s as any).star_order || (s as any).default_order,
          department_name: (s.module as any).department.name,
          department_color: (s.module as any).department.color,
        }));

      setStarredModules(starred);

      // Calculate accessible departments - only show departments with at least one accessible module
      const accessible = depts.filter(dept => {
        const deptModules = mods.filter(m => m.department_id === dept.id);
        return deptModules.some(mod => checkModuleAccess(mod));
      });

      setUserDepartments(accessible);
      setMainDepartments(accessible.filter(d => d.navigation_section === 'main'));
      setFooterDepartments(accessible.filter(d => d.navigation_section === 'footer'));

      // Load quick access suggestions (calculate after maps are set)
      const suggestions = mods.filter(m => {
        if (!m.is_quick_access || m.module_key === 'messages') return false;
        return checkModuleAccess(m);
      });
      setQuickAccessSuggestions(suggestions);
    } catch (error) {
      console.error('Error loading departments:', error);
    } finally {
      setLoading(false);
    }
  }

  function getUserModules(departmentId: string): DepartmentModule[] {
    return modules.filter(mod => {
      if (mod.department_id !== departmentId || mod.module_key === 'messages') return false;
      return hasModuleAccess(mod);
    });
  }

  function hasAccess(departmentName: string): boolean {
    const dept = departments.find(d => d.name === departmentName);
    if (!dept) return false;

    // Admin sees everything
    if (profile?.role === 'admin') return true;

    // Check explicit department access (default true if no grant)
    const hasAccess = userOverrides.get(dept.id);
    return hasAccess === undefined ? true : hasAccess;
  }

  function hasModuleAccess(moduleKey: string | DepartmentModule): boolean {
    const mod = typeof moduleKey === 'string'
      ? modules.find(m => m.module_key === moduleKey)
      : moduleKey;
    if (!mod) return false;

    // Find all copies of this module across every department (same module_key)
    const siblings = modules.filter(m => m.module_key === mod.module_key);

    // If any sibling has a user override, the most permissive override wins
    const overriddenSibling = siblings.find(s => moduleUserOverrides.has(s.id));
    if (overriddenSibling) {
      return moduleUserOverrides.get(overriddenSibling.id) || false;
    }

    // Admin sees everything (unless they have overrides)
    if (profile?.role === 'admin') return true;

    // If any sibling has a role grant, use the most permissive
    const grantedSibling = siblings.find(s => moduleRoleAccess.has(s.id));
    if (grantedSibling) {
      return moduleRoleAccess.get(grantedSibling.id) || false;
    }

    // Admin-department modules default to denied for non-admin roles
    if (siblings.some(s => adminModuleIdSet.has(s.id))) return false;

    // Deny by default — access requires an explicit role grant
    return false;
  }


  async function starModule(moduleId: string, order?: number) {
    if (!profile) return;

    try {
      // Check if module is already starred by querying the database directly
      const { data: existing } = await supabase
        .from('user_starred_modules')
        .select('id')
        .eq('user_id', profile.id)
        .eq('module_id', moduleId)
        .maybeSingle();

      if (existing) {
        throw new Error('This module is already starred');
      }

      // Check against the accessible starred count (what the user actually sees)
      // This avoids counting orphaned entries for modules the user lost access to
      if (starredModules.length >= 6) {
        throw new Error('You can only star up to 6 modules. Please unstar another module first.');
      }

      // If order not provided, find the first available order slot (1-6)
      // Use the accessible starredModules state so orphaned entries don't block slots
      let starOrder = order;
      if (!starOrder) {
        const usedOrders = new Set(starredModules.map(sm => sm.star_order));
        for (let i = 1; i <= 6; i++) {
          if (!usedOrders.has(i)) {
            starOrder = i;
            break;
          }
        }
      }

      if (!starOrder) {
        throw new Error('Unable to determine star order');
      }

      // Insert the new starred module
      const { error } = await supabase
        .from('user_starred_modules')
        .insert({
          user_id: profile.id,
          module_id: moduleId,
          star_order: starOrder,
        });

      if (error) {
        // If there's a unique constraint violation, provide a better error message
        if (error.message.includes('unique') || error.message.includes('duplicate')) {
          throw new Error('This star position is already taken. Please try again.');
        }
        throw error;
      }

      await loadDepartments();
    } catch (error: any) {
      console.error('Error starring module:', error);
      throw new Error(error.message || 'Failed to star module');
    }
  }

  async function unstarModule(moduleId: string) {
    if (!profile) return;

    try {
      const { error } = await supabase
        .from('user_starred_modules')
        .delete()
        .eq('user_id', profile.id)
        .eq('module_id', moduleId);

      if (error) throw error;
      await loadDepartments();
    } catch (error) {
      console.error('Error unstarring module:', error);
      throw error;
    }
  }

  const value = {
    departments,
    modules,
    userDepartments,
    mainDepartments,
    footerDepartments,
    starredModules,
    quickAccessSuggestions,
    getUserModules,
    hasAccess,
    hasModuleAccess,
    starModule,
    unstarModule,
    loading,
    refresh: loadDepartments,
  };

  return (
    <DepartmentContext.Provider value={value}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartments() {
  const context = useContext(DepartmentContext);
  if (context === undefined) {
    throw new Error('useDepartments must be used within a DepartmentProvider');
  }
  return context;
}
