
import { useState, useCallback, useEffect } from "react";
import { useAccessibleJobs } from "./useAccessibleJobs";
import { useMobileQRScanner } from "./useMobileQRScanner";
import { useMobileBarcodeScanner } from "./useMobileBarcodeScanner";
import { toast } from "sonner";

export interface MobileFactoryFloorConfig {
  enableVibration?: boolean;
  enableSounds?: boolean;
  autoRefreshInterval?: number;
  showCompletedJobs?: boolean;
}

export const useMobileFactoryFloor = (config: MobileFactoryFloorConfig = {}) => {
  const {
    enableVibration = true,
    enableSounds = true,
    autoRefreshInterval = 30000, // 30 seconds
    showCompletedJobs = false
  } = config;

  const { 
    jobs, 
    isLoading, 
    startJob, 
    completeJob, 
    refreshJobs 
  } = useAccessibleJobs();
  
  const qrScanner = useMobileQRScanner();
  const barcodeScanner = useMobileBarcodeScanner();
  
  const [activeJobs, setActiveJobs] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'my-active' | 'available' | 'urgent'>('available');
  const [searchQuery, setSearchQuery] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Auto-refresh jobs
  useEffect(() => {
    if (autoRefreshInterval > 0) {
      const interval = setInterval(refreshJobs, autoRefreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefreshInterval, refreshJobs]);

  // Online/offline detection
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connection restored - syncing data...");
      refreshJobs();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("Working offline - changes will sync when reconnected");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshJobs]);

  // Haptic feedback
  const triggerHapticFeedback = useCallback((type: 'light' | 'medium' | 'heavy' = 'medium') => {
    if (!enableVibration) return;
    
    if ('vibrate' in navigator) {
      const patterns = {
        light: [50],
        medium: [100],
        heavy: [200]
      };
      navigator.vibrate(patterns[type]);
    }
  }, [enableVibration]);

  // Audio feedback
  const playSound = useCallback((type: 'success' | 'error' | 'info' = 'info') => {
    if (!enableSounds) return;
    
    // Create audio context for simple beeps
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      const frequencies = {
        success: 800,
        error: 300,
        info: 600
      };
      
      oscillator.frequency.setValueAtTime(frequencies[type], audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.warn('Audio feedback not supported:', error);
    }
  }, [enableSounds]);

  // Enhanced job actions with feedback
  const handleStartJob = useCallback(async (jobId: string, stageId: string) => {
    try {
      triggerHapticFeedback('light');
      const success = await startJob(jobId, stageId);
      
      if (success) {
        setActiveJobs(prev => [...prev, jobId]);
        triggerHapticFeedback('medium');
        playSound('success');
        toast.success("Job started successfully!", {
          duration: 2000,
        });
      }
      
      return success;
    } catch (error) {
      triggerHapticFeedback('heavy');
      playSound('error');
      toast.error("Failed to start job");
      return false;
    }
  }, [startJob, triggerHapticFeedback, playSound]);

  const handleCompleteJob = useCallback(async (jobId: string, stageId: string) => {
    try {
      triggerHapticFeedback('light');
      const success = await completeJob(jobId, stageId);
      
      if (success) {
        setActiveJobs(prev => prev.filter(id => id !== jobId));
        triggerHapticFeedback('medium');
        playSound('success');
        toast.success("Job completed successfully!", {
          duration: 2000,
        });
      }
      
      return success;
    } catch (error) {
      triggerHapticFeedback('heavy');
      playSound('error');
      toast.error("Failed to complete job");
      return false;
    }
  }, [completeJob, triggerHapticFeedback, playSound]);

  const handleHoldJob = useCallback(async (jobId: string, reason: string) => {
    try {
      // Implement hold functionality here
      setActiveJobs(prev => prev.filter(id => id !== jobId));
      triggerHapticFeedback('light');
      playSound('info');
      toast.info(`Job held: ${reason}`, {
        duration: 3000,
      });
      return true;
    } catch (error) {
      triggerHapticFeedback('heavy');
      playSound('error');
      toast.error("Failed to hold job");
      return false;
    }
  }, [triggerHapticFeedback, playSound]);

  // Smart job filtering
  const filteredJobs = useCallback(() => {
    let filtered = jobs;

    // Apply search filter
    if (searchQuery) {
      filtered = filtered.filter(job =>
        job.wo_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (job.reference && job.reference.toLowerCase().includes(searchQuery.toLowerCase()))
      );
    }

    // Apply mode filter
    switch (filterMode) {
      case 'my-active':
        filtered = filtered.filter(job => 
          job.current_stage_status === 'active' && job.user_can_work
        );
        break;
      case 'available':
        filtered = filtered.filter(job => 
          job.current_stage_status === 'pending' && job.user_can_work
        );
        break;
      case 'urgent':
        filtered = filtered.filter(job => {
          const isOverdue = job.due_date && new Date(job.due_date) < new Date();
          const isDueSoon = job.due_date && !isOverdue && 
            new Date(job.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
          return isOverdue || isDueSoon;
        });
        break;
    }

    // Hide completed jobs unless specified
    if (!showCompletedJobs) {
      filtered = filtered.filter(job => job.current_stage_status !== 'completed');
    }

    // Smart sorting: active jobs first, then by urgency, then by due date
    return filtered.sort((a, b) => {
      // Active jobs first
      if (a.current_stage_status === 'active' && b.current_stage_status !== 'active') return -1;
      if (b.current_stage_status === 'active' && a.current_stage_status !== 'active') return 1;
      
      // Then by urgency (overdue first)
      const aOverdue = a.due_date && new Date(a.due_date) < new Date();
      const bOverdue = b.due_date && new Date(b.due_date) < new Date();
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      
      // Finally by due date
      if (a.due_date && b.due_date) {
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      }
      
      return 0;
    });
  }, [jobs, searchQuery, filterMode, showCompletedJobs]);

  // Get filter counts for UI
  const getFilterCounts = useCallback(() => {
    return {
      all: jobs.length,
      available: jobs.filter(j => j.current_stage_status === 'pending' && j.user_can_work).length,
      'my-active': jobs.filter(j => j.current_stage_status === 'active' && j.user_can_work).length,
      urgent: jobs.filter(j => {
        const isOverdue = j.due_date && new Date(j.due_date) < new Date();
        const isDueSoon = j.due_date && !isOverdue && 
          new Date(j.due_date) <= new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
        return isOverdue || isDueSoon;
      }).length
    };
  }, [jobs]);

  // Process scan results - flexible WO matching (with or without prefix)
  const handleScanResult = useCallback((data: string, type: 'qr' | 'barcode') => {
    triggerHapticFeedback('medium');
    playSound('info');
    
    // Extract numeric portion for flexible matching
    const cleanData = data.trim().toUpperCase();
    const dataNumbers = cleanData.replace(/^[A-Z]+/, '').replace(/\D/g, '');
    
    // Try to find job by flexible WO number matching
    const job = jobs.find(j => {
      const woNo = (j.wo_no || '').trim().toUpperCase();
      const woNumbers = woNo.replace(/^[A-Z]+/, '').replace(/\D/g, '');
      
      // Match if: exact match, job_id match, or numeric portions match
      return woNo === cleanData || 
             j.job_id === data ||
             (dataNumbers && woNumbers && dataNumbers === woNumbers);
    });
    
    if (job) {
      toast.success(`Found job: ${job.wo_no}`, {
        duration: 3000,
        action: {
          label: "View",
          onClick: () => {
            // Navigate to job or highlight it
            setFilterMode('all');
            setSearchQuery(job.wo_no);
          }
        }
      });
    } else {
      toast.warning("Job not found", {
        description: `No job found for: ${data}`,
        duration: 3000,
      });
    }
  }, [jobs, triggerHapticFeedback, playSound]);

  return {
    // Data
    jobs: filteredJobs(),
    allJobs: jobs,
    isLoading,
    isOnline,
    activeJobs,
    
    // Filtering
    filterMode,
    setFilterMode,
    searchQuery,
    setSearchQuery,
    getFilterCounts,
    
    // Actions
    handleStartJob,
    handleCompleteJob,
    handleHoldJob,
    refreshJobs,
    
    // Scanning
    qrScanner,
    barcodeScanner,
    handleScanResult,
    
    // Feedback
    triggerHapticFeedback,
    playSound,
    
    // Config
    config: {
      enableVibration,
      enableSounds,
      autoRefreshInterval,
      showCompletedJobs
    }
  };
};
