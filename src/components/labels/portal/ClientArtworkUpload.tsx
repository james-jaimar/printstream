import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, FileUp } from 'lucide-react';

interface ClientArtworkUploadProps {
  onUpload: (file: File) => Promise<void>;
  isPending?: boolean;
}

export default function ClientArtworkUpload({ onUpload, isPending }: ClientArtworkUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    await onUpload(selectedFile);
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      {!selectedFile ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
        >
          <Upload className="h-3.5 w-3.5 mr-1" />
          Upload New Artwork
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {selectedFile.name}
          </span>
          <Button size="sm" onClick={handleUpload} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <FileUp className="h-3.5 w-3.5 mr-1" />
            )}
            Send
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedFile(null);
              if (inputRef.current) inputRef.current.value = '';
            }}
            disabled={isPending}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
