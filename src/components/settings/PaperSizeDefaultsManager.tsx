import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Layers } from 'lucide-react';
import { toast } from 'sonner';

interface PrintSpec {
  id: string;
  name: string;
  category: string;
}

interface PaperSize {
  id: string;
  name: string;
  dimensions: string;
}

interface PaperSizeDefault {
  id: string;
  paper_weight_id: string;
  paper_type_id: string | null;
  default_paper_size_id: string;
}

export function PaperSizeDefaultsManager() {
  const [defaults, setDefaults] = useState<PaperSizeDefault[]>([]);
  const [paperWeights, setPaperWeights] = useState<PrintSpec[]>([]);
  const [paperTypes, setPaperTypes] = useState<PrintSpec[]>([]);
  const [paperSizes, setPaperSizes] = useState<PaperSize[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New row state
  const [newWeightId, setNewWeightId] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  const [newSizeId, setNewSizeId] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setIsLoading(true);
    const [defaultsRes, specsRes, sizesRes] = await Promise.all([
      supabase.from('paper_size_defaults' as any).select('*'),
      supabase.from('print_specifications').select('id, name, category').in('category', ['paper_weight', 'paper_type']).order('name'),
      supabase.from('hp12000_paper_sizes').select('id, name, dimensions').eq('is_active', true).order('sort_order'),
    ]);

    if (defaultsRes.data) setDefaults(defaultsRes.data as any[]);
    if (specsRes.data) {
      setPaperWeights(specsRes.data.filter(s => s.category === 'paper_weight'));
      setPaperTypes(specsRes.data.filter(s => s.category === 'paper_type'));
    }
    if (sizesRes.data) setPaperSizes(sizesRes.data);
    setIsLoading(false);
  };

  const handleAdd = async () => {
    if (!newWeightId || !newSizeId) {
      toast.error('Weight and Size are required');
      return;
    }

    const insertData: any = {
      paper_weight_id: newWeightId,
      paper_type_id: newTypeId && newTypeId !== '__none__' ? newTypeId : null,
      default_paper_size_id: newSizeId,
    };

    const { error } = await supabase.from('paper_size_defaults' as any).insert(insertData);
    if (error) {
      if (error.message.includes('duplicate') || error.message.includes('unique')) {
        toast.error('A default for this weight/type combination already exists');
      } else {
        toast.error(`Failed to add: ${error.message}`);
      }
      return;
    }

    toast.success('Paper size default added');
    setNewWeightId('');
    setNewTypeId('');
    setNewSizeId('');
    loadAll();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('paper_size_defaults' as any).delete().eq('id', id);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
      return;
    }
    toast.success('Default removed');
    loadAll();
  };

  const getSpecName = (id: string) => {
    const spec = [...paperWeights, ...paperTypes].find(s => s.id === id);
    return spec?.name ?? '—';
  };

  const getSizeName = (id: string) => {
    const size = paperSizes.find(s => s.id === id);
    return size ? `${size.name} (${size.dimensions})` : '—';
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 flex justify-center">
          <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-primary animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Layers className="h-5 w-5 text-primary" />
          Paper Size Defaults
        </CardTitle>
        <CardDescription>
          Set default HP12000 paper sizes for weight/type combinations. New jobs will auto-assign these sizes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing defaults */}
        {defaults.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Weight</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Default Size</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {defaults.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{getSpecName(d.paper_weight_id)}</TableCell>
                  <TableCell>{d.paper_type_id ? getSpecName(d.paper_type_id) : <span className="text-muted-foreground italic">Any</span>}</TableCell>
                  <TableCell>{getSizeName(d.default_paper_size_id)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {defaults.length === 0 && (
          <p className="text-muted-foreground text-center py-4 text-sm">No defaults configured yet. Add one below.</p>
        )}

        {/* Add new row */}
        <div className="flex flex-col sm:flex-row gap-2 items-end border-t pt-4">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Weight *</label>
            <Select value={newWeightId} onValueChange={setNewWeightId}>
              <SelectTrigger><SelectValue placeholder="Select weight" /></SelectTrigger>
              <SelectContent>
                {paperWeights.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Type (optional)</label>
            <Select value={newTypeId} onValueChange={setNewTypeId}>
              <SelectTrigger><SelectValue placeholder="Any type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Any type</SelectItem>
                {paperTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Default Size *</label>
            <Select value={newSizeId} onValueChange={setNewSizeId}>
              <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
              <SelectContent>
                {paperSizes.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} ({s.dimensions})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} size="sm" className="flex items-center gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

