
import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { ExcelUpload } from "@/components/tracker/ExcelUpload";
import { QuickEasySyncPanel } from "@/components/tracker/QuickEasySyncPanel";

const TrackerUpload = () => {
  return (
    <div className="w-full max-w-[95vw] mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-4 mb-4">
          <Button variant="outline" size="sm" asChild>
            <Link to="/tracker/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>
        <h1 className="text-3xl font-bold">Upload Production Jobs</h1>
        <p className="text-muted-foreground">Import production jobs from QuickEasy or Excel files</p>
      </div>

      <div className="space-y-6">
        <QuickEasySyncPanel />
        <ExcelUpload />
      </div>
    </div>
  );
};

export default TrackerUpload;
