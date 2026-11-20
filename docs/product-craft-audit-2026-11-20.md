# Beebizy product-craft audit

Reviewed November 20, 2026. Scope: the Bizy Link/Command center release, its vendor schedule and finance handoffs, public partner forms, exports and the original delivery requirements. This is a focused workflow audit, not proof that every feature in Beebizy or every external provider is complete.

## Result

The implemented core works, but the full requested scope remains incomplete. SMS delivery, automatic link reminders and size collection in the separate paid-ticket checkout remain open.

## Findings and corrections

| Location | Observed issue | Correction |
| --- | --- | --- |
| Budget header | The real QA event showed $0 committed spend while its vendor commitment and ROI estimate showed $500. | Header and ROI now share the same vendor-aware calculation, preserving named-line deduplication and zero actual amounts. |
| Payments header and filter | A $500 vendor without a manually created payment plan showed $0 outstanding and was absent from Balance due. | Suggested vendor contracts now contribute to outstanding totals and the balance-due filter. Paid and refunded legacy payments remain distinct. |
| Final-payment summary | Confirming the final payment could settle the row without including the remaining contract in the Paid total. | A manually confirmed final payment settles the contract in both totals; reopening restores the balance based on recorded paid deposits. This records a payment status and does not initiate a transfer. |
| First payment entry | Creating the first plan changed the row identity; typing into the next field during the save could also be overwritten. | Stable row identity plus a visible saving state and temporarily disabled row controls protect entry until the mutation completes. The rapid-entry check confirmed the name remained present after saving. |
| Fundraising summary | Sponsor commitments/current bids could be mistaken for money received. | Label changed to Fundraising commitments, with an explanation. Command center and the wrap-up report continue using actual recorded collections. |
| Sponsor form | A one-person limit read “1 named guests.” | Singular/plural wording corrected. |

## Evidence

- Fresh baseline: 751 tests passed. After fixes: 757 tests across 101 files, type checking, lint and build passed.
- Live isolated QA event: `evt_4847063664be4718be47`. Eight named people, one sponsor, one vendor, three selected size questions, saved table/foursome and one M handout were preserved.
- Downloaded the actual live production CSV: L requested 3/received 2/out 0/stock 2; M requested 2/received 2/out 1/stock 1; S requested 1/received 0/out 0/stock 0.
- Downloaded the actual live report at operations revision 12: eight named people, zero checked in, $2,500 sponsor commitment kept separate from collected money, $500 vendor contract, arrival 08:00/service 10:00/departure 15:00, saved groups and sponsor deliverable.
- Live screens showed the same vendor and cost in Vendors, Run of Show, Budget and Payments. The pre-fix misleading summary values were reproduced there before editing.
- Local UI using the isolated demo adapter: booked a vendor with a $500 contract; Budget showed $500 committed and Payments showed $500 outstanding. Recorded a paid $100 deposit: $100 paid/$400 outstanding. Confirmed final payment: $500 paid/$0 outstanding. The final-payment control required the payer name first.
- Rapid first-entry check: the next field was disabled while saving, re-enabled afterward, and retained “QA reviewer.”
- Narrow viewport: 390px viewport and 390px page width. The wide payments table scrolls inside its container.
- Existing full-golf-group destinations are disabled. The task chooser, original preparation milestones, sponsor promises, no-login forms and current-record report generation were inspected live.

Local demo screenshots and actual downloaded QA exports are in `Downloads/Beebizy Command Center QA`. Demo screenshots are not presented as customer data or provider delivery receipts.

## Published verification

PR #40 is merged. The existing Studio URL was promoted to `dpl_G2tL6su6Gk9fuQs2XPHc23i5E6yA` with application commits `368459d` and `e3f47b6`. After reloading the live QA event, Budget showed $500 committed, Payments showed $500 outstanding, and the Balance due filter included the unpaid vendor. Fundraising showed $2,500 explicitly as commitments, and the private sponsor form used the corrected one-guest wording. The four live industry routes returned HTTP 200. Local mutation checks remain separate from these read-only live release checks.

## Remaining work and limits

| Item | Status |
| --- | --- |
| Direct vendor/guest SMS | Unavailable. The user has no business texting account/provider configured. No paid account, sender or subscription was created. |
| Automatic Bizy Link reminders | Not implemented. Important dates are a manual work tracker. |
| Per-ticket sizes in paid checkout | Not implemented by this release. Sizes currently cover public RSVP and invited sponsor lists. |
| Public sponsor/vendor self-onboarding | Current flow requires the organizer to add the partner record and create its private link first. |
| Board report delivery | On-demand HTML with Print/Save as PDF; not automatically emailed after the event. |
| SCU HubSpot portal | This audit does not verify SCU's separate account or connection. The prior 201-person company-portal proof remains a separate dated test. |
| Staffing claim | Two people doing twenty people's work is a customer goal, not a measured result. |

No customer event was edited, and no email, SMS, external payment or paid service was initiated during this audit. This review did not involve first-time-user research with children and does not claim universal usability or zero remaining defects.
