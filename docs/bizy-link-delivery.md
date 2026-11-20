# Bizy Link and event command center

The requested workflow combines the existing event registration, sponsor, vendor, payment, floorplan and attendance records with participant self-service and fulfillment reporting.

## Delivery scope

- One public Bizy Link per event with guest registration, contribution and partner entry points. Private partner links restrict roster and vendor details to their recipient.
- Apparel question presets, an ordering cutoff, individual fulfillment exports and grouped production quantities. Preserve the existing first/last names, question audiences and RSVP party validation.
- Persisted table seating and golf foursomes with drag-and-drop assignment, capacity checks, registration identity and revision conflict handling.
- Sponsor deliverable status alongside existing sponsor tiers and fundraising records.
- A downloadable post-event report using actual attendance, settled fundraising, sponsorship records and apparel quantities.
- Vendor and guest SMS composition, delivery status and provider setup. Real SMS delivery depends on a configured provider account and explicit send actions.
- Cohesive public industry pages for Universities, Schools, Nonprofits and SMBs using the supplied copy.

The staffing comparison is a customer goal. The application must calculate reports from actual records rather than generate unsupported savings or fundraising figures.

## Event preparation example

The supplied event roadmap targets March 21–22, 2027. Preparation covers onboarding and event setup in early December, partner links and participant collection through January, apparel cutoffs and initial placements in February, and finalized placements, reminders and check-in preparation in early March. The post-event report is intended for the week of March 24. Event-specific dates and partner access remain configurable.

## Verification

Verify the normal organizer and participant flows, refresh recovery, cross-device persistence, conflicting edits, group capacities, duplicate roster submissions, cutoff enforcement, export quantities and recipient isolation. Browser testing must include actual clicking, saving and submitting in a separate test event. Keep GitHub main synchronized after verification and manually promote the intended Vercel project.

## Current dependency

The user confirmed there is no SMS account yet. Sending vendor texts, invitation texts and automated SMS reminders remains unavailable until a business texting provider and sender are configured. No paid account, phone number, subscription or message is created by this work. The UI distinguishes copying a link into a personal text from sending SMS through Beebizy.

## Organizer workflow

Open an event and choose **Command center**. Start with **Apparel & gear**: add shirt, pant or gift sizing questions in Design invitation, save the invitation, then select those questions for fulfillment. Set the production cutoff in the event time zone. Download individual sizes or grouped vendor quantities as CSV. Record stock received and mark each person's complete gear bundle handed out.

Use **Tables** or **Golf foursomes** to drag guests into groups. The placement menu is the keyboard alternative. A foursome holds at most four people. Save changes to share the board with teammates; other sessions refresh every 15 seconds. Private draft recovery protects unfinished work. Revision checks reject stale saves rather than overwrite a teammate's arrangement. Cancelled assigned guests remain visible so organizers can free their seats.

In **Sponsors & roadmap**, track sponsor deliverables and add a preparation timeline relative to the event date. Dates can be adjusted. These milestones track work; they do not themselves send reminders.

Under **Bizy Link**, copy the general event link, or explicitly create a personal link for a booked vendor or existing sponsor. Sponsor links accept one roster of up to the configured number of named guests and sizing answers. Repeated submissions return the existing result. Vendors submit their own times and a separate note, without seeing internal booking notes or prices. Personal links expire 30 days after the event (or creation, when later) and can be closed immediately. No invitation or email is sent when a link is created. Existing active donation campaigns are available from the same event link through the existing checkout flow.

**Wrap-up report** downloads a standalone, printable HTML report. Open it to print or save as PDF. Its sources are re-read at download time. The report includes attendance, currency-separated settled payment totals, sponsor commitments and deliverables, apparel inventory, placements, vendor schedules and preparation milestones. Unpaid pledges and commitments do not inflate collected funds. Legacy payments lacking currency are listed separately for reconciliation.

## Storage and rollout

Operations and hashed partner grants are private JSON extensions on the existing event row. Atomic JSON key updates preserve invitation design, guest drafts and the other extensions. Normal public event serialization does not expose these fields. Partner access is limited to its own record and private draft. Migration `0101_payment_currency` adds nullable currency fields to donations and bidder bills. New checkouts retain their actual currency; historical unknown values are not guessed. No changes to automatic charging preferences are introduced.

Industry website pages were merged in `taranggoyal70/beebizy-www` PR #8 and published to the existing marketing project. Platform code has a separate release and verification process.
