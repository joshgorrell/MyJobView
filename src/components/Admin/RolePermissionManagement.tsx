import { Fragment, useEffect, useState } from "react";
import { Shield, Save, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  effectiveModuleAccess,
  isPermissionModule,
  notifyPermissionsChanged,
  permissionLabel,
  uniquePermissionModules,
} from "../../lib/permissionCatalog";
import ConfirmModal from "../ui/ConfirmModal";

interface Role {
  id: string;
  role_key: string;
  display_name: string;
  description: string;
  is_system_role: boolean;
  is_active: boolean;
}
interface Department {
  id: string;
  display_name: string;
}
interface Module {
  id: string;
  department_id: string;
  module_key: string;
  display_name: string;
  description: string | null;
  is_active: boolean;
}
interface Snapshot {
  revision: number;
  modules: { module_id: string; has_access: boolean }[];
}

export function RolePermissionManagement() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [loadedRole, setLoadedRole] = useState("");
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<Map<string, boolean>>(new Map());
  const [matrix, setMatrix] = useState<Map<string, Map<string, boolean>>>(
    new Map(),
  );
  const [view, setView] = useState<"edit" | "matrix">("edit");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingRole, setPendingRole] = useState("");
  const [roleForm, setRoleForm] = useState<Role | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [description, setDescription] = useState("");
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from("roles").select("*").order("display_name"),
      supabase
        .from("departments")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("department_modules")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("role_module_access")
        .select("role_id, module_id, has_access"),
    ])
      .then(([r, d, m, grants]) => {
        if (cancelled) return;
        for (const result of [r, d, m, grants])
          if (result.error) throw result.error;
        setRoles(r.data || []);
        setDepartments(d.data || []);
        setModules((m.data || []).filter(isPermissionModule));
        setSelectedRole((current) =>
          (r.data || []).some((role) => role.id === current)
            ? current
            : r.data?.[0]?.id || "",
        );
        const next = new Map<string, Map<string, boolean>>();
        for (const grant of grants.data || []) {
          if (!next.has(grant.role_id)) next.set(grant.role_id, new Map());
          next.get(grant.role_id)!.set(grant.module_id, grant.has_access);
        }
        setMatrix(next);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Unable to load permissions.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (!selectedRole) return;
    let cancelled = false;
    setLoadedRole("");
    setError("");
    setDirty(false);
    supabase
      .rpc("get_role_page_permissions", { p_role_id: selectedRole })
      .then(({ data, error: failure }) => {
        if (cancelled) return;
        if (failure) {
          setError(failure.message);
          return;
        }
        const snapshot = data as Snapshot;
        setAccess(
          new Map(
            snapshot.modules.map((row) => [row.module_id, row.has_access]),
          ),
        );
        setRevision(snapshot.revision);
        setLoadedRole(selectedRole);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedRole, reload]);

  const role = roles.find((item) => item.id === selectedRole);
  const pages = uniquePermissionModules(modules);
  const ready = loadedRole === selectedRole && !!role && !saving;
  const roleAccess = (
    key: string,
    values = access,
    currentRole = role?.role_key || "",
  ) => effectiveModuleAccess(key, modules, values, new Map(), currentRole);

  function toggle(keys: string[], grant?: boolean) {
    if (!ready || role?.role_key === "admin") return;
    const next = new Map(access);
    for (const key of keys) {
      if (key === "settings" || key === "feature_suggestions") continue;
      const value = grant ?? !roleAccess(key);
      modules
        .filter((m) => m.module_key === key)
        .forEach((m) => next.set(m.id, value));
    }
    setAccess(next);
    setDirty(true);
    setMessage("");
  }

  async function save() {
    if (!ready || !dirty) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const { error: failure } = await supabase.rpc(
        "save_role_page_permissions",
        {
          p_role_id: selectedRole,
          p_expected_revision: revision,
          p_permissions: pages
            .filter(
              (m) =>
                !["settings", "feature_suggestions"].includes(m.module_key),
            )
            .map((m) => ({
              module_key: m.module_key,
              has_access: roleAccess(m.module_key),
            })),
        },
      );
      if (failure) throw failure;
      setDirty(false);
      setMessage(
        "Permissions saved. Individual exceptions and action permissions were preserved.",
      );
      notifyPermissionsChanged();
      setReload((value) => value + 1);
    } catch (e: any) {
      setError(
        e.message ||
          "Save failed. Your edits remain available; no permissions were replaced.",
      );
    } finally {
      setSaving(false);
    }
  }

  function editRole(item: Role | null) {
    setRoleForm(item);
    setName(item?.display_name || "");
    setKey(item?.role_key || "");
    setDescription(item?.description || "");
  }

  async function saveRole() {
    if (!name.trim() || !key.trim() || !description.trim()) {
      setError("Complete the role name, key and description.");
      return;
    }
    setSaving(true);
    setError("");
    const result = roleForm
      ? await supabase
          .from("roles")
          .update({
            display_name: name.trim(),
            description: description.trim(),
          })
          .eq("id", roleForm.id)
      : await supabase.from("roles").insert({
          role_key: key.trim().toLowerCase().replace(/\s+/g, "_"),
          display_name: name.trim(),
          description: description.trim(),
          is_system_role: false,
          is_active: true,
        });
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRoleForm(undefined);
    setReload((value) => value + 1);
  }

  if (loading && !roles.length)
    return <p role="status">Loading role permissions…</p>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-primary flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Role Permissions
          </h2>
          <p className="text-sm text-secondary">
            Current pages and capabilities. Departments group the pages; Grant
            All and Revoke All apply to those pages.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setView(view === "edit" ? "matrix" : "edit")}
            className="min-h-11 px-3 rounded-lg border border-subtle"
          >
            {view === "edit" ? "View Matrix" : "Edit Permissions"}
          </button>
          <button
            onClick={() => editRole(null)}
            className="min-h-11 px-3 rounded-lg border border-subtle flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Role
          </button>
        </div>
      </div>
      <p className="rounded-lg bg-blue-500/10 p-3 text-sm text-secondary">
        Personal profile settings are available through the avatar. Flow:
        Customer Messages controls customer conversations; internal Flow access
        is separate. Invoices is one shared page. Employee-only features remain
        subject to employment classification.
      </p>
      {error && (
        <div role="alert" className="rounded-lg p-3 bg-red-500/10 text-red-600">
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          className="rounded-lg p-3 bg-green-500/10 text-green-700"
        >
          {message}
        </div>
      )}
      {view === "matrix" ? (
        <div className="max-w-full overflow-x-auto rounded-lg border border-subtle">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className="p-3 text-left">Page or capability</th>
                {roles
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <th key={r.id} className="p-3 min-w-[120px]">
                      {r.display_name}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {departments.map((d) => (
                <Fragment key={d.id}>
                  <tr>
                    <th
                      colSpan={roles.filter((r) => r.is_active).length + 1}
                      className="p-3 text-left bg-elevated"
                    >
                      {d.display_name}
                    </th>
                  </tr>
                  {pages
                    .filter((m) => m.department_id === d.id)
                    .map((m) => (
                      <tr key={m.id} className="border-t border-subtle">
                        <td className="p-3">
                          {permissionLabel(m.module_key, m.display_name)}
                        </td>
                        {roles
                          .filter((r) => r.is_active)
                          .map((r) => (
                            <td key={r.id} className="p-3 text-center">
                              {roleAccess(
                                m.module_key,
                                matrix.get(r.id) || new Map(),
                                r.role_key,
                              )
                                ? "Yes"
                                : "No"}
                            </td>
                          ))}
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Role
              <select
                aria-label="Role to configure"
                disabled={saving}
                value={selectedRole}
                onChange={(e) =>
                  dirty
                    ? setPendingRole(e.target.value)
                    : setSelectedRole(e.target.value)
                }
                className="min-h-11 max-w-full px-3 rounded-lg bg-canvas border border-subtle"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.display_name}
                    {!r.is_active ? " (inactive)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => role && editRole(role)}
              className="p-3 rounded-lg border border-subtle"
              aria-label="Edit role details"
            >
              <Pencil className="w-4 h-4" />
            </button>
            {role && !role.is_system_role && (
              <button
                onClick={() => setDeleteRole(role)}
                className="p-3 rounded-lg border border-subtle"
                aria-label="Delete role"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          {role?.role_key === "admin" && (
            <p className="p-3 rounded-lg bg-amber-500/10 text-sm">
              Administrators have full system access. To restrict a person,
              assign a limited role. Administrator page defaults cannot be
              unchecked.
            </p>
          )}
          {loadedRole !== selectedRole && !error && (
            <p role="status">Loading this role’s saved permissions…</p>
          )}
          <fieldset
            disabled={!ready || role?.role_key === "admin"}
            className="space-y-3 min-w-0"
          >
            {departments.map((d) => {
              const list = pages.filter((m) => m.department_id === d.id);
              if (!list.length) return null;
              const editableKeys = list
                .filter((m) => m.module_key !== "settings")
                .map((m) => m.module_key);
              return (
                <section
                  key={d.id}
                  className="rounded-lg border border-subtle overflow-hidden"
                >
                  <div className="flex flex-wrap justify-between gap-2 p-3 bg-elevated">
                    <h3 className="font-semibold">{d.display_name}</h3>
                    <div className="flex gap-2">
                      <button
                        disabled={!editableKeys.length}
                        onClick={() => toggle(editableKeys, true)}
                        className="min-h-11 px-3 text-sm border border-subtle rounded-lg"
                      >
                        Grant All
                      </button>
                      <button
                        disabled={!editableKeys.length}
                        onClick={() => toggle(editableKeys, false)}
                        className="min-h-11 px-3 text-sm border border-subtle rounded-lg"
                      >
                        Revoke All
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-subtle">
                    {list.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-start justify-between gap-3 p-3"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">
                            {permissionLabel(m.module_key, m.display_name)}
                          </span>
                          <p className="text-xs text-secondary">
                            {m.module_key === "settings"
                              ? "Administrators only; company settings, users and roles."
                              : m.module_key === "feature_suggestions"
                                ? "Available to every signed-in user."
                                : m.description}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          aria-label={permissionLabel(
                            m.module_key,
                            m.display_name,
                          )}
                          disabled={[
                            "settings",
                            "feature_suggestions",
                          ].includes(m.module_key)}
                          checked={roleAccess(m.module_key)}
                          onChange={() => toggle([m.module_key])}
                          className="w-5 h-5 mt-1 shrink-0"
                        />
                      </label>
                    ))}
                  </div>
                </section>
              );
            })}
          </fieldset>
          <button
            disabled={!ready || !dirty}
            onClick={save}
            className="min-h-11 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save Permissions"}
          </button>
        </>
      )}
      {roleForm !== undefined && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Role details"
            className="bg-canvas p-4 sm:p-6 rounded-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto space-y-3"
          >
            <h3 className="font-bold">{roleForm ? "Edit Role" : "New Role"}</h3>
            <label className="block">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="block w-full p-2 border border-subtle rounded bg-canvas"
              />
            </label>
            <label className="block">
              Key
              <input
                disabled={!!roleForm}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="block w-full p-2 border border-subtle rounded bg-canvas"
              />
            </label>
            <label className="block">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="block w-full p-2 border border-subtle rounded bg-canvas"
              />
            </label>
            {error && (
              <p role="alert" className="text-red-600">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                disabled={saving}
                onClick={() => setRoleForm(undefined)}
                className="min-h-11 px-3"
              >
                Cancel
              </button>
              <button
                disabled={saving}
                onClick={saveRole}
                className="min-h-11 px-3 bg-blue-600 text-white rounded"
              >
                Save Role
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        isOpen={!!pendingRole}
        title="Discard unsaved permissions?"
        message="The selected role has unsaved edits. Switch roles and discard those edits?"
        confirmLabel="Switch Role"
        onCancel={() => setPendingRole("")}
        onConfirm={() => {
          setSelectedRole(pendingRole);
          setPendingRole("");
        }}
      />
      <ConfirmModal
        isOpen={!!deleteRole}
        title="Delete Role"
        message="Only an unused custom role can be deleted."
        variant="danger"
        confirmLabel="Delete"
        onCancel={() => setDeleteRole(null)}
        onConfirm={async () => {
          const result = await supabase
            .from("roles")
            .delete()
            .eq("id", deleteRole!.id);
          setDeleteRole(null);
          if (result.error) setError(result.error.message);
          else setReload((v) => v + 1);
        }}
      />
    </div>
  );
}
