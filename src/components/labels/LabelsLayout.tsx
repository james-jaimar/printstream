import { useState } from 'react';
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
  ChevronRight,
  Boxes,
  BarChart3,
  Building2,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
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
  const [collapsed, setCollapsed] = useState(false);

  const renderNavItem = (item: typeof navItems[0]) => {
    const link = (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
            collapsed ? 'justify-center px-2 py-2.5' : 'px-4 py-2.5',
            isActive
              ? 'bg-slate-800 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          )
        }
      >
        <item.icon className="h-4 w-4 flex-shrink-0" />
        {!collapsed && item.label}
      </NavLink>
    );

    if (collapsed) {
      return (
        <Tooltip key={item.to}>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {item.label}
          </TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-screen bg-[radial-gradient(1100px_520px_at_50%_-140px,rgba(30,41,59,0.22),transparent_60%),linear-gradient(to_bottom,rgba(241,245,249,1),rgba(226,232,240,1))]">
        {/* Sidebar */}
        <aside className={cn(
          'flex-shrink-0 flex flex-col transition-all duration-300',
          collapsed ? 'w-[60px]' : 'w-[260px]'
        )}>
          <div className="sticky top-0 h-screen flex flex-col p-4">
            {/* Glass sidebar card */}
            <div className="flex-1 rounded-2xl border border-slate-200/70 bg-white/70 shadow-[0_1px_0_rgba(15,23,42,0.04),0_14px_40px_rgba(15,23,42,0.07)] backdrop-blur flex flex-col overflow-hidden">
              {/* Teal accent bar */}
              <div className="h-[3px] w-full bg-gradient-to-r from-[#00B8D4] to-[#0097A7]" />
              
              {/* Brand + collapse toggle */}
              <div className={cn('flex items-center gap-2 pt-5 pb-4', collapsed ? 'px-2 justify-center' : 'px-4')}>
                {!collapsed && (
                  <>
                    <img src={impressLogo} alt="Impress" className="h-7 w-auto shrink-0 object-contain" />
                    <div className="h-6 w-px bg-slate-200 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-900 leading-tight">Labels Division</div>
                      <div className="text-[10px] text-slate-500 leading-tight">Admin Console</div>
                    </div>
                  </>
                )}
                <button
                  onClick={() => setCollapsed(c => !c)}
                  className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                  title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>

              {/* Navigation */}
              <ScrollArea className={cn('flex-1 py-2', collapsed ? 'px-1.5' : 'px-3')}>
                <nav className="space-y-0.5">
                  {navItems.map(renderNavItem)}
                </nav>

                <div className="my-4 border-t border-slate-200/60" />

                <nav className="space-y-0.5">
                  {adminItems.map(renderNavItem)}
                </nav>
              </ScrollArea>

              {/* Footer */}
              <div className={cn('border-t border-slate-200/60', collapsed ? 'px-1.5 py-3' : 'px-3 py-3')}>
                {collapsed ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="w-full text-slate-500 hover:text-slate-900" asChild>
                        <NavLink to="/tracker">
                          <ChevronLeft className="h-4 w-4" />
                        </NavLink>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>Back to Tracker</TooltipContent>
                  </Tooltip>
                ) : (
                  <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500 hover:text-slate-900" asChild>
                    <NavLink to="/tracker">
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Back to Tracker
                    </NavLink>
                  </Button>
                )}
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
    </TooltipProvider>
  );
}
