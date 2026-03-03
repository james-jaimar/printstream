
import { toast } from "sonner";
import { getSignedUrl } from "./pdf/urlUtils";
import { downloadFile, openInNewTab } from "./pdf/downloadUtils";
import { handlePdfError } from "./pdf/errorUtils";

/**
 * Handles PDF view or download actions
 */
export const handlePdfAction = async (
  url: string | null,
  action: 'view' | 'download',
  filename?: string
): Promise<void> => {
  if (!url) {
    toast.error("PDF URL is not available");
    return;
  }

  // Show a loading toast that we'll dismiss later
  const toastId = toast.loading(`${action === 'view' ? 'Opening' : 'Downloading'} PDF...`);

  // Setup a timeout to clear the loading toast if the operation takes too long
  const timeoutId = setTimeout(() => {
    toast.dismiss(toastId);
    toast.warning("PDF processing is taking longer than expected", {
      description: "This might be due to a large file or slow connection"
    });
  }, 10000); // 10 second timeout
  
  try {
    console.log(`Attempting to access PDF at: ${url}`);
    
    // Get signed URL if needed
    const isAlreadySigned = url.includes('token=');
    const accessUrl = isAlreadySigned ? url : await getSignedUrl(url, 3600, { download: action === 'download' });
    
    if (!accessUrl) {
      throw new Error("Could not generate a valid URL for this PDF");
    }

    console.log(`Access URL generated: ${accessUrl.substring(0, 100)}...`);
    
    // Clear the timeout as we've successfully generated the URL
    clearTimeout(timeoutId);
    toast.dismiss(toastId);
    
    if (action === 'view') {
      openInNewTab(accessUrl);
      toast.success("PDF opened in a new tab");
    } else {
      const displayFilename = filename || url.split('/').pop() || 'document.pdf';
      downloadFile(accessUrl, displayFilename);
      toast.success(`PDF downloaded as ${displayFilename}`);
    }
  } catch (error) {
    // Clear the timeout as we've encountered an error
    clearTimeout(timeoutId);
    toast.dismiss(toastId);
    handlePdfError(error);
  }
};
