# Workspace theme regression checklist

Themes: Classic Gradient (`classic`), Light, Dark, MJV.

## Shared rules

- Account `profiles.ui_theme` takes precedence over a stale device cache.
- Save confirmation requires a returned profile row with the requested theme.
- Failed saves, missing migrations, constraints and zero-row updates show an error and restore the previous appearance.
- Page titles use 20px on phones and 24px on desktop; section headings 18px, card headings 16px, body 14px and helper text 12px. Use the shared font stack. TV dashboards explicitly retain display sizing.
- Use `bg-canvas` for content panels, `bg-surface` for inset sections, `bg-elevated` for hover/selected neutral surfaces, and semantic text/border classes. Tint badges use the relevant semantic status surface.
- Use `createWorkspacePortal` for workspace dialogs rendered outside the app root.
- Branded artwork and customer previews use `data-theme-fixed`; customer previews also establish a light token boundary. Keep their appearance identical to the customer view.
- Form text, placeholders, autofill and native options follow the selected palette; mobile editable fields use 16px to avoid iOS zoom.

## Automated verification

Run `npm run test:themes`, `npm run test:themes:browser`, `npm run test:service-requests`, `npm run test:punchlist` and `npm run test:proposals:browser`.

The theme browser harness uses actual components with mocked account/data APIs at 320, 375, 390, 430 and 1280px. It checks all four themes against Settings, populated Flow, populated Service Requests, populated Punchlist, Projects, Tasks and its creation form, Finance, Dispatch, confirmations, portal-rendered content and legacy surface/button fixtures. It measures text contrast across solid and gradient surfaces, heading uniformity, horizontal overflow and selector layout. Persistence scenarios cover reload, stale cache, legacy System normalization, fresh-device account loading, network/schema/constraint failures and zero-row saves.

## Release smoke test

On a connected staging account, repeat these checks with production-like data:

- Select each theme, navigate through Pipeline/Contacts, Proposals and its editor/detail, Sales Orders, Projects, Production, Dispatch, Service Requests, Punchlist, Flow, Finance, Admin, Catalog and Settings. Check loaded lists, selected rows, status badges, empty states and menus.
- Open a form and a body-rendered modal; check entered text, placeholders, dropdowns, validation messages, autofill and disabled controls.
- Reload, sign out/in and sign in on a second device. The account preference must follow the user. Check a second user's independent preference.
- Inspect customer portal previews and business-card artwork for their intended branding.
- On iPhone, keep the theme selector on one row, ensure no horizontal page overflow, and verify proposal expansion and scheduling actions.

The automated harness does not authenticate to a live account or verify live cross-device database synchronization. The existing theme migrations must be present before account saving can succeed.
