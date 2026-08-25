/**
 * Routes and providers.
 *
 * Three route families:
 *   public marketing  - `/`
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
import NotFound from "@/pages/not-found";

import Today from "@/screens/Today";
import EventsIndex from "@/screens/events/EventsIndex";
import EventForm from "@/screens/events/EventForm";
import EventWorkspace from "@/screens/events/EventWorkspace";
import Guests from "@/screens/Guests";
import VendorsIndex from "@/screens/vendors/VendorsIndex";
import VendorDetail from "@/screens/vendors/VendorDetail";
import VendorForm from "@/screens/vendors/VendorForm";
import Budget from "@/screens/Budget";
import Tasks from "@/screens/Tasks";
import Library from "@/screens/Library";
import TemplateDetail from "@/screens/library/TemplateDetail";
import BoardDetail from "@/screens/library/BoardDetail";
import Settings from "@/screens/Settings";
import { PublicEventPage, PublicTicketsPage } from "@/screens/public/PublicEvent";
import { isDemoSession } from "@/app/demo";

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
          <Route path="/app/events" component={EventsIndex} />
          <Route path="/app/events/new">{() => <EventForm />}</Route>
          <Route path="/app/events/:id/edit">{(params) => <EventForm id={params.id} />}</Route>
          <Route path="/app/events/:id/:section">
            {(params) => <EventWorkspace id={params.id} section={params.section} />}
          </Route>
          <Route path="/app/events/:id">{(params) => <EventWorkspace id={params.id} />}</Route>
          <Route path="/app/guests" component={Guests} />
          <Route path="/app/guests/new" component={Guests} />
          <Route path="/app/vendors" component={VendorsIndex} />
          <Route path="/app/vendors/new">{() => <VendorForm />}</Route>
          <Route path="/app/vendors/:id">{(params) => <VendorDetail id={params.id} />}</Route>
          <Route path="/app/budget" component={Budget} />
          <Route path="/app/tasks" component={Tasks} />
          <Route path="/app/library" component={Library} />
          <Route path="/app/library/templates/:id">{(params) => <TemplateDetail id={params.id} />}</Route>
          <Route path="/app/library/boards/:id">{(params) => <BoardDetail id={params.id} />}</Route>
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
      <Route path="/" component={LandingPage} />
      <Route path="/about" component={AboutPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/login/*" component={LoginPage} />
      <Route path="/access-denied" component={AccessDeniedPage} />
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
      <Route path="/app/people">{() => <Redirect to="/app/guests" replace />}</Route>
      <Route path="/dashboard">{() => <Redirect to="/app" replace />}</Route>
      <Route path="/dashboard/events">{() => <Redirect to="/app/events" replace />}</Route>
      <Route path="/dashboard/events/:id">{(params) => <Redirect to={`/app/events/${params.id}`} replace />}</Route>
      <Route path="/dashboard/vendors">{() => <Redirect to="/app/vendors" replace />}</Route>
      <Route path="/dashboard/guests">{() => <Redirect to="/app/guests" replace />}</Route>
      <Route path="/dashboard/registrations">{() => <Redirect to="/app/guests" replace />}</Route>
      <Route path="/dashboard/tickets">{() => <Redirect to="/app/budget" replace />}</Route>
      <Route path="/dashboard/reporting">{() => <Redirect to="/app/budget" replace />}</Route>
      <Route path="/dashboard/history">{() => <Redirect to="/app/budget" replace />}</Route>
      <Route path="/dashboard/templates">{() => <Redirect to="/app/library" replace />}</Route>
      <Route path="/dashboard/locations">{() => <Redirect to="/app/library" replace />}</Route>
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
