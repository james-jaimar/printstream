import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Hook to generate a signed URL for a thumbnail stored in Supabase Storage.
 * If the URL is already a full URL (http/https or data:), returns it as-is.
 * Otherwise, treats it as a storage path and generates a signed URL.
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

    // If it's already a full URL or data URL, use it directly
    if (thumbnailPath.startsWith('http') || thumbnailPath.startsWith('data:')) {
      setUrl(thumbnailPath);
      setIsLoading(false);
      return;
    }

    // Otherwise, generate a signed URL
    const generateSignedUrl = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signError } = await supabase.storage
          .from('label-files')
          .createSignedUrl(thumbnailPath, 60 * 60); // 1 hour expiry

        if (signError) {
          console.error('Failed to generate signed URL:', signError);
          setError(signError.message);
          setUrl(null);
        } else {
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
  // If it's already a full URL or data URL, return as-is
  if (storagePath.startsWith('http') || storagePath.startsWith('data:')) {
    return storagePath;
  }

  try {
    const { data, error } = await supabase.storage
      .from('label-files')
      .createSignedUrl(storagePath, expiresIn);

    if (error) {
      console.error('Failed to generate signed URL:', error);
      return null;
    }

    return data.signedUrl;
  } catch (err) {
    console.error('Error generating signed URL:', err);
    return null;
  }
}
