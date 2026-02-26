
import React from "react";
import { Badge } from "@/components/ui/badge";
import { RotateCcw } from "lucide-react";

interface ReworkBadgeProps {
  reworkQty?: number | null;
  reworkPercentage?: number | null;
  size?: "sm" | "default";
  className?: string;
}

export const ReworkBadge: React.FC<ReworkBadgeProps> = ({
  reworkQty,
  reworkPercentage,
  size = "default",
  className = "",
}) => {
  if (!reworkQty && !reworkPercentage) return null;

  const label = reworkQty
    ? `REWORK +${reworkQty}`
    : `REWORK ${reworkPercentage?.toFixed(1)}%`;

  return (
    <Badge
      variant="outline"
      className={`bg-orange-100 text-orange-800 border-orange-300 font-semibold ${
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
      } ${className}`}
    >
      <RotateCcw className={size === "sm" ? "h-2.5 w-2.5 mr-0.5" : "h-3 w-3 mr-1"} />
      {label}
    </Badge>
  );
};
