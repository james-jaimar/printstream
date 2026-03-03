
import React, { useEffect, useState } from 'react';
import { getSignedUrl } from '@/utils/pdf/urlUtils';

interface PdfViewerProps {
  url: string | null;
  className?: string;
}

const PdfViewer = ({ url, className = '' }: PdfViewerProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const setupPdfUrl = async () => {
      if (!url) return;
      
      try {
        setIsLoading(true);
        setError(null);
        
        const signedUrl = await getSignedUrl(url);
        if (!signedUrl) {
          throw new Error('Could not generate a valid URL for this PDF');
        }
        
        console.log('PDF URL ready:', signedUrl);
        setPdfUrl(signedUrl);
      } catch (error) {
        console.error('Error setting up PDF URL:', error);
        setError(error instanceof Error ? error.message : 'Failed to setup PDF URL');
      } finally {
        setIsLoading(false);
      }
    };

    setupPdfUrl();
  }, [url]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary mb-4"></div>
          <p className="text-gray-500">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <div className="flex flex-col items-center text-center">
          <p className="text-red-500 mb-2">{error}</p>
          <p className="text-gray-500">Try downloading the PDF instead for better results.</p>
        </div>
      </div>
    );
  }

  if (!pdfUrl) {
    return (
      <div className="flex items-center justify-center p-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
        <p className="text-gray-500">No PDF available</p>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden ${className}`}>
      <iframe
        src={pdfUrl}
        className="w-full h-[600px] border-0"
        title="PDF Viewer"
      />
    </div>
  );
};

export default PdfViewer;
