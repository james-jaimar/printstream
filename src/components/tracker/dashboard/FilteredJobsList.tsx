
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Filter, 
  Calendar,
  User,
  Building,
  Clock,
  AlertTriangle,
  CheckCircle,
  X,
  CreditCard
} from "lucide-react";
import { format } from "date-fns";
import { JobStatusDisplay } from "../common/JobStatusDisplay";

interface FilteredJobsListProps {
  jobs: any[];
  activeFilter: string | null;
  onClose: () => void;
  categories: any[];
}

export const FilteredJobsList: React.FC<FilteredJobsListProps> = ({
  jobs,
  activeFilter,
  onClose,
  categories
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  if (!activeFilter || jobs.length === 0) {
    return null;
  }

  const getFilterTitle = (filter: string) => {
    switch (filter) {
      case "overdue": return "Overdue Jobs";
      case "due_today": return "Due Today";
      case "due_tomorrow": return "Due Tomorrow";
      case "due_this_week": return "Due This Week";
      case "critical": return "Critical Jobs";
      case "total": return "All Jobs";
      case "in_progress": return "In Progress Jobs";
      case "completed_this_month": return "Completed This Month";
      default: return "Filtered Jobs";
    }
  };

  const getFilterColor = (filter: string) => {
    switch (filter) {
      case "overdue": return "bg-red-50 border-red-200";
      case "due_today": return "bg-orange-50 border-orange-200";
      case "due_tomorrow": return "bg-yellow-50 border-yellow-200";
      case "critical": return "bg-red-50 border-red-200";
      case "completed_this_month": return "bg-green-50 border-green-200";
      default: return "bg-blue-50 border-blue-200";
    }
  };

  // Filter jobs based on search and category
  const filteredJobs = jobs.filter(job => {
    const matchesSearch = !searchQuery || 
      job.wo_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.customer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.reference?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || job.category === categoryFilter;
    
    return matchesSearch && matchesCategory;
  });

  return (
    <Card className={`${getFilterColor(activeFilter)} shadow-lg`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <span>{getFilterTitle(activeFilter)}</span>
            <Badge variant="outline">{filteredJobs.length} jobs</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        {isExpanded && (
          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by order number, customer, or reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardContent>
          {filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="text-lg font-medium mb-2">No jobs found</p>
              <p className="text-sm">Try adjusting your search or filter criteria.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredJobs.map((job) => {
                return (
                  <div 
                    key={job.job_id} 
                    className="flex items-start justify-between p-4 bg-white border rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="flex-1 min-w-0 space-y-3">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {job.wo_no}
                        </h3>
                        {job.payment_status === 'awaiting_payment' && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300 font-semibold text-[10px] px-1.5 py-0">
                            <CreditCard className="h-2.5 w-2.5 mr-0.5" />
                            AWAITING PAYMENT
                          </Badge>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-600">
                        {job.customer && (
                          <div className="flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            <span className="truncate">{job.customer}</span>
                          </div>
                        )}
                        
                        {job.reference && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-gray-500 truncate">
                              Ref: {job.reference}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-start gap-4 ml-4">
                      <div className="text-right">
                        {job.workflow_progress !== undefined && (
                          <div className="mb-2">
                            <div className="text-sm font-medium">{Math.round(job.workflow_progress)}%</div>
                            <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-blue-500 transition-all duration-300"
                                style={{ width: `${job.workflow_progress}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Use JobStatusDisplay component instead of basic badges */}
                      <div className="min-w-0">
                        <JobStatusDisplay 
                          job={job} 
                          showDetails={true}
                          compact={true}
                        />
                      </div>
                      
                      {activeFilter === 'overdue' && (
                        <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
                      )}
                      {activeFilter === 'completed_this_month' && (
                        <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      )}
                      {(activeFilter === 'due_today' || activeFilter === 'due_tomorrow') && (
                        <Clock className="h-5 w-5 text-orange-500 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
};
