# Additional guests on event RSVPs

## Live behavior

The invitation designer now includes **Allow attendees to bring guests** and **Maximum extra guests per registration**. Limits range from one to ten; existing events default to off. These organizer settings use the existing private device/server draft recovery, with explicit Save invitation to publish.

Carlin's event has one extra guest enabled. Only `maxAdditionalGuests` was changed in her registration-page settings; the remaining page content was compared before/after and is identical. Her four actual registration rows remain untouched.

Guests choose **Add a guest**, enter separate first/last names, and answer the organizer's questions for that person. Guest email is optional. The submitting person receives one confirmation listing their party. Each person gets an individual registration and check-in entry, quantity one, and a common RSVP group reference with Registered by/Registrant email columns in exports. Anonymous unfinished forms retain the complete party on that device; they are not confirmed until explicitly submitted.

This extends the RSVP flow. Paid tickets retain their existing ticket-quantity checkout. Existing primary auction bidder allocation is unchanged; this feature does not create or email a new private bidder link for a name-only companion.

## Atomicity and data safety

All guest and registration writes execute in one transaction, under the existing event-capacity lock and normalized email locks. A duplicate or capacity failure rolls back the whole party, including newly created people. Names without an email become distinct guest records. Existing matching email records retain their saved name and staff notes. Custom answers remain individual. No arrivals are recorded by registration.

The public API validates organizer limits, every name, optional email formats, duplicate party emails and required questions independently of the browser. A reduced/disabled guest limit does not silently discard recovered guest details: the form asks the attendee to remove extra guests before continuing.

## Verification

- Type checking, lint, all **714 tests**, and production build pass.
- The real SQL was exercised against temporary PostgreSQL tables and the production capacity-trigger function. The test exceeds capacity on the second person and confirms that the entire party is rolled back. Mixed-case email matching, tenant boundaries, saved notes, duplicate rollback and group metadata pass.
- A disposable event copied Carlin's actual four questions. On the staged/live API, a two-person RSVP with only one available place returned 409 and left zero registrations and zero orphan people.
- The live browser added a name-only companion, recovered both people's names/answers after refresh, and submitted successfully. The response confirmed two people. Repeating the host submission returned 409 without creating another companion.
- Registrations showed two distinct confirmed rows and different dietary/question answers. Check-in showed both people independently, with zero arrivals.
- CSV and genuine Excel files were downloaded through the live browser and opened locally. They contain both names, separate answers and the group/registrant columns.
- The planner changed the test event's guest limit from two to one using the actual invitation designer and Save invitation action. The saved public API reflected one.
- The disposable test event and both unused test people were removed afterward. A final read confirmed Carlin still has four registrations.
- Desktop browser verification is complete. The browser viewport override reported 1512px despite the requested phone width, so a phone-specific audit is not claimed.

## Deployment continuity

- Stable URL: https://beebizy-studio-preview.vercel.app
- Release branch: `codex/rsvp-additional-guests`.
- Code commits: `da0604d`, `44fbe5b`, `618a269`.
- Active deployment: `dpl_ABSaLQBXpGo3dv9JQABqZe81URZQ`.
- Previous deployment: `dpl_pG1pxNaVZkHxjpqGzxtwR8wG5ASs`.
- No database migration was required. The branch includes the verified Carlin export and HubSpot releases. Preserve them when integrating the unfinished SCU work.
- A rollback to the old RSVP implementation does not support companions; account for active newer clients before reverting.

Proof: `/private/tmp/beebizy-carlin-add-guest-live.png`, `/private/tmp/beebizy-rsvp-add-guest-form.png`, and `/private/tmp/beebizy-rsvp-party-confirmation.png`.
