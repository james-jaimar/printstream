import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { LabelDieline } from '@/types/labels';

interface DielineComboboxProps {
  dielines: LabelDieline[];
  value?: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function DielineCombobox({
  dielines,
  value,
  onValueChange,
  disabled,
  placeholder = 'Select dieline…',
}: DielineComboboxProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => dielines.find((d) => d.id === value),
    [dielines, value]
  );

  // Group active dielines by roll width
  const grouped = useMemo(() => {
    const active = dielines.filter((d) => d.is_active);
    const map = new Map<number, LabelDieline[]>();
    for (const d of active) {
      const list = map.get(d.roll_width_mm) ?? [];
      list.push(d);
      map.set(d.roll_width_mm, list);
    }
    // Sort groups by roll width
    return Array.from(map.entries()).sort(([a], [b]) => a - b);
  }, [dielines]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search dielines…" />
          <CommandList>
            <CommandEmpty>No dieline found.</CommandEmpty>
            {grouped.map(([rollWidth, items]) => (
              <CommandGroup key={rollWidth} heading={`${rollWidth}mm Roll`}>
                {items.map((dieline) => (
                  <CommandItem
                    key={dieline.id}
                    value={`${dieline.name} ${dieline.label_width_mm}x${dieline.label_height_mm} ${dieline.roll_width_mm}`}
                    onSelect={() => {
                      onValueChange(dieline.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === dieline.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {dieline.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
