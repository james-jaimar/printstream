
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

/**
 * Represents the available user roles in the system
 */
export type UserRole = 'admin' | 'manager' | 'operator' | 'dtp_operator' | 'packaging_operator' | 'user';

/**
 * Response from the useUserRole hook
 */
export interface UserRoleResponse {
  /** The current user's role */
  userRole: UserRole;
  /** Whether the role data is still loading */
  isLoading: boolean;
  /** Whether the user is an admin */
  isAdmin: boolean;
  /** Whether the user is a manager (or admin) */
  isManager: boolean;
  /** Whether the user is any type of operator (but NOT admin/manager) */
  isOperator: boolean;
  /** Whether the user is specifically a DTP operator */
  isDtpOperator: boolean;
  /** Whether the user is specifically a Packaging & Shipping operator */
  isPackagingOperator: boolean;
  /** Whether the user belongs to the Labels group */
  isLabelsUser: boolean;
  /** List of stages the user has access to - based on actual group memberships, not admin overrides */
  accessibleStages: Array<{
    stage_id: string;
    stage_name: string;
    stage_color: string;
    can_view: boolean;
    can_edit: boolean;
    can_work: boolean;
    can_manage: boolean;
  }>;
}

/**
 * Hook to determine the current user's role in the system
 * @returns UserRoleResponse object containing role information
 */
export const useUserRole = (): UserRoleResponse => {
  const { user, loading: authLoading } = useAuth();
  const [userRole, setUserRole] = useState<UserRole>('user');
  const [isLoading, setIsLoading] = useState(true);
  const [accessibleStages, setAccessibleStages] = useState<Array<{
    stage_id: string;
    stage_name: string;
    stage_color: string;
    can_view: boolean;
    can_edit: boolean;
    can_work: boolean;
    can_manage: boolean;
  }>>([]);

  useEffect(() => {
    const determineUserRole = async () => {
      // Wait for auth to complete first
      if (authLoading) {
        console.log('🔄 Auth still loading, waiting...');
        return;
      }

      if (!user?.id) {
        console.log('🔄 No user found, setting default role');
        setUserRole('user');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        console.log('🔄 Determining role for user:', user.id);

        // Check for admin role first - this takes precedence over all other roles
        const { data: userRoles, error: roleError } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);

        if (roleError) {
          console.warn('⚠️ Error fetching user roles, defaulting to user role:', roleError);
          setUserRole('user');
          setIsLoading(false);
          return;
        }

        const hasAdminRole = userRoles?.some(r => r.role === 'admin');
        if (hasAdminRole) {
          console.log('🔑 User determined as admin');
          setUserRole('admin');
          setAccessibleStages([]);
          setIsLoading(false);
          return;
        }

        // Get user's group memberships and stage permissions
        const { data: groupMemberships, error: groupError } = await supabase
          .from('user_group_memberships')
          .select(`
            user_groups!inner(name, description)
          `)
          .eq('user_id', user.id);

        if (groupError) {
          console.warn('⚠️ Error fetching group memberships, defaulting to user role:', groupError);
          setUserRole('user');
          setIsLoading(false);
          return;
        }

        // Get their ACTUAL group-based permissions (not admin overrides)
        const { data: actualStages, error: stagesError } = await supabase.rpc('get_user_accessible_stages', {
          p_user_id: user.id
        });

        if (stagesError) {
          console.warn('⚠️ Error fetching accessible stages:', stagesError);
          // Continue with group-based role detection even if stages fail
        }

        const normalizedStages = (actualStages || []).map((stage: any) => ({
          stage_id: stage.stage_id,
          stage_name: stage.stage_name,
          stage_color: stage.stage_color,
          can_view: stage.can_view,
          can_edit: stage.can_edit,
          can_work: stage.can_work,
          can_manage: stage.can_manage
        }));

        setAccessibleStages(normalizedStages);

        // Enhanced role detection logic with fallbacks
        const groupNames = groupMemberships?.map(m => m.user_groups?.name?.toLowerCase() || '') || [];
        const groupDescriptions = groupMemberships?.map(m => m.user_groups?.description?.toLowerCase() || '') || [];
        
        console.log('🔍 User group analysis:', {
          userId: user.id,
          groupNames,
          groupDescriptions,
          totalStages: normalizedStages.length,
          workableStages: normalizedStages.filter(s => s.can_work).length
        });

        // Check for manager role in group names or descriptions
        const isManager = groupNames.some(name => 
          name.includes('manager') || 
          name.includes('supervisor') || 
          name.includes('admin')
        ) || groupDescriptions.some(desc => 
          desc.includes('manager') || 
          desc.includes('supervisor')
        );

        if (isManager) {
          console.log('🔑 User determined as manager');
          setUserRole('manager');
          setIsLoading(false);
          return;
        }

        // Enhanced operator detection - check both group names and workable/manageable stages
        const workableStages = normalizedStages.filter(stage => stage.can_work);
        const manageableStages = normalizedStages.filter(stage => stage.can_manage);
        // Consider manageable stages as workable since manage implies work capability
        const effectiveWorkableStages = [...workableStages, ...manageableStages.filter(stage => !workableStages.some(ws => ws.stage_id === stage.stage_id))];
        
        const dtpRelatedStages = effectiveWorkableStages.filter(stage => {
          const stageName = stage.stage_name.toLowerCase();
          return stageName.includes('dtp') || 
                 stageName.includes('digital') ||
                 stageName.includes('proof') ||
                 stageName.includes('pre-press') ||
                 stageName.includes('design') ||
                 stageName.includes('artwork');
        });

        const packagingRelatedStages = effectiveWorkableStages.filter(stage => {
          const stageName = stage.stage_name.toLowerCase();
          return stageName.includes('packaging') ||
                 stageName.includes('pack') ||
                 stageName.includes('shipping') ||
                 stageName.includes('dispatch') ||
                 stageName.includes('ship');
        });

        const printingRelatedStages = effectiveWorkableStages.filter(stage => {
          const stageName = stage.stage_name.toLowerCase();
          return stageName.includes('print') ||
                 stageName.includes('hp') ||
                 stageName.includes('press') ||
                 stageName.includes('production');
        });

        // Enhanced operator group detection - include equipment-specific groups
        const isInOperatorGroup = groupNames.some(name => 
          name.includes('operator') || 
          name.includes('printing') || 
          name.includes('dtp') || 
          name.includes('production') ||
          // Equipment-specific groups
          name.includes('hunkeler') ||
          name.includes('case') && name.includes('binding') ||
          name.includes('perfect') && name.includes('binding') ||
          name.includes('laminating') ||
          name.includes('finishing') ||
          name.includes('gathering') ||
          name.includes('saddle') ||
          name.includes('cutting') ||
          name.includes('folding') ||
          name.includes('hp12000') ||
          name.includes('hp') ||
          name.includes('press')
        );

        // Check for packaging & dispatch group membership
        const isInPackagingGroup = groupNames.some(name =>
          name.toLowerCase().includes('packaging') ||
          name.toLowerCase().includes('dispatch') ||
          name.toLowerCase().includes('shipping')
        );

        console.log('🧑‍💻 Enhanced operator analysis:', {
          workableStages: workableStages.length,
          manageableStages: manageableStages.length,
          effectiveWorkableStages: effectiveWorkableStages.length,
          dtpStages: dtpRelatedStages.length,
          packagingStages: packagingRelatedStages.length,
          printingStages: printingRelatedStages.length,
          isInOperatorGroup,
          isInPackagingGroup,
          groupNames,
          stageNames: effectiveWorkableStages.map(s => s.stage_name)
        });

        // Role determination with enhanced logic and fallbacks
        if (isInPackagingGroup && (packagingRelatedStages.length > 0 || groupNames.some(n => n.toLowerCase().includes('packaging') || n.toLowerCase().includes('dispatch')))) {
          console.log('🔑 User determined as packaging_operator');
          setUserRole('packaging_operator');
        } else if (dtpRelatedStages.length > 0 && (dtpRelatedStages.length >= printingRelatedStages.length || groupNames.includes('dtp'))) {
          console.log('🔑 User determined as dtp_operator');
          setUserRole('dtp_operator');
        } else if (effectiveWorkableStages.length > 0 || isInOperatorGroup) {
          console.log('🔑 User determined as operator');
          setUserRole('operator');
        } else {
          console.log('🔑 User determined as user (default)');
          setUserRole('user');
        }

      } catch (error) {
        console.error('❌ Error determining user role:', error);
        // Fallback to safe default
        setUserRole('user');
      } finally {
        setIsLoading(false);
      }
    };

    determineUserRole();
  }, [user?.id, authLoading]);

  // Derived properties for convenient access
  const isAdmin = userRole === 'admin';
  const isManager = userRole === 'manager' || userRole === 'admin';
  // IMPORTANT: isOperator should NOT include admin/manager - only actual operators
  const isOperator = userRole === 'operator' || userRole === 'dtp_operator' || userRole === 'packaging_operator';
  const isDtpOperator = userRole === 'dtp_operator';
  const isPackagingOperator = userRole === 'packaging_operator';
  const [isLabelsUser, setIsLabelsUser] = useState(false);

  // Detect Labels group membership from group data
  useEffect(() => {
    if (isLoading || authLoading) return;
    const checkLabelsGroup = async () => {
      if (!user?.id) { setIsLabelsUser(false); return; }
      const { data } = await supabase
        .from('user_group_memberships')
        .select('user_groups!inner(name)')
        .eq('user_id', user.id);
      const groupNames = data?.map((m: any) => m.user_groups?.name?.toLowerCase() || '') || [];
      setIsLabelsUser(groupNames.some(name => name === 'labels'));
    };
    checkLabelsGroup();
  }, [user?.id, isLoading, authLoading]);

  return {
    userRole,
    isLoading: authLoading || isLoading, // Include auth loading state
    isAdmin,
    isManager,
    isOperator,
    isDtpOperator,
    isPackagingOperator,
    isLabelsUser,
    accessibleStages
  };
};
