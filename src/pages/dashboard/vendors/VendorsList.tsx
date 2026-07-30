import { useState } from "react";
import { Link } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useListVendors, useDeleteVendor, getListVendorsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Plus, Phone, Mail, Globe, Store, MapPin } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORY_COLORS: Record<string, string> = {
  Catering: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
  "Audio/Visual": "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
  Photography: "bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300",
  Videography: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  Decor: "bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300",
  Security: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300",
  Transportation: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300",
  Staffing: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-300",
  Entertainment: "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300",
};

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      <span className="text-sm font-semibold text-foreground">{rating.toFixed(1)}</span>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? "bg-foreground text-background border-foreground"
          : "bg-background text-muted-foreground border-border hover:border-foreground/40"
      }`}
    >
      {label}
    </button>
  );
}

export default function VendorsList() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeCity, setActiveCity] = useState<string | null>(null);
  const { data: vendors = [], isLoading, isError, error } = useListVendors();
  const deleteVendor = useDeleteVendor();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const categories = [...new Set(vendors.map((v) => v.category))].sort();
  const cities = [...new Set(vendors.map((v) => v.city).filter(Boolean) as string[])].sort();

  const filtered = vendors.filter((v) => {
    const matchSearch =
      search === "" ||
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      v.category.toLowerCase().includes(search.toLowerCase()) ||
      (v.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (v.state ?? "").toLowerCase().includes(search.toLowerCase());
    const matchCat = !activeCategory || v.category === activeCategory;
    const matchCity = !activeCity || v.city === activeCity;
    return matchSearch && matchCat && matchCity;
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, v) => {
    if (!acc[v.category]) acc[v.category] = [];
    acc[v.category].push(v);
    return acc;
  }, {});

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Remove vendor "${name}" from the marketplace?`)) return;
    deleteVendor.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
          toast({ title: "Vendor removed" });
        },
        onError: () => toast({ title: "Failed to remove vendor", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Vendor Marketplace</h1>
            <p className="text-muted-foreground mt-1">Browse and manage event service providers.</p>
          </div>
          <Link href="/dashboard/vendors/new">
            <Button className="gap-2 shrink-0">
              <Plus className="w-4 h-4" />
              Add Vendor
            </Button>
          </Link>
        </div>

        <div className="space-y-3 mb-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>

          {/* Category filter */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-muted-foreground font-medium mr-1">Category:</span>
            <FilterChip label="All" active={!activeCategory} onClick={() => setActiveCategory(null)} />
            {categories.map((cat) => (
              <FilterChip
                key={cat}
                label={cat}
                active={activeCategory === cat}
                onClick={() => setActiveCategory(cat === activeCategory ? null : cat)}
              />
            ))}
          </div>

          {/* City filter */}
          {cities.length > 0 && (
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-muted-foreground font-medium mr-1">City:</span>
              <FilterChip label="All cities" active={!activeCity} onClick={() => setActiveCity(null)} />
              {cities.map((city) => (
                <FilterChip
                  key={city}
                  label={city}
                  active={activeCity === city}
                  onClick={() => setActiveCity(city === activeCity ? null : city)}
                />
              ))}
            </div>
          )}
        </div>

        {isError ? (
          <div className="text-center py-20 text-destructive">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Failed to load vendors.</p>
            <p className="text-sm mt-1 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
          </div>
        ) : isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-52 w-full rounded-xl" />
            ))}
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No vendors found.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(grouped).map(([category, vendorList]) => (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground"}`}>
                    {category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {vendorList.length} {vendorList.length === 1 ? "vendor" : "vendors"}
                  </span>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {vendorList.map((vendor) => (
                    <div
                      key={vendor.id}
                      className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors flex flex-col"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <h3 className="font-semibold text-foreground leading-tight">{vendor.name}</h3>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="secondary" className={`text-xs font-medium ${CATEGORY_COLORS[vendor.category] ?? ""}`}>
                              {vendor.category}
                            </Badge>
                            {vendor.city && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0" />
                                {vendor.city}{vendor.state ? `, ${vendor.state}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <StarRating rating={vendor.rating ?? null} />
                      </div>

                      {vendor.description && (
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2 flex-1">
                          {vendor.description}
                        </p>
                      )}

                      <div className="mt-3 space-y-1">
                        {vendor.contactEmail && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{vendor.contactEmail}</span>
                          </div>
                        )}
                        {vendor.contactPhone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3 shrink-0" />
                            {vendor.contactPhone}
                          </div>
                        )}
                        {vendor.website && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Globe className="w-3 h-3 shrink-0" />
                            <span className="truncate">{vendor.website}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2 mt-4 pt-3 border-t border-border">
                        <Link href={`/dashboard/vendors/${vendor.id}/edit`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full">Edit</Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(vendor.id, vendor.name)}
                          disabled={deleteVendor.isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
