
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, Save, Database } from "lucide-react";
import { PaperSizeDefaultsManager } from "@/components/settings/PaperSizeDefaultsManager";
import { productConfigs } from "@/config/productTypes";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface SlaSetting {
  product_type: string;
  sla_target_days: number;
}

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [slaSettings, setSlaSettings] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load SLA settings from database
  useEffect(() => {
    const loadSettings = async () => {
      setIsLoading(true);
      try {
        // Try to get settings from database first
        const { data: settingsData, error } = await supabase
          .from('app_settings')
          .select('*')
          .eq('setting_type', 'sla');
        
        const settings: Record<string, number> = {};
        
        // If we have settings in the database, use them
        if (settingsData && settingsData.length > 0) {
          settingsData.forEach(setting => {
            settings[setting.product_type] = setting.sla_target_days;
          });
        } else {
          // Otherwise initialize from product configs
          Object.entries(productConfigs).forEach(([productType, config]) => {
            settings[productType] = config.slaTargetDays;
          });
        }
        
        setSlaSettings(settings);
      } catch (err) {
        console.error("Failed to load settings:", err);
        toast.error("Failed to load settings", {
          description: "Using default values instead"
        });
        
        // Fall back to product configs
        const defaultSettings: Record<string, number> = {};
        Object.entries(productConfigs).forEach(([productType, config]) => {
          defaultSettings[productType] = config.slaTargetDays;
        });
        setSlaSettings(defaultSettings);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadSettings();
  }, []);
  
  const handleSlaChange = (productType: string, value: string) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setSlaSettings(prev => ({
        ...prev,
        [productType]: numValue
      }));
    }
  };
  
  const handleSaveSettings = async () => {
    if (!user) {
      toast.error("You must be logged in to save settings");
      return;
    }
    
    setIsSaving(true);
    try {
      // Prepare data for upsert
      const upsertData = Object.entries(slaSettings).map(([productType, days]) => ({
        product_type: productType,
        sla_target_days: days,
        setting_type: 'sla',
        updated_by: user.id
      }));
      
      // Delete existing settings first to avoid conflicts
      const { error: deleteError } = await supabase
        .from('app_settings')
        .delete()
        .eq('setting_type', 'sla');
        
      if (deleteError) {
        throw new Error(`Failed to clear existing settings: ${deleteError.message}`);
      }
      
      // Insert new settings
      const { error: insertError } = await supabase
        .from('app_settings')
        .insert(upsertData);
        
      if (insertError) {
        throw new Error(`Failed to save settings: ${insertError.message}`);
      }
      
      // Update the productConfigs in memory for the current session
      Object.entries(slaSettings).forEach(([productType, days]) => {
        if (productConfigs[productType]) {
          productConfigs[productType].slaTargetDays = days;
        }
      });
      
      toast.success("SLA settings updated successfully", {
        description: "New SLA settings will apply to newly created batches"
      });
      
    } catch (error) {
      console.error("Failed to save settings:", error);
      toast.error("Failed to save settings", {
        description: error instanceof Error ? error.message : "Unknown error occurred"
      });
    } finally {
      setIsSaving(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center">
            <SettingsIcon className="h-6 w-6 mr-2 text-printstream-primary" />
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          </div>
          <p className="text-gray-500 mt-1">Configure application settings</p>
        </div>
        <Button onClick={() => navigate("/")}>Back to Dashboard</Button>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            SLA Settings
          </CardTitle>
          <CardDescription>
            Configure default SLA target days for each product type.
            These settings affect when jobs are flagged as approaching their due date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center my-8">
              <div className="h-6 w-6 rounded-full border-2 border-t-transparent border-primary animate-spin"></div>
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="grid grid-cols-3 items-center gap-4">
                <Label className="text-right font-medium">Product Type</Label>
                <Label className="text-right font-medium">SLA Target Days</Label>
                <div></div> {/* Empty space for alignment */}
              </div>
              
              {Object.entries(productConfigs).map(([productType, config]) => (
                <div key={productType} className="grid grid-cols-3 items-center gap-4">
                  <div className="text-right">
                    <span className="text-sm font-medium">{productType}</span>
                  </div>
                  <div>
                    <Input
                      type="number"
                      value={slaSettings[productType] || config.slaTargetDays}
                      min="1"
                      onChange={(e) => handleSlaChange(productType, e.target.value)}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Default: {config.slaTargetDays} days
                  </div>
                </div>
              ))}
              
              <div className="flex justify-end mt-4">
                <Button 
                  onClick={handleSaveSettings} 
                  disabled={isSaving}
                  className="flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="h-4 w-4 rounded-full border-2 border-t-transparent animate-spin"></div>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      <span>Save Settings</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Additional settings sections can be added here */}
    </div>
  );
};

export default Settings;
