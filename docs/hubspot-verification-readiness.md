# HubSpot integration: verification readiness

Updated November 11, 2026.

## Confirmed setup

- HubSpot developer account: Beebizy Studio, portal `247905640`.
- Project: `beebizy-hubspot-integration`, platform `2026.09`, deployed build `1`.
- App: Beebizy, ID `60483375`, marketplace distribution.
- The deployed OAuth scopes and Beebizy request match: `oauth`, `crm.objects.contacts.read`, `crm.objects.contacts.write`.
- The callback is `https://beebizy-studio-preview.vercel.app/api/integrations/hubspot/callback`.
- The original customer installation error was the unsigned Acceptable Use Policy. The developer Distribution screen now marks that step **Done** and offers an install URL.
- Marketplace listing status is **Not created**, HubSpot review is **Not started**, and the company connection is now installed for testing. The company install does not qualify as an independent customer pilot.
- Tarang subsequently explicitly approved pilot testing and the unverified-app confirmation. OAuth completed successfully for the company account, portal `247905640`. Do not repeat the obsolete verification-first hold. SCU must connect its own HubSpot account in its own customer workspace, using its authorized administrator.

## HubSpot's review dependency

HubSpot requires at least three active, unique installs from production customer accounts unaffiliated with Beebizy. Active means successful OAuth-authenticated API requests or signed webhook/extension activity within the previous 30 days. Beebizy's own company account and developer test accounts do not satisfy this requirement.

Prepare accurate listing copy, setup instructions, public support/privacy/terms links, permission descriptions, and a working demonstration. Collect the three authorized customer pilots before submitting for review. Never represent the app as HubSpot-verified or publish a listing claiming unimplemented behavior.

The app may remain unlisted during the pilot. The current marketplace distribution permits up to 25 installs before listing. Accepting the AUP did not complete marketplace review.

## Requested email and contact workflow

Tarang clarified that event emails should be sent from Beebizy using HubSpot contacts. The intended company sender is `hello@beebizy.com`; `tarang@beebizy.com` is the administrator's work login. The existing saved environment copy has `MAIL_FROM=Beebizy <hello@beebizy.com>` and an email provider key configured. Production delivery/domain verification was not tested in this task; do not claim that it was.

The desired integration imports all contacts into the workspace address book and keeps their contact details updated from HubSpot. Planners then select contacts for an event's registration/invitation list, which is also used for Check-in. "Checklist" in this request means this registration/check-in contact selection, not importing HubSpot tasks.

Current implemented sync is outbound: Beebizy registrations and attendance update HubSpot contacts and event notes when an event explicitly enables sync. Inbound contact sync and explicit event selection are implemented on `codex/hubspot-inbound-email-sync`. See `docs/hubspot-contact-sync.md` for the workflow and release evidence. Importing contacts must not automatically send emails, mark guests arrived, or create confirmed RSVPs. Preserve existing guest notes, custom RSVP answers, event history, tenant boundaries, and name metadata. Match stable HubSpot IDs and normalized email addresses without duplicating people; surface conflicting identities for review.

## Sources

- [HubSpot app management, AUP, distribution and install limits](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/manage-apps-in-hubspot)
- [Marketplace listing requirements and active installs](https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements)
- [HubSpot Acceptable Use Policy](https://legal.hubspot.com/acceptable-use)
