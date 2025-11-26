'use client';

import { useState, useCallback } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

interface PdfUploaderProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  className?: string;
}

export function PdfUploader({ onFileSelect, isUploading = false, className }: PdfUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const pdfFile = files.find(file => file.type === 'application/pdf');

      if (pdfFile) {
        setSelectedFile(pdfFile);
        onFileSelect(pdfFile);
      }
    },
    [onFileSelect]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.type === 'application/pdf') {
        setSelectedFile(file);
        onFileSelect(file);
      }
    },
    [onFileSelect]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
  }, []);

  return (
    <div className={cn('w-full max-w-md mx-auto', className)}>
      {!selectedFile ? (
        <div
          className={cn(
            'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
            isDragOver
              ? 'border-purple-400 bg-purple-50/10'
              : 'border-gray-300 hover:border-gray-400',
            isUploading && 'pointer-events-none opacity-50'
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            disabled={isUploading}
          />

          <div className="flex flex-col items-center space-y-4">
            <Upload className="w-12 h-12 text-gray-400" />
            <div>
              <p className="text-lg font-medium text-gray-200">
                Drop your PDF file
              </p>
              <p className="text-sm text-gray-400 mt-1">
                or click to browse
              </p>
            </div>
            <p className="text-xs text-gray-500">PDF files only</p>
          </div>
        </div>
      ) : (
        <div className="relative border rounded-lg p-4 bg-gray-800/50">
          {isUploading && (
            <div className="absolute inset-0 bg-gray-900/70 rounded-lg flex items-center justify-center z-10">
              <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          )}

          <div className="flex items-center space-x-3">
            <FileText className="w-8 h-8 text-purple-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-400">
                {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            {!isUploading && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFile}
                className="text-gray-400 hover:text-gray-200"
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}