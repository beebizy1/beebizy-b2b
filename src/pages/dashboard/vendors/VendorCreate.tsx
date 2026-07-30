import { AppLayout } from "@/components/layout/AppLayout";
import { useCreateVendor, getListVendorsQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Catering", "Audio/Visual", "Photography", "Videography", "Decor", "Security", "Transportation", "Staffing", "Entertainment", "Other"];

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().min(1, "Category is required"),
  description: z.string().optional(),
  contactEmail: z.string().email("Invalid email").optional().or(z.literal("")),
  contactPhone: z.string().optional(),
  website: z.string().optional(),
  rating: z.coerce.number().min(0).max(5).optional().or(z.literal("")),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function VendorCreate() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createVendor = useCreateVendor();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { category: "Catering" },
  });

  const onSubmit = (data: FormData) => {
    createVendor.mutate(
      {
        data: {
          name: data.name,
          category: data.category,
          description: data.description || undefined,
          contactEmail: data.contactEmail || undefined,
          contactPhone: data.contactPhone || undefined,
          website: data.website || undefined,
          rating: data.rating ? Number(data.rating) : undefined,
          city: data.city || undefined,
          state: data.state || undefined,
          country: data.country || undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
          toast({ title: "Vendor added to marketplace" });
          navigate(`/dashboard/vendors`);
        },
        onError: () => toast({ title: "Failed to create vendor", variant: "destructive" }),
      }
    );
  };

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard/vendors">
            <Button variant="ghost" size="sm" className="gap-2 -ml-3">
              <ArrowLeft className="w-4 h-4" />
              Back to Marketplace
            </Button>
          </Link>
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-8">Add Vendor</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">Vendor Name *</Label>
              <Input id="name" {...register("name")} placeholder="e.g. Premier Catering Co." />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <select id="category" {...register("category")} className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.category && <p className="text-xs text-destructive">{errors.category.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rating">Rating (0–5)</Label>
              <Input id="rating" type="number" step="0.1" min="0" max="5" {...register("rating")} placeholder="4.5" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register("description")} rows={3} placeholder="Brief description of services offered..." />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" {...register("city")} placeholder="e.g. New York" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input id="state" {...register("state")} placeholder="e.g. NY" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register("country")} placeholder="e.g. US" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input id="contactEmail" type="email" {...register("contactEmail")} placeholder="contact@vendor.com" />
              {errors.contactEmail && <p className="text-xs text-destructive">{errors.contactEmail.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone</Label>
              <Input id="contactPhone" {...register("contactPhone")} placeholder="+1-555-000-0000" />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" {...register("website")} placeholder="www.vendor.com" />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={createVendor.isPending}>
              {createVendor.isPending ? "Adding..." : "Add Vendor"}
            </Button>
            <Link href="/dashboard/vendors">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
          </div>
        </form>
      </div>
    </AppLayout>
  );
}
