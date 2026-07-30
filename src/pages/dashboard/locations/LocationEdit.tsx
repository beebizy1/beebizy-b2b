import { AppLayout } from "@/components/layout/AppLayout";
import { useGetLocation, useUpdateLocation, getGetLocationQueryKey, getListLocationsQueryKey } from "@workspace/api-client-react";
import { useLocation, Link, useRoute } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAddresses } from "@/hooks/use-addresses";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useId } from "react";
import { QueryError } from "@/components/QueryError";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().default("US"),
  phone: z.string().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

export default function LocationEdit() {
  const [, params] = useRoute("/dashboard/locations/:id/edit");
  const id = params?.id || "";
  const [, setLocationPath] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: location, isLoading, isError, error } = useGetLocation(id, { query: { enabled: !!id, queryKey: getGetLocationQueryKey(id) } });
  const updateLocation = useUpdateLocation();
  const { addresses: savedAddresses, saveAddress, findByFormatted, formatAddress: formatSavedAddress } = useAddresses();
  const addressListId = useId();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      country: "US",
      phone: "",
    },
  });

  useEffect(() => {
    if (location) {
      form.reset({
        name: location.name,
        address: location.address || "",
        city: location.city || "",
        state: location.state || "",
        country: location.country || "US",
        phone: location.phone || "",
      });
    }
  }, [location, form]);

  const onSubmit = (data: FormValues) => {
    saveAddress({
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      country: data.country,
    });
    updateLocation.mutate(
      { 
        id,
        data: {
          ...data,
          address: data.address || undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          phone: data.phone || undefined,
        }
      },
      {
        onSuccess: (updated) => {
          queryClient.invalidateQueries({ queryKey: getGetLocationQueryKey(id) });
          queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
          toast({ title: "Location updated successfully" });
          setLocationPath(`/dashboard/locations/${updated.id}`);
        },
        onError: () => {
          toast({ title: "Failed to update location", variant: "destructive" });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8 max-w-2xl mx-auto space-y-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-10 w-1/2" />
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  if (isError) {
    return (
      <AppLayout>
        <QueryError error={error} label="Failed to load location." />
      </AppLayout>
    );
  }

  if (!location) return null;

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href={`/dashboard/locations/${id}`}>
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Location
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">Edit Location</h1>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-4 bg-card p-6 rounded-xl border">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Downtown Store" {...field} value={field.value || ''} />
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
                        value={field.value || ''}
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
                        <Input placeholder="San Francisco" {...field} value={field.value || ''} />
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
                        <Input placeholder="CA" {...field} value={field.value || ''} />
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
                        <Input placeholder="US" {...field} value={field.value || ''} />
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
                      <Input placeholder="(555) 123-4567" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-4">
              <Link href={`/dashboard/locations/${id}`}>
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={updateLocation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white">
                {updateLocation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
