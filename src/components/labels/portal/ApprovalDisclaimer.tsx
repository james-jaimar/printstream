import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ShieldCheck } from 'lucide-react';

interface ApprovalDisclaimerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isPending?: boolean;
  itemCount?: number;
}

export default function ApprovalDisclaimer({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  itemCount = 1,
}: ApprovalDisclaimerProps) {
  const [agreed, setAgreed] = useState(false);

  const handleOpenChange = (val: boolean) => {
    if (!val) setAgreed(false);
    onOpenChange(val);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Confirm Proof Approval
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                You are approving{' '}
                <strong className="text-foreground">
                  {itemCount} item{itemCount !== 1 ? 's' : ''}
                </strong>{' '}
                for production.
              </p>
              <div className="rounded-md border bg-muted/50 p-3 text-xs leading-relaxed">
                By approving this proof, you confirm that the artwork, colours, text,
                and layout are correct. Once approved, <strong>no amendments can be
                made</strong> and the order will proceed directly into production.
                We accept no liability for errors not identified prior to approval.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex items-start gap-2 py-2">
          <Checkbox
            id="disclaimer-agree"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(v === true)}
          />
          <Label htmlFor="disclaimer-agree" className="text-xs leading-snug cursor-pointer">
            I have reviewed all artwork and confirm it is correct for production.
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!agreed || isPending}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? 'Approving…' : 'Approve for Production'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
