
import { useState, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { AlertCircle } from "lucide-react";
import { UserFormData } from "@/types/user-types";
import { supabase } from "@/integrations/supabase/client";

interface UserFormProps {
  initialData?: UserFormData;
  onSubmit: (data: UserFormData) => void;
  isEditing?: boolean;
}

interface UserGroup {
  id: string;
  name: string;
  description: string;
}

// Define form schema based on whether we're editing or creating
const createUserSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  full_name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(100),
  confirmPassword: z.string(),
  role: z.string().default("user"),
  groups: z.array(z.string()).optional()
}).refine((data) => data.password === data.confirmPassword, {
  path: ["confirmPassword"],
  message: "Passwords do not match",
});

const editUserSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  full_name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  role: z.string().default("user"),
  groups: z.array(z.string()).optional()
});

const roleOptions = [
  { value: 'user', label: 'User' },
  { value: 'operator', label: 'Operator' },
  { value: 'dtp_operator', label: 'DTP Operator' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrator' },
  { value: 'viewer', label: 'Viewer' }
];

export function UserForm({ initialData, onSubmit, isEditing = false }: UserFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState("");
  const [userGroups, setUserGroups] = useState<UserGroup[]>([]);
  
  const formSchema = isEditing ? editUserSchema : createUserSchema;
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: initialData?.email || "",
      full_name: initialData?.full_name || "",
      role: initialData?.role || "user",
      groups: initialData?.groups || [],
      ...(isEditing ? {} : { password: "", confirmPassword: "" })
    }
  });

  // Update form when initialData changes (important for edit mode)
  useEffect(() => {
    if (initialData) {
      console.log('🔄 UserForm initialData updated:', {
        email: initialData.email,
        full_name: initialData.full_name,
        role: initialData.role,
        groups: initialData.groups
      });
      
      form.reset({
        email: initialData.email || "",
        full_name: initialData.full_name || "",
        role: initialData.role || "user",
        groups: initialData.groups || [],
        ...(isEditing ? {} : { password: "", confirmPassword: "" })
      });
    }
  }, [initialData, form, isEditing]);

  useEffect(() => {
    fetchUserGroups();
  }, []);

  const fetchUserGroups = async () => {
    try {
      const { data, error } = await supabase
        .from('user_groups')
        .select('*')
        .order('name');

      if (error) throw error;
      setUserGroups(data || []);
      console.log('📋 Fetched user groups:', data?.length || 0);
    } catch (error) {
      console.error('Error fetching user groups:', error);
    }
  };

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    setServerError("");
    
    try {
      await onSubmit(data);
      // Reset form after successful creation
      if (!isEditing) {
        form.reset();
      }
    } catch (error: any) {
      setServerError(error.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Debug: Log current form values
  const currentGroups = form.watch('groups');
  console.log('👀 UserForm current groups value:', currentGroups);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-4">
        {serverError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 flex items-start">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <p className="text-sm">{serverError}</p>
          </div>
        )}
        
        <FormField
          control={form.control}
          name="full_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full Name</FormLabel>
              <FormControl>
                <Input placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Email
                {isEditing && (
                  <span className="text-xs text-muted-foreground ml-2">
                    (Changing this will affect login credentials)
                  </span>
                )}
              </FormLabel>
              <FormControl>
                <Input 
                  placeholder="user@example.com" 
                  type="email"
                  {...field} 
                />
              </FormControl>
              <FormMessage />
              {isEditing && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ User will need to use the new email address to sign in
                </p>
              )}
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role</FormLabel>
              <Select 
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {userGroups.length > 0 && (
          <FormField
            control={form.control}
            name="groups"
            render={() => (
              <FormItem>
                <FormLabel>User Groups</FormLabel>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {userGroups.map((group) => (
                    <FormField
                      key={group.id}
                      control={form.control}
                      name="groups"
                      render={({ field }) => {
                        const isChecked = field.value?.includes(group.id) || false;
                        console.log(`🔍 Group ${group.name} (${group.id}) checked: ${isChecked}`);
                        
                        return (
                          <FormItem
                            key={group.id}
                            className="flex flex-row items-start space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const current = field.value || [];
                                  if (checked) {
                                    field.onChange([...current, group.id]);
                                  } else {
                                    field.onChange(current.filter((id) => id !== group.id));
                                  }
                                }}
                              />
                            </FormControl>
                            <div className="space-y-1 leading-none">
                              <FormLabel className="text-sm font-normal">
                                {group.name}
                              </FormLabel>
                              {group.description && (
                                <p className="text-xs text-muted-foreground">
                                  {group.description}
                                </p>
                              )}
                            </div>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {!isEditing && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="********" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </>
        )}

        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Processing..." : isEditing ? "Update User" : "Create User"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}
