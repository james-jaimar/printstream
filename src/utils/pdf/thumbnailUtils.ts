import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

/**
 * Generate a thumbnail from a PDF file
 * @param file - The PDF file to generate thumbnail from
 * @param maxWidth - Maximum width of the thumbnail (default 300px)
 * @returns Data URL of the thumbnail image
 */
export async function generatePdfThumbnail(
  file: File,
  maxWidth: number = 300
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;
  
  return canvas.toDataURL('image/png');
}

/**
 * Generate a thumbnail from a PDF URL
 * @param url - The URL of the PDF
 * @param maxWidth - Maximum width of the thumbnail (default 300px)
 * @returns Data URL of the thumbnail image
 */
export async function generatePdfThumbnailFromUrl(
  url: string,
  maxWidth: number = 300
): Promise<string> {
  const pdf = await pdfjsLib.getDocument(url).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  const scale = maxWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Could not get canvas context');
  }
  
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  
  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
  }).promise;
  
  return canvas.toDataURL('image/png');
}

/**
 * Convert a data URL to a Blob
 * @param dataUrl - The data URL to convert
 * @returns Blob object
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}

/**
 * Get PDF page dimensions in mm
 * @param file - The PDF file
 * @returns Object with width and height in mm
 */
export async function getPdfDimensionsMm(file: File): Promise<{ width_mm: number; height_mm: number }> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);
  
  const viewport = page.getViewport({ scale: 1 });
  
  // PDF units are in points (1 pt = 1/72 inch, 1 inch = 25.4mm)
  const PT_TO_MM = 25.4 / 72;
  
  return {
    width_mm: viewport.width * PT_TO_MM,
    height_mm: viewport.height * PT_TO_MM,
  };
}
