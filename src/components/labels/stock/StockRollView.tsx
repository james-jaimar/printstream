import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LabelStock } from '@/types/labels';

interface StockRollViewProps {
  stock: LabelStock[];
  onAddStock: (stockId: string) => void;
  onViewDetails: (stockId: string) => void;
  onPrintBarcode: (stock: LabelStock) => void;
  onEdit: (stock: LabelStock) => void;
}

interface RollInfo {
  fillPercent: number;
  meters: number;
  isFull: boolean;
}

function getRollColor(fillPercent: number): string {
  if (fillPercent >= 75) return '#22c55e'; // green
  if (fillPercent >= 25) return '#eab308'; // amber
  return '#ef4444'; // red
}

function getRollBadgeClass(fillPercent: number): string {
  if (fillPercent >= 75) return 'bg-green-100 text-green-800 border-green-200';
  if (fillPercent >= 25) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function computeRolls(stock: LabelStock): RollInfo[] {
  const rollLen = stock.roll_length_meters;
  const current = stock.current_stock_meters;

  if (current <= 0 || rollLen <= 0) {
    return [{ fillPercent: 0, meters: 0, isFull: false }];
  }

  const fullCount = Math.floor(current / rollLen);
  const remainder = current % rollLen;
  const rolls: RollInfo[] = [];

  for (let i = 0; i < fullCount; i++) {
    rolls.push({ fillPercent: 100, meters: rollLen, isFull: true });
  }

  if (remainder > 0) {
    rolls.push({
      fillPercent: (remainder / rollLen) * 100,
      meters: remainder,
      isFull: false,
    });
  }

  return rolls;
}

/** Inline SVG roll icon with proportional fill from bottom */
function RollIcon({ fillPercent, size = 64 }: { fillPercent: number; size?: number }) {
  const color = getRollColor(fillPercent);
  // The roll body spans roughly from y=17 to y=236 in the 283 viewBox
  const bodyTop = 47;
  const bodyBottom = 236;
  const bodyHeight = bodyBottom - bodyTop;
  const fillHeight = (fillPercent / 100) * bodyHeight;
  const fillY = bodyBottom - fillHeight;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 283.46 283.46"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
    >
      <defs>
        <clipPath id={`body-clip-${fillPercent}-${size}`}>
          {/* Clip to the roll body shape */}
          <path d="M120.43,17.01c42.1,0,76.23,13.54,76.23,30.24v189.16H44.2V47.25c0-16.7,34.13-30.24,76.23-30.24Z" />
        </clipPath>
      </defs>

      {/* Fill rectangle clipped to body shape */}
      <rect
        x="0"
        y={fillY}
        width="283.46"
        height={fillHeight}
        fill={color}
        opacity={0.35}
        clipPath={`url(#body-clip-${fillPercent}-${size})`}
      />

      {/* Roll body outline */}
      <path
        d="M120.43,17.01c42.1,0,76.23,13.54,76.23,30.24v189.16H44.2V47.25c0-16.7,34.13-30.24,76.23-30.24Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeMiterlimit="10"
        className="text-muted-foreground"
      />

      {/* Bottom ellipse */}
      <ellipse
        cx="120.43"
        cy="236.41"
        rx="76.23"
        ry="30.24"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeMiterlimit="10"
        className="text-muted-foreground"
      />

      {/* Inner core */}
      <ellipse
        cx="120.43"
        cy="236.41"
        rx="34.65"
        ry="13.75"
        fill="currentColor"
        className="text-muted-foreground/30"
      />

      {/* Side panel */}
      <path
        d="M120.43,206.17h107.35c6.1,0,11.04-4.94,11.04-11.04V28.05c0-6.1-4.94-11.04-11.04-11.04h-107.35"
        fill="none"
        stroke="currentColor"
        strokeWidth="8"
        strokeMiterlimit="10"
        className="text-muted-foreground"
      />

      {/* Fill level line */}
      {fillPercent > 0 && fillPercent < 100 && (
        <line
          x1="44"
          y1={fillY}
          x2="197"
          y2={fillY}
          stroke={color}
          strokeWidth="3"
          opacity={0.7}
        />
      )}
    </svg>
  );
}

const SUBSTRATE_COLORS: Record<string, string> = {
  'PP': 'bg-blue-100 text-blue-800 border-blue-200',
  'PE': 'bg-purple-100 text-purple-800 border-purple-200',
  'PET': 'bg-teal-100 text-teal-800 border-teal-200',
  'Vinyl': 'bg-orange-100 text-orange-800 border-orange-200',
  'Semi Gloss': 'bg-pink-100 text-pink-800 border-pink-200',
  'Paper': 'bg-amber-100 text-amber-800 border-amber-200',
};

export function StockRollView({ stock, onViewDetails }: StockRollViewProps) {
  const substrateRolls = useMemo(() => {
    return stock.map((s) => ({
      stock: s,
      rolls: computeRolls(s),
    }));
  }, [stock]);

  if (stock.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No stock items found</p>;
  }

  return (
    <div className="space-y-6">
      {substrateRolls.map(({ stock: s, rolls }) => (
        <Card
          key={s.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onViewDetails(s.id)}
        >
          <CardContent className="p-4">
            {/* Substrate header */}
            <div className="flex items-center gap-2 mb-3">
              <span className="font-medium text-sm">{s.name}</span>
              <Badge className={`border text-[10px] ${SUBSTRATE_COLORS[s.substrate_type] ?? 'bg-secondary text-secondary-foreground'}`}>
                {s.substrate_type}
              </Badge>
              <span className="text-xs text-muted-foreground">{s.width_mm}mm</span>
              {s.glue_type && (
                <span className="text-xs text-muted-foreground">• {s.glue_type}</span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {s.current_stock_meters.toLocaleString()}m total • {rolls.length} roll{rolls.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Roll icons */}
            <div className="flex flex-wrap gap-4">
              {rolls.map((roll, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <RollIcon fillPercent={roll.fillPercent} size={56} />
                  <span className="text-[11px] font-medium">
                    {roll.isFull ? `${roll.meters.toLocaleString()}m` : `${Math.round(roll.meters).toLocaleString()}m`}
                  </span>
                  {roll.isFull ? (
                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-green-300 text-green-700">
                      Full
                    </Badge>
                  ) : (
                    <Badge className={`text-[9px] px-1 py-0 border ${getRollBadgeClass(roll.fillPercent)}`}>
                      {Math.round(roll.fillPercent)}%
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
