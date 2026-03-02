import React from "react";
import { ArrowRight, Users } from "lucide-react";

interface LiveProductionFlowProps {
  stats: {
    stages: Array<{
      name: string;
      color: string;
      count: number;
    }>;
  };
}

export const LiveProductionFlow: React.FC<LiveProductionFlowProps> = ({ stats }) => {
  const stages = stats.stages || [];

  // Find the max count to identify the busiest stage
  const maxCount = stages.reduce((max, s) => Math.max(max, s.count), 0);

  const ProductionStage = ({ 
    stage, 
    isLast,
    isBusiest
  }: { 
    stage: typeof stages[0]; 
    isLast: boolean;
    isBusiest: boolean;
  }) => {
    return (
      <>
        <div className={`factory-stage-box ${isBusiest ? 'border-4 border-yellow-400' : ''}`}
             style={{ backgroundColor: stage.color || '#6B7280' }}>
          {isBusiest && (
            <div className="absolute top-2 right-2">
              <span className="text-xs font-bold bg-yellow-400 text-black px-2 py-0.5 rounded">BUSIEST</span>
            </div>
          )}
          
          <div className="relative z-10">
            <div className="text-3xl font-bold mb-2">{stage.name.toUpperCase()}</div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                <span className="text-lg">Jobs</span>
              </div>
              <span className="text-4xl font-bold">{stage.count}</span>
            </div>
          </div>
        </div>
        
        {!isLast && (
          <ArrowRight className="h-12 w-12 factory-flow-arrow flex-shrink-0" />
        )}
      </>
    );
  };

  return (
    <div className="bg-gray-800 rounded-2xl p-6 border border-gray-700">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Live Production Assembly Line</h2>
        <p className="text-gray-400 text-lg">Real-time stage monitoring</p>
      </div>

      <div className="factory-assembly-line">
        {stages.length > 0 ? (
          stages.map((stage, index) => (
            <ProductionStage
              key={stage.name}
              stage={stage}
              isLast={index === stages.length - 1}
              isBusiest={stage.count === maxCount && maxCount > 0}
            />
          ))
        ) : (
          <div className="text-center py-12 text-gray-400">
            <Users className="h-16 w-16 mx-auto mb-4" />
            <h3 className="text-2xl font-semibold mb-2">No Active Stages</h3>
            <p className="text-lg">Production stages will appear here when jobs are active</p>
          </div>
        )}
      </div>

      {/* Flow Statistics */}
      <div className="grid grid-cols-2 gap-6 mt-6">
        <div className="bg-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-400">
            {stages.reduce((sum, stage) => sum + stage.count, 0)}
          </div>
          <div className="text-gray-300">Total in Production</div>
        </div>
        
        <div className="bg-gray-700 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">
            {stages.length}
          </div>
          <div className="text-gray-300">Active Stages</div>
        </div>
      </div>
    </div>
  );
};
