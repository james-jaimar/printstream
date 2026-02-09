import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ClientContact {
  id: string;
  customer_id: string;
  name: string;
  email: string;
  company_name: string;
  can_approve: boolean;
}

interface ClientAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  contact: ClientContact | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const ClientAuthContext = createContext<ClientAuthState>({
  isAuthenticated: false,
  isLoading: true,
  contact: null,
  token: null,
  login: async () => {},
  logout: () => {},
});

const TOKEN_KEY = 'label_client_token';
const CONTACT_KEY = 'label_client_contact';

export function ClientAuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [contact, setContact] = useState<ClientContact | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verify stored token on mount
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    const storedContact = localStorage.getItem(CONTACT_KEY);

    if (!stored) {
      setIsLoading(false);
      return;
    }

    // Verify token is still valid
    supabase.functions
      .invoke('label-client-auth/verify', {
        body: { token: stored },
      })
      .then(({ data, error }) => {
        if (error || !data?.valid) {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(CONTACT_KEY);
        } else {
          setToken(stored);
          if (storedContact) {
            try {
              setContact(JSON.parse(storedContact));
            } catch {
              // If contact parse fails, use payload from verify
              const p = data.payload;
              setContact({
                id: p.contact_id,
                customer_id: p.customer_id,
                name: p.name,
                email: p.email,
                company_name: p.company_name,
                can_approve: p.can_approve,
              });
            }
          }
        }
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(CONTACT_KEY);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.functions.invoke('label-client-auth/login', {
      body: { email, password },
    });

    if (error) {
      throw new Error(data?.error || 'Login failed');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    setToken(data.token);
    setContact(data.contact);
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(CONTACT_KEY, JSON.stringify(data.contact));
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setContact(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CONTACT_KEY);
  }, []);

  return (
    <ClientAuthContext.Provider
      value={{
        isAuthenticated: !!token,
        isLoading,
        contact,
        token,
        login,
        logout,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  return useContext(ClientAuthContext);
}
