import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

import orientation1 from '@/assets/orientations/orientation-1.svg';
import orientation2 from '@/assets/orientations/orientation-2.svg';
import orientation3 from '@/assets/orientations/orientation-3.svg';
import orientation4 from '@/assets/orientations/orientation-4.svg';
import orientation5 from '@/assets/orientations/orientation-5.svg';
import orientation6 from '@/assets/orientations/orientation-6.svg';
import orientation7 from '@/assets/orientations/orientation-7.svg';
import orientation8 from '@/assets/orientations/orientation-8.svg';

export const LABEL_ORIENTATIONS = [
  { number: 1, winding: 'Outwound', direction: 'Head to Lead', svg: orientation1 },
  { number: 2, winding: 'Outwound', direction: 'Foot to Lead', svg: orientation2 },
  { number: 3, winding: 'Outwound', direction: 'Right to Lead', svg: orientation3 },
  { number: 4, winding: 'Outwound', direction: 'Left to Lead', svg: orientation4 },
  { number: 5, winding: 'Inwound', direction: 'Head to Lead', svg: orientation5 },
  { number: 6, winding: 'Inwound', direction: 'Foot to Lead', svg: orientation6 },
  { number: 7, winding: 'Inwound', direction: 'Right to Lead', svg: orientation7 },
  { number: 8, winding: 'Inwound', direction: 'Left to Lead', svg: orientation8 },
] as const;

export interface OrientationPickerProps {
  value: number;
  onChange?: (value: number) => void;
  readOnly?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function OrientationPicker({ value, onChange, readOnly, size = 'md', className }: OrientationPickerProps) {
  const imgSize = size === 'sm' ? 'h-12 w-12' : 'h-20 w-20';
  const tileSize = size === 'sm' ? 'min-w-[80px] p-2' : 'min-w-[110px] p-3';

  return (
    <div className={cn('flex gap-2 overflow-x-auto pb-2', className)}>
      {LABEL_ORIENTATIONS.map((o) => {
        const isSelected = value === o.number;
        return (
          <button
            key={o.number}
            type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange?.(o.number)}
            className={cn(
              'relative flex flex-col items-center gap-1.5 rounded-xl border-2 transition-all flex-shrink-0',
              tileSize,
              isSelected
                ? 'border-[#00B8D4] bg-[#00B8D4]/5 shadow-md ring-1 ring-[#00B8D4]/20'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm',
              readOnly && !isSelected && 'opacity-40',
              readOnly && 'cursor-default',
              !readOnly && 'cursor-pointer',
            )}
          >
            {isSelected && (
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#00B8D4] flex items-center justify-center shadow-sm">
                <Check className="h-3 w-3 text-white" />
              </div>
            )}
            <img src={o.svg} alt={`Orientation ${o.number}`} className={cn(imgSize, 'object-contain')} />
            <span className={cn(
              'font-bold',
              size === 'sm' ? 'text-xs' : 'text-sm',
              isSelected ? 'text-[#00B8D4]' : 'text-slate-700',
            )}>
              #{o.number}
            </span>
            <span className={cn(
              'text-center leading-tight',
              size === 'sm' ? 'text-[9px]' : 'text-[10px]',
              isSelected ? 'text-[#00B8D4]/80' : 'text-slate-500',
            )}>
              {o.winding}<br />{o.direction}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function getOrientationLabel(num: number): string {
  const o = LABEL_ORIENTATIONS.find(x => x.number === num);
  return o ? `#${o.number} — ${o.winding} / ${o.direction}` : `#${num}`;
}

export function getOrientationSvg(num: number): string {
  return LABEL_ORIENTATIONS.find(x => x.number === num)?.svg || orientation1;
}
