/*
  # Make change_orders.project_id nullable

  The project_id column was NOT NULL but many change orders are created
  before a project exists. Making it nullable so creation never fails
  due to a missing project link.
*/
ALTER TABLE change_orders ALTER COLUMN project_id DROP NOT NULL;
