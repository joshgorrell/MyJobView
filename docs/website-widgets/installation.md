# Dealer website widget installation (release candidate)

Do not install on a live website until the release is approved.

1. In MJV Admin > Integrations > Website Widgets, configure each desired widget separately.
2. Enter exact HTTPS website origins (including www or staging subdomains separately). Set routing, appearance and applicable portal or review destination.
3. Save. Once the platform runtime is released, enable the widget and copy its installation code.
4. Paste that widget's script into the HTML location where it should appear. Analytics is invisible and should be installed only once per page. No other widget is required.
5. Publish to a private test site first. Verify mobile and desktop rendering, customer submission, staff receipt, retry behavior and disabled behavior.
6. Disable a widget in MJV to stop its public runtime without editing website HTML.

## Platform operator release gates
Apply migrations in order and verify schema compatibility, deploy public edge functions with runtime disabled, publish widget assets with cross-origin module access, configure Turnstile site key and secret for approved domains, and validate staging. Enable WEBSITE_WIDGET_RUNTIME_ENABLED and VITE_WEBSITE_WIDGET_ACTIVATION only in the approved environment. Never expose service-role credentials in embed code.

Electronic Life pilot: use synthetic records and the private prototype only. Confirm each intake arrives in the intended MJV workflow and verify chat replies, portal authentication, and analytics. Obtain owner approval before connecting electroniclife.com. Roll back by disabling the global runtime and individual widget settings.

## Hosting acceptance
The asset host must return JavaScript MIME types and Access-Control-Allow-Origin: * for public /website-widgets/*.js modules. This is for static assets only; API responses must continue to enforce exact dealer origins. Verify headers against the actual staging host, since not all hosting providers honor public/_headers. Keep module caching short to allow compatible fixes.
