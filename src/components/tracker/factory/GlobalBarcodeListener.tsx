import React, { useEffect, useRef } from "react";

interface GlobalBarcodeListenerProps {
  onBarcodeDetected: (barcodeData: string) => void;
  minLength?: number;
  timeout?: number;
}

export const GlobalBarcodeListener: React.FC<GlobalBarcodeListenerProps> = ({
  onBarcodeDetected,
  minLength = 5,
  timeout = 500
}) => {
  const barcodeRef = useRef<string>("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store callback in a ref so the keydown listener never needs to be re-registered
  const callbackRef = useRef(onBarcodeDetected);

  // Keep the ref pointing to the latest callback without re-registering the listener
  useEffect(() => {
    callbackRef.current = onBarcodeDetected;
  }, [onBarcodeDetected]);

  useEffect(() => {
    console.log('🔍 GlobalBarcodeListener mounted');
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore keystrokes when user is typing in input fields
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ignore modified keys (Ctrl, Alt, Shift combinations)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Handle Enter key (common barcode scanner behavior)
      if (event.key === 'Enter') {
        if (barcodeRef.current.length >= minLength) {
          console.log('Barcode detected via Enter:', barcodeRef.current);
          callbackRef.current(barcodeRef.current.trim());
        }
        barcodeRef.current = "";
        return;
      }

      // Handle Tab key (some scanners use this)
      if (event.key === 'Tab' && barcodeRef.current.length >= minLength) {
        event.preventDefault();
        console.log('Barcode detected via Tab:', barcodeRef.current);
        callbackRef.current(barcodeRef.current.trim());
        barcodeRef.current = "";
        return;
      }

      // Only append printable characters
      if (event.key.length === 1 && /[a-zA-Z0-9\-_\.\/]/.test(event.key)) {
        barcodeRef.current += event.key;
        
        // Set timeout to process accumulated data
        timeoutRef.current = setTimeout(() => {
          if (barcodeRef.current.length >= minLength) {
            console.log('✅ Barcode detected via timeout:', barcodeRef.current);
            callbackRef.current(barcodeRef.current.trim());
          }
          barcodeRef.current = "";
        }, timeout);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [minLength, timeout]); // onBarcodeDetected intentionally excluded — uses ref

  return null;
};
