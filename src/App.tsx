/**
 * Routes and providers.
 *
 * Three route families:
 *   private beta entry - `/`, which enters the authenticated product
 *   public guest      - `/e/:token`, `/e/:token/tickets`, and Clerk sign-in
 *   the product       - `/app/*`, behind `RequireSession` and inside `AppShell`
 *
 * The old build put the product under `/dashboard` with thirty flat routes and no
 * guard, so `/dashboard/settings` rendered a frame of the app before bouncing to login.
 * `/dashboard/*` now redirects into `/app` so existing links keep working.
 */

import { Redirect, Route, Router as WouterRouter, Switch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { ClerkGate } from "@/app/ClerkGate";
import { DataProvider } from "@/data/provider";
import { isDataError } from "@/data/adapter";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { RequireSession, SessionProvider } from "@/app/session";
import { AppShell } from "@/app/shell/AppShell";

import LandingPage from "@/pages/LandingPage";
import AboutPage from "@/pages/AboutPage";
import LoginPage from "@/pages/LoginPage";
import AccessDeniedPage from "@/pages/AccessDeniedPage";
import SubscriptionRequiredPage from "@/pages/SubscriptionRequiredPage";
import NotFound from "@/pages/not-found";

import Today from "@/screens/Today";
import AIPlanner from "@/screens/AIPlanner";
import EventsIndex from "@/screens/events/EventsIndex";
import CalendarView from "@/screens/CalendarView";
import EventForm from "@/screens/events/EventForm";
import EventWorkspace from "@/screens/events/EventWorkspace";
import Guests from "@/screens/Guests";
import VendorsIndex from "@/screens/vendors/VendorsIndex";
import VendorDetail from "@/screens/vendors/VendorDetail";
import VendorForm from "@/screens/vendors/VendorForm";
import Budget from "@/screens/Budget";
import History from "@/screens/History";
import Messages from "@/screens/Messages";
import Tasks from "@/screens/Tasks";
import Library from "@/screens/Library";
import TemplateDetail from "@/screens/library/TemplateDetail";
import BoardDetail from "@/screens/library/BoardDetail";
import LocationsIndex from "@/screens/locations/LocationsIndex";
import LocationForm from "@/screens/locations/LocationForm";
import LocationDetail from "@/screens/locations/LocationDetail";
import RegistrationsIndex from "@/screens/registrations/RegistrationsIndex";
import RegistrationForm from "@/screens/registrations/RegistrationForm";
import PostEventSummary from "@/screens/events/PostEventSummary";
import TicketSales from "@/screens/tickets/TicketSales";
import Settings from "@/screens/Settings";
import { PublicEventPage, PublicTicketsPage } from "@/screens/public/PublicEvent";
import { isDemoSession } from "@/app/demo";
import { isPrivateBetaHost, privateBetaUrl } from "@/lib/privateBetaHost";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a permission-denied or not-found is pure latency. Only transient
      // failures get a second and third attempt.
      retry: (failureCount, error) => {
        if (isDataError(error) && !error.isRetryable) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

/** Everything inside the product chrome. */
function AppRoutes() {
  return (
    <RequireSession>
      <AppShell>
        <Switch>
          <Route path="/app" component={Today} />
          <Route path="/app/plan" component={AIPlanner} />
          <Route path="/app/calendar" component={CalendarView} />
          <Route path="/app/events">{() => <EventsIndex />}</Route>
          <Route path="/app/events/new">{() => <EventForm />}</Route>
          <Route path="/app/events/:id/edit">{(params) => <EventForm id={params.id} />}</Route>
          <Route path="/app/events/:id/summary">{(params) => <PostEventSummary id={params.id} />}</Route>
          <Route path="/app/events/:id/:section">
            {(params) => <EventWorkspace id={params.id} section={params.section} />}
          </Route>
          <Route path="/app/events/:id">{(params) => <EventWorkspace id={params.id} />}</Route>
          <Route path="/app/attendees" component={Guests} />
          <Route path="/app/attendees/new" component={Guests} />
          <Route path="/app/locations" component={LocationsIndex} />
          <Route path="/app/locations/new">{() => <LocationForm />}</Route>
          <Route path="/app/locations/:id/edit">{(params) => <LocationForm id={params.id} />}</Route>
          <Route path="/app/locations/:id">{(params) => <LocationDetail id={params.id} />}</Route>
          <Route path="/app/registrations" component={RegistrationsIndex} />
          <Route path="/app/registrations/new">{() => <RegistrationForm />}</Route>
          <Route path="/app/vendors" component={VendorsIndex} />
          <Route path="/app/vendors/new">{() => <VendorForm />}</Route>
          <Route path="/app/vendors/:id">{(params) => <VendorDetail id={params.id} />}</Route>
          <Route path="/app/budget">{() => <Budget />}</Route>
          <Route path="/app/history" component={History} />
          <Route path="/app/reporting">
            {() => (
              <Budget
                title="Portfolio performance, event by event"
                description="Track spend, revenue and return across every event, with the underlying event detail one click away."
              />
            )}
          </Route>
          <Route path="/app/messages" component={Messages} />
          <Route path="/app/tasks" component={Tasks} />
          <Route path="/app/tickets" component={TicketSales} />
          <Route path="/app/templates" component={Library} />
          <Route path="/app/templates/boards/:id">{(params) => <BoardDetail id={params.id} />}</Route>
          <Route path="/app/templates/:id">{(params) => <TemplateDetail id={params.id} />}</Route>
          <Route path="/app/settings" component={Settings} />
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </RequireSession>
  );
}

function Routes() {
  return (
    <Switch>
      <Route path="/">{() => <Redirect to="/app" replace />}</Route>
      <Route path="/marketing-preview" component={LandingPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/login/*" component={LoginPage} />
      <Route path="/access-denied" component={AccessDeniedPage} />
      <Route path="/subscription-required" component={SubscriptionRequiredPage} />
      <Route path="/signup">{() => <Redirect to="/access-denied" replace />}</Route>
      <Route path="/signup/*">{() => <Redirect to="/access-denied" replace />}</Route>

      {/* Guest-facing pages for a shared event. No session required. */}
      <Route path="/e/:token/tickets">{(params) => <PublicTicketsPage token={params.token} />}</Route>
      <Route path="/e/:token">{(params) => <PublicEventPage token={params.token} />}</Route>

      {/*
        Legacy links from the previous route layout, plus the two this rebuild moved when
        the vocabulary changed — /app/money and /app/people were live long enough to be
        bookmarked, and a dead bookmark is a worse welcome than a redirect.
      */}
      <Route path="/app/money">{() => <Redirect to="/app/budget" replace />}</Route>
      <Route path="/app/people">{() => <Redirect to="/app/attendees" replace />}</Route>
      {/* The rail moved Guests to Attendees, Library to Templates and Reports to
          Reporting when the vocabulary aligned with the reference design. All three
          were live long enough to be bookmarked. */}
      <Route path="/app/guests">{() => <Redirect to="/app/attendees" replace />}</Route>
      <Route path="/app/guests/new">{() => <Redirect to="/app/attendees/new" replace />}</Route>
      <Route path="/app/reports">{() => <Redirect to="/app/reporting" replace />}</Route>
      <Route path="/app/library">{() => <Redirect to="/app/templates" replace />}</Route>
      <Route path="/app/library/templates/:id">{(params) => <Redirect to={`/app/templates/${params.id}`} replace />}</Route>
      <Route path="/app/library/boards/:id">{(params) => <Redirect to={`/app/templates/boards/${params.id}`} replace />}</Route>
      <Route path="/dashboard">{() => <Redirect to="/app" replace />}</Route>
      <Route path="/dashboard/events">{() => <Redirect to="/app/events" replace />}</Route>
      <Route path="/dashboard/events/:id">{(params) => <Redirect to={`/app/events/${params.id}`} replace />}</Route>
      <Route path="/dashboard/vendors">{() => <Redirect to="/app/vendors" replace />}</Route>
      <Route path="/dashboard/guests">{() => <Redirect to="/app/attendees" replace />}</Route>
      <Route path="/dashboard/registrations">{() => <Redirect to="/app/registrations" replace />}</Route>
      <Route path="/dashboard/tickets">{() => <Redirect to="/app/tickets" replace />}</Route>
      <Route path="/dashboard/reporting">{() => <Redirect to="/app/reporting" replace />}</Route>
      <Route path="/dashboard/history">{() => <Redirect to="/app/history" replace />}</Route>
      <Route path="/dashboard/templates">{() => <Redirect to="/app/templates" replace />}</Route>
      <Route path="/dashboard/locations">{() => <Redirect to="/app/locations" replace />}</Route>
      <Route path="/dashboard/settings">{() => <Redirect to="/app/settings" replace />}</Route>
      <Route path="/buy/:token">{(params) => <Redirect to={`/e/${params.token}/tickets`} replace />}</Route>
      <Route path="/share/:token">{(params) => <Redirect to={`/e/${params.token}`} replace />}</Route>

      {/* `*` has to be greedy here: `/app/:rest*` only matched a single segment, which
          404'd every event workspace and vendor detail URL. */}
      <Route path="/app/*" component={AppRoutes} />
      <Route path="/app" component={AppRoutes} />

      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  if (!isPrivateBetaHost(window.location.hostname)) {
    window.location.replace(privateBetaUrl(window.location.pathname, window.location.search, window.location.hash));
    return null;
  }

  const demoSession = isDemoSession();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ClerkGate>
          <DataProvider forceDemo={demoSession}>
            <SessionProvider forceDemo={demoSession}>
              <TooltipProvider>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <Routes />
                </WouterRouter>
                <Toaster />
              </TooltipProvider>
            </SessionProvider>
          </DataProvider>
        </ClerkGate>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
