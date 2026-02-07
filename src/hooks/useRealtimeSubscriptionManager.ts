import { supabase } from '@/integrations/supabase/client';

type SubscriberCallback = () => void;

interface TableSubscription {
  subscribers: Set<SubscriberCallback>;
  channel: ReturnType<typeof supabase.channel> | null;
  debounceTimer: NodeJS.Timeout | null;
  lastNotified: number;
}

/**
 * Centralized subscription manager to prevent multiple hooks from creating
 * duplicate real-time subscriptions and causing cascade refetches.
 * 
 * Features:
 * - Single subscription per table
 * - 2-second debounce on notifications
 * - Tab visibility awareness
 * - Automatic cleanup when no subscribers
 */
class RealtimeSubscriptionManager {
  private subscriptions: Map<string, TableSubscription> = new Map();
  private isTabVisible: boolean = true;
  private readonly DEBOUNCE_MS = 2000;

  constructor() {
    if (typeof document !== 'undefined') {
      this.isTabVisible = !document.hidden;
      document.addEventListener('visibilitychange', () => {
        this.isTabVisible = !document.hidden;
        console.log(`📡 SubscriptionManager: Tab ${this.isTabVisible ? 'visible' : 'hidden'}`);
      });
    }
  }

  /**
   * Subscribe to changes on a table. Returns an unsubscribe function.
   */
  subscribe(table: string, callback: SubscriberCallback): () => void {
    let subscription = this.subscriptions.get(table);

    if (!subscription) {
      subscription = {
        subscribers: new Set(),
        channel: null,
        debounceTimer: null,
        lastNotified: 0,
      };
      this.subscriptions.set(table, subscription);
    }

    subscription.subscribers.add(callback);
    console.log(`📡 SubscriptionManager: Added subscriber to ${table} (total: ${subscription.subscribers.size})`);

    // Create channel if first subscriber
    if (subscription.subscribers.size === 1 && !subscription.channel) {
      this.createChannel(table, subscription);
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(table, callback);
    };
  }

  private createChannel(table: string, subscription: TableSubscription) {
    console.log(`📡 SubscriptionManager: Creating channel for ${table}`);
    
    const channel = supabase
      .channel(`centralized_${table}_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: table,
        },
        (payload) => {
          console.log(`📡 SubscriptionManager: ${table} changed (${payload.eventType})`);
          this.notifySubscribers(table);
        }
      )
      .subscribe();

    subscription.channel = channel;
  }

  private notifySubscribers(table: string) {
    const subscription = this.subscriptions.get(table);
    if (!subscription) return;

    // Skip if tab is hidden
    if (!this.isTabVisible) {
      console.log(`📡 SubscriptionManager: Skipping ${table} notification (tab hidden)`);
      return;
    }

    // Debounce notifications
    if (subscription.debounceTimer) {
      clearTimeout(subscription.debounceTimer);
    }

    subscription.debounceTimer = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastNotify = now - subscription.lastNotified;
      
      // Extra protection: don't notify more than once per second
      if (timeSinceLastNotify < 1000) {
        console.log(`📡 SubscriptionManager: Throttled ${table} notification`);
        return;
      }

      subscription.lastNotified = now;
      console.log(`📡 SubscriptionManager: Notifying ${subscription.subscribers.size} subscribers for ${table}`);
      
      subscription.subscribers.forEach(callback => {
        try {
          callback();
        } catch (err) {
          console.error(`📡 SubscriptionManager: Error in ${table} subscriber:`, err);
        }
      });
    }, this.DEBOUNCE_MS);
  }

  private unsubscribe(table: string, callback: SubscriberCallback) {
    const subscription = this.subscriptions.get(table);
    if (!subscription) return;

    subscription.subscribers.delete(callback);
    console.log(`📡 SubscriptionManager: Removed subscriber from ${table} (remaining: ${subscription.subscribers.size})`);

    // Cleanup channel if no more subscribers
    if (subscription.subscribers.size === 0) {
      if (subscription.debounceTimer) {
        clearTimeout(subscription.debounceTimer);
      }
      if (subscription.channel) {
        console.log(`📡 SubscriptionManager: Removing channel for ${table}`);
        supabase.removeChannel(subscription.channel);
      }
      this.subscriptions.delete(table);
    }
  }

  /**
   * Force notify all subscribers of a table (for manual refresh)
   */
  forceNotify(table: string) {
    const subscription = this.subscriptions.get(table);
    if (!subscription) return;

    subscription.lastNotified = 0; // Reset throttle
    this.notifySubscribers(table);
  }

  /**
   * Get current subscription stats (for debugging)
   */
  getStats() {
    const stats: Record<string, number> = {};
    this.subscriptions.forEach((sub, table) => {
      stats[table] = sub.subscribers.size;
    });
    return stats;
  }
}

// Singleton instance
export const subscriptionManager = new RealtimeSubscriptionManager();

/**
 * Hook to use the centralized subscription manager
 */
export const useCentralizedSubscription = (
  table: string,
  callback: SubscriberCallback,
  enabled: boolean = true
) => {
  // This is just a convenience wrapper - actual subscription
  // should be managed in useEffect in the consuming hook
  return { subscriptionManager, table, callback, enabled };
};
