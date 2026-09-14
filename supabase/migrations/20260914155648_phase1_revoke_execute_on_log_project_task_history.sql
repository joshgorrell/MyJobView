/*
# Phase 1: Revoke EXECUTE on log_project_task_history from anon and authenticated

## Problem
The security advisor flagged that log_project_task_history() can be executed
directly via /rest/v1/rpc/log_project_task_history by any authenticated or anon
user. This is a trigger function that should only be called by the database
trigger, not via the REST API.

## Fix
REVOKE EXECUTE on the function from anon and authenticated roles.
The function is SECURITY DEFINER and runs as the trigger caller, so direct
execution via the API could allow users to insert arbitrary history records.
*/

REVOKE EXECUTE ON FUNCTION log_project_task_history() FROM anon, authenticated;