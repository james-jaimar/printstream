
import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserRole } from "@/types/user-types";

interface RoleSelectorProps {
  value: UserRole;
  onValueChange: (role: UserRole) => void;
  disabled?: boolean;
}

const roleOptions: { value: UserRole; label: string; description: string }[] = [
  { 
    value: 'user', 
    label: 'User', 
    description: 'Basic user with limited access' 
  },
  { 
    value: 'operator', 
    label: 'Operator', 
    description: 'Production floor operator' 
  },
  { 
    value: 'dtp_operator', 
    label: 'DTP Operator', 
    description: 'Digital printing and proofing specialist' 
  },
  { 
    value: 'manager', 
    label: 'Manager', 
    description: 'Department manager with oversight access' 
  },
  { 
    value: 'admin', 
    label: 'Administrator', 
    description: 'Full system access and user management' 
  },
  { 
    value: 'viewer', 
    label: 'Viewer', 
    description: 'Read-only access for sales and external staff' 
  }
];

export const RoleSelector: React.FC<RoleSelectorProps> = ({
  value,
  onValueChange,
  disabled = false
}) => {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Role</label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger>
          <SelectValue placeholder="Select a role" />
        </SelectTrigger>
        <SelectContent>
          {roleOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              <div className="flex flex-col">
                <span className="font-medium">{option.label}</span>
                <span className="text-xs text-gray-500">{option.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
