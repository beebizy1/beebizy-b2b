/**
 * Locations.
 *
 * A searchable card grid of venues, one card per location, each showing where it is,
 * how to reach it, and how many events have been hosted there. `eventCount` is
 * denormalised onto the record, so the grid renders without joining events.
 */

import { useMemo, useState } from "react";
import { Link } from "wouter";
import { MapPin, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorNotice, PageHeader, Panel } from "@/components/primitives";
import { useLocations } from "@/data/hooks";

export default function LocationsIndex() {
  const [search, setSearch] = useState("");
  const { data: locations, isLoading, isError, error, refetch } = useLocations();

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return locations ?? [];
    return (locations ?? []).filter(
      (location) =>
        location.name.toLowerCase().includes(term) || location.corporationName.toLowerCase().includes(term),
    );
  }, [locations, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Locations"
        actions={
          <Button asChild>
            <Link href="/app/locations/new">
              <Plus className="size-4" aria-hidden="true" />
              Add Location
            </Link>
          </Button>
        }
      />

      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by name…"
          aria-label="Search locations by name"
          className="pl-9"
        />
      </div>

      {isError ? (
        <ErrorNotice error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Panel>
          <EmptyState
            icon={MapPin}
            title={search ? "No locations match that search" : "No locations yet"}
            description={
              search
                ? "Try a different name, or clear the search to see every venue."
                : "Add the venues you run events at and every event can be booked into one."
            }
            action={
              search ? null : (
                <Button asChild>
                  <Link href="/app/locations/new">Add Location</Link>
                </Button>
              )
            }
          />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((location) => (
            <Link
              key={location.id}
              href={`/app/locations/${location.id}`}
              className="flex h-full flex-col rounded-xl border border-card-border bg-card p-5 shadow-xs transition-colors hover:border-primary/50 hover:bg-primary-wash"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="line-clamp-1 text-lg font-semibold text-foreground">{location.name}</h3>
                  <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{location.corporationName}</p>
                </div>
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary-muted text-primary-text">
                  <MapPin className="size-4" aria-hidden="true" />
                </span>
              </div>

              <div className="mt-auto space-y-2">
                <div className="space-y-1 pt-2 text-sm text-muted-foreground">
                  {location.city ? (
                    <p>
                      {location.city}
                      {location.state ? `, ${location.state}` : ""} {location.country}
                    </p>
                  ) : null}
                  {location.phone ? <p>{location.phone}</p> : null}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-sm">
                  <span className="text-muted-foreground">Events Hosted</span>
                  <span data-numeric className="font-medium text-foreground">
                    {location.eventCount}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
