import { useId, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCategories, DEFAULT_EVENT_CATEGORIES } from "@/hooks/use-categories";
import { useAddresses } from "@/hooks/use-addresses";
import {
  useListLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  getListLocationsQueryKey,
  type LocationWithStats,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Check, X, RotateCcw, Tags, MapPin } from "lucide-react";
import { QueryError, QueryErrorInline } from "@/components/QueryError";

export default function SettingsPage() {
  return (
    <AppLayout>
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Settings</h1>

        <Accordion type="multiple" defaultValue={[]} className="border border-border rounded-lg bg-card divide-y divide-border">
          <AccordionItem value="categories" className="border-b-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3 text-left">
                <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                  <Tags className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-base">Event Categories</div>
                  <div className="text-sm text-muted-foreground font-normal">
                    Manage the categories available when creating or editing an event.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <CategoriesManager />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="locations" className="border-b-0">
            <AccordionTrigger className="px-6 py-4 hover:no-underline">
              <div className="flex items-center gap-3 text-left">
                <div className="p-2 rounded-md bg-primary/10 text-primary shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-semibold text-base">My Locations</div>
                  <div className="text-sm text-muted-foreground font-normal">
                    Manage the venues and locations available when creating an event.
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-6 pb-6">
              <LocationsManager />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </AppLayout>
  );
}

function CategoriesManager() {
  const { categories, error: loadError, addCategory, renameCategory, removeCategory, resetToDefaults } = useCategories();
  const [newCategory, setNewCategory] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const handleAdd = () => {
    const error = addCategory(newCategory);
    if (error) {
      setAddError(error);
      return;
    }
    setNewCategory("");
    setAddError(null);
  };

  const startEditing = (category: string) => {
    setEditingCategory(category);
    setEditingValue(category);
    setEditError(null);
  };

  const cancelEditing = () => {
    setEditingCategory(null);
    setEditingValue("");
    setEditError(null);
  };

  const saveEditing = () => {
    if (!editingCategory) return;
    const error = renameCategory(editingCategory, editingValue);
    if (error) {
      setEditError(error);
      return;
    }
    cancelEditing();
  };

  const isDefaultSet =
    categories.length === DEFAULT_EVENT_CATEGORIES.length &&
    categories.every((c, i) => c === DEFAULT_EVENT_CATEGORIES[i]);

  return (
    <div className="space-y-4">
      {!!loadError && <QueryErrorInline error={loadError} label="Failed to load categories." />}
      <div className="flex gap-2">
        <Input
          placeholder="New category name"
          value={newCategory}
          onChange={(e) => {
            setNewCategory(e.target.value);
            setAddError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button onClick={handleAdd} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>
      {addError && <p className="text-sm text-destructive">{addError}</p>}

      <div className="border border-border rounded-lg divide-y divide-border">
        {categories.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No categories yet. Add one above.
          </div>
        ) : (
          categories.map((category) => (
            <div key={category} className="flex items-center justify-between gap-3 px-4 py-3">
              {editingCategory === category ? (
                <div className="flex-1 flex items-center gap-2">
                  <Input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => {
                      setEditingValue(e.target.value);
                      setEditError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveEditing();
                      } else if (e.key === "Escape") {
                        cancelEditing();
                      }
                    }}
                    className="h-8"
                  />
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={saveEditing}>
                    <Check className="w-4 h-4 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={cancelEditing}>
                    <X className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="font-medium">{category}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => startEditing(category)}>
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove "{category}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This removes it from the category picker. Events that already use this category keep their existing value.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeCategory(category)}
                            className="bg-destructive text-destructive-foreground"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
      {editError && <p className="text-sm text-destructive">{editError}</p>}

      {!isDefaultSet && (
        <div className="flex justify-end">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <RotateCcw className="w-3.5 h-3.5" />
                Reset to defaults
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset categories to defaults?</AlertDialogTitle>
                <AlertDialogDescription>
                  This replaces your customized category list with the default set. Events that already use a removed category keep their existing value.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetToDefaults}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}

const locationFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default("US"),
  phone: z.string().optional(),
});

type LocationFormValues = z.infer<typeof locationFormSchema>;

function LocationsManager() {
  const { data: locations, isLoading, isError, error } = useListLocations();
  const deleteLocation = useDeleteLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: string) => {
    deleteLocation.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
          toast({ title: "Location removed" });
        },
        onError: () => toast({ title: "Failed to remove location", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <LocationFormDialog
          trigger={
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Location
            </Button>
          }
        />
      </div>

      <div className="border border-border rounded-lg divide-y divide-border">
        {isError ? (
          <QueryError error={error} label="Failed to load locations." />
        ) : isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : !locations || locations.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No locations yet. Add one above.
          </div>
        ) : (
          locations.map((location) => (
            <div key={location.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{location.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {location.corporationName}
                  {location.city ? ` • ${location.city}${location.state ? `, ${location.state}` : ""}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <LocationFormDialog
                  location={location}
                  trigger={
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                    </Button>
                  }
                />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove "{location.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. Events already using this location keep their existing reference.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(location.id)}
                        className="bg-destructive text-destructive-foreground"
                      >
                        Remove
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function LocationFormDialog({
  location,
  trigger,
}: {
  location?: LocationWithStats;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLocation = useCreateLocation();
  const updateLocation = useUpdateLocation();
  const { addresses: savedAddresses, saveAddress, findByFormatted, formatAddress: formatSavedAddress } = useAddresses();
  const isEdit = !!location;
  const addressListId = useId();

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: location?.name ?? "",
      address: location?.address ?? "",
      city: location?.city ?? "",
      state: location?.state ?? "",
      country: location?.country ?? "US",
      phone: location?.phone ?? "",
    },
  });

  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        name: location?.name ?? "",
        address: location?.address ?? "",
        city: location?.city ?? "",
        state: location?.state ?? "",
        country: location?.country ?? "US",
        phone: location?.phone ?? "",
      });
    }
    setSubmitError(null);
    setOpen(next);
  };

  const onSubmit = (data: LocationFormValues) => {
    setSubmitError(null);
    saveAddress({
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      country: data.country,
    });
    if (isEdit && location) {
      updateLocation.mutate(
        { id: location.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
            toast({ title: "Location updated" });
            setOpen(false);
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to update location.";
            setSubmitError(message);
            toast({ title: "Failed to update location", variant: "destructive" });
          },
        }
      );
    } else {
      createLocation.mutate(
        { data: { ...data, corporationName: data.name } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
            toast({ title: "Location created" });
            setOpen(false);
          },
          onError: (error) => {
            const message = error instanceof Error ? error.message : "Failed to create location.";
            setSubmitError(message);
            toast({ title: "Failed to create location", variant: "destructive" });
          },
        }
      );
    }
  };

  const isPending = createLocation.isPending || updateLocation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Location" : "Add Location"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Downtown Store" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="123 Main St"
                      list={addressListId}
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        const match = findByFormatted(e.target.value);
                        if (match) {
                          form.setValue("city", match.city);
                          form.setValue("state", match.state);
                          form.setValue("country", match.country);
                        }
                      }}
                    />
                  </FormControl>
                  <datalist id={addressListId}>
                    {savedAddresses.map((a) => (
                      <option key={formatSavedAddress(a)} value={formatSavedAddress(a)} />
                    ))}
                  </datalist>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="San Francisco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State/Province</FormLabel>
                    <FormControl>
                      <Input placeholder="CA" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input placeholder="US" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input placeholder="(555) 123-4567" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {submitError && (
              <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-3 py-2">
                {submitError}
              </p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Location"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
