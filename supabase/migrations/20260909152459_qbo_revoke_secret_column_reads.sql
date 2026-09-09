/*
# QBO 1.1: Revoke Residual Secret Column Reads

## Summary

The earlier privilege restriction removed client writes, but a legacy table
grant still allowed the anonymous role to select QuickBooks access and refresh
tokens. This migration explicitly revokes all client SELECT and REFERENCES
privileges on token and token-version columns.

## Security

- Anonymous and authenticated browser roles cannot read access_token.
- Anonymous and authenticated browser roles cannot read refresh_token.
- Anonymous and authenticated browser roles cannot read token_version.
- Trusted server-side functions using the service role are unaffected.
- No data is changed or deleted.
*/

REVOKE SELECT (access_token, refresh_token, token_version),
  REFERENCES (access_token, refresh_token, token_version)
ON quickbooks_settings FROM anon, authenticated;
