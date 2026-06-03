/*
  # Remove Legacy Menu System

  1. Tables to Drop
    - `menu_items` - Main menu items table
    - `menu_item_roles` - Role-based menu access
    - `menu_role_permissions` - Permission mappings
    - `user_menu_overrides` - User-specific menu customizations

  2. Clean Up
    - All associated indexes are automatically dropped
    - All foreign key constraints are automatically removed
    - All RLS policies are automatically removed

  3. Why
    - System has fully migrated to Department-based navigation
    - Menu system is no longer used in the application
    - Simplifies codebase and reduces technical debt
*/

-- Drop tables (dependencies first)
DROP TABLE IF EXISTS user_menu_overrides CASCADE;
DROP TABLE IF EXISTS menu_item_roles CASCADE;
DROP TABLE IF EXISTS menu_role_permissions CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
