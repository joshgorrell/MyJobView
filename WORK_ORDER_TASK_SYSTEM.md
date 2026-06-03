# Work Order Task Management System

## Overview

A comprehensive task management system for work orders that supports both project-based and service-based work orders. Tasks can be sourced from approved proposals or created manually, with full support for multi-technician assignments and real-time collaboration.

## Key Features

### 1. Project Task Management

**Automatic Task Generation from Proposals**
- When a proposal is approved and converted to a sales order with a project, tasks are automatically generated from proposal line items
- Each line item with labor phases creates individual project tasks
- Tasks include:
  - Title (auto-generated from room, product, and phase)
  - Description (from tech notes or line item description)
  - Labor phase assignment
  - Estimated hours
  - Traceability back to source proposal line item

**Manual Task Management**
- Project managers can add custom tasks not from proposals
- Edit task details, hours, and descriptions
- Assign tasks to labor phases for organization
- Mark tasks as open, completed, or cancelled
- Delete tasks that are no longer needed

**Task Organization**
- Tasks grouped by labor phase
- Collapsible phase sections for better organization
- Filter view by specific phase or show all
- Sort order maintained from proposal
- Completion counts show how many times task was completed across work orders

### 2. Work Order Integration

**Phase-Based Task Filtering**
- Work orders can be assigned to specific labor phases
- Only tasks from selected phase are displayed to technicians
- Helps focus technicians on relevant work for their assignment
- Optional - can show all tasks if no phase selected

**Work Order Groups for Multi-Tech Assignments**
- When creating service/warranty work orders with multiple technicians
- System creates one work order per technician
- All work orders linked via `work_order_group_id`
- Each technician has individual work order for notes and time tracking
- Tasks are shared across the group

### 3. Task Completion Tracking

**Individual Tech Completion**
- Each technician can mark tasks complete independently
- Record actual hours spent on each task
- Add completion notes
- See who else has completed the task in multi-tech scenarios
- Real-time updates show other technicians' completions

**Completion Visibility**
- Green checkmark for tasks you've completed
- Blue indicators show other technicians' completions
- Shows technician name and hours for each completion
- Helps coordinate multi-tech work without duplication

### 4. Service Work Order Tasks

**Manual Task Creation**
- For service/warranty work orders without projects
- Simple add interface with title, description, and hours
- Tasks optional - description alone often sufficient
- Can add, edit, and delete tasks at any time

**Shared Tasks for Multi-Tech Work**
- Tasks created for work order groups are shared
- All technicians in group see the same task list
- Completion tracking works the same as project tasks
- Real-time collaboration on task completion

### 5. Project Dashboard

**Task Overview in Project Detail**
- New "Tasks" tab in project detail view
- Complete list of all project tasks
- Grouped by labor phase with summary counts
- Shows open vs completed task counts per phase
- Displays estimated hours per phase
- Allows project managers to manage tasks

**Work Order Assignment Context**
- See which tasks have been completed and how many times
- Track completion across multiple work orders
- Identify tasks not yet addressed by any work order
- Monitor progress by phase

## Database Schema

### New Tables

**project_tasks**
```sql
- id (uuid, primary key)
- project_id (references projects)
- title (text)
- description (text)
- labor_phase_id (references labor_phases)
- estimated_hours (numeric)
- status (open | completed | cancelled)
- sort_order (integer)
- source_line_item_id (uuid)
- source_phase_id (uuid)
- created_by (references profiles)
- completed_at (timestamptz)
- created_at, updated_at (timestamptz)
```

**work_order_task_completions**
```sql
- id (uuid, primary key)
- work_order_id (references work_orders)
- project_task_id (references project_tasks)
- work_order_task_id (references work_order_tasks)
- technician_id (references profiles)
- completed_at (timestamptz)
- actual_hours (numeric)
- notes (text)
- created_at (timestamptz)
```

### Table Enhancements

**work_orders**
- `work_order_group_id` (uuid) - Links sibling work orders for multi-tech assignments
- `labor_phase_id` (uuid) - Filters tasks by phase
- `is_group_work_order` (boolean) - Indicates multi-tech work order
- `project_id` now allows NULL for service work orders

**work_order_tasks**
- `shared_task` (boolean) - Indicates task shared across group
- `project_task_id` (uuid) - Links to master project task
- `completed_by` (uuid) - Tracks who completed the task

## Components

### ProjectTasksList
Location: `src/components/Projects/ProjectTasksList.tsx`

Displays and manages project tasks with:
- Phase-based grouping
- Add/edit/delete functionality
- Completion status toggle
- Filter by phase
- Completion count tracking

### WorkOrderTasksChecklist
Location: `src/components/Production/WorkOrderTasksChecklist.tsx`

Interactive checklist for technicians with:
- Project task display (filtered by phase)
- Service task display (work order specific)
- Check/uncheck to mark complete
- Hours entry on completion
- Real-time updates of other techs' completions
- Multi-tech collaboration visibility

### ServiceWorkOrderTaskManager
Location: `src/components/Production/ServiceWorkOrderTaskManager.tsx`

Simple task management for service work orders:
- Add tasks with title, description, hours
- Drag and drop reordering
- Delete tasks
- Shows shared status for group work orders

## Triggers and Functions

### generate_project_tasks_from_proposal()
- Fires when sales order is created with proposal
- Iterates through proposal line items with labor phases
- Creates project_task entries for each phase
- Maintains traceability and sort order

### generate_project_tasks_on_project_creation()
- Fires when project is created
- Checks for linked sales order and proposal
- Generates tasks if not already created
- Prevents duplicate task generation

## Usage Workflows

### For Project-Based Work

1. **Proposal Creation**: Sales team creates proposal with line items and labor phases
2. **Approval**: Customer approves proposal
3. **Conversion**: Proposal converts to sales order and project
4. **Task Generation**: System automatically creates project tasks from proposal
5. **Work Order Creation**: Project manager creates work order and selects labor phase
6. **Task Assignment**: Technician sees filtered tasks for their phase
7. **Completion**: Technician checks off tasks as completed with hours
8. **Tracking**: Project manager monitors completion across all work orders

### For Service/Warranty Work

1. **Work Order Creation**: Service request creates work order
2. **Tech Assignment**: Single or multiple technicians assigned
3. **Multi-Tech**: If multiple techs, creates one work order per tech (linked by group ID)
4. **Task Addition** (Optional): Manager or tech adds tasks to work order
5. **Shared Tasks**: In multi-tech scenarios, tasks shared across all work orders
6. **Completion**: Each tech marks tasks complete independently
7. **Collaboration**: Techs see each other's completions in real-time
8. **No Tasks**: Work can be completed with only description, no tasks required

## Security & Permissions

### Row Level Security

**project_tasks**
- View: Project managers, admins, assigned technicians
- Create/Update/Delete: Project managers, admins

**work_order_task_completions**
- View: Technician who completed, work order assignee, group members, managers
- Create: Technicians for their own completions
- Update/Delete: Own completions or managers

**work_order_tasks**
- View: Work order assignee, shared task group members, managers
- Create/Update: Managers
- Update: Technicians for their assigned work orders

## Real-Time Features

- Task completion updates broadcast via Supabase real-time
- Technicians see other techs' completions immediately
- No page refresh needed for collaboration visibility
- Works across work order groups seamlessly

## Benefits

1. **Automatic Task Generation**: No manual data entry from proposals to tasks
2. **Phase-Based Organization**: Technicians see only relevant tasks
3. **Multi-Tech Coordination**: Clear visibility of who's completed what
4. **Flexible for Service**: Tasks optional, description often sufficient
5. **Traceability**: Tasks linked back to proposal line items
6. **Time Tracking**: Per-task hour tracking aggregates to project level
7. **Real-Time Collaboration**: Instant updates across technician teams
8. **Manager Oversight**: Complete visibility of task completion and hours

## Technical Notes

- Uses Supabase real-time for live updates
- Efficient RLS policies prevent unauthorized access
- Triggers ensure automatic task generation
- Support for both project and service work order types
- Graceful handling of NULL project_id for service work
- Group ID system enables multi-tech collaboration
- Task completion tracked separately from task status
