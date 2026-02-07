import { useState, useEffect } from 'react';

/**
 * Hook to detect browser tab visibility.
 * Used to pause polling and real-time subscriptions when tab is hidden
 * to reduce database egress.
 */
export const useTabVisibility = () => {
  const [isVisible, setIsVisible] = useState(() => {
    // SSR safety check
    if (typeof document === 'undefined') return true;
    return !document.hidden;
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setIsVisible(visible);
      console.log(`📱 Tab visibility: ${visible ? 'visible' : 'hidden'}`);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return { isVisible };
};
