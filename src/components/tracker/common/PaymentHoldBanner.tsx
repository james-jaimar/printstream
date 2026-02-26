
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CreditCard, ShieldCheck } from "lucide-react";
import { usePartialRework } from "@/hooks/tracker/usePartialRework";
import { useUserRole } from "@/hooks/tracker/useUserRole";

interface PaymentHoldBannerProps {
  jobId: string;
  paymentStatus: string;
  paymentHoldReason?: string | null;
  onReleased?: () => void;
  /** Compact inline badge mode vs full banner */
  variant?: "banner" | "badge";
}

export const PaymentHoldBanner: React.FC<PaymentHoldBannerProps> = ({
  jobId,
  paymentStatus,
  paymentHoldReason,
  onReleased,
  variant = "banner",
}) => {
  const { isProcessing, releasePaymentHold, setPaymentHold } = usePartialRework();
  const { isAdmin, isManager } = useUserRole();

  if (paymentStatus === 'paid') {
    // Show "hold" button for admins/managers on paid jobs
    if (variant === 'banner' && (isAdmin || isManager)) {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const success = await setPaymentHold(jobId, 'Manually placed on hold');
            if (success) onReleased?.();
          }}
          disabled={isProcessing}
          className="text-amber-600 border-amber-300 hover:bg-amber-50"
        >
          <CreditCard className="h-3.5 w-3.5 mr-1.5" />
          Hold for Payment
        </Button>
      );
    }
    return null;
  }

  // Awaiting payment state
  if (variant === "badge") {
    return (
      <Badge
        variant="outline"
        className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0"
      >
        <CreditCard className="h-2.5 w-2.5 mr-0.5" />
        AWAITING PAYMENT
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-300">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-amber-900">Awaiting Payment</p>
        {paymentHoldReason && (
          <p className="text-xs text-amber-700 mt-0.5">{paymentHoldReason}</p>
        )}
        <p className="text-xs text-amber-600 mt-1">
          Production is blocked until payment is confirmed.
        </p>
      </div>
      {(isAdmin || isManager) && (
        <Button
          size="sm"
          onClick={async () => {
            const success = await releasePaymentHold(jobId);
            if (success) onReleased?.();
          }}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700 shrink-0"
        >
          <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
          Release
        </Button>
      )}
    </div>
  );
};
