# Model/SKU and proposal template release audit

PR #248 integrates main after Rewards PR #261. Existing product columns retain
their storage meaning: `manufacturer_model_number` is the company's Model/Alias;
`sku` is the manufacturer/distributor ordering identifier. New product forms copy
Model/Alias into SKU until the user edits SKU. Editing an existing product retains
its SKU. Catalog identity presents Model/Alias first and a distinct ordering SKU.
Purchase order line creation already uses product SKU in the legacy
`model_number` purchase-line field; this change clarifies its label, preserving
existing purchasing, email and receiving contracts. UPC details from main remain.

## Templates and document access

Company templates can be created/edited/deleted/defaulted only by active company
administrators (admin/owner/super_admin). Active staff can create and edit their
own personal templates; metadata and scope cannot be reassigned through the API.
Company default switches are atomic and serialized, with one default per company.
Legacy template company metadata is preserved; new copies receive the current
company/creator after copying display preferences.

The installed database lacked `show_installed_price` and `show_item_color`; the
migration adds these settings. It replaces permissive same-organization template
writes and preserves selected-template reads for older portal clients during
rollout. Customers can read only templates sent on their own proposal/order;
their document ownership bindings cannot be rewritten to borrow another template.
The new proposal-specific resolver supports company default inheritance and
sales-order overrides without listing other staff members' private templates.

The document edge function now validates a real user and authorized proposal/
template before service-role reads. Portal callers cannot override stored display
flags. Template lookup failures in the portal stop rendering instead of showing
all fields. The public shared-link entrypoint remains its existing limited,
token-validated summary; expanded decision behavior belongs to subsequent #258.

## Rendered values

Model and SKU display independently in portal and printable HTML. Identifier
strings are escaped before HTML interpolation. Hidden line items stay hidden.
Unit price is separate from the stored equipment line total. Installed total is
equipment plus labor, matching `calculate_proposal_totals`; explicit stored zero
labor is preserved, and null-labor fallback includes quantity. Labor-only and
customer-supplied items follow the database parts/labor definition. Parts-only
deposits use the stored parts total, rather than subtracting labor a second time.
The quantity visibility flag is honored in the generated table.

This changes presentation and permissions; stored proposals, order amounts,
customer records, catalog identities and existing templates are retained.
The existing generator returns printable HTML, as its existing document adapter
expects. Browser printing was checked as a 612 x 792 point Letter PDF; this PR
does not rename HTML attachments as binary PDFs.

## Verification

- Full application typecheck and production build.
- Executable template SQL tests in PGlite locally and PostgreSQL 17 in CI:
  company/personal CRUD, admin/manager/portal/inactive/anonymous/tenant boundaries,
  immutable metadata, default switching and private selected-template rendering.
- Separate PostgreSQL sessions race default switches and invalid requests.
- Actual edge handler tests: authentication before privileged reads, template
  restrictions, all model/SKU visibility combinations, zero/quantity amounts,
  hidden items, escaped identifiers and failure of partial document generation.
- Browser coverage of both real product forms, existing SKU preservation, portal
  flags and failure handling at 320/390/768/1440 in both themes, and company versus
  personal template creation controls. Actual generator output is printed and
  visually inspected. Existing preview side-effect tests remain enforced.
- Existing purchasing, product-dialog and Promise document regressions.
- Dedicated CI runs Deno checking against the pinned edge SDK. Local JSR network
  access is unavailable; local strict TypeScript checking used installed SDK types.

Before merge, require latest-head CI, apply/verify migrations and deploy the
updated document function with JWT verification enabled. Record production
verification separately; tests alone are not deployment evidence. Purchasing CI
uses the same bounded headless browser setup as the already-reviewed workflows.

Builder consumer audit: Model/Alias and ordering SKU have separate controls in both PDF settings views. Template apply/save preserves independent item color, installed amount and labor amount flags. Saving an existing template changes display settings without rewriting legacy company/creator/scope/default metadata; new copies bind the current organization/company. Company saves require administrators in both UI and handler. Actual builder handler regression coverage exercises these paths.
