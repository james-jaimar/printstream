
import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { DynamicHeader } from "./tracker/DynamicHeader";
import { ContextSidebar } from "./tracker/ContextSidebar";
import { useAuth } from "@/hooks/useAuth";
import { ReadOnlyProvider } from "@/contexts/ReadOnlyContext";

const TrackerLayout = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("orders");
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [filters, setFilters] = useState<any>({});
  const [productionSidebarData, setProductionSidebarData] = useState<any>({
    consolidatedStages: [],
    getJobCountForStage: () => 0,
    getJobCountByStatus: () => 0,
    totalActiveJobs: 0
  });

  const routeToTab = {
    '/tracker/dashboard': 'dashboard',
    '/tracker/jobs': 'orders',
    '/tracker/production': 'production',
    '/tracker/kanban': 'kanban',
    '/tracker/schedule-board': 'schedule-board',
    '/tracker/worksheets': 'worksheets',
    '/tracker/admin': 'setup',
    '/tracker/users': 'setup',
    '/tracker/upload': 'setup',
    '/tracker/labels': 'setup',
    '/tracker/mobile': 'setup'
  };

  useEffect(() => {
    const currentTab = routeToTab[location.pathname] || 'dashboard';
    setActiveTab(currentTab);
  }, [location.pathname]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    
    const tabRoutes = {
      'dashboard': '/tracker/dashboard',
      'orders': '/tracker/jobs',
      'production': '/tracker/production',
      'kanban': '/tracker/kanban',
      'schedule-board': '/tracker/schedule-board',
      'worksheets': '/tracker/worksheets',
      'setup': '/tracker/admin'
    };
    
    const route = tabRoutes[tab] || '/tracker/dashboard';
    navigate(route);
  };

  const handleFilterChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const handleStageSelect = (stageId: string | null) => {
    setSelectedStageId(stageId);
  };

  const setSidebarData = (data: any) => {
    setProductionSidebarData(data);
  };

  const isKanbanTab = activeTab === 'kanban';
  const isDashboardTab = activeTab === 'dashboard';
  const isOrdersTab = activeTab === 'orders';

  return (
    <ReadOnlyProvider>
      <div className="flex h-screen bg-gray-50 w-full">
        <div className="flex flex-col flex-1 overflow-hidden">
          <DynamicHeader 
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
          
          <div className="flex flex-1 overflow-hidden">
            {!isKanbanTab && !isDashboardTab && !isOrdersTab && (
              <ContextSidebar 
                activeTab={activeTab}
                onFilterChange={handleFilterChange}
                productionSidebarData={activeTab === "production" ? productionSidebarData : undefined}
                onStageSelect={activeTab === "production" ? handleStageSelect : undefined}
                selectedStageId={activeTab === "production" ? selectedStageId : undefined}
              />
            )}
            
            <main className={`flex-1 overflow-auto ${activeTab === 'production' ? '' : 'p-6'}`}>
              <Outlet context={{ 
                activeTab, 
                filters,
                selectedStageId,
                onStageSelect: handleStageSelect,
                onFilterChange: handleFilterChange,
                setSidebarData
              }} />
            </main>
          </div>
        </div>
      </div>
    </ReadOnlyProvider>
  );
};

export default TrackerLayout;
