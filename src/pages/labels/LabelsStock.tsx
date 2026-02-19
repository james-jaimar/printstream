import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Search, Barcode, LayoutGrid, List } from 'lucide-react';
import { useLabelStock } from '@/hooks/labels/useLabelStock';
import { 
  StockCard, 
  StockDetailModal, 
  StockBarcodeModal, 
  StockTransactionModal, 
  StockBarcodeScanner,
  StockFormDialog,
  StockListView,
} from '@/components/labels/stock';
import { LowStockAlert } from '@/components/labels/production';
import type { LabelStock, SubstrateType, FinishType } from '@/types/labels';

const SUBSTRATE_TYPES: SubstrateType[] = ['Paper', 'PP', 'PE', 'PET', 'Vinyl'];
const FINISH_TYPES: FinishType[] = ['Gloss', 'Matt', 'Uncoated'];

export default function LabelsStock() {
  const [search, setSearch] = useState('');
  const [scannerActive, setScannerActive] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [substrateFilter, setSubstrateFilter] = useState<string>('all');
  const [finishFilter, setFinishFilter] = useState<string>('all');
  const [stockLevelFilter, setStockLevelFilter] = useState<string>('all');

  // Modals
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<LabelStock | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<LabelStock | null>(null);

  const { data: stock, isLoading } = useLabelStock();

  const filteredStock = useMemo(() => {
    if (!stock) return [];
    return stock.filter((s) => {
      // Text search
      const matchesSearch = !search || 
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.substrate_type.toLowerCase().includes(search.toLowerCase()) ||
        s.barcode?.toLowerCase().includes(search.toLowerCase()) ||
        s.supplier?.toLowerCase().includes(search.toLowerCase());

      // Substrate filter
      const matchesSubstrate = substrateFilter === 'all' || s.substrate_type === substrateFilter;

      // Finish filter
      const matchesFinish = finishFilter === 'all' || s.finish === finishFilter;

      // Stock level filter
      let matchesLevel = true;
      if (stockLevelFilter === 'low') {
        matchesLevel = s.current_stock_meters <= s.reorder_level_meters;
      } else if (stockLevelFilter === 'critical') {
        matchesLevel = s.current_stock_meters <= s.reorder_level_meters * 0.5;
      } else if (stockLevelFilter === 'good') {
        matchesLevel = s.current_stock_meters > s.reorder_level_meters;
      }

      return matchesSearch && matchesSubstrate && matchesFinish && matchesLevel;
    });
  }, [stock, search, substrateFilter, finishFilter, stockLevelFilter]);

  const activeFilterCount = [substrateFilter, finishFilter, stockLevelFilter]
    .filter(f => f !== 'all').length;

  const handleAddStock = (stockId: string) => {
    setSelectedStockId(stockId);
    setTransactionModalOpen(true);
  };

  const handleViewDetails = (stockId: string) => {
    setSelectedStockId(stockId);
    setDetailModalOpen(true);
  };

  const handlePrintBarcode = (stockItem: LabelStock) => {
    setSelectedStock(stockItem);
    setBarcodeModalOpen(true);
  };

  const handleEdit = (stockItem: LabelStock) => {
    setEditingStock(stockItem);
    setFormDialogOpen(true);
  };

  const handleStockFoundByScanner = (stockItem: LabelStock) => {
    setSelectedStockId(stockItem.id);
    setSelectedStock(stockItem);
    setDetailModalOpen(true);
  };

  const handleNewStock = () => {
    setEditingStock(null);
    setFormDialogOpen(true);
  };

  const clearFilters = () => {
    setSubstrateFilter('all');
    setFinishFilter('all');
    setStockLevelFilter('all');
    setSearch('');
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stock Management</h1>
          <p className="text-sm text-muted-foreground">Roll substrate inventory and tracking</p>
        </div>
        <Button onClick={handleNewStock}>
          <Plus className="h-4 w-4 mr-2" />
          Add Stock Item
        </Button>
      </div>

      {/* Search, Filters, View Toggle */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, type, barcode, or supplier..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <Select value={substrateFilter} onValueChange={setSubstrateFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Substrate" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SUBSTRATE_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={finishFilter} onValueChange={setFinishFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Finish" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Finishes</SelectItem>
              {FINISH_TYPES.map(f => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stockLevelFilter} onValueChange={setStockLevelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Stock Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="good">In Stock</SelectItem>
              <SelectItem value="low">Low Stock</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>

          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
              <Badge variant="secondary" className="ml-1 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                {activeFilterCount}
              </Badge>
            </Button>
          )}

          {/* Scanner + View Toggle */}
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="scanner-toggle"
                checked={scannerActive}
                onCheckedChange={setScannerActive}
              />
              <Label htmlFor="scanner-toggle" className="flex items-center gap-1 cursor-pointer text-sm">
                <Barcode className="h-4 w-4" />
                Scanner
              </Label>
            </div>

            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="text-sm text-muted-foreground">
          {filteredStock.length} item{filteredStock.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && ` (filtered from ${stock?.length ?? 0})`}
        </div>
      </div>

      {scannerActive && (
        <StockBarcodeScanner 
          isActive={scannerActive} 
          onStockFound={handleStockFoundByScanner} 
        />
      )}

      <LowStockAlert />

      {/* Content */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading stock...</p>
      ) : viewMode === 'list' ? (
        <StockListView
          stock={filteredStock}
          onAddStock={handleAddStock}
          onViewDetails={handleViewDetails}
          onPrintBarcode={handlePrintBarcode}
          onEdit={handleEdit}
        />
      ) : filteredStock.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No stock items found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStock.map((item) => (
            <StockCard
              key={item.id}
              stock={item}
              onAddStock={handleAddStock}
              onViewDetails={handleViewDetails}
              onPrintBarcode={handlePrintBarcode}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <StockFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        editStock={editingStock}
      />

      <StockDetailModal
        stockId={selectedStockId}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
        onPrintBarcode={() => {
          const stockItem = stock?.find(s => s.id === selectedStockId);
          if (stockItem) {
            setSelectedStock(stockItem);
            setBarcodeModalOpen(true);
          }
        }}
        onAddTransaction={() => {
          setTransactionModalOpen(true);
        }}
      />

      <StockBarcodeModal
        stock={selectedStock}
        open={barcodeModalOpen}
        onOpenChange={setBarcodeModalOpen}
      />

      <StockTransactionModal
        stockId={selectedStockId}
        open={transactionModalOpen}
        onOpenChange={setTransactionModalOpen}
      />
    </div>
  );
}
