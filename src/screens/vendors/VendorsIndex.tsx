/**
 * Vendor directory.
 *
 * Messages were a separate top-level page in the old build, so an unread caterer reply
 * lived nowhere near the caterer. Each row carries its own thread state, and unread
 * counts roll up to the sidebar badge.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ExternalLink, MapPin, Plus, Search, Sparkles, Star, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EmptyState,
  ErrorNotice,
  GroupLabel,
  LoadingRows,
  Panel,
  PanelHeader,
  PageHeader,
  Pill,
  StatTile,
} from "@/components/primitives";
import { useCreateVendor, useVendors } from "@/data/hooks";
import { usePreferences } from "@/app/preferences";
import type { Vendor } from "@/data/entities";
import { toast } from "@/hooks/use-toast";

const ALL = "__all__";

const MARKETPLACE_VENDORS = [
  {
    name: "Golden Gate Catering",
    category: "Catering",
    description: "Seasonal menus, full dietary coverage and service teams for 100–800 guests.",
    city: "San Francisco",
    state: "CA",
    country: "USA",
    rating: 4.9,
  },
  {
    name: "Northstar Production",
    category: "AV",
    description: "Staging, lighting, show calling and hybrid production under one lead.",
    city: "Los Angeles",
    state: "CA",
    country: "USA",
    rating: 4.8,
  },
  {
    name: "Field & Form",
    category: "Florals",
    description: "Theme-led floral installations with reusable structures and local sourcing.",
    city: "New York",
    state: "NY",
    country: "USA",
    rating: 4.9,
  },
  {
    name: "Signal House Entertainment",
    category: "Entertainment",
    description: "Curated musicians, DJs and event-specific sound direction.",
    city: "Chicago",
    state: "IL",
    country: "USA",
    rating: 4.7,
  },
  {
    name: "Common Thread Staffing",
    category: "Staffing",
    description: "Guest experience, registration and event operations teams nationwide.",
    city: "Austin",
    state: "TX",
    country: "USA",
    rating: 4.8,
  },
  {
    name: "Gatherwell Rentals",
    category: "Rentals",
    description: "Modern furniture, tabletop and modular lounge collections.",
    city: "Miami",
    state: "FL",
    country: "USA",
    rating: 4.6,
  },
] as const;

function Rating({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">unrated</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
      <Star className="size-3 fill-primary text-primary" aria-hidden="true" />
      <span data-numeric>{value.toFixed(1)}</span>
    </span>
  );
}

function VendorRow({ vendor }: { vendor: Vendor }) {
  const { when } = usePreferences();
  return (
    <li>
      <Link
        href={`/app/vendors/${vendor.id}`}
        className="flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-accent/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-foreground">{vendor.name}</span>
            {vendor.unreadCount > 0 ? (
              <span data-numeric className="rounded-full bg-info px-1.5 text-[11px] font-bold text-info-foreground">
                {vendor.unreadCount} new
              </span>
            ) : null}
          </div>
          {vendor.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{vendor.description}</p>
          ) : null}
          {vendor.lastMessage ? (
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {vendor.lastDirection === "inbound" ? "They said" : "You said"}:
              </span>{" "}
              {vendor.lastMessage}
              {vendor.lastMessageAt ? (
                <span className="text-muted-foreground/70"> · {when(vendor.lastMessageAt)}</span>
              ) : null}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {vendor.city ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" aria-hidden="true" />
              {vendor.city}
            </span>
          ) : null}
          <Rating value={vendor.rating} />
        </div>
      </Link>
    </li>
  );
}

export default function VendorsIndex() {
  const { data: vendors, isLoading, isError, error, refetch } = useVendors();
  const createVendor = useCreateVendor();
  const [source, setSource] = useState<"mine" | "marketplace">("mine");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [city, setCity] = useState(ALL);

  const categories = useMemo(
    () => [...new Set([...(vendors ?? []).map((vendor) => vendor.category), ...MARKETPLACE_VENDORS.map((vendor) => vendor.category)])].sort(),
    [vendors],
  );
  const cities = useMemo(
    () => [
      ...new Set([
        ...(vendors ?? []).map((vendor) => vendor.city).filter((value): value is string => Boolean(value)),
        ...MARKETPLACE_VENDORS.map((vendor) => vendor.city),
      ]),
    ].sort(),
    [vendors],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (vendors ?? []).filter((vendor) => {
      if (category !== ALL && vendor.category !== category) return false;
      if (city !== ALL && vendor.city !== city) return false;
      if (!needle) return true;
      return [vendor.name, vendor.category, vendor.description ?? "", vendor.city ?? ""].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [vendors, search, category, city]);

  const visibleMarketplace = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return MARKETPLACE_VENDORS.filter((vendor) => {
      if (category !== ALL && vendor.category !== category) return false;
      if (city !== ALL && vendor.city !== city) return false;
      if (!needle) return true;
      return [vendor.name, vendor.category, vendor.description, vendor.city].some((field) =>
        field.toLowerCase().includes(needle),
      );
    });
  }, [search, category, city]);

  const grouped = useMemo(() => {
    const map = new Map<string, Vendor[]>();
    for (const vendor of visible) {
      const bucket = map.get(vendor.category);
      if (bucket) bucket.push(vendor);
      else map.set(vendor.category, [vendor]);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [visible]);

  const unread = (vendors ?? []).reduce((sum, vendor) => sum + vendor.unreadCount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vendor Hub"
        title="Your vendors and the Beebizy marketplace"
        description="Add vendors your team already trusts or use marketplace suggestions by category and city. Book them from the event's Vendors section."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <a href="https://app.beebizy.com/client-app/search-v2" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 size-4" />
                Browse marketplace
              </a>
            </Button>
            <Button asChild>
              <Link href="/app/vendors/new">
                <Plus className="mr-1.5 size-4" />
                Add your vendor
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Vendors" value={vendors?.length ?? 0} icon={Store} loading={isLoading} />
        <StatTile label="Categories" value={categories.length} loading={isLoading} />
        <StatTile label="Cities" value={cities.length} loading={isLoading} />
        <StatTile label="Unread replies" value={unread} tone={unread > 0 ? "info" : "neutral"} loading={isLoading} />
      </div>

      {isError ? <ErrorNotice error={error} title="Couldn't load vendors" onRetry={() => void refetch()} /> : null}

      <div className="inline-flex w-fit rounded-lg border border-hairline bg-surface p-0.5 shadow-xs" role="tablist" aria-label="Vendor source">
        <button
          type="button"
          role="tab"
          aria-selected={source === "mine"}
          onClick={() => setSource("mine")}
          className={source === "mine" ? "rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground" : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"}
        >
          My vendors
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={source === "marketplace"}
          onClick={() => setSource("marketplace")}
          className={source === "marketplace" ? "rounded-md bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground" : "rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"}
        >
          <Sparkles className="mr-1.5 inline size-3.5 text-primary" />
          Beebizy marketplace
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(inputEvent) => setSearch(inputEvent.target.value)}
            placeholder="Search vendors"
            aria-label="Search vendors"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[180px]" aria-label="Filter by category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categories.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={city} onValueChange={setCity}>
          <SelectTrigger className="w-[170px]" aria-label="Filter by city">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All cities</SelectItem>
            {cities.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {source === "mine" ? <Panel>
        <PanelHeader
          title={`${visible.length} ${visible.length === 1 ? "vendor" : "vendors"}`}
          description="Your saved network and Beebizy marketplace suggestions"
        />
        {isLoading ? (
          <LoadingRows rows={5} className="p-4" />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Store}
            title={search || category !== ALL || city !== ALL ? "No vendors match" : "No vendors yet"}
            description="Add your own vendor or broaden the search to see marketplace suggestions."
            action={
              <Button asChild size="sm">
                <Link href="/app/vendors/new">
                  <Plus className="mr-1.5 size-4" />
                  New vendor
                </Link>
              </Button>
            }
          />
        ) : (
          <div>
            {grouped.map(([groupName, groupVendors]) => (
              <section key={groupName}>
                <GroupLabel>
                  {groupName} · {groupVendors.length}
                </GroupLabel>
                <ul className="divide-y divide-hairline">
                  {groupVendors.map((vendor) => (
                    <VendorRow key={vendor.id} vendor={vendor} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Panel> : (
        <Panel>
          <PanelHeader
            title={`${visibleMarketplace.length} marketplace ${visibleMarketplace.length === 1 ? "match" : "matches"}`}
            description="Curated Beebizy vendors. Add any suggestion to your private vendor hub before booking it onto an event."
          />
          {visibleMarketplace.length === 0 ? (
            <EmptyState
              icon={Store}
              title="No marketplace vendors match"
              description="Broaden the category, city or search terms."
            />
          ) : (
            <ul className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3">
              {visibleMarketplace.map((vendor) => {
                const saved = (vendors ?? []).some((existing) => existing.name.toLowerCase() === vendor.name.toLowerCase());
                return (
                  <li key={vendor.name} className="flex flex-col rounded-xl border border-hairline bg-card p-5 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary-muted text-primary-text">
                        <Store className="size-4" aria-hidden="true" />
                      </span>
                      <Rating value={vendor.rating} />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-foreground">{vendor.name}</h3>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Pill tone="info">{vendor.category}</Pill>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" aria-hidden="true" />
                        {vendor.city}, {vendor.state}
                      </span>
                    </div>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">{vendor.description}</p>
                    <Button
                      className="mt-5"
                      variant={saved ? "outline" : "default"}
                      size="sm"
                      disabled={saved || createVendor.isPending}
                      onClick={() =>
                        createVendor.mutate(
                          {
                            name: vendor.name,
                            category: vendor.category,
                            description: vendor.description,
                            city: vendor.city,
                            state: vendor.state,
                            country: vendor.country,
                            rating: vendor.rating,
                          },
                          {
                            onSuccess: () => toast({ title: "Vendor added", description: `${vendor.name} is now in your vendor hub.` }),
                            onError: (mutationError) => toast({ title: "Couldn't add vendor", description: mutationError.message }),
                          },
                        )
                      }
                    >
                      {saved ? <CheckCircle2 className="mr-1.5 size-3.5" /> : <Plus className="mr-1.5 size-3.5" />}
                      {saved ? "Added to my vendors" : "Add to my vendors"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {categories.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Coverage:{" "}
          {categories.map((option) => (
            <Pill key={option} className="mr-1.5">
              {option}
            </Pill>
          ))}
        </p>
      ) : null}
    </div>
  );
}
