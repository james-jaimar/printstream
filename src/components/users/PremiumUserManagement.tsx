import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  UserPlus, 
  Search, 
  Filter, 
  MoreHorizontal, 
  Edit3, 
  Trash2, 
  RefreshCw, 
  KeyRound, 
  Mail,
  Crown,
  Settings,
  Users,
  Shield,
  Eye,
  Calendar,
  Clock
} from "lucide-react";
import { useUserManagement } from "@/contexts/UserManagementContext";
import { UserForm } from "./UserForm";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { UserFormData, UserWithRole } from "@/types/user-types";
import { toast } from "sonner";
import { resetUserPasswordAdmin, sendPasswordResetEmail } from "@/services/passwordService";

export const PremiumUserManagement = () => {
  const { users, isLoading, fetchUsers, createUser, updateUser, deleteUser } = useUserManagement();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRole | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<UserWithRole | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCreateUser = async (userData: UserFormData) => {
    await createUser(userData);
    setShowCreateDialog(false);
  };

  const handleUpdateUser = async (userData: UserFormData) => {
    if (!editingUser) return;
    await updateUser(editingUser.id, userData);
    setEditingUser(null);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (window.confirm(`Are you sure you want to remove ${userName}? This action cannot be undone.`)) {
      await deleteUser(userId);
    }
  };

  const handlePasswordReset = async (data: { newPassword: string }) => {
    if (!passwordResetUser) return;
    
    try {
      setActionLoading(`reset-${passwordResetUser.id}`);
      await resetUserPasswordAdmin({
        userId: passwordResetUser.id,
        newPassword: data.newPassword
      });
      toast.success('Password reset successfully');
      setPasswordResetUser(null);
    } catch (error: any) {
      toast.error(`Failed to reset password: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendPasswordResetEmail = async (email: string, userName: string) => {
    try {
      setActionLoading(`email-${email}`);
      await sendPasswordResetEmail(email);
      toast.success(`Password reset email sent to ${userName}`);
    } catch (error: any) {
      toast.error(`Failed to send reset email: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await fetchUsers();
      toast.success('Users refreshed successfully');
    } catch (error) {
      toast.error('Failed to refresh users');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getRoleConfig = (role: string) => {
    switch (role) {
      case 'admin': 
        return { 
          color: 'bg-gradient-to-r from-red-500 to-rose-600 text-white',
          icon: Crown,
          label: 'Administrator',
          description: 'Full system access'
        };
      case 'manager': 
        return { 
          color: 'bg-gradient-to-r from-purple-500 to-violet-600 text-white',
          icon: Shield,
          label: 'Manager',
          description: 'Team management'
        };
      case 'dtp_operator': 
        return { 
          color: 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white',
          icon: Settings,
          label: 'DTP Operator',
          description: 'Design & prepress'
        };
      case 'operator': 
        return { 
          color: 'bg-gradient-to-r from-green-500 to-emerald-600 text-white',
          icon: Users,
          label: 'Operator',
          description: 'Production floor'
        };
      default: 
        return { 
          color: 'bg-gradient-to-r from-gray-500 to-slate-600 text-white',
          icon: Eye,
          label: 'User',
          description: 'Basic access'
        };
    }
  };

  const convertUserToFormData = (user: UserWithRole): UserFormData => {
    return {
      email: user.email,
      full_name: user.full_name,
      role: user.role as any,
      groups: user.groups || []
    };
  };

  const filteredUsers = users.filter(user => 
    (user.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (user.role || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getInitials = (name: string) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex flex-col items-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading user management...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts, roles, and permissions for your organization
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shadow-sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={() => setShowCreateDialog(true)}
            className="shadow-sm bg-primary hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950 dark:to-cyan-950">
          <CardContent className="p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Total Users</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{users.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-0 shadow-sm bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-950 dark:to-rose-950">
          <CardContent className="p-4">
            <div className="flex items-center">
              <Crown className="h-8 w-8 text-red-600 dark:text-red-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-red-700 dark:text-red-300">Administrators</p>
                <p className="text-2xl font-bold text-red-900 dark:text-red-100">
                  {users.filter(u => u.role === 'admin').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950">
          <CardContent className="p-4">
            <div className="flex items-center">
              <Shield className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-purple-700 dark:text-purple-300">Managers</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {users.filter(u => u.role === 'manager').length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
          <CardContent className="p-4">
            <div className="flex items-center">
              <Settings className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div className="ml-4">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">Operators</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">
                  {users.filter(u => u.role.includes('operator')).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center space-x-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, email, or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-0 bg-muted/50"
              />
            </div>
            <Button variant="outline" size="sm" className="shadow-sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Grid */}
      <div className="grid gap-4">
        {filteredUsers.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="p-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No users found</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? "No users match your search criteria." : "Get started by adding your first user."}
              </p>
              {!searchQuery && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Add First User
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredUsers.map((user) => {
            const roleConfig = getRoleConfig(user.role);
            const RoleIcon = roleConfig.icon;
            
            return (
              <Card key={user.id} className="border-0 shadow-sm hover:shadow-md transition-all duration-200">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Avatar className="h-12 w-12 border-2 border-muted">
                        <AvatarImage src="" alt={user.full_name} />
                        <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/30 text-primary font-semibold">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          <h3 className="text-lg font-semibold">{user.full_name}</h3>
                          <Badge className={`${roleConfig.color} shadow-sm border-0`}>
                            <RoleIcon className="h-3 w-3 mr-1.5" />
                            {roleConfig.label}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
                        
                        <div className="flex items-center space-x-4 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            Joined {formatDate(user.created_at)}
                          </div>
                          {user.groups && user.groups.length > 0 && (
                            <div className="flex items-center">
                              <Users className="h-3 w-3 mr-1" />
                              {user.groups.length} group{user.groups.length > 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => setEditingUser(user)}>
                          <Edit3 className="h-4 w-4 mr-2" />
                          Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPasswordResetUser(user)}>
                          <KeyRound className="h-4 w-4 mr-2" />
                          Reset Password
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleSendPasswordResetEmail(user.email, user.full_name)}
                          disabled={actionLoading === `email-${user.email}`}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Send Reset Email
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteUser(user.id, user.full_name)}
                          className="text-red-600 hover:text-red-700 focus:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete User
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Create User Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
          </DialogHeader>
          <UserForm
            onSubmit={handleCreateUser}
            isEditing={false}
          />
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <UserForm
              initialData={convertUserToFormData(editingUser)}
              onSubmit={handleUpdateUser}
              isEditing={true}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={!!passwordResetUser} onOpenChange={() => setPasswordResetUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password for {passwordResetUser?.full_name}</DialogTitle>
          </DialogHeader>
          {passwordResetUser && (
            <PasswordChangeForm
              onSubmit={handlePasswordReset}
              isCurrentUser={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};