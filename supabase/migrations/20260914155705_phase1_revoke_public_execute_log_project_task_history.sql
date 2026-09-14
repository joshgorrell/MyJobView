/*
# Phase 1: Revoke EXECUTE on log_project_task_history from PUBLIC

The previous migration revoked from anon and authenticated, but PUBLIC still
had EXECUTE. Revoke from PUBLIC so only postgres and service_role can execute
the trigger function directly. The trigger itself runs as the table owner,
which still has access.
*/

REVOKE EXECUTE ON FUNCTION log_project_task_history() FROM PUBLIC;