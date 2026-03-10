import React, { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Mapping {
  id: string;
  excel_text: string;
  production_stage_id?: string;
  stage_specification_id?: string;
  print_specification_id?: string;
  paper_type_specification_id?: string;
  paper_weight_specification_id?: string;
  delivery_method_specification_id?: string;
  is_collection_mapping?: boolean;
  mapping_type: 'production_stage' | 'print_specification' | 'paper_specification' | 'delivery_specification';
  confidence_score?: number;
  is_verified: boolean;
}

interface Option { id: string; name: string; display_name?: string }

interface EditMappingDialogProps {
  mapping: Mapping | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const EditMappingDialog: React.FC<EditMappingDialogProps> = ({
  mapping, open, onOpenChange, onSaved
}) => {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  // Form state
  const [mappingType, setMappingType] = useState<string>("");
  const [productionStageId, setProductionStageId] = useState<string>("");
  const [stageSpecId, setStageSpecId] = useState<string>("");
  const [paperTypeId, setPaperTypeId] = useState<string>("");
  const [paperWeightId, setPaperWeightId] = useState<string>("");
  const [deliveryMethodId, setDeliveryMethodId] = useState<string>("");
  const [isCollection, setIsCollection] = useState(false);
  const [confidenceScore, setConfidenceScore] = useState<number>(0);
  const [isVerified, setIsVerified] = useState(false);

  // Options
  const [stages, setStages] = useState<Option[]>([]);
  const [stageSpecs, setStageSpecs] = useState<Option[]>([]);
  const [paperTypes, setPaperTypes] = useState<Option[]>([]);
  const [paperWeights, setPaperWeights] = useState<Option[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<Option[]>([]);

  // Populate form when mapping changes
  useEffect(() => {
    if (mapping) {
      setMappingType(mapping.mapping_type || "production_stage");
      setProductionStageId(mapping.production_stage_id || "");
      setStageSpecId(mapping.stage_specification_id || "");
      setPaperTypeId(mapping.paper_type_specification_id || "");
      setPaperWeightId(mapping.paper_weight_specification_id || "");
      setDeliveryMethodId(mapping.delivery_method_specification_id || "");
      setIsCollection(mapping.is_collection_mapping || false);
      setConfidenceScore(mapping.confidence_score || 0);
      setIsVerified(mapping.is_verified);
    }
  }, [mapping]);

  // Load dropdown options on open
  useEffect(() => {
    if (!open) return;
    loadOptions();
  }, [open]);

  const loadOptions = async () => {
    const [stagesRes, stageSpecsRes, paperTypesRes, paperWeightsRes, deliveryRes] = await Promise.all([
      supabase.from('production_stages').select('id, name').order('name'),
      supabase.from('stage_specifications').select('id, name').order('name'),
      supabase.from('print_specifications').select('id, name, display_name').eq('category', 'paper_type').eq('is_active', true).order('display_name'),
      supabase.from('print_specifications').select('id, name, display_name').eq('category', 'paper_weight').eq('is_active', true).order('display_name'),
      supabase.from('print_specifications').select('id, name, display_name').eq('category', 'delivery_method').eq('is_active', true).order('display_name'),
    ]);
    setStages(stagesRes.data || []);
    setStageSpecs(stageSpecsRes.data || []);
    setPaperTypes(paperTypesRes.data || []);
    setPaperWeights(paperWeightsRes.data || []);
    setDeliveryMethods(deliveryRes.data || []);
  };

  const handleSave = async () => {
    if (!mapping) return;
    setSaving(true);
    try {
      const updateData: Record<string, any> = {
        mapping_type: mappingType,
        confidence_score: confidenceScore,
        is_verified: isVerified,
        updated_at: new Date().toISOString(),
        // Clear all FK fields first
        production_stage_id: null,
        stage_specification_id: null,
        paper_type_specification_id: null,
        paper_weight_specification_id: null,
        delivery_method_specification_id: null,
        print_specification_id: null,
        is_collection_mapping: false,
      };

      if (mappingType === 'production_stage') {
        updateData.production_stage_id = productionStageId || null;
        updateData.stage_specification_id = stageSpecId || null;
      } else if (mappingType === 'paper_specification') {
        updateData.paper_type_specification_id = paperTypeId || null;
        updateData.paper_weight_specification_id = paperWeightId || null;
      } else if (mappingType === 'delivery_specification') {
        updateData.delivery_method_specification_id = deliveryMethodId || null;
        updateData.is_collection_mapping = isCollection;
      }

      const { error } = await supabase
        .from('excel_import_mappings')
        .update(updateData)
        .eq('id', mapping.id);

      if (error) throw error;

      toast({ title: "Mapping Updated", description: `"${mapping.excel_text}" has been updated.` });
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: "Error Updating Mapping", description: error.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (!mapping) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Mapping</DialogTitle>
          <DialogDescription>
            Update what this Excel text maps to in the system.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Excel Text (read-only) */}
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs">Excel Text (source)</Label>
            <div className="rounded-md border bg-muted px-3 py-2 text-sm font-mono break-all">
              {mapping.excel_text}
            </div>
          </div>

          {/* Mapping Type */}
          <div className="space-y-1">
            <Label>Mapping Type</Label>
            <Select value={mappingType} onValueChange={setMappingType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production_stage">Production Stage</SelectItem>
                <SelectItem value="paper_specification">Paper Specification</SelectItem>
                <SelectItem value="delivery_specification">Delivery / Collection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Dynamic fields based on type */}
          {mappingType === 'production_stage' && (
            <>
              <div className="space-y-1">
                <Label>Production Stage</Label>
                <Select value={productionStageId} onValueChange={setProductionStageId}>
                  <SelectTrigger><SelectValue placeholder="Select stage..." /></SelectTrigger>
                  <SelectContent>
                    {stages.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Stage Specification (optional)</Label>
                <Select value={stageSpecId} onValueChange={setStageSpecId}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {stageSpecs.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {mappingType === 'paper_specification' && (
            <>
              <div className="space-y-1">
                <Label>Paper Type</Label>
                <Select value={paperTypeId} onValueChange={setPaperTypeId}>
                  <SelectTrigger><SelectValue placeholder="Select paper type..." /></SelectTrigger>
                  <SelectContent>
                    {paperTypes.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.display_name || p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Paper Weight</Label>
                <Select value={paperWeightId} onValueChange={setPaperWeightId}>
                  <SelectTrigger><SelectValue placeholder="Select paper weight..." /></SelectTrigger>
                  <SelectContent>
                    {paperWeights.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.display_name || p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {mappingType === 'delivery_specification' && (
            <>
              <div className="space-y-1">
                <Label>Delivery Method</Label>
                <Select value={deliveryMethodId} onValueChange={setDeliveryMethodId}>
                  <SelectTrigger><SelectValue placeholder="Select delivery method..." /></SelectTrigger>
                  <SelectContent>
                    {deliveryMethods.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.display_name || d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Checkbox
                  id="is-collection"
                  checked={isCollection}
                  onCheckedChange={(v) => setIsCollection(!!v)}
                />
                <Label htmlFor="is-collection" className="text-sm cursor-pointer">This is a collection (not delivery)</Label>
              </div>
            </>
          )}

          {/* Confidence Score */}
          <div className="space-y-1">
            <Label>Confidence Score (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={confidenceScore}
              onChange={e => setConfidenceScore(Number(e.target.value))}
            />
          </div>

          {/* Verified */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="is-verified"
              checked={isVerified}
              onCheckedChange={(v) => setIsVerified(!!v)}
            />
            <Label htmlFor="is-verified" className="text-sm cursor-pointer">Verified</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
