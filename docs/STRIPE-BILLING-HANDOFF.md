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

- Solo monthly price: USD $79 per month
- Solo annual price: USD $599 per year
- Monthly lookup key: `beebizy_solo_monthly`
- Annual lookup key: `beebizy_solo_annual`
- Stable webhook URL: `https://beebizy-studio-preview.vercel.app/api/billing/webhook`
- Team and Enterprise remain sales-assisted and are not automatically charged

The sandbox webhook verifies Stripe signatures and handles Checkout completion,
asynchronous payment success or failure, subscription changes or cancellation, and paid
or failed invoices. It also releases reserved Solo capacity when Checkout expires.

## Founder steps for production

1. In Stripe live mode, create the Solo product with recurring USD prices of exactly $79
   monthly and $599 yearly.
2. Create a restricted live API key with only the permissions needed for Customers,
   Products and Prices, Checkout Sessions, Subscriptions, Invoices, and Billing Portal.
3. In the Beebizy Vercel project, add the restricted key as `STRIPE_SECRET_KEY` for the
   Production environment only.
4. Add the two live price IDs as `STRIPE_SOLO_MONTHLY_PRICE_ID` and
   `STRIPE_SOLO_ANNUAL_PRICE_ID` for Production only.
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
- Solo is one workspace owner and one event per calendar year.
- Team adds collaboration, vendor management, inspiration boards, and an editable weather
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

Before changing an existing workspace to Solo, reduce it to one member with no pending
invitations and no more than one event in any calendar year. The self-serve Solo Checkout
performs these checks automatically.
