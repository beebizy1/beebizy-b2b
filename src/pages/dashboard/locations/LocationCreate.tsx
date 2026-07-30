import { AppLayout } from "@/components/layout/AppLayout";
import { useCreateLocation, getListLocationsQueryKey } from "@workspace/api-client-react";
import { useLocation, Link } from "wouter";
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
import { useId } from "react";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().default("US"),
  phone: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function LocationCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createLocation = useCreateLocation();
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

  const onSubmit = (data: FormValues) => {
    saveAddress({
      address: data.address ?? "",
      city: data.city ?? "",
      state: data.state ?? "",
      country: data.country,
    });
    createLocation.mutate(
      { data: { ...data, corporationName: data.name } },
      {
        onSuccess: (location) => {
          queryClient.invalidateQueries({ queryKey: getListLocationsQueryKey() });
          toast({ title: "Location created successfully" });
          setLocation(`/dashboard/locations`);
        },
        onError: () => {
          toast({ title: "Failed to create location", variant: "destructive" });
        },
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/locations">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Locations
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">Add Location</h1>

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
            </div>

            <div className="flex justify-end gap-4">
              <Link href="/dashboard/locations">
                <Button variant="outline" type="button">Cancel</Button>
              </Link>
              <Button type="submit" disabled={createLocation.isPending} className="bg-teal-600 hover:bg-teal-700 text-white">
                {createLocation.isPending ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </AppLayout>
  );
}
