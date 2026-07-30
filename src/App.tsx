import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { isNonRetryable } from "@/lib/firestore/errors";
import { AuthProvider } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import CompleteProfilePage from "@/pages/CompleteProfilePage";
import Dashboard from "@/pages/dashboard/Dashboard";
import EventsList from "@/pages/dashboard/events/EventsList";
import EventCreate from "@/pages/dashboard/events/EventCreate";
import EventEdit from "@/pages/dashboard/events/EventEdit";
import EventDetail from "@/pages/dashboard/events/EventDetail";
import AttendeesList from "@/pages/dashboard/attendees/AttendeesList";
import AttendeeCreate from "@/pages/dashboard/attendees/AttendeeCreate";
import CalendarView from "@/pages/dashboard/CalendarView";
import RegistrationsList from "@/pages/dashboard/registrations/RegistrationsList";
import RegistrationCreate from "@/pages/dashboard/registrations/RegistrationCreate";
import LocationsList from "@/pages/dashboard/locations/LocationsList";
import LocationCreate from "@/pages/dashboard/locations/LocationCreate";
import LocationDetail from "@/pages/dashboard/locations/LocationDetail";
import LocationEdit from "@/pages/dashboard/locations/LocationEdit";
import VendorsList from "@/pages/dashboard/vendors/VendorsList";
import VendorCreate from "@/pages/dashboard/vendors/VendorCreate";
import TemplatesList from "@/pages/dashboard/templates/TemplatesList";
import TemplateCreate from "@/pages/dashboard/templates/TemplateCreate";
import TemplateDetail from "@/pages/dashboard/templates/TemplateDetail";
import MessagesPage from "@/pages/dashboard/messages/MessagesPage";
import TicketSalesPage from "@/pages/dashboard/tickets/TicketSalesPage";
import ReportingPage from "@/pages/dashboard/ReportingPage";
import HistoricalDataPage from "@/pages/dashboard/HistoricalDataPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import ChecklistsList from "@/pages/dashboard/checklists/ChecklistsList";
import ChecklistDetail from "@/pages/dashboard/checklists/ChecklistDetail";
import CanvasesList from "@/pages/dashboard/canvas/CanvasesList";
import CanvasDetail from "@/pages/dashboard/canvas/CanvasDetail";
import BuyTicketsPage from "@/pages/BuyTicketsPage";
import SharePage from "@/pages/SharePage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't burn multiple retries + exponential backoff on non-retryable Firestore
      // errors (permission-denied, not-found, unauthenticated, ...).
      retry: (failureCount, error) => {
        if (isNonRetryable(error)) return false;
        return failureCount < 2;
      },
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/complete-profile" component={CompleteProfilePage} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/calendar" component={CalendarView} />
      <Route path="/dashboard/events" component={EventsList} />
      <Route path="/dashboard/events/new" component={EventCreate} />
      <Route path="/dashboard/events/:id" component={EventDetail} />
      <Route path="/dashboard/events/:id/edit" component={EventEdit} />
      <Route path="/dashboard/templates" component={TemplatesList} />
      <Route path="/dashboard/templates/new" component={TemplateCreate} />
      <Route path="/dashboard/templates/:id" component={TemplateDetail} />
      <Route path="/dashboard/locations" component={LocationsList} />
      <Route path="/dashboard/locations/new" component={LocationCreate} />
      <Route path="/dashboard/locations/:id" component={LocationDetail} />
      <Route path="/dashboard/locations/:id/edit" component={LocationEdit} />
      <Route path="/dashboard/vendors" component={VendorsList} />
      <Route path="/dashboard/vendors/new" component={VendorCreate} />
      <Route path="/dashboard/attendees" component={AttendeesList} />
      <Route path="/dashboard/attendees/new" component={AttendeeCreate} />
      <Route path="/dashboard/registrations" component={RegistrationsList} />
      <Route path="/dashboard/registrations/new" component={RegistrationCreate} />
      <Route path="/dashboard/messages" component={MessagesPage} />
      <Route path="/dashboard/tickets" component={TicketSalesPage} />
      <Route path="/dashboard/reporting" component={ReportingPage} />
      <Route path="/dashboard/history" component={HistoricalDataPage} />
      <Route path="/dashboard/settings" component={SettingsPage} />
      <Route path="/dashboard/checklists" component={ChecklistsList} />
      <Route path="/dashboard/checklists/:id" component={ChecklistDetail} />
      <Route path="/dashboard/canvas" component={CanvasesList} />
      <Route path="/dashboard/canvas/:id" component={CanvasDetail} />
      <Route path="/buy/:token" component={BuyTicketsPage} />
      <Route path="/share/:token" component={SharePage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
