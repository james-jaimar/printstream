
import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, X, ArrowLeftRight } from "lucide-react";

interface ProductionManagerHeaderProps {
  jobCount: number;
  statusFilter: string | null;
  setStatusFilter: (filter: string | null) => void;
  uniqueStatuses: string[];
  onRefresh: () => void;
  refreshing: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredJobCount: number;
  sortBy: 'wo_no' | 'due_date';
  setSortBy: (field: 'wo_no' | 'due_date') => void;
  sortOrder: 'asc' | 'desc';
  setSortOrder: (order: 'asc' | 'desc') => void;
  onPrinterReassignment?: () => void;
  showPrinterReassignment?: boolean;
}

export const ProductionManagerHeader: React.FC<ProductionManagerHeaderProps> = ({
  jobCount,
  statusFilter,
  setStatusFilter,
  uniqueStatuses,
  onRefresh,
  refreshing,
  searchQuery,
  setSearchQuery,
  filteredJobCount,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  onPrinterReassignment,
  showPrinterReassignment = false
}) => {
  const handleSort = (field: 'wo_no' | 'due_date') => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold">Production Management</h1>
        <p className="text-gray-600">Overview of all production jobs</p>
        <p className="text-sm text-gray-500 mt-1">
          {searchQuery ? (
            <>
              Showing {filteredJobCount} of {jobCount} job{jobCount !== 1 ? 's' : ''} matching "{searchQuery}"
            </>
          ) : (
            <>
              Managing {jobCount} job{jobCount !== 1 ? 's' : ''}
            </>
          )}
        </p>
      </div>
      
      <div className="flex items-center gap-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by work order, reference, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10 w-[300px]"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 hover:bg-gray-100"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
        
        {/* Sorting Controls */}
        <div className="flex gap-2">
          <Button
            variant={sortBy === 'wo_no' ? "default" : "outline"}
            size="sm"
            onClick={() => handleSort('wo_no')}
            className="flex items-center gap-1"
          >
            Work Order {sortBy === 'wo_no' && (sortOrder === 'asc' ? '↑' : '↓')}
          </Button>
          <Button
            variant={sortBy === 'due_date' ? "default" : "outline"}
            size="sm"
            onClick={() => handleSort('due_date')}
            className="flex items-center gap-1"
          >
            Due Date {sortBy === 'due_date' && (sortOrder === 'asc' ? '↑' : '↓')}
          </Button>
        </div>
        
        <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? null : value)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map(status => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {showPrinterReassignment && onPrinterReassignment && (
          <Button
            variant="outline"
            onClick={onPrinterReassignment}
            className="flex items-center gap-2"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Move Printers
          </Button>
        )}
        
        <Button 
          variant="outline" 
          onClick={onRefresh}
          disabled={refreshing}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>
    </div>
  );
};
