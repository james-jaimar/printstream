
export interface User {
  id: string;
  email?: string;
}

export interface UserProfile {
  id: string;
  full_name?: string;
  avatar_url?: string;
  created_at?: string;
  updated_at?: string;
}

// Updated to include all roles that the system actually uses
export type UserRole = 'admin' | 'manager' | 'operator' | 'dtp_operator' | 'packaging_operator' | 'viewer' | 'user';

export interface UserFormData {
  email?: string;
  full_name: string;
  password?: string;
  confirmPassword?: string;
  role: UserRole;
  groups?: string[];
}

export interface UserWithRole {
  id: string;
  email: string;
  full_name: string;
  role: string;
  created_at: string;
  groups?: string[];
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
  permissions: Record<string, boolean>;
}

export interface UserGroupMembership {
  id: string;
  user_id: string;
  group_id: string;
  assigned_at: string;
  assigned_by?: string;
}
