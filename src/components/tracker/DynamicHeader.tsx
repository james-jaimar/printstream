
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, HelpCircle, LogOut, Home, Factory, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/tracker/useUserRole";
import { RefreshIndicator } from "./RefreshIndicator";
import { useDataManager } from "@/hooks/tracker/useDataManager";
import { OrderSearchModal } from "./modals/OrderSearchModal";
import { MasterOrderModal } from "./modals/MasterOrderModal";
import type { AccessibleJob } from "@/hooks/tracker/useAccessibleJobs";

interface DynamicHeaderProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export const DynamicHeader: React.FC<DynamicHeaderProps> = ({
  activeTab,
  onTabChange
}) => {
  const { user, signOut } = useAuth();
  const { isManager, isAdmin, isViewer } = useUserRole();
  const { 
    lastUpdated, 
    isRefreshing, 
    manualRefresh, 
    getTimeSinceLastUpdate 
  } = useDataManager();

  const [showOrderSearch, setShowOrderSearch] = useState(false);
  const [showMasterModal, setShowMasterModal] = useState(false);
  const [selectedJob, setSelectedJob] = useState<AccessibleJob | null>(null);

  const allTabs = [
    { id: "dashboard", label: "DASHBOARD" },
    { id: "orders", label: "ORDERS" },
    { id: "production", label: "PRODUCTION" },
    { id: "kanban", label: "KANBAN" },
    { id: "schedule-board", label: "SCHEDULE" },
    { id: "worksheets", label: "WORKSHEETS" },
    { id: "setup", label: "SETUP" }
  ];

  // Viewers only see 5 tabs
  const tabs = isViewer 
    ? allTabs.filter(t => ['dashboard', 'orders', 'production', 'kanban', 'schedule-board'].includes(t.id))
    : allTabs;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleLogoClick = () => {
    onTabChange("dashboard");
  };

  const handleOrderSelect = (job: AccessibleJob) => {
    setSelectedJob(job);
    setShowMasterModal(true);
  };

  const handleMasterModalClose = () => {
    setShowMasterModal(false);
    setSelectedJob(null);
  };

  return (
    <>
      <header className="bg-white border-b flex items-center justify-between px-4 py-2 h-[56px] min-h-[44px]">
        <div className="flex items-center space-x-4 min-h-[44px]">
          <div className="flex items-center space-x-2">
            <h1 
              className="text-lg font-bold text-green-600 cursor-pointer hover:text-green-700 transition-colors"
              onClick={handleLogoClick}
              title="Go to Dashboard"
              style={{ lineHeight: "1.2" }}
            >
              Tracker
            </h1>
          </div>
          
          <Tabs value={activeTab} onValueChange={onTabChange} className="w-auto min-h-[36px]">
            <TabsList className={`grid w-auto bg-gray-100 px-0 py-0 gap-0 min-h-[36px]`} style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
              {tabs.map((tab) => (
                <TabsTrigger 
                  key={tab.id} 
                  value={tab.id}
                  className="text-xs font-medium px-3 py-1 min-h-[28px] data-[state=active]:bg-green-600 data-[state=active]:text-white cursor-pointer"
                  style={{ minWidth: "70px" }}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center space-x-2">
          <RefreshIndicator
            lastUpdated={lastUpdated}
            isRefreshing={isRefreshing}
            onRefresh={manualRefresh}
            getTimeSinceLastUpdate={getTimeSinceLastUpdate}
            showTimeOnly={true}
            className="hidden md:flex"
          />
          
          {/* Order Search Button */}
          {!isViewer && (isManager || isAdmin) && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowOrderSearch(true)}
              className="px-2 py-1 text-xs"
              title="Search Orders"
            >
              <Search size={14} />
              <span className="hidden sm:inline ml-1">Search</span>
            </Button>
          )}
          
          {!isViewer && (isManager || isAdmin) && (
            <Button variant="outline" size="sm" asChild className="px-2 py-1 text-xs">
              <Link to="/tracker/factory-floor" className="flex items-center gap-1">
                <Factory size={14} />
                Factory
              </Link>
            </Button>
          )}
          <Button variant="ghost" size="icon" className="p-1">
            <Bell size={18} />
          </Button>
          <Button variant="ghost" size="icon" className="p-1">
            <HelpCircle size={18} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut} className="p-1">
            <LogOut size={18} />
          </Button>
          <Button 
            asChild 
            variant="ghost" 
            size="icon"
            title="Switch Apps"
            className="p-1"
          >
            <Link to="/">
              <Home size={18} />
            </Link>
          </Button>
          <div className="h-7 w-7 rounded-full bg-green-400 flex items-center justify-center text-white font-medium text-xs">
            {user?.email?.[0].toUpperCase() || 'U'}
          </div>
        </div>
      </header>

      {/* Order Search Modal */}
      <OrderSearchModal
        isOpen={showOrderSearch}
        onClose={() => setShowOrderSearch(false)}
        onOrderSelect={handleOrderSelect}
      />

      {/* Master Order Modal */}
      <MasterOrderModal
        isOpen={showMasterModal}
        onClose={handleMasterModalClose}
        job={selectedJob}
        onRefresh={() => {
          // Trigger any necessary refreshes
          manualRefresh();
        }}
      />
    </>
  );
};
