import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// In-memory cache for signed URLs
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const CACHE_TTL = 50 * 60 * 1000; // 50 minutes (URLs expire at 60 min)

function getCachedUrl(path: string): string | null {
  const entry = signedUrlCache.get(path);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.url;
  }
  if (entry) signedUrlCache.delete(path);
  return null;
}

function setCachedUrl(path: string, url: string): void {
  signedUrlCache.set(path, { url, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Hook to generate a signed URL for a thumbnail stored in Supabase Storage.
 * Caches signed URLs in memory to avoid repeated requests.
 */
export function useThumbnailUrl(thumbnailPath: string | null | undefined): {
  url: string | null;
  isLoading: boolean;
  error: string | null;
} {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!thumbnailPath) {
      setUrl(null);
      setIsLoading(false);
      return;
    }

    if (thumbnailPath.startsWith('http') || thumbnailPath.startsWith('data:')) {
      setUrl(thumbnailPath);
      setIsLoading(false);
      return;
    }

    // Check cache first
    const cached = getCachedUrl(thumbnailPath);
    if (cached) {
      setUrl(cached);
      setIsLoading(false);
      return;
    }

    const generateSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signError } = await supabase.storage
          .from('label-files')
          .createSignedUrl(thumbnailPath, 60 * 60);

        if (signError) {
          console.error('Failed to generate signed URL:', signError);
          setError(signError.message);
          setUrl(null);
        } else {
          setCachedUrl(thumbnailPath, data.signedUrl);
          setUrl(data.signedUrl);
        }
      } catch (err) {
        console.error('Error generating signed URL:', err);
        setError((err as Error).message);
        setUrl(null);
      } finally {
        setIsLoading(false);
      }
    };

    generateSignedUrl();
  }, [thumbnailPath]);

  return { url, isLoading, error };
}

/**
 * Generate a signed URL for a storage path (non-hook version for callbacks)
 */
export async function generateSignedUrl(
  storagePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  if (storagePath.startsWith('http') || storagePath.startsWith('data:')) {
    return storagePath;
  }

  // Check cache first
  const cached = getCachedUrl(storagePath);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.storage
      .from('label-files')
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }

    setCachedUrl(storagePath, data.signedUrl);
    return data.signedUrl;
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
}
