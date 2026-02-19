import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { LabelStock } from '@/types/labels';

import rollIcon20 from '@/assets/roll_icon_20.svg';
import rollIcon30 from '@/assets/roll_icon_30.svg';
import rollIcon40 from '@/assets/roll_icon_40.svg';
import rollIcon50 from '@/assets/roll_icon_50.svg';
import rollIcon66 from '@/assets/roll_icon_66.svg';
import rollIcon75 from '@/assets/roll_icon_75.svg';
import rollIcon85 from '@/assets/roll_icon_85.svg';
import rollIcon100 from '@/assets/roll_icon_100.svg';

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

function getRollIcon(fillPercent: number): string {
  if (fillPercent >= 93) return rollIcon100;
  if (fillPercent >= 80) return rollIcon85;
  if (fillPercent >= 70) return rollIcon75;
  if (fillPercent >= 58) return rollIcon66;
  if (fillPercent >= 45) return rollIcon50;
  if (fillPercent >= 35) return rollIcon40;
  if (fillPercent >= 25) return rollIcon30;
  return rollIcon20;
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
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {substrateRolls.map(({ stock: s, rolls }) => (
        <Card
          key={s.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onViewDetails(s.id)}
        >
          <CardContent className="p-3">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium text-xs truncate">{s.name}</span>
              <Badge className={`border text-[9px] shrink-0 ${SUBSTRATE_COLORS[s.substrate_type] ?? 'bg-secondary text-secondary-foreground'}`}>
                {s.substrate_type}
              </Badge>
              <span className="text-[10px] text-muted-foreground shrink-0">{s.width_mm}mm</span>
              {s.glue_type && (
                <span className="text-[10px] text-muted-foreground shrink-0">• {s.glue_type}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground mb-2">
              {s.current_stock_meters.toLocaleString()}m total • {rolls.length} roll{rolls.length !== 1 ? 's' : ''}
            </div>

            {/* Roll icons - max 5 per row */}
            <div className="flex flex-wrap gap-2">
              {rolls.map((roll, idx) => (
                <div key={idx} className="flex flex-col items-center gap-0.5" style={{ width: 48 }}>
                  <img
                    src={roll.fillPercent <= 0 ? rollIcon20 : getRollIcon(roll.fillPercent)}
                    alt={`Roll ${idx + 1}`}
                    className="w-10 h-10"
                    style={roll.fillPercent <= 0 ? { filter: 'grayscale(1) opacity(0.4)' } : undefined}
                  />
                  <span className="text-[10px] font-medium leading-tight">
                    {roll.isFull ? `${roll.meters.toLocaleString()}m` : `${Math.round(roll.meters).toLocaleString()}m`}
                  </span>
                  {roll.isFull ? (
                    <Badge variant="outline" className="text-[8px] px-1 py-0 border-green-300 text-green-700">
                      Full
                    </Badge>
                  ) : (
                    <Badge className={`text-[8px] px-1 py-0 border ${getRollBadgeClass(roll.fillPercent)}`}>
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
