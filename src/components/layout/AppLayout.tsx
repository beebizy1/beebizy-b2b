import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Calendar, CalendarDays, Users, Ticket, Menu, MapPin, Store, FileText, MessageSquare, BarChart2, PieChart, DollarSign, Settings, ListChecks, LayoutGrid, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Calendar", href: "/dashboard/calendar", icon: CalendarDays },
  { name: "Events", href: "/dashboard/events", icon: Calendar },
  { name: "Templates", href: "/dashboard/templates", icon: FileText },
  { name: "Locations", href: "/dashboard/locations", icon: MapPin },
  { name: "Vendors", href: "/dashboard/vendors", icon: Store },
  { name: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  { name: "Attendees", href: "/dashboard/attendees", icon: Users },
  { name: "Registrations", href: "/dashboard/registrations", icon: Ticket },
  { name: "Reporting", href: "/dashboard/reporting", icon: PieChart },
  { name: "Financial Data", href: "/dashboard/history", icon: DollarSign },
  { name: "Checklists", href: "/dashboard/checklists", icon: ListChecks },
  { name: "Inspiration Card", href: "/dashboard/canvas", icon: LayoutGrid },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, userProfile, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate("/login");
    }
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </div>
    );
  }

  const displayName = userProfile?.name || user.displayName || user.email || "";
  const photoURL = userProfile?.photoURL || user.photoURL || undefined;
  const initials = getInitials(displayName);

  const Sidebar = () => (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-4 flex items-center gap-3 mb-4 border-b border-sidebar-border pb-4">
        <Avatar className="h-10 w-10 border border-sidebar-border shrink-0">
          <AvatarImage src={photoURL} alt={displayName} />
          <AvatarFallback>{initials || <UserIcon className="w-4 h-4 text-muted-foreground" />}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{displayName}</div>
          {user.email && <div className="text-xs text-muted-foreground truncate">{user.email}</div>}
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? location === "/dashboard"
              : location === item.href || location.startsWith(`${item.href}/`);
          return (
            <Link key={item.name} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors cursor-pointer ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                }`}
              >
                <item.icon className={`w-4 h-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                {item.name}
              </div>
            </Link>
          );
        })}
      </nav>
      <div className="p-4 border-t border-sidebar-border">
        <Link href="/">
          <div className="text-sm text-muted-foreground hover:text-foreground cursor-pointer transition-colors flex items-center gap-2">
            ← Back to Homepage
          </div>
        </Link>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 inset-x-0 h-16 border-b border-border bg-background z-50 flex items-center px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64">
            <Sidebar />
          </SheetContent>
        </Sheet>
        <Avatar className="h-8 w-8 border border-border shrink-0">
          <AvatarImage src={photoURL} alt={displayName} />
          <AvatarFallback className="text-xs">{initials || <UserIcon className="w-3.5 h-3.5 text-muted-foreground" />}</AvatarFallback>
        </Avatar>
        <div className="ml-2 min-w-0">
          <div className="text-sm font-semibold truncate">{displayName}</div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-16 md:pt-0 min-h-screen flex flex-col">
        {children}
      </main>
    </div>
  );
}
