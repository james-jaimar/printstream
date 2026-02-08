import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar, Construction } from 'lucide-react';

export default function LabelsSchedule() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Production Schedule</h1>
          <p className="text-muted-foreground">
            Drag-and-drop schedule board for label runs
          </p>
        </div>
      </div>

      {/* Placeholder */}
      <Card className="border-dashed">
        <CardContent className="py-16 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="p-4 bg-muted rounded-full">
              <Construction className="h-12 w-12 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold">Schedule Board Coming Soon</h3>
              <p className="text-muted-foreground max-w-md mx-auto mt-2">
                The drag-and-drop schedule board will allow you to visually plan and manage
                label production runs across days, grouped by substrate for efficiency.
              </p>
            </div>
            <div className="flex gap-4 mt-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <Calendar className="h-8 w-8 mx-auto text-primary mb-2" />
                <p className="text-sm font-medium">Date Columns</p>
                <p className="text-xs text-muted-foreground">Drag runs to schedule</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="h-8 w-8 mx-auto bg-primary/20 rounded mb-2 flex items-center justify-center">
                  <span className="text-xs font-bold">D&D</span>
                </div>
                <p className="text-sm font-medium">Drag & Drop</p>
                <p className="text-xs text-muted-foreground">Reorder and reschedule</p>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="h-8 w-8 mx-auto bg-green-500/20 rounded mb-2 flex items-center justify-center">
                  <span className="text-xs font-bold text-green-700">PP</span>
                </div>
                <p className="text-sm font-medium">Group by Substrate</p>
                <p className="text-xs text-muted-foreground">Minimize changeovers</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
