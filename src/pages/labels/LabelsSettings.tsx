import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, Users, Sliders } from 'lucide-react';
import { ClientManagement } from '@/components/labels/admin';

export default function LabelsSettings() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage label division settings and configuration
        </p>
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Configure default values and preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-center py-8">
                General settings coming soon...
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
