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
  const [dialog, setDialog] = useState<"revoke" | "role" | "bulk" | null>(null);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(new Set());
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

  const eligibleKeys = pages.map((m) => m.module_key).filter((key) => !locked(key));
  const selectedKeys = eligibleKeys.filter((key) => selection.has(key));
  const desired = (key: string) => dialog === "revoke" ? false : dialog === "role" ? access(key, true) : selection.has(key);
  const toGrant = eligibleKeys.filter((key) => desired(key) && !access(key));
  const toRevoke = eligibleKeys.filter((key) => !desired(key) && access(key));

  async function applyReviewed() {
    if (!dialog || saving || loading || loadedFor !== identity) return;
    const mode = dialog;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const groups: Array<[string[], boolean | null]> = mode === "role"
        ? [[eligibleKeys, null]]
        : mode === "revoke"
          ? [[eligibleKeys, false]]
          : [[selectedKeys, true], [eligibleKeys.filter((key) => !selection.has(key)), false]];
      for (const [keys, allowed] of groups) {
        if (!keys.length) continue;
        const { error: failure } = await supabase.rpc("set_user_page_permissions", {
          p_user_id: userId, p_module_keys: keys, p_has_access: allowed,
        });
        if (failure) throw failure;
      }
      setDialog(null);
      setBulkEditing(false);
      setMessage(mode === "role" ? "Role page defaults restored." : "Page permissions updated.");
      setReload((v) => v + 1);
      notifyPermissionsChanged();
      onChanged?.();
    } catch (e: any) {
      setError((e.message || "Unable to apply page permissions.") + " Reload to verify saved access.");
      setReload((v) => v + 1);
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
      {role !== "admin" && !loading && loadedFor === identity && (
        <div className="rounded-lg border border-subtle p-3 space-y-3">
          <div>
            <p className="font-semibold text-primary">Page Permissions</p>
            <p className="text-xs text-secondary">Individual pages save immediately. Bulk actions require confirmation. Separate action permissions are unaffected.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving || !eligibleKeys.length} onClick={() => setDialog("revoke")}
              className="min-h-11 px-3 rounded border border-red-500/50 text-red-500 text-sm">Revoke All</button>
            <button type="button" disabled={saving || !eligibleKeys.length} onClick={() => setDialog("role")}
              className="min-h-11 px-3 rounded border border-subtle text-sm">Grant Role</button>
            <button type="button" disabled={saving || !eligibleKeys.length} onClick={() => {
              if (bulkEditing) { setBulkEditing(false); return; }
              setSelection(new Set(eligibleKeys.filter((key) => access(key))));
              setBulkEditing(true);
              setExpanded(new Set(departments.map((d) => d.id)));
            }} className="min-h-11 px-3 rounded border border-subtle text-sm">{bulkEditing ? "Cancel Bulk" : "Bulk Grant"}</button>
          </div>
          {bulkEditing && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-secondary">{selectedKeys.length} pages selected. Check or uncheck pages below, then review.</span>
              <button type="button" onClick={() => setSelection(new Set(eligibleKeys))} className="min-h-11 px-3 rounded border border-subtle text-sm">Select All</button>
              <button type="button" onClick={() => setSelection(new Set())} className="min-h-11 px-3 rounded border border-subtle text-sm">Clear</button>
              <button type="button" onClick={() => setDialog("bulk")} className="min-h-11 px-3 rounded bg-primary text-white text-sm">Review Changes</button>
            </div>
          )}
        </div>
      )}
      {dialog && (
        <div className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-3 sm:p-6" onMouseDown={(e) => e.stopPropagation()}>
          <div role="dialog" aria-modal="true" aria-label="Review page permission changes"
            className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl bg-canvas text-primary border border-subtle p-4 sm:p-6 space-y-4">
            <h3 className="text-lg font-semibold">Review Page Permission Changes</h3>
            <p className="text-sm text-secondary">
              {dialog === "revoke" ? `Revoke all ${eligibleKeys.length} eligible pages for ${userName}, overriding role defaults.`
                : dialog === "role" ? `Replace ${userName}'s page exceptions with the saved defaults for their assigned role.`
                : `Apply the selected page permissions for ${userName}. Unchecked eligible pages will be revoked.`}
              {" "}Administrator-only and universal pages are unchanged. Separate action permissions are unaffected.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-subtle p-3"><strong>{toGrant.length}</strong> pages to grant</div>
              <div className="rounded-lg border border-subtle p-3"><strong>{toRevoke.length}</strong> pages to revoke</div>
            </div>
            {toGrant.length > 0 && <div><p className="font-semibold text-sm text-green-600">Grant access</p><p className="text-sm text-secondary">{toGrant.map((key) => permissionLabel(key, pages.find((p) => p.module_key === key)?.display_name || key)).join(", ")}</p></div>}
            {toRevoke.length > 0 && <div><p className="font-semibold text-sm text-red-500">Revoke access</p><p className="text-sm text-secondary">{toRevoke.map((key) => permissionLabel(key, pages.find((p) => p.module_key === key)?.display_name || key)).join(", ")}</p></div>}
            {!toGrant.length && !toRevoke.length && <p className="text-sm text-secondary">No effective page access changes. Existing exceptions may still be updated.</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setDialog(null)} className="min-h-11 px-4 rounded border border-subtle">{dialog === "bulk" ? "Back to Editing" : "Cancel"}</button>
              <button type="button" disabled={saving} onClick={() => void applyReviewed()} className="min-h-11 px-4 rounded bg-primary text-white disabled:opacity-50">{saving ? "Saving…" : dialog === "revoke" ? "Confirm Revoke All" : dialog === "role" ? "Apply Role Permissions" : "Confirm & Apply"}</button>
            </div>
          </div>
        </div>
      )}
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
                        {!bulkEditing && hasOverride(m.module_key) && !locked(m.module_key) && (
                          <button
                            type="button"
                            onClick={() => change([m.module_key], null)}
                            className="min-h-11 text-xs px-2 underline"
                          >
                            Use Role Default
                          </button>
                        )}
                        {bulkEditing && !locked(m.module_key) ? (
                          <input type="checkbox" aria-label={`Select ${permissionLabel(m.module_key, m.display_name)}`}
                            checked={selection.has(m.module_key)} onChange={(e) => setSelection((current) => {
                              const next = new Set(current);
                              if (e.target.checked) next.add(m.module_key); else next.delete(m.module_key);
                              return next;
                            })} className="h-5 w-5" />
                        ) : <button
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
                        </button>}
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
