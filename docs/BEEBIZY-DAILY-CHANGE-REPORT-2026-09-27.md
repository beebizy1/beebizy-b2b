# Beebizy Change Report

**Changes completed:** September 27, 2026

**Prepared for review:** September 29, 2026

**Product:** Beebizy Studio

**Live preview:** https://beebizy-studio-preview.vercel.app

## Meeting overview

Yesterday's work focused on removing the main points of friction reported during testing. The updates make it easier to bring existing guest lists into Beebizy, assign responsibilities, manage vendor payments, organize a multi-day event, and arrange the workspace around each team's process.

All changes in this report are complete and available on the Beebizy preview site.

## At a glance

| Area | What changed | Why it matters |
| --- | --- | --- |
| Guest imports | Beebizy now recognizes more spreadsheet formats and lets the user confirm how each column should be used. | Teams can use existing lists without renaming every column first. |
| Assignments | New checklist and run-of-show assignments can send the assignee an email with a direct link. | The person responsible can open the exact item and act on it. |
| Deposits | Deposits now save correctly and connect to vendor and budget information. | Teams can track contracted, paid, outstanding, and overdue amounts in one place. |
| Vendors | Adding a vendor from an event keeps the user inside that event. | The workflow no longer sends the user away from the page they were using. |
| Multi-day events | A shared day selector now carries the selected day across event sections. | Schedules and volunteer shifts can be organized by Day 1, Day 2, and beyond. |
| Workspace layout | Teams can rearrange event tabs into the order they prefer. | Each organization can match Beebizy to its own workflow. |
| Spreadsheet tools | Import actions are easier to find in key planning sections. | Existing checklist, budget, and floorplan information is faster to bring in. |

## Changes completed

### 1. More flexible guest-list imports

Guest lists no longer need to follow one exact Beebizy template.

- Upload a CSV file, paste spreadsheet data, or load a public Google Sheet.
- Beebizy suggests which columns contain the guest name, email, organization, guest type, notes, and number of attendees.
- The user can review and change those suggestions before importing.
- A guest can be imported without an email address. This supports door lists and records that only contain names.
- A single spreadsheet row can represent more than one attendee, such as a guest plus a partner.
- The registration, check-in, analytics, and printed check-in totals now count people accurately, not only spreadsheet rows.
- The system checks event capacity before importing the list.

**Real-world check:** The Mrs. Bench registration sheet was tested successfully. Beebizy read 16 spreadsheet rows representing 32 attendees.

### 2. Clearer responsibility emails

Assignment delivery was strengthened for the three places where teams coordinate event-day work.

- Checklist assignments can send an email when a person is assigned.
- Run-of-show assignments can send an email with the event day and time.
- Volunteer assignments continue to include the role and shift time.
- Each message links directly to the assigned item, where the assignee can review it, mark it complete, or add it to Google Calendar.
- Existing verified Beebizy users can be activated in the correct workspace without being trapped in a repeated invitation flow.
- Organizers can also send one combined responsibilities email instead of forwarding several separate messages.

### 3. Reliable deposits and vendor payment tracking

The Deposits section now works as a complete payment tracker.

- New deposits save correctly.
- Vendor commitments and relevant budget items can appear in the payment plan.
- Teams can see contracted, paid, outstanding, and overdue totals.
- Deposit status can be updated as pending, paid, overdue, or refunded.
- The remaining amount is calculated from the vendor commitment and recorded payments.
- Adding a new vendor from inside an event now returns the user to the same event and connects that vendor to it.

### 4. Multi-day event organization

Multi-day events now use one shared day selector across the workspace.

- Users can add Day 2, Day 3, and additional event days.
- The selected day stays active while moving between event sections.
- Run-of-show items and volunteer shifts follow the selected day.
- Event-wide information, such as the overall budget, remains shared across all days.

This makes it easier to manage a conference or program that includes setup, sessions, meals, and follow-up activities on different days.

### 5. Custom event-tab order

Teams can now select **Arrange** and move event tabs up or down.

- A team can place the sections it uses most at the beginning.
- The saved order applies across events in the selected Beebizy view.
- New sections are still shown, even when a custom order has already been saved.
- The default order can be restored at any time.

The current preference is saved in the browser being used. A future enhancement can save it to the person's Beebizy account so it follows them to every device.

### 6. Easier-to-find spreadsheet imports

Spreadsheet import actions are now visible inside the Checklist, Budget, and Floorplan sections instead of requiring the user to leave the work they are doing.

The importer also recognizes more common column names, including:

- Action item
- Completion date or target date
- Point person or person responsible
- Task owner
- Complete or done

This makes existing client spreadsheets more likely to import correctly without manual cleanup.

## Before and now

| Before | Now |
| --- | --- |
| A guest sheet could fail when its headings did not match Beebizy exactly. | Beebizy suggests column matches and lets the user correct them before import. |
| A list of 16 couples could appear as only 16 registrations. | Party size is retained, so the system can show 32 people. |
| A task assignment could require the organizer to explain where to find it. | The assignee can receive a direct link to the exact checklist or run-of-show item. |
| Deposits could fail to save or remain disconnected from vendor commitments. | Deposits save and roll into paid and outstanding totals. |
| Adding a vendor could move the user away from the event. | The vendor is added to the event and the user returns to the event workflow. |
| Event tabs appeared in one fixed order. | Teams can arrange tabs to match their process. |
| Multi-day planning was strongest only in the run of show. | The chosen day now follows the user across the workspace and supports volunteer shifts. |

## Verification and release status

| Check | Result |
| --- | --- |
| Live preview | Updated and available |
| Automated quality checks | 381 passed |
| Type check | Passed |
| Code quality check | Passed with no errors |
| Database updates | Included for deposits and attendee counts |
| Real spreadsheet test | Mrs. Bench sheet imported as 16 rows and 32 people |

The four existing development warnings are internal file-organization notices. They do not affect client use of the preview.

## Suggested review for tomorrow's meeting

1. Import a guest list whose column names do not match Beebizy.
2. Confirm the total number of people, including party sizes.
3. Open the registration list, check-in view, and printable guest list.
4. Assign one checklist item and one run-of-show item, then open the emailed links.
5. Add a vendor, record a deposit, and update its payment status.
6. Add a second event day and confirm that the selected day follows the user across tabs.
7. Rearrange the event tabs and confirm the preferred order.

## Decisions to confirm

- Should attendee count mean the total number of people in the party, or the number of additional guests beyond the named person? Beebizy currently treats it as the total number of people represented by that row.
- Should the custom tab order follow each person across all devices? It currently stays with the browser and Beebizy view where it was arranged.
- Which two or three real client spreadsheets should be used for the next import test?

## Bottom line

Yesterday's release addressed the most important operational feedback from hands-on testing. The largest improvement is that Beebizy now adapts more easily to the spreadsheets and working habits clients already have, while keeping registrations, assignments, schedules, vendors, and payments connected inside the event.
