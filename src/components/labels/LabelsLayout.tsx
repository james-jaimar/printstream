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
  Boxes,
  BarChart3,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import impressLogo from '@/assets/impress-logo-colour.png';

const navItems = [
  { to: '/labels', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/labels/orders', label: 'Orders', icon: ClipboardList },
  { to: '/labels/customers', label: 'Customers', icon: Building2 },
  { to: '/labels/dielines', label: 'Dieline Library', icon: Tag },
  { to: '/labels/stock', label: 'Stock Management', icon: Package },
  { to: '/labels/schedule', label: 'Schedule Board', icon: Calendar },
  { to: '/labels/reports', label: 'Reports', icon: BarChart3 },
];

const adminItems = [
  { to: '/labels/settings', label: 'Settings', icon: Settings },
];

export default function LabelsLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(30,41,59,0.22),transparent_60%),linear-gradient(to_bottom,rgba(241,245,249,1),rgba(226,232,240,1))]">
      {/* Sidebar */}
      <aside className="w-[260px] flex-shrink-0 flex flex-col">
        <div className="sticky top-0 h-screen flex flex-col p-4">
          {/* Glass sidebar card */}
          <div className="flex-1 rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur flex flex-col overflow-hidden">
            {/* Teal accent bar */}
            <div className="h-[3px] w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
            
            {/* Brand */}
            <div className="px-5 pt-5 pb-4 flex items-center gap-3">
              <img src={impressLogo} alt="Impress" className="h-8 object-contain" />
              <div className="h-6 w-px bg-slate-200" />
              <div>
                <div className="text-sm font-semibold text-slate-900">Labels Division</div>
                <div className="text-[10px] text-slate-500">Admin Console</div>
              </div>
            </div>

            {/* Navigation */}
            <ScrollArea className="flex-1 px-3 py-2">
              <nav className="space-y-0.5">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              <div className="my-4 border-t border-slate-200/60" />

              <nav className="space-y-0.5">
                {adminItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      )
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </ScrollArea>

            {/* Footer */}
            <div className="px-3 py-3 border-t border-slate-200/60">
              <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500 hover:text-slate-900" asChild>
                <NavLink to="/tracker">
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back to Tracker
                </NavLink>
              </Button>
            </div>
          </div>
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
