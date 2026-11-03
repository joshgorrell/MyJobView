import { useEffect, useState } from "react";
import { X, Shield } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  effectiveModuleAccess,
  isPermissionModule,
  notifyPermissionsChanged,
  permissionLabel,
  permissionOverridesMap,
  uniquePermissionModules,
} from "../../lib/permissionCatalog";

interface Props {
  userId: string;
  userName: string;
  userRoleId: string | null;
  onClose: () => void;
  inline?: boolean;
  previewRole?: string;
  onChanged?: () => void;
}
interface Module {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
}
interface Department {
  id: string;
  display_name: string;
}
interface Override {
  module_id: string;
  override_type: string;
}

export function UserModuleAccess({
  userId,
  userName,
  userRoleId,
  onClose,
  inline = false,
  previewRole,
  onChanged,
}: Props) {
  const [modules, setModules] = useState<Module[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roleAccess, setRoleAccess] = useState<Map<string, boolean>>(new Map());
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [role, setRole] = useState("");
  const [classification, setClassification] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadedFor, setLoadedFor] = useState("");
  const identity = `${userId}:${userRoleId || ""}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadedFor("");
    setError("");
    Promise.all([
      supabase
        .from("department_modules")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("departments")
        .select("id,display_name")
        .eq("is_active", true)
        .order("sort_order"),
      userRoleId
        ? supabase
            .from("role_module_access")
            .select("module_id,has_access")
            .eq("role_id", userRoleId)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from("user_permission_overrides")
        .select("module_id,override_type")
        .eq("user_id", userId),
      supabase
        .from("profiles")
        .select("role,employment_classification")
        .eq("id", userId)
        .single(),
    ])
      .then(([m, d, grants, exceptions, profile]) => {
        if (cancelled) return;
        for (const result of [m, d, grants, exceptions, profile])
          if (result.error) throw result.error;
        setModules((m.data || []).filter(isPermissionModule));
        setDepartments(d.data || []);
        setRoleAccess(
          new Map(
            (grants.data || []).map((row) => [row.module_id, row.has_access]),
          ),
        );
        setOverrides(exceptions.data || []);
        setRole(previewRole || profile.data?.role || "");
        setClassification(profile.data?.employment_classification || "");
        setLoadedFor(identity);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Unable to load page access.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, userRoleId, previewRole, reload]);

  const overrideMap = permissionOverridesMap(overrides);
  const pages = uniquePermissionModules(modules);
  const access = (key: string, inherited = false) => {
    if (key === "my_time_off" && classification !== "employee") return false;
    return effectiveModuleAccess(
      key,
      modules,
      roleAccess,
      inherited ? new Map() : overrideMap,
      role,
    );
  };
  const hasOverride = (key: string) =>
    modules.some((m) => m.module_key === key && overrideMap.has(m.id));
  const locked = (key: string) =>
    role === "admin" ||
    key === "settings" ||
    key === "feature_suggestions" ||
    (key === "my_time_off" && classification !== "employee");

  async function change(keys: string[], value: boolean | null) {
    if (loading || saving || loadedFor !== identity) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: failure } = await supabase.rpc(
        "set_user_page_permissions",
        {
          p_user_id: userId,
          p_module_keys: keys.filter((k) => !locked(k)),
          p_has_access: value,
        },
      );
      if (failure) throw failure;
      setMessage(
        value === null
          ? "Role defaults restored."
          : "Page access saved immediately.",
      );
      setReload((v) => v + 1);
      notifyPermissionsChanged();
      onChanged?.();
    } catch (e: any) {
      setError(e.message || "Page access was not saved.");
    } finally {
      setSaving(false);
    }
  }

  const content = (
    <div className="space-y-3 min-w-0">
      {!inline && (
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-xl text-primary">Page Access</h2>
            <p className="text-sm text-secondary">{userName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close page access"
            className="p-3"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}
      <p className="text-sm text-secondary flex gap-2">
        <Shield className="w-5 h-5 shrink-0" />
        <span>
          Pages inherit the selected role. Individual exceptions survive role
          changes. Department buttons apply to the pages listed inside them.
          Changes save immediately; action permissions elsewhere use Save
          Changes.
        </span>
      </p>
      {role === "admin" && (
        <p className="p-3 rounded bg-amber-500/10 text-sm">
          Administrators have full system access. Use a limited role to restrict
          this user.
        </p>
      )}
      {loading && <p role="status">Loading saved page permissions…</p>}
      {error && (
        <p role="alert" className="text-red-600 p-3 rounded bg-red-500/10">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-green-600">
          {message}
        </p>
      )}
      <fieldset
        disabled={loading || saving || loadedFor !== identity}
        className="space-y-3 min-w-0"
      >
        {departments.map((d) => {
          const list = pages.filter((m) => m.department_id === d.id);
          if (!list.length) return null;
          const keys = list.map((m) => m.module_key).filter((k) => !locked(k));
          return (
            <section
              key={d.id}
              className="rounded-lg border border-subtle overflow-hidden"
            >
              <div className="p-3 flex flex-wrap items-center justify-between gap-2 bg-elevated">
                <button
                  type="button"
                  aria-expanded={expanded.has(d.id)}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      next.has(d.id) ? next.delete(d.id) : next.add(d.id);
                      return next;
                    })
                  }
                  className="min-h-11 font-semibold text-left"
                >
                  {d.display_name} ·{" "}
                  {list.filter((m) => access(m.module_key)).length}/
                  {list.length} pages
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!keys.length}
                    onClick={() => change(keys, true)}
                    className="min-h-11 text-sm px-3 border border-subtle rounded"
                  >
                    Grant All
                  </button>
                  <button
                    type="button"
                    disabled={!keys.length}
                    onClick={() => change(keys, false)}
                    className="min-h-11 text-sm px-3 border border-subtle rounded"
                  >
                    Revoke All
                  </button>
                </div>
              </div>
              {expanded.has(d.id) && (
                <div className="divide-y divide-subtle">
                  {list.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {permissionLabel(m.module_key, m.display_name)}
                          {hasOverride(m.module_key) && (
                            <span className="ml-2 text-xs text-amber-600">
                              Individual exception
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-secondary">
                          {m.module_key === "my_time_off" &&
                          classification !== "employee"
                            ? "Employees only."
                            : m.module_key === "settings"
                              ? "Administrator role required."
                              : `Role default: ${access(m.module_key, true) ? "Allowed" : "Not allowed"}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {hasOverride(m.module_key) && !locked(m.module_key) && (
                          <button
                            type="button"
                            onClick={() => change([m.module_key], null)}
                            className="min-h-11 text-xs px-2 underline"
                          >
                            Use Role Default
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Access ${permissionLabel(m.module_key, m.display_name)}`}
                          aria-pressed={access(m.module_key)}
                          disabled={locked(m.module_key)}
                          onClick={() =>
                            change([m.module_key], !access(m.module_key))
                          }
                          className={`min-h-11 px-3 text-sm rounded ${access(m.module_key) ? "bg-green-600 text-white" : "bg-elevated border border-subtle"}`}
                        >
                          {access(m.module_key) ? "Allowed" : "Not Allowed"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </fieldset>
    </div>
  );
  return inline ? (
    content
  ) : (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Page access"
        className="w-full max-w-4xl max-h-[90dvh] overflow-y-auto bg-canvas text-primary rounded-xl p-4 sm:p-6"
      >
        {content}
      </div>
    </div>
  );
}
