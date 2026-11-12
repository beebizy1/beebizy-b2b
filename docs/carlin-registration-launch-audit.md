# Carlin registration launch check

Verified November 11, 2026 (Pacific time).

## Live release

- Existing Studio URL: https://beebizy-studio-preview.vercel.app
- Branch: `codex/carlin-registration-export`.
- Implementation commits: `1972be9` and `65d15cb`.
- Active deployment: `dpl_4iVfHDaUehyGr1nvfvhfW2irVFhJ`.
- Previous export deployment: `dpl_6sn7aGFsQCSjKqzD1SFz6QxJZsKT`.
- Earlier rollback: `dpl_HYDCURv5VF32PyhDtXTnQaDwaqsn`.

## Verified behavior

- Carlin's actual invitation loads, preserves paragraphs, exposes the hotel booking hyperlink and separate Hotel Information page, and routes the bottom RSVP button to the registration form.
- The form shows First name, Last name, email, and all four organizer-defined questions. The event time is December 29, 2026, 7:00 PM to 11:45 PM in America/Chicago.
- A separate, clearly labelled test event in Tarang's workspace copied the actual form configuration. Its live public form accepted a complete RSVP and saved both compound name parts plus all four answers. Refresh restored unfinished entries before submission and retained the saved registration afterward.
- Repeated submissions returned HTTP 409, kept one registration, and preserved the original answers. The duplicate error now remains visibly on the form instead of relying on a brief toast.
- CSV and genuine `.xlsx` buttons are present directly in each event's Registrations section. All registrations are exported by default; an explicit checkbox restricts the download to current filters.
- Both files were downloaded through the live browser and opened locally. Names, accents, question headings and answers matched the saved test registration. CSV quoting and formula protection, real Excel round-trip, actual status, and empty/filtered lists have regression tests.
- The real RSVP form was checked at 390px width without horizontal overflow.
- Carlin's four real registration rows remained unchanged. The disposable event and unused fake guest were removed after verification.

## Validation and limits

Type checking, lint, all 687 tests and production build passed. After the final error-message edit, focused registration tests, type checking, lint and build passed again.

The email provider accepted the disposable test's confirmation request. This is not evidence of delivery to a real guest's inbox. Carlin is the sole owner of her workspace; Tarang's separate workspace correctly cannot open her private event. The export UI was exercised using the isolated event and shared production component, without changing her memberships or signing in as her.

Screenshot evidence is saved at `/private/tmp/beebizy-carlin-export-controls.png`, `/private/tmp/beebizy-carlin-mobile-rsvp.png`, and `/private/tmp/beebizy-carlin-duplicate-protection.png`.

No Stripe settings, marketing website, HubSpot behavior, or real registration contents changed in this release. Incorporate both implementation commits before any later Studio deployment.
