# Stripe Billing Handoff

## Ownership and payment safety

Laila owns the production Stripe account. The developer does not need her Stripe login,
bank details, or secret keys. Laila can enter each production value directly in Vercel as
a sensitive environment variable.

The current Beebizy deployment uses Stripe sandbox resources. Sandbox setup cannot move
money. In addition, the application rejects any live Stripe price until
`STRIPE_LIVE_PAYMENTS_ENABLED` is explicitly set to `true` in production.

Stripe only charges a real customer after that customer enters a real card and confirms a
live Checkout page. Creating products, prices, webhooks, or portal settings does not debit
Laila's bank account.

## Current sandbox setup

- The published Solo offer is USD $299 per month.
- The Studio pricing page offers monthly billing only.
- Monthly lookup key: `beebizy_solo_monthly`
- Stable webhook URL: `https://beebizy-studio-preview.vercel.app/api/billing/webhook`
- Team and Enterprise remain sales-assisted and are not automatically charged

As of September 11, 2026, the existing Stripe test Price under the monthly lookup key is
still $79. The application intentionally rejects that amount so nobody can enter Checkout
for the wrong price. Laila needs to create the $299 monthly Price in Stripe test mode and
add its test Price ID to Vercel before the Solo button will open Checkout.

The sandbox webhook verifies Stripe signatures and handles Checkout completion,
asynchronous payment success or failure, subscription changes or cancellation, and paid
or failed invoices. It also releases reserved Solo capacity when Checkout expires.

## Founder steps for the sandbox now

These steps stay entirely in test mode and cannot deduct money from Laila's bank account:

1. In the Stripe Dashboard, turn on **Test mode**.
2. Create a recurring Solo Price of exactly USD $299 per month.
3. Copy that test Price ID into the Beebizy Vercel project's Production environment as
   `STRIPE_SOLO_MONTHLY_PRICE_ID`. Laila can enter it herself; the developer does not need
   access to her Stripe account.
4. Redeploy Beebizy and run the sandbox verification. Do not use a real card.

## Founder steps for a future live launch

Do not complete these steps until Laila explicitly approves collecting real payments.

1. In Stripe live mode, create the Solo product with a recurring USD price of exactly
   $299 monthly.
2. Create a restricted live API key with only the permissions needed for Customers,
   Products and Prices, Checkout Sessions, Subscriptions, Invoices, and Billing Portal.
3. In the Beebizy Vercel project, add the restricted key as `STRIPE_SECRET_KEY` for the
   Production environment only.
4. Add the live price ID as `STRIPE_SOLO_MONTHLY_PRICE_ID` for Production only.
5. Create a live Stripe webhook endpoint at the stable webhook URL above. Subscribe it to:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and
   `invoice.payment_failed`.
   Also subscribe to `checkout.session.expired` so an abandoned Solo checkout releases
   its temporary event and seat reservation.
6. Add that endpoint's signing secret to Vercel as `STRIPE_WEBHOOK_SECRET` for Production
   only.
7. Configure the Stripe Customer Portal to let customers update payment methods, view
   invoice history, and cancel at the end of the billing period.
8. Confirm the company's tax registrations and Stripe Tax settings with the founder's tax
   adviser. Automatic tax is intentionally not enabled in code until those registrations
   are confirmed.
9. Run one final Stripe test-mode checkout and webhook test. Only after it passes, set
   `STRIPE_LIVE_PAYMENTS_ENABLED=true` in the Production environment and redeploy.

## Plan enforcement

- Private-pilot workspaces stay free and retain full product access.
- Solo includes two total team members, up to three events per calendar year, and the five
  features shown on the pricing page, including inspiration boards.
- Team adds unlimited events and team members, vendor management, and an editable weather
  and contingency workflow.
- Enterprise adds multi-location management, integrations, and custom reporting.
- Only a workspace owner can start Checkout or open the Billing Portal.
- The server validates the price currency, interval, and exact amount before creating
  Checkout, and it blocks duplicate active subscriptions.

## Team and Enterprise provisioning

Team and Enterprise are intentionally not self-serve card purchases. Laila sends the
contract or Stripe invoice from her own account. After payment is confirmed, the product
engineer finds the customer's verified workspace and sets `subscription_status` to
`active` and `subscription_plan` to `team` or `enterprise` in the production database.
The workspace owner then signs in again and receives the plan's server-enforced access.
Sales-assisted workspaces do not show the Stripe Customer Portal button unless a Stripe
customer ID is also recorded. Their billing continues directly through Beebizy.

Before changing an existing workspace to Solo, reduce it to no more than two occupied
seats in total, counting both members and pending invitations, and no more than three
events in any calendar year. The self-serve Solo Checkout performs these checks
automatically.
