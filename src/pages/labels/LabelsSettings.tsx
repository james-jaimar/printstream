import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, Sliders, Workflow, Layers, Wrench } from 'lucide-react';
import { ClientManagement, LabelStageManagement, LabelFinishingManagement, LabelServicesManagement } from '@/components/labels/admin';

const glassCard = 'rounded-2xl border border-border bg-card shadow-sm';

export default function LabelsSettings() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage label division settings, stages, and configuration</p>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />Clients
          </TabsTrigger>
          <TabsTrigger value="stages" className="flex items-center gap-2">
            <Workflow className="h-4 w-4" />Stages
          </TabsTrigger>
          <TabsTrigger value="finishing" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />Finishing
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />Services
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6">
          <ClientManagement />
        </TabsContent>

        <TabsContent value="stages" className="mt-6">
          <Card className={glassCard}>
            <CardContent className="pt-6">
              <LabelStageManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="finishing" className="mt-6">
          <Card className={glassCard}>
            <CardContent className="pt-6">
              <LabelFinishingManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-6">
          <Card className={glassCard}>
            <CardContent className="pt-6">
              <LabelServicesManagement />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <Card className={glassCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground">
                <Settings className="h-5 w-5 text-primary" />
                General Settings
              </CardTitle>
              <CardDescription>Configure default values and preferences</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">General settings coming soon...</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
