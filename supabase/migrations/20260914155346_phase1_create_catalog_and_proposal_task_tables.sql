/*
# Phase 1: Create catalog_item_default_tasks and proposal_tasks tables

## 1. catalog_item_default_tasks (NEW TABLE)
Stores default task templates per product in the catalog. When a salesperson
adds a product to a proposal, these default tasks can be copied forward into
proposal_tasks as independent snapshots.

Columns:
- id (uuid PK)
- product_id (uuid, FK to products ON DELETE SET NULL, NOT NULL)
  - Uses ON DELETE SET NULL to match the soft-deactivation pattern used by
    proposal_line_items.product_id and change_order_line_items.product_id.
    Products are retired via is_active=false, not hard-deleted. If a product
    IS hard-deleted, the default task survives (product_id becomes NULL).
- title (text, NOT NULL)
- description (text, nullable)
- labor_phase_id (uuid, nullable, FK to labor_phases ON DELETE SET NULL)
  - A task survives even if a labor phase is retired/deleted.
- sort_order (integer, default 0)
- organization_id (uuid, NOT NULL, default get_user_org_id(), FK to organizations)
- created_at, updated_at (timestamptz, default now())

## 2. proposal_tasks (NEW TABLE)
Stores task snapshots copied from catalog defaults (or manually created) on a
specific proposal. Each proposal task is an independent snapshot — editing a
catalog default task never rewrites an existing proposal task, and deleting a
catalog default task never deletes a proposal task.

Columns:
- id (uuid PK)
- proposal_id (uuid, FK to proposals ON DELETE CASCADE, NOT NULL)
  - If the entire proposal is deleted, its tasks are deleted with it.
- line_item_id (uuid, nullable, FK to proposal_line_items ON DELETE CASCADE)
  - Nullable for manually added tasks. If a proposal line item is removed,
    tasks belonging specifically to that line item are removed.
- source_default_task_id (uuid, nullable, FK to catalog_item_default_tasks ON DELETE SET NULL)
  - Lineage to the catalog default this was copied from.
  - ON DELETE SET NULL: deleting/retiring a catalog default task must NOT delete
    the proposal task snapshot or prevent catalog maintenance.
- title (text, NOT NULL)
- description (text, nullable)
- labor_phase_id (uuid, nullable, FK to labor_phases ON DELETE SET NULL)
- sort_order (integer, default 0)
- organization_id (uuid, NOT NULL, default get_user_org_id(), FK to organizations)
- created_by (uuid, nullable, FK to profiles ON DELETE SET NULL)
- created_at, updated_at (timestamptz, default now())

NO is_deleted column — a normal DELETE is sufficient because no regeneration
or synchronization process exists that would recreate deleted proposal tasks.

## 3. RLS
Both tables get organization-scoped CRUD policies matching the project_tasks pattern:
- SELECT: organization_id = get_user_org_id()
- INSERT: organization_id = get_user_org_id()
- UPDATE: organization_id = get_user_org_id()
- DELETE: organization_id = get_user_org_id()

## 4. Indexes
- catalog_item_default_tasks(product_id)
- proposal_tasks(proposal_id)
- proposal_tasks(line_item_id)

## Snapshot Semantics
Catalog Default Task -> Proposal Task -> Project Task
Each level becomes an independent snapshot when copied forward.
- Changing a Catalog Default Task never rewrites an existing Proposal Task.
- Deleting a Catalog Default Task never deletes an existing Proposal Task.
- Editing a Proposal Task never changes the Catalog Default Task.
- Project Tasks created later are independent operational records.
- Project Task edits never rewrite the approved Proposal Task.
*/

-- ============================================================
-- 1. catalog_item_default_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS catalog_item_default_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE catalog_item_default_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "catalog_default_tasks_select_same_org" ON catalog_item_default_tasks;
CREATE POLICY "catalog_default_tasks_select_same_org"
  ON catalog_item_default_tasks FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "catalog_default_tasks_insert_same_org" ON catalog_item_default_tasks;
CREATE POLICY "catalog_default_tasks_insert_same_org"
  ON catalog_item_default_tasks FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "catalog_default_tasks_update_same_org" ON catalog_item_default_tasks;
CREATE POLICY "catalog_default_tasks_update_same_org"
  ON catalog_item_default_tasks FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "catalog_default_tasks_delete_same_org" ON catalog_item_default_tasks;
CREATE POLICY "catalog_default_tasks_delete_same_org"
  ON catalog_item_default_tasks FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

CREATE INDEX IF NOT EXISTS idx_catalog_default_tasks_product_id
  ON catalog_item_default_tasks(product_id);

-- ============================================================
-- 2. proposal_tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS proposal_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  line_item_id uuid REFERENCES proposal_line_items(id) ON DELETE CASCADE,
  source_default_task_id uuid REFERENCES catalog_item_default_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  labor_phase_id uuid REFERENCES labor_phases(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  organization_id uuid NOT NULL DEFAULT get_user_org_id() REFERENCES organizations(id),
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE proposal_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "proposal_tasks_select_same_org" ON proposal_tasks;
CREATE POLICY "proposal_tasks_select_same_org"
  ON proposal_tasks FOR SELECT
  TO authenticated USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "proposal_tasks_insert_same_org" ON proposal_tasks;
CREATE POLICY "proposal_tasks_insert_same_org"
  ON proposal_tasks FOR INSERT
  TO authenticated WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "proposal_tasks_update_same_org" ON proposal_tasks;
CREATE POLICY "proposal_tasks_update_same_org"
  ON proposal_tasks FOR UPDATE
  TO authenticated USING (organization_id = get_user_org_id())
  WITH CHECK (organization_id = get_user_org_id());

DROP POLICY IF EXISTS "proposal_tasks_delete_same_org" ON proposal_tasks;
CREATE POLICY "proposal_tasks_delete_same_org"
  ON proposal_tasks FOR DELETE
  TO authenticated USING (organization_id = get_user_org_id());

CREATE INDEX IF NOT EXISTS idx_proposal_tasks_proposal_id
  ON proposal_tasks(proposal_id);

CREATE INDEX IF NOT EXISTS idx_proposal_tasks_line_item_id
  ON proposal_tasks(line_item_id);