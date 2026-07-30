import { AppLayout } from "@/components/layout/AppLayout";
import { useListLocations } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { QueryError } from "@/components/QueryError";
import { Plus, MapPin, Search } from "lucide-react";
import { useState } from "react";

export default function LocationsList() {
  const [search, setSearch] = useState("");
  const { data: locations, isLoading, isError, error } = useListLocations();

  const filteredLocations = locations?.filter((loc) =>
    loc.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <h1 className="text-3xl font-bold tracking-tight">Locations</h1>
          <Link href="/dashboard/locations/new">
            <Button className="gap-2 bg-teal-600 hover:bg-teal-700 text-white">
              <Plus className="w-4 h-4" />
              Add Location
            </Button>
          </Link>
        </div>

        <div className="mb-8 max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isError ? (
          <QueryError error={error} label="Failed to load locations." />
        ) : isLoading ? (
          <div className="space-y-8">
            {[1, 2].map(i => (
              <div key={i} className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3].map(j => <Skeleton key={j} className="h-40 w-full" />)}
                </div>
              </div>
            ))}
          </div>
        ) : !filteredLocations || filteredLocations.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border border-dashed rounded-lg bg-card">
            No locations found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredLocations.map((location) => (
              <Link key={location.id} href={`/dashboard/locations/${location.id}`}>
                <Card className="hover:border-teal-500/50 hover:bg-teal-50/50 dark:hover:bg-teal-950/20 transition-all cursor-pointer h-full border-border">
                  <CardContent className="p-5 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-lg line-clamp-1">{location.name}</h3>
                      <div className="p-2 bg-teal-100 dark:bg-teal-900/40 text-teal-600 rounded-md shrink-0">
                        <MapPin className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="space-y-2 mt-auto">
                      <div className="text-sm text-muted-foreground space-y-1 pt-2">
                        {location.city && (
                          <p>{location.city}{location.state ? `, ${location.state}` : ''} {location.country}</p>
                        )}
                        {location.phone && <p>{location.phone}</p>}
                      </div>

                      <div className="pt-2 mt-2 border-t border-border flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Events Hosted</span>
                        <span className="font-medium">{location.eventCount || 0}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
