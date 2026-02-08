import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Search, Barcode } from 'lucide-react';
import { useLabelStock } from '@/hooks/labels/useLabelStock';
import { 
  StockCard, 
  StockDetailModal, 
  StockBarcodeModal, 
  StockTransactionModal,
  StockBarcodeScanner 
} from '@/components/labels/stock';
import { LowStockAlert } from '@/components/labels/production';
import type { LabelStock } from '@/types/labels';

export default function LabelsStock() {
  const [search, setSearch] = useState('');
  const [scannerActive, setScannerActive] = useState(true);
  
  // Modal states
  const [selectedStockId, setSelectedStockId] = useState<string | null>(null);
  const [selectedStock, setSelectedStock] = useState<LabelStock | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [transactionModalOpen, setTransactionModalOpen] = useState(false);

  const { data: stock, isLoading } = useLabelStock();

  const filteredStock = stock?.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.substrate_type.toLowerCase().includes(search.toLowerCase()) ||
    s.barcode?.toLowerCase().includes(search.toLowerCase())
  );

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

  const handleStockFoundByScanner = (stockItem: LabelStock) => {
    setSelectedStockId(stockItem.id);
    setSelectedStock(stockItem);
    setDetailModalOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stock Management</h1>
          <p className="text-muted-foreground">
            Roll substrate inventory and tracking
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Stock Item
        </Button>
      </div>

      {/* Search and Scanner Toggle */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, type, or barcode..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="scanner-toggle"
            checked={scannerActive}
            onCheckedChange={setScannerActive}
          />
          <Label htmlFor="scanner-toggle" className="flex items-center gap-2 cursor-pointer">
            <Barcode className="h-4 w-4" />
            Scanner
          </Label>
        </div>
      </div>

      {/* Barcode Scanner Status */}
      {scannerActive && (
        <StockBarcodeScanner 
          isActive={scannerActive} 
          onStockFound={handleStockFoundByScanner} 
        />
      )}

      {/* Low Stock Alert */}
      <LowStockAlert />

      {/* Stock Grid */}
      {isLoading ? (
        <p className="text-muted-foreground text-center py-8">Loading stock...</p>
      ) : filteredStock?.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">No stock items found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStock?.map((item) => (
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
