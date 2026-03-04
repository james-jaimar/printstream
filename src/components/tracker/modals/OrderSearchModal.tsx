
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Loader2, Package, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAccessibleJobs } from "@/hooks/tracker/useAccessibleJobs";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import type { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface OrderSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSelect: (job: AccessibleJob) => void;
}

export const OrderSearchModal: React.FC<OrderSearchModalProps> = ({
  isOpen,
  onClose,
  onOrderSelect
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const { isViewer } = useUserRole();
  const { jobs, isLoading } = useAccessibleJobs({ permissionType: isViewer ? 'view' : 'manage' });

  // Enhanced filter with batch context
  const filteredJobs = jobs.filter(job => {
    // Batch filter logic
    if (batchFilter !== "all") {
      switch (batchFilter) {
        case 'individual':
          if (job.is_batch_master || job.is_in_batch_processing) return false;
          break;
        case 'batched':
          if (!job.is_in_batch_processing) return false;
          break;
        case 'batch_master':
          if (!job.is_batch_master) return false;
          break;
      }
    }

    // Enhanced search with batch context
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const searchFields = [
        job.wo_no,
        job.customer,
        job.reference,
        job.batch_name,
        job.batch_category,
        job.is_batch_master ? 'batch master' : null,
        job.is_in_batch_processing ? 'in batch' : null
      ].filter(Boolean);

      return searchFields.some(field => 
        field?.toLowerCase().includes(query)
      );
    }

    return true;
  });

  const handleOrderClick = (job: AccessibleJob) => {
    onOrderSelect(job);
    onClose();
    setSearchQuery("");
    setBatchFilter("all");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Search Orders</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by WO, customer, reference, or batch..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            
            <Select value={batchFilter} onValueChange={setBatchFilter}>
              <SelectTrigger className="w-40">
                <Package className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="individual">Individual</SelectItem>
                <SelectItem value="batched">In Batch</SelectItem>
                <SelectItem value="batch_master">Batch Masters</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="max-h-96 overflow-y-auto border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="ml-2">Loading orders...</span>
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchQuery ? 'No orders found matching your search' : 'Start typing to search orders'}
              </div>
            ) : (
              <div className="divide-y">
                {filteredJobs.slice(0, 50).map((job) => (
                  <div
                    key={job.job_id}
                    onClick={() => handleOrderClick(job)}
                    className="p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="font-medium">{job.wo_no}</div>
                          {job.is_batch_master && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                              Batch Master
                            </span>
                          )}
                          {job.is_in_batch_processing && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">
                              In Batch
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">{job.customer}</div>
                        {job.reference && (
                          <div className="text-xs text-gray-500">{job.reference}</div>
                        )}
                        {job.batch_name && (
                          <div className="text-xs text-orange-600">Batch: {job.batch_name}</div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium" style={{ color: job.current_stage_color }}>
                          {job.display_stage_name}
                        </div>
                        <div className="text-xs text-gray-500">{job.status}</div>
                        {job.due_date && (
                          <div className="text-xs text-gray-500">Due: {job.due_date}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
