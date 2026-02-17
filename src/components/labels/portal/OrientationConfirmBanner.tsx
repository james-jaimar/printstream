import { useState } from 'react';
import { AlertTriangle, CheckCircle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getOrientationLabel, getOrientationSvg, LABEL_ORIENTATIONS } from '@/components/labels/OrientationPicker';

interface OrientationConfirmBannerProps {
  orientation: number;
  confirmed: boolean;
  onConfirm: () => Promise<void>;
  isPending?: boolean;
}

export function OrientationConfirmBanner({ orientation, confirmed, onConfirm, isPending }: OrientationConfirmBannerProps) {
  const [confirming, setConfirming] = useState(false);
  const orientationData = LABEL_ORIENTATIONS.find(o => o.number === orientation);
  const svg = getOrientationSvg(orientation);
  const label = getOrientationLabel(orientation);

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      await onConfirm();
    } finally {
      setConfirming(false);
    }
  };

  const isLoading = confirming || isPending;

  return (
    <div className={`rounded-2xl border-2 p-5 transition-colors ${
      confirmed
        ? 'border-emerald-200/70 bg-emerald-50/50'
        : 'border-amber-300/70 bg-amber-50/50'
    } shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur`}>
      <div className="flex flex-col sm:flex-row items-center gap-5">
        {/* SVG Preview */}
        <div className="flex-shrink-0">
          <div className={`w-24 h-24 sm:w-28 sm:h-28 rounded-xl border-2 p-2 bg-white flex items-center justify-center ${
            confirmed ? 'border-emerald-200' : 'border-amber-200'
          }`}>
            <img src={svg} alt={label} className="w-full h-full object-contain" />
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 text-center sm:text-left space-y-2">
          <div className="flex items-center justify-center sm:justify-start gap-2">
            <h3 className="font-bold text-base">Label Orientation</h3>
            {confirmed ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 gap-1">
                <CheckCircle className="h-3 w-3" />
                Confirmed
              </Badge>
            ) : (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                <AlertTriangle className="h-3 w-3" />
                Needs Confirmation
              </Badge>
            )}
          </div>
          <p className="text-sm font-medium text-slate-700">{label}</p>
          {orientationData && (
            <p className="text-xs text-slate-500">
              {orientationData.winding} — {orientationData.direction}
            </p>
          )}
          {!confirmed && (
            <div className="space-y-2 pt-1">
              <p className="text-xs text-amber-700 font-medium flex items-center gap-1.5 justify-center sm:justify-start">
                <AlertTriangle className="h-3.5 w-3.5" />
                Incorrect orientation means the entire print run must be scrapped
              </p>
              <Button
                size="sm"
                className="bg-[#00B8D4] hover:bg-[#0097A7] text-white gap-1.5"
                onClick={handleConfirm}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                Confirm Orientation
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
