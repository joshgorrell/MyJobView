# Smart Intake department notification behavior

Electronic Life service launch:
- Bobbi Holthaus: intended primary notification recipient, subject to selecting her verified MJV user account in dealer settings.
- JP: optional secondary notification recipient, subject to selecting the correct MJV user account.
- Anyone with Service Center department access and the appropriate request permissions may see and handle the shared intake queue.

Dealer administrators configure notification recipients independently of Service Center access. Configure notification kinds separately: new service request, urgent request, and needs human review. Avoid notifying existing Gmail forward recipients merely because they receive mailbox copies.

When an authorized employee claims, reassigns, resolves or reclassifies intake, write an audit event. Notifications should deep-link to the request and deduplicate on intake ID plus notification kind and recipient. Do not leak customer message bodies to users outside the department.

The notification helper is a pure policy model, not yet integrated with the live MJV notification system. The actual user IDs and department permission mapping must be verified before activation.
