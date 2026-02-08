import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          'pdf-lib': ['pdf-lib'],
          'pdfjs-dist': ['pdfjs-dist']
        }
      }
    }
  },
  esbuild: {
    target: 'es2022'
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
    esbuildOptions: {
      target: 'es2022'
    }
  }
}));
