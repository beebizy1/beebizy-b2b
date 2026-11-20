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

Open an event and choose **Start the guided setup** from Overview, or open **Command center**. The four cards guide you through sizes, sharing, placement and reporting. In **Sizes & supplies**, add a shirt, pant or gift question and its packing-list selection together. Use the full form settings for custom options or required questions. Set the production cutoff in the event time zone. Download individual sizes or grouped vendor quantities as CSV. Record stock received and mark each person's complete gear bundle handed out.

The cutoff and cancellations remove new production requests, not already recorded handouts. Known-size handouts remain in inventory totals after a cutoff or cancellation; the individual export includes registration status. This keeps the remaining-stock calculation from increasing merely because the order window closes.

Use **Tables** or **Golf groups** to drag guests into groups. The placement menu is the keyboard alternative and disables full destinations. Cards show names and places first; choose Edit to change a group. A foursome holds at most four people. Save changes to share the board with teammates; other sessions refresh every 15 seconds. Private draft recovery protects unfinished work. Revision checks reject stale saves rather than overwrite a teammate's arrangement. Cancelled assigned guests remain visible so organizers can free their seats.

In **Sponsors & dates**, track sponsor promises and add important dates relative to the event date. Dates can be adjusted. These milestones track work; they do not themselves send reminders.

Under **Share links**, copy the general event link, or explicitly create a personal link for a booked vendor or existing sponsor. Sponsor links accept one roster of up to the configured number of named guests and sizing answers. Repeated submissions return the existing result. Vendors submit their own times and a separate note, without seeing internal booking notes or prices. Personal links expire 30 days after the event (or creation, when later) and can be closed immediately. No invitation or email is sent when a link is created. Existing active donation campaigns are available from the same event link through the existing checkout flow.

**Event report** downloads a standalone, printable HTML report. Open it to print or save as PDF. Its sources are re-read at download time. The report includes attendance, currency-separated settled payment totals, sponsor commitments and deliverables, apparel inventory, placements, vendor schedules and preparation milestones. Unpaid pledges and commitments do not inflate collected funds. Legacy payments lacking currency are listed separately for reconciliation.

## Storage and rollout

Operations and hashed partner grants are private JSON extensions on the existing event row. Atomic JSON key updates preserve invitation design, guest drafts and the other extensions. Normal public event serialization does not expose these fields. Partner access is limited to its own record and private draft. Migration `0101_payment_currency` adds nullable currency fields to donations and bidder bills. New checkouts retain their actual currency; historical unknown values are not guessed. No changes to automatic charging preferences are introduced.

Industry website pages were merged in `taranggoyal70/beebizy-www` PR #8 and published to the existing marketing project. Platform code has a separate release and verification process.

## Verification evidence

The isolated QA event exercises the real database without sending email, SMS or payments. Native checks cover simultaneous roster submissions alongside normal RSVP, complete rollback at capacity, workspace and partner isolation, link closure, deleted-partner access and expiry while waiting for the event transaction lock. The expiry check verifies that a transaction accepted before expiry finishes completely and that later reads are denied.

Chrome checks covered organizer link creation, two named sponsor guests with independent sizes, draft recovery after reload, submission persistence, automatic fulfillment totals, vendor time and note updates, and their appearance in Run of Show. The actual downloaded production CSV matched requested, received, handed-out and remaining-stock values. Table drag-and-drop, saving and printable report download were verified. The current and previous saved operations versions survive server reads. Active event views refresh registration counts, readiness and vendor schedules every 15 seconds; event editor forms do not opt into event polling.

## Scope check and usability refinement

The full request is not complete until messaging and reminders are delivered. The implemented core is listed below with its current boundaries.

| Request | Current result |
| --- | --- |
| Guests and VIPs choose sizes | Public RSVP and invited sponsor guest forms collect the configured size questions. The guided setup adds a preset and its packing-list selection in one action. |
| Vendor-ready fulfillment report | Individual and grouped CSV exports, known-size quantities, stock received and recorded handouts are available. Missing answers remain visible in the individual list. |
| Fundraising, sponsors and vendor schedules together | Command center shows recorded payments by currency, sponsor promises and links to the existing budget/payment/schedule tools. Vendor self-service times update the shared booking used by Run of Show. |
| Tables and golf foursomes | Saved drag-and-drop groups with capacity checks and an accessible move menu. The physical floor-plan canvas remains a separate event tool. |
| Instant wrap-up | An on-demand printable HTML report checks the latest source records. The downloaded file can be printed or saved as PDF. |
| One Bizy Link | Guests use the event link. Sponsors and booked vendors receive private links for their own form. Partner records are added by the organizer first; confirmed sponsor lists are changed through the organizer. |
| Self-service contributions | Existing active event donation campaigns are linked to their existing checkout. Payment setup remains an explicit organization action. No charging preference changed. |
| Texting vendors and guest invitation links | Pending. No business texting provider/account is connected, and this release does not send SMS. |
| Automatic link reminders | Pending. Important dates are a work tracker, not an automatic message schedule. |
| December to March preparation | Suggested dates are generated from the event date and remain editable. A March 21 start produces December 1, December 15, February 15, March 7, March 21 and March 24 milestones. |
| Industry pages | Universities, Schools, Nonprofits and SMB pages are live in the existing website style. |
| Two people doing twenty people's work | A customer staffing goal, not a measured or promised result. |

The refinement starts with a four-step guide: choose details, share links, arrange guests, get the report. Task choice is kept in the URL so Back navigation and vendor-form returns reopen the right screen. Tables show names and places first, with optional editing controls. Full destinations are disabled in the move menu. Sharing has explicit copy buttons, visible private-link limits, and a short path for adding a missing sponsor or vendor. The guest forms use plain language and no account setup. Unfinished editing still uses complete local/server draft recovery and saved-version checks.

Size collection in this release is attached to RSVP and sponsor guest lists. The separate paid-ticket checkout keeps its existing question behavior; this work does not add per-ticket size questions to that checkout.
