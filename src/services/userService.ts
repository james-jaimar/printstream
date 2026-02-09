
import { supabase } from '@/integrations/supabase/client';
import { User, UserFormData, UserProfile, UserRole, UserWithRole } from '@/types/user-types';

// Fetch users using RPC and public tables (the original working pattern)
export async function fetchUsers(): Promise<UserWithRole[]> {
  try {
    console.log('🔄 Fetching users via RPC...');
    
    // Get user IDs and emails from auth.users via RPC
    const { data: authUsers, error: rpcError } = await supabase.rpc('get_all_users');
    
    if (rpcError) {
      console.error('❌ RPC error:', rpcError);
      throw new Error(`Failed to fetch users: ${rpcError.message}`);
    }
    
    if (!authUsers || !Array.isArray(authUsers)) {
      console.warn('⚠️ Invalid response from RPC:', authUsers);
      return [];
    }
    
    // Get all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*');
    
    if (profilesError) {
      console.error('❌ Profiles error:', profilesError);
    }
    
    // Get all roles
    const { data: roles, error: rolesError } = await supabase
      .from('user_roles')
      .select('*');
    
    if (rolesError) {
      console.error('❌ Roles error:', rolesError);
    }
    
    // Get all group memberships
    const { data: memberships, error: membershipsError } = await supabase
      .from('user_group_memberships')
      .select('user_id, group_id');
    
    if (membershipsError) {
      console.error('❌ Memberships error:', membershipsError);
    }
    
    // Combine all data
    const users: UserWithRole[] = authUsers.map((authUser: { id: string; email: string }) => {
      const profile = profiles?.find(p => p.id === authUser.id);
      const userRole = roles?.find(r => r.user_id === authUser.id);
      const userGroups = memberships?.filter(m => m.user_id === authUser.id).map(m => m.group_id) || [];
      
      return {
        id: authUser.id,
        email: authUser.email,
        full_name: profile?.full_name || '',
        role: (userRole?.role as UserRole) || 'user',
        groups: userGroups,
        created_at: profile?.created_at || new Date().toISOString()
      };
    });
    
    console.log(`✅ Successfully fetched ${users.length} users via RPC`);
    return users;
  } catch (error: any) {
    console.error('❌ Error in fetchUsers:', error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

// Check if any admin exists
export async function checkAdminExists(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin')
      .limit(1);
    
    if (error) {
      console.error('Error checking admin existence:', error);
      return false;
    }
    
    return data && data.length > 0;
  } catch (error) {
    console.error('Error checking admin existence:', error);
    return false;
  }
}

// Add admin role
export async function addAdminRole(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_roles')
      .upsert({ 
        user_id: userId, 
        role: 'admin' 
      });
    
    if (error) throw error;
  } catch (error) {
    console.error('Error setting admin role:', error);
    throw error;
  }
}

// Create a new user using Supabase Admin API
export async function createUser(userData: UserFormData): Promise<User> {
  try {
    console.log('Creating user via create-user-admin edge function:', userData);
    
    const { data, error } = await supabase.functions.invoke('create-user-admin', {
      body: {
        email: userData.email,
        password: userData.password,
        full_name: userData.full_name,
        role: userData.role || 'user',
        groups: userData.groups || []
      }
    });
    
    if (error) {
      console.error('Edge function error:', error);
      throw new Error(error.message || 'Failed to create user');
    }
    
    if (!data || !data.user) {
      throw new Error('User creation failed - no user data returned');
    }
    
    console.log('User created successfully:', data.user);
    
    return {
      id: data.user.id,
      email: data.user.email
    };
  } catch (error: any) {
    console.error('Error creating user:', error);
    throw new Error(error.message || 'Failed to create user');
  }
}

// Update user profile
export async function updateUserProfile(userId: string, userData: UserFormData): Promise<void> {
  try {
    console.log('🔄 Updating user profile for:', userId, userData);

    // Update email if provided and different
    if (userData.email) {
      console.log('🔄 Updating user email via admin function...');
      const { data, error } = await supabase.functions.invoke('update-user-email-admin', {
        body: {
          userId: userId,
          newEmail: userData.email
        }
      });

      if (error) {
        console.error('Error updating email:', error);
        throw new Error(`Failed to update email: ${error.message}`);
      }
      console.log('✅ Email updated successfully');
    }

    // Update profile if full_name provided
    if (userData.full_name !== undefined) {
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          full_name: userData.full_name,
          updated_at: new Date().toISOString()
        });
      
      if (profileError) {
        console.error('Error updating profile:', profileError);
        throw profileError;
      }
      console.log('✅ Profile updated successfully');
    }
    
    // Update role if provided
    if (userData.role) {
      await updateUserRole(userId, userData.role);
      console.log('✅ Role updated successfully');
    }
    
    // Update group memberships if provided
    if (userData.groups !== undefined) {
      console.log('🔄 Updating group memberships:', userData.groups);
      
      // Remove existing memberships
      const { error: deleteError } = await supabase
        .from('user_group_memberships')
        .delete()
        .eq('user_id', userId);
      
      if (deleteError) {
        console.error('Error removing existing memberships:', deleteError);
        throw deleteError;
      }
      
      // Add new memberships
      if (userData.groups.length > 0) {
        const memberships = userData.groups.map(groupId => ({
          user_id: userId,
          group_id: groupId
        }));
        
        const { error: insertError } = await supabase
          .from('user_group_memberships')
          .insert(memberships);
        
        if (insertError) {
          console.error('Error inserting new memberships:', insertError);
          throw insertError;
        }
      }
      console.log('✅ Group memberships updated successfully');
    }
  } catch (error) {
    console.error('❌ Error updating user profile:', error);
    throw error;
  }
}

// Update user role with proper upsert handling
export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  try {
    console.log('🔄 Updating user role:', userId, role);
    
    const { error } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: role,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('Error updating user role:', error);
      throw error;
    }
    
    console.log('✅ User role updated successfully');
  } catch (error) {
    console.error('❌ Error updating user role:', error);
    throw error;
  }
}

// Assign role to user
export async function assignRole(userId: string, role: UserRole): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: role
      }, {
        onConflict: 'user_id'
      });
    
    if (error) throw error;
  } catch (error) {
    console.error('Error assigning role:', error);
    throw error;
  }
}

// Revoke user access (remove from user_roles)
export async function revokeUserAccess(userId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId);
    
    if (error) throw error;
  } catch (error) {
    console.error('Error revoking user access:', error);
    throw error;
  }
}
