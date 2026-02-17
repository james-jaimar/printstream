import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, Sliders } from 'lucide-react';
import { ClientManagement } from '@/components/labels/admin';

const glassCard = 'rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur';

export default function LabelsSettings() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="pt-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500">Manage label division settings and configuration</p>
      </div>

      <Tabs defaultValue="clients" className="w-full">
        <TabsList>
          <TabsTrigger value="clients" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Sliders className="h-4 w-4" />
            General
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clients" className="mt-6">
          <ClientManagement />
        </TabsContent>

        <TabsContent value="general" className="mt-6">
          <Card className={glassCard}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-slate-900">
                <Settings className="h-5 w-5 text-[#00B8D4]" />
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
