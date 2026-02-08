import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { 
  LayoutDashboard, 
  ClipboardList, 
  Tag, 
  Package, 
  Calendar,
  Settings,
  ChevronLeft,
  Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { 
    to: '/labels', 
    label: 'Dashboard', 
    icon: LayoutDashboard, 
    end: true 
  },
  { 
    to: '/labels/orders', 
    label: 'Orders', 
    icon: ClipboardList 
  },
  { 
    to: '/labels/dielines', 
    label: 'Dieline Library', 
    icon: Tag 
  },
  { 
    to: '/labels/stock', 
    label: 'Stock Management', 
    icon: Package 
  },
  { 
    to: '/labels/schedule', 
    label: 'Schedule Board', 
    icon: Calendar 
  },
];

const adminItems = [
  { 
    to: '/labels/settings', 
    label: 'Settings', 
    icon: Settings 
  },
];

export default function LabelsLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-2">
            <Boxes className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Labels Division</span>
          </div>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <Separator className="my-4" />

          <nav className="space-y-1">
            {adminItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t">
          <Button variant="ghost" className="w-full justify-start" asChild>
            <NavLink to="/tracker">
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back to Tracker
            </NavLink>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
