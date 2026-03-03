
import { supabase } from "@/integrations/supabase/client";

/**
 * Extracts bucket name and file path from a Supabase storage URL
 */
export const extractStoragePaths = (url: string) => {
  try {
    // Clean URL - sometimes URLs can have extra spaces or new lines
    const cleanUrl = url.trim();
    
    // Early return if URL is empty or obviously invalid
    if (!cleanUrl || !cleanUrl.includes('/')) {
      console.error('Invalid URL provided:', url);
      return null;
    }
    
    const urlObj = new URL(cleanUrl);
    const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
    
    // Format: /storage/v1/object/public/BUCKET_NAME/FILE_PATH
    // Look for 'public' or 'object/public' in the path
    const publicIndex = pathParts.indexOf('public');
    
    if (publicIndex !== -1 && publicIndex < pathParts.length - 1) {
      const bucket = pathParts[publicIndex + 1];
      const filePath = pathParts.slice(publicIndex + 2).join('/');
      
      if (bucket && filePath) {
        console.log(`Extracted bucket: ${bucket}, filePath: ${filePath}`);
        return { bucket, filePath };
      }
    }
    
    // Legacy format - look for "pdf_files" or other bucket name in the path
    const bucketIndex = pathParts.findIndex(part => 
      part === 'pdf_files' || 
      part === 'batches' || 
      part.includes('_files')
    );
    
    if (bucketIndex === -1) {
      console.error('Could not identify bucket in URL:', cleanUrl);
      return null;
    }
    
    const bucket = pathParts[bucketIndex];
    const filePath = pathParts.slice(bucketIndex + 1).join('/');
    
    if (!filePath) {
      console.error('Could not extract file path from URL:', cleanUrl);
      return null;
    }
    
    console.log(`Extracted bucket: ${bucket}, filePath: ${filePath}`);
    return { bucket, filePath };
  } catch (error) {
    console.error('Error extracting paths from URL:', error);
    return null;
  }
};

/**
 * Gets a signed URL for accessing a PDF
 */
export const getSignedUrl = async (url: string | null, expiresIn = 3600, options?: { download?: boolean }): Promise<string | null> => {
  if (!url) return null;
  
  try {
    // If it's already a signed URL, return it as is
    if (url.includes('token=')) {
      console.log('URL is already signed, returning as is');
      return url;
    }
    
    console.log(`Processing URL for signing: ${url.substring(0, 50)}...`);
    
    const paths = extractStoragePaths(url);
    if (!paths) {
      console.warn('Could not extract paths from URL, using original URL:', url);
      return url;
    }
    
    console.log(`Requesting signed URL for bucket: ${paths.bucket}, file: ${paths.filePath}`);
    
    try {
      const { data, error } = await supabase.storage
        .from(paths.bucket)
        .createSignedUrl(paths.filePath, expiresIn, {
          download: options?.download ?? false,
        });
        
      if (error) {
        console.error('Error getting signed URL:', error);
        console.error('Error details:', error.message);
        
        // If we get a "not found" error, it's possible that the file might be in another bucket
        if (error.message.includes('not found')) {
          // Try with another common bucket name as fallback
          const alternateBucket = paths.bucket === 'pdf_files' ? 'batches' : 'pdf_files';
          console.log(`Trying alternate bucket: ${alternateBucket}`);
          
          const { data: altData, error: altError } = await supabase.storage
            .from(alternateBucket)
            .createSignedUrl(paths.filePath, expiresIn, {
              download: options?.download ?? false,
            });
            
          if (altError) {
            console.error(`Error with alternate bucket ${alternateBucket}:`, altError);
            // Return the original URL as fallback if signing fails
            return url;
          }
          
          console.log('Signed URL generated successfully from alternate bucket');
          return altData.signedUrl;
        }
        
        // Return the original URL as fallback if signing fails
        return url;
      }
      
      console.log('Signed URL generated successfully');
      return data.signedUrl;
    } catch (signError) {
      console.error('Exception in createSignedUrl:', signError);
      return url;
    }
  } catch (error) {
    console.error('Error generating signed URL:', error);
    return url;
  }
};
