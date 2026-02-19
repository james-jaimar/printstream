import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface StockItem {
  id: string;
  name: string;
  width_mm: number;
  substrate_type: string;
  finish: string;
  glue_type: string | null;
  current_stock_meters: number;
  gsm: number | null;
}

interface SubstrateSelectorProps {
  stock: StockItem[];
  value: string;
  onChange: (value: string) => void;
}

export function SubstrateSelector({ stock, value, onChange }: SubstrateSelectorProps) {
  const [search, setSearch] = useState('');
  const [filterWidth, setFilterWidth] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterFinish, setFilterFinish] = useState<string>('all');
  const [filterGlue, setFilterGlue] = useState<string>('all');

  const uniqueWidths = useMemo(() => [...new Set(stock.map(s => s.width_mm))].sort((a, b) => a - b), [stock]);
  const uniqueTypes = useMemo(() => [...new Set(stock.map(s => s.substrate_type))].sort(), [stock]);
  const uniqueFinishes = useMemo(() => [...new Set(stock.map(s => s.finish))].sort(), [stock]);
  const uniqueGlues = useMemo(() => [...new Set(stock.map(s => s.glue_type).filter(Boolean))].sort() as string[], [stock]);

  const filtered = useMemo(() => {
    return stock.filter(s => {
      if (filterWidth !== 'all' && s.width_mm !== Number(filterWidth)) return false;
      if (filterType !== 'all' && s.substrate_type !== filterType) return false;
      if (filterFinish !== 'all' && s.finish !== filterFinish) return false;
      if (filterGlue !== 'all' && (s.glue_type || '') !== filterGlue) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${s.name} ${s.substrate_type} ${s.finish} ${s.glue_type || ''} ${s.width_mm}mm`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [stock, filterWidth, filterType, filterFinish, filterGlue, search]);

  const selectedItem = stock.find(s => s.id === value);
  const hasActiveFilters = filterWidth !== 'all' || filterType !== 'all' || filterFinish !== 'all' || filterGlue !== 'all' || search;

  const clearFilters = () => {
    setSearch('');
    setFilterWidth('all');
    setFilterType('all');
    setFilterFinish('all');
    setFilterGlue('all');
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Substrate</Label>
        {hasActiveFilters && (
          <button type="button" onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> Clear filters
          </button>
        )}
      </div>

      {/* Selected substrate display */}
      {selectedItem && (
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium">{selectedItem.name}</span>
            <Badge variant="outline" className="text-xs">{selectedItem.width_mm}mm</Badge>
            <Badge variant="secondary" className="text-xs">{selectedItem.finish}</Badge>
          </div>
          <span className="text-xs text-muted-foreground">{selectedItem.current_stock_meters}m available</span>
        </div>
      )}

      {/* Search + filters row */}
      <div className="grid grid-cols-5 gap-2">
        <div className="col-span-2 relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={filterWidth} onValueChange={setFilterWidth}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Width" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All widths</SelectItem>
            {uniqueWidths.map(w => (
              <SelectItem key={w} value={String(w)}>{w}mm</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {uniqueTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFinish} onValueChange={setFilterFinish}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Finish" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All finishes</SelectItem>
            {uniqueFinishes.map(f => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Results list */}
      <ScrollArea className="h-[180px] rounded-md border">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground py-8">
            No substrates match your filters
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(s.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent transition-colors",
                  value === s.id && "bg-primary/10"
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{s.name}</span>
                  <Badge variant="outline" className="text-xs shrink-0">{s.width_mm}mm</Badge>
                  {s.glue_type && (
                    <Badge variant="secondary" className="text-xs shrink-0">{s.glue_type}</Badge>
                  )}
                </div>
                <span className={cn(
                  "text-xs shrink-0 ml-2",
                  s.current_stock_meters > 0 ? "text-muted-foreground" : "text-destructive"
                )}>
                  {s.current_stock_meters}m
                </span>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
      <p className="text-xs text-muted-foreground">
        {filtered.length} of {stock.length} substrates
      </p>
    </div>
  );
}
