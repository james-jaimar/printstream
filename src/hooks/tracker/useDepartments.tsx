
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Department {
  id: string;
  name: string;
  description?: string;
  color: string;
  allows_concurrent_jobs: boolean;
  max_concurrent_jobs: number;
  created_at: string;
  updated_at: string;
}

interface UserDepartment {
  department_id: string;
  department_name: string;
  department_color: string;
  allows_concurrent_jobs: boolean;
  max_concurrent_jobs: number;
}

export const useDepartments = () => {
  const { user } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [userDepartments, setUserDepartments] = useState<UserDepartment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // OPTIMIZED: Specific columns instead of SELECT *
  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, description, color, allows_concurrent_jobs, max_concurrent_jobs, created_at, updated_at')
        .order('name');
      
      if (error) throw error;
      setDepartments(data || []);
    } catch (err) {
      console.error('Error fetching departments:', err);
      setError('Failed to load departments');
    }
  };

  // Fetch user's departments
  const fetchUserDepartments = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .rpc('get_user_departments', { p_user_id: user.id });
      
      if (error) throw error;
      setUserDepartments(data || []);
    } catch (err) {
      console.error('Error fetching user departments:', err);
      setError('Failed to load user departments');
    }
  };

  // Assign user to department
  const assignUserToDepartment = async (userId: string, departmentId: string) => {
    try {
      const { error } = await supabase
        .from('user_department_assignments')
        .insert({
          user_id: userId,
          department_id: departmentId,
          assigned_by: user?.id
        });
      
      if (error) throw error;
      toast.success('User assigned to department');
      await fetchUserDepartments();
      return true;
    } catch (err) {
      console.error('Error assigning user to department:', err);
      toast.error('Failed to assign user to department');
      return false;
    }
  };

  // Remove user from department
  const removeUserFromDepartment = async (userId: string, departmentId: string) => {
    try {
      const { error } = await supabase
        .from('user_department_assignments')
        .delete()
        .eq('user_id', userId)
        .eq('department_id', departmentId);
      
      if (error) throw error;
      toast.success('User removed from department');
      await fetchUserDepartments();
      return true;
    } catch (err) {
      console.error('Error removing user from department:', err);
      toast.error('Failed to remove user from department');
      return false;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchDepartments(), fetchUserDepartments()]);
      setIsLoading(false);
    };

    if (user) {
      loadData();
    }
  }, [user]);

  return {
    departments,
    userDepartments,
    isLoading,
    error,
    fetchDepartments,
    fetchUserDepartments,
    assignUserToDepartment,
    removeUserFromDepartment
  };
};
