import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight, SkipForward, Factory, Workflow, Database, Settings } from "lucide-react";
import type { EnhancedJobCreationResult } from "@/utils/excel/enhancedJobCreator";
import type { CategoryAssignmentResult } from "@/utils/excel/productionStageMapper";
import type { RowMappingResult } from "@/utils/excel/types";
import { RowMappingTable } from "./RowMappingTable";
import { RowMappingErrorBoundary } from "./RowMappingErrorBoundary";
import { supabase } from "@/integrations/supabase/client";
import { AddRowDialog } from "./AddRowDialog";
import { toast } from "sonner";

interface PaginatedJobCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: EnhancedJobCreationResult | null;
  isProcessing: boolean;
  onSingleJobConfirm: (woNo: string, userApprovedMappings?: Array<{groupName: string, mappedStageId: string, mappedStageName: string, category: string, mappedStageSpecId?: string, mappedStageSpecName?: string, paperSpecification?: string, partType?: string, quantity?: number}>) => Promise<void>;
  onComplete: () => void;
}

interface AvailableStage {
  id: string;
  name: string;
  category: string;
}

interface AvailableCategory {
  id: string;
  name: string;
  color: string;
}

interface OrderProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'skipped' | 'failed';
  error?: string;
}

export const PaginatedJobCreationDialog: React.FC<PaginatedJobCreationDialogProps> = ({
  open,
  onOpenChange,
  result,
  isProcessing,
  onSingleJobConfirm,
  onComplete
}) => {
  const CUSTOM_WORKFLOW_VALUE = 'custom_workflow';
  
  const [currentOrderIndex, setCurrentOrderIndex] = useState(0);
  const [selectedTab, setSelectedTab] = useState("mapping");
  const [availableStages, setAvailableStages] = useState<AvailableStage[]>([]);
  const [availableCategories, setAvailableCategories] = useState<AvailableCategory[]>([]);
  const [stageSpecifications, setStageSpecifications] = useState<{ [stageId: string]: any[] }>({});
  const [updatedRowMappings, setUpdatedRowMappings] = useState<{ [woNo: string]: RowMappingResult[] }>({});
  const [orderStatuses, setOrderStatuses] = useState<{ [woNo: string]: OrderProcessingStatus }>({});
  const [showAddRowDialog, setShowAddRowDialog] = useState(false);
  const [selectedWoForAdd, setSelectedWoForAdd] = useState<string>("");
  const [isProcessingSingle, setIsProcessingSingle] = useState(false);

  // Get order list from result
  const orderList = result ? Object.keys(result.categoryAssignments) : [];
  const currentOrder = orderList[currentOrderIndex];
  const totalOrders = orderList.length;

  useEffect(() => {
    loadAvailableStages();
    loadAvailableCategories();
    loadStageSpecifications();
  }, []);

  useEffect(() => {
    if (result?.rowMappings) {
      // Initialize updatedRowMappings with DEEP CLONE to prevent cross-order contamination
      const initialMappings: { [woNo: string]: RowMappingResult[] } = {};
      Object.entries(result.rowMappings).forEach(([woNo, mappings]) => {
        if (mappings && mappings.length > 0) {
          // CRITICAL: Deep clone each mapping object to avoid shared references
          initialMappings[woNo] = mappings.map(m => ({...m}));
        }
      });
      setUpdatedRowMappings(initialMappings);

      // Initialize order statuses
      const initialStatuses: { [woNo: string]: OrderProcessingStatus } = {};
      Object.keys(result.categoryAssignments).forEach(woNo => {
        initialStatuses[woNo] = { status: 'pending' };
      });
      setOrderStatuses(initialStatuses);
    }
  }, [result]);

  const loadAvailableStages = async () => {
    try {
      const { data: stages, error } = await supabase
        .from('production_stages')
        .select('id, name, description')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const mappedStages = (stages || []).map(stage => ({
        id: stage.id,
        name: stage.name,
        category: inferStageCategory(stage.name, stage.description)
      }));

      setAvailableStages(mappedStages);
    } catch (error) {
      console.error('Failed to load available stages:', error);
    }
  };

  const loadAvailableCategories = async () => {
    try {
      const { data: categories, error } = await supabase
        .from('categories')
        .select('id, name, color')
        .order('name');

      if (error) throw error;
      setAvailableCategories(categories || []);
    } catch (error) {
      console.error('Failed to load available categories:', error);
    }
  };

  const loadStageSpecifications = async () => {
    try {
      const { data: specs, error } = await supabase
        .from('stage_specifications')
        .select('id, name, production_stage_id')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;

      const specsByStage: { [stageId: string]: any[] } = {};
      (specs || []).forEach(spec => {
        if (!specsByStage[spec.production_stage_id]) {
          specsByStage[spec.production_stage_id] = [];
        }
        specsByStage[spec.production_stage_id].push(spec);
      });

      setStageSpecifications(specsByStage);
    } catch (error) {
      console.error('Failed to load stage specifications:', error);
    }
  };

  const inferStageCategory = (name: string, description?: string): string => {
    const text = `${name} ${description || ''}`.toLowerCase();
    
    if (text.includes('print') || text.includes('hp') || text.includes('xerox') || text.includes('digital')) {
      return 'printing';
    }
    if (text.includes('finish') || text.includes('laminat') || text.includes('cut') || text.includes('fold') || text.includes('bind')) {
      return 'finishing';
    }
    if (text.includes('prepress') || text.includes('dtp') || text.includes('proof') || text.includes('plate')) {
      return 'prepress';
    }
    if (text.includes('packag') || text.includes('box') || text.includes('wrap') || text.includes('ship')) {
      return 'packaging';
    }
    if (text.includes('deliver') || text.includes('dispatch')) {
      return 'delivery';
    }
    
    return 'unknown';
  };

  const handleUpdateMapping = (woNo: string, arrayIndex: number, stageId: string, stageName: string, stageSpecId?: string, stageSpecName?: string) => {
    setUpdatedRowMappings(prev => {
      const updated = { ...prev };
      const mappings = prev[woNo];
      if (mappings && arrayIndex >= 0 && arrayIndex < mappings.length) {
        const mappingsCopy = [...mappings];
        mappingsCopy[arrayIndex] = {
          ...mappingsCopy[arrayIndex],
          mappedStageId: stageId,
          mappedStageName: stageName,
          mappedStageSpecId: stageSpecId || null,
          mappedStageSpecName: stageSpecName || null,
          isUnmapped: false
        };
        updated[woNo] = mappingsCopy;
      }
      return updated;
    });
  };

  const handleUpdateCategory = (woNo: string, categoryId: string | null, categoryName: string | null) => {
    if (result && result.categoryAssignments[woNo]) {
      result.categoryAssignments[woNo].categoryId = categoryId;
      result.categoryAssignments[woNo].categoryName = categoryName;
      result.categoryAssignments[woNo].requiresCustomWorkflow = !categoryId;
    }
  };

  const handleToggleManualOverride = (woNo: string, arrayIndex: number) => {
    setUpdatedRowMappings(prev => {
      const updated = { ...prev };
      const mappings = prev[woNo];
      if (mappings && arrayIndex >= 0 && arrayIndex < mappings.length) {
        const currentValue = mappings[arrayIndex].manualOverride;
        const newValue = !currentValue;
        
        const mappingsCopy = [...mappings];
        
        // If opening edit mode (newValue = true), close all other rows first
        if (newValue) {
          mappingsCopy.forEach((m, idx) => {
            if (idx !== arrayIndex) {
              mappingsCopy[idx] = {
                ...m,
                manualOverride: false
              };
            }
          });
        }
        
        // Toggle the clicked row
        mappingsCopy[arrayIndex] = {
          ...mappingsCopy[arrayIndex],
          manualOverride: newValue
        };
        
        updated[woNo] = mappingsCopy;
      }
      return updated;
    });
  };

  const handleIgnoreRow = (woNo: string, arrayIndex: number) => {
    setUpdatedRowMappings(prev => {
      const updated = { ...prev };
      const mappings = prev[woNo];
      if (mappings && arrayIndex >= 0 && arrayIndex < mappings.length) {
        const mappingsCopy = [...mappings];
        mappingsCopy[arrayIndex] = {
          ...mappingsCopy[arrayIndex],
          ignored: true
        };
        updated[woNo] = mappingsCopy;
      }
      return updated;
    });
  };

  const handleRestoreRow = (woNo: string, arrayIndex: number) => {
    setUpdatedRowMappings(prev => {
      const updated = { ...prev };
      const mappings = prev[woNo];
      if (mappings && arrayIndex >= 0 && arrayIndex < mappings.length) {
        const mappingsCopy = [...mappings];
        mappingsCopy[arrayIndex] = {
          ...mappingsCopy[arrayIndex],
          ignored: false
        };
        updated[woNo] = mappingsCopy;
      }
      return updated;
    });
  };

  const handleAddCustomRow = (woNo: string, newRow: RowMappingResult) => {
    setUpdatedRowMappings(prev => {
      const currentMappings = prev[woNo] || [];
      
      // Count existing custom rows to assign unique negative index
      const customRowCount = currentMappings.filter(m => m.isCustomRow).length;
      const uniqueNegativeIndex = -(customRowCount + 1); // -1, -2, -3, etc.
      
      // Assign unique negative index while preserving customRowId
      const rowWithUniqueIndex = {
        ...newRow,
        excelRowIndex: uniqueNegativeIndex
      };
      
      return {
        ...prev,
        [woNo]: [...currentMappings, rowWithUniqueIndex]
      };
    });
  };

  const getCurrentOrderMappings = () => {
    if (!currentOrder || !updatedRowMappings[currentOrder]) {
      return [];
    }
    // Return a copy to prevent external mutations
    return [...updatedRowMappings[currentOrder]];
  };

  const extractUserApprovedMappings = (woNo: string) => {
    const mappings = updatedRowMappings[woNo] || [];
    const userApprovedMappings: Array<{
      groupName: string, 
      mappedStageId: string, 
      mappedStageName: string, 
      category: string,
      mappedStageSpecId?: string,
      mappedStageSpecName?: string,
      paperSpecification?: string,
      partType?: string,
      quantity?: number
    }> = [];
    
    mappings.forEach(mapping => {
      if (mapping.mappedStageId && mapping.mappedStageName && !mapping.isUnmapped && !mapping.ignored) {
        const stage = availableStages.find(s => s.id === mapping.mappedStageId);
        
        const approvedMapping = {
          groupName: mapping.groupName || `Row ${mapping.excelRowIndex}`,
          mappedStageId: mapping.mappedStageId,
          mappedStageName: mapping.mappedStageName,
          category: stage?.category || 'unknown',
          mappedStageSpecId: mapping.mappedStageSpecId || undefined,
          mappedStageSpecName: mapping.mappedStageSpecName || undefined,
          paperSpecification: mapping.paperSpecification || undefined,
          partType: mapping.partType || undefined,
          quantity: mapping.qty || undefined
        };
        
        userApprovedMappings.push(approvedMapping);
      }
    });
    
    return userApprovedMappings;
  };

  const handleProcessCurrentOrder = async () => {
    if (!currentOrder) return;

    setIsProcessingSingle(true);
    setOrderStatuses(prev => ({ ...prev, [currentOrder]: { status: 'processing' } }));

    try {
      const userApprovedMappings = extractUserApprovedMappings(currentOrder);
      console.log(`🔄 Processing order ${currentOrder} with ${userApprovedMappings.length} mappings`);
      
      await onSingleJobConfirm(currentOrder, userApprovedMappings);
      
      setOrderStatuses(prev => ({ ...prev, [currentOrder]: { status: 'completed' } }));
      toast.success(`Order ${currentOrder} processed successfully`);
      
      // Auto-advance to next order if not the last one
      if (currentOrderIndex < totalOrders - 1) {
        setCurrentOrderIndex(prev => prev + 1);
        setSelectedTab("mapping"); // Reset to mapping tab for next order
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`❌ Failed to process order ${currentOrder}:`, error);
      
      // Provide more specific error messaging for common issues
      let displayMessage = errorMessage;
      if (errorMessage.includes('unique constraint') || errorMessage.includes('duplicate key')) {
        displayMessage = `Duplicate data conflict for ${currentOrder}. This order may have already been processed.`;
      } else if (errorMessage.includes('initialize_custom_job_stages_with_specs')) {
        displayMessage = `Workflow setup failed for ${currentOrder}. Please check stage mappings and try again.`;
      }
      
      setOrderStatuses(prev => ({ 
        ...prev, 
        [currentOrder]: { status: 'failed', error: displayMessage } 
      }));
      toast.error(`Failed to process order ${currentOrder}: ${displayMessage}`);
    } finally {
      setIsProcessingSingle(false);
    }
  };

  const handleSkipCurrentOrder = () => {
    if (!currentOrder) return;
    
    setOrderStatuses(prev => ({ ...prev, [currentOrder]: { status: 'skipped' } }));
    toast.info(`Order ${currentOrder} skipped`);
    
    // Auto-advance to next order if not the last one
    if (currentOrderIndex < totalOrders - 1) {
      setCurrentOrderIndex(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentOrderIndex > 0) {
      setCurrentOrderIndex(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentOrderIndex < totalOrders - 1) {
      setCurrentOrderIndex(prev => prev + 1);
    }
  };

  const getProcessingProgress = () => {
    const processedCount = Object.values(orderStatuses).filter(
      status => status.status === 'completed' || status.status === 'skipped'
    ).length;
    return Math.round((processedCount / totalOrders) * 100);
  };

  const getCompletedCount = () => {
    return Object.values(orderStatuses).filter(status => status.status === 'completed').length;
  };

  const getSkippedCount = () => {
    return Object.values(orderStatuses).filter(status => status.status === 'skipped').length;
  };

  const getFailedCount = () => {
    return Object.values(orderStatuses).filter(status => status.status === 'failed').length;
  };

  const isLastOrder = currentOrderIndex === totalOrders - 1;
  const isFirstOrder = currentOrderIndex === 0;
  const currentOrderStatus = currentOrder ? orderStatuses[currentOrder]?.status : 'pending';

  if (!result && !isProcessing) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-7xl h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5" />
            Single Order Processing - {currentOrder}
          </DialogTitle>
          <DialogDescription>
            Process orders one at a time to avoid duplicate data issues and maintain better control
          </DialogDescription>
        </DialogHeader>

        {isProcessing ? (
          <div className="space-y-4 py-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
            <div className="text-center">
              <p className="font-medium">Processing Excel data...</p>
              <p className="text-sm text-muted-foreground">Preparing orders for review</p>
            </div>
          </div>
        ) : result ? (
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Progress Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-600" />
                    <div>
                      <div className="text-2xl font-bold">{totalOrders}</div>
                      <div className="text-sm text-muted-foreground">Total Orders</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div>
                      <div className="text-2xl font-bold text-green-600">{getCompletedCount()}</div>
                      <div className="text-sm text-muted-foreground">Completed</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <SkipForward className="h-4 w-4 text-orange-600" />
                    <div>
                      <div className="text-2xl font-bold text-orange-600">{getSkippedCount()}</div>
                      <div className="text-sm text-muted-foreground">Skipped</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-600" />
                    <div>
                      <div className="text-2xl font-bold text-red-600">{getFailedCount()}</div>
                      <div className="text-sm text-muted-foreground">Failed</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overall Progress */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Processing Progress</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Progress value={getProcessingProgress()} className="h-2" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Order {currentOrderIndex + 1} of {totalOrders}</span>
                    <span>{getProcessingProgress()}% complete</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Job Context Information */}
            {currentOrder && result?.categoryAssignments[currentOrder]?.originalJob && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Job Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Customer</div>
                      <div className="font-medium">
                        {result.categoryAssignments[currentOrder].originalJob.customer || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Reference</div>
                      <div className="font-medium">
                        {result.categoryAssignments[currentOrder].originalJob.reference || 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Quantity</div>
                      <div className="font-medium">
                        {result.categoryAssignments[currentOrder].originalJob.qty || 'N/A'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Current Order Status */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Order {currentOrder}</CardTitle>
                  <Badge variant={
                    currentOrderStatus === 'completed' ? 'default' :
                    currentOrderStatus === 'failed' ? 'destructive' :
                    currentOrderStatus === 'skipped' ? 'secondary' :
                    currentOrderStatus === 'processing' ? 'outline' : 'outline'
                  }>
                    {currentOrderStatus}
                  </Badge>
                </div>
                {orderStatuses[currentOrder]?.error && (
                  <CardDescription className="text-red-600">
                    Error: {orderStatuses[currentOrder].error}
                  </CardDescription>
                )}
              </CardHeader>
            </Card>

            {/* Order Content */}
            {currentOrder && (
              <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="mapping">Stage Mapping</TabsTrigger>
                  <TabsTrigger value="category">Category Assignment</TabsTrigger>
                </TabsList>

                <TabsContent value="mapping" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Stage Mapping for {currentOrder}</CardTitle>
                      <CardDescription>
                        Review and adjust the automatically mapped stages for this order
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RowMappingErrorBoundary woNo={currentOrder}>
                        <RowMappingTable
                          key={currentOrder}
                          rowMappings={getCurrentOrderMappings()}
                          availableStages={availableStages}
                          stageSpecifications={stageSpecifications}
                          workOrderNumber={currentOrder}
                          onUpdateMapping={(woNo, arrayIndex, stageId, stageName, stageSpecId, stageSpecName) => 
                            handleUpdateMapping(woNo, arrayIndex, stageId, stageName, stageSpecId, stageSpecName)
                          }
                          onToggleManualOverride={(woNo, arrayIndex) => handleToggleManualOverride(woNo, arrayIndex)}
                          onIgnoreRow={(woNo, arrayIndex) => handleIgnoreRow(woNo, arrayIndex)}
                          onRestoreRow={(woNo, arrayIndex) => handleRestoreRow(woNo, arrayIndex)}
                        />
                      </RowMappingErrorBoundary>
                      
                      <div className="mt-4 flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setSelectedWoForAdd(currentOrder);
                            setShowAddRowDialog(true);
                          }}
                        >
                          Add Custom Stage
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="category" className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Category Assignment for {currentOrder}</CardTitle>
                      <CardDescription>
                        Assign a production category or use custom workflow
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Category</label>
                          <Select
                            value={result.categoryAssignments[currentOrder]?.categoryId ?? CUSTOM_WORKFLOW_VALUE}
                            onValueChange={(value) => {
                              if (value === CUSTOM_WORKFLOW_VALUE) {
                                handleUpdateCategory(currentOrder, null, null);
                              } else {
                                const category = availableCategories.find(c => c.id === value);
                                handleUpdateCategory(currentOrder, value, category?.name || null);
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select category (or leave empty for custom workflow)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={CUSTOM_WORKFLOW_VALUE}>Custom Workflow (Recommended)</SelectItem>
                              {availableCategories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}
          </div>
        ) : null}

        {/* Navigation and Actions */}
        <div className="flex items-center justify-between border-t pt-4">
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={isFirstOrder || isProcessingSingle}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <Button
              variant="outline"
              onClick={handleNext}
              disabled={isLastOrder || isProcessingSingle}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSkipCurrentOrder}
              disabled={currentOrderStatus === 'completed' || currentOrderStatus === 'skipped' || isProcessingSingle}
            >
              <SkipForward className="h-4 w-4 mr-1" />
              Skip This Order
            </Button>
            <Button
              onClick={handleProcessCurrentOrder}
              disabled={currentOrderStatus === 'completed' || currentOrderStatus === 'skipped' || isProcessingSingle}
            >
              {isProcessingSingle ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Workflow className="h-4 w-4 mr-1" />
                  Process This Order
                </>
              )}
            </Button>
            {isLastOrder && (getCompletedCount() + getSkippedCount()) === totalOrders && (
              <Button onClick={onComplete} variant="default">
                Complete Import
              </Button>
            )}
          </div>
        </div>

        {/* Add Row Dialog */}
        <AddRowDialog
          open={showAddRowDialog}
          onOpenChange={setShowAddRowDialog}
          woNo={selectedWoForAdd}
          availableStages={availableStages}
          stageSpecifications={stageSpecifications}
          onAddRow={(newRow) => handleAddCustomRow(selectedWoForAdd, newRow)}
        />
      </DialogContent>
    </Dialog>
  );
};