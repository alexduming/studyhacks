'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Clock, Download, Image as ImageIcon, ZoomIn } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/shared/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';

interface InfographicCardProps {
  id: string;
  imageUrl: string | null;
  prompt: string;
  formattedDate: string;
}

export function InfographicCard({
  id,
  imageUrl,
  prompt,
  formattedDate,
}: InfographicCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent opening the dialog
    e.preventDefault();

    if (!imageUrl) return;

    setIsDownloading(true);
    try {
      // Use proxy to avoid CORS issues
      const response = await fetch(`/api/storage/proxy-image?url=${encodeURIComponent(imageUrl)}`);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `infographic-${id}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback
      window.open(imageUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Card
          className="group relative cursor-pointer overflow-hidden transition-all hover:shadow-md hover:border-primary"
        >
          {/* 1. Preview Cover Image */}
          <div className="bg-muted relative aspect-video w-full overflow-hidden">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="Infographic preview"
                fill
                unoptimized
                className="object-cover transition-transform group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            ) : (
              <div className="bg-secondary/50 flex h-full w-full items-center justify-center">
                <ImageIcon className="text-muted-foreground/50 h-12 w-12" />
              </div>
            )}
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
               <ZoomIn className="text-white h-8 w-8 drop-shadow-md" />
            </div>
          </div>

          <CardContent className="px-4 py-3">
             {/* 2. Generation Prompt */}
            <p className="line-clamp-2 text-sm text-muted-foreground" title={prompt}>
              {prompt}
            </p>
          </CardContent>

          <CardFooter className="flex items-center justify-between px-4 pb-4 pt-0 text-xs text-muted-foreground">
             {/* 4. Generation Time */}
            <div className="flex items-center">
              <Clock className="mr-1 h-3 w-3" />
              <span>{formattedDate}</span>
            </div>

             {/* 3. Download Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:text-foreground z-10"
              onClick={handleDownload}
              disabled={!imageUrl || isDownloading}
              title="Download"
            >
              <Download className="h-4 w-4" />
            </Button>
          </CardFooter>
        </Card>
      </DialogTrigger>

      <DialogContent className="max-w-5xl w-[90vw] p-0 overflow-hidden bg-transparent border-none shadow-none focus:outline-none">
        <DialogTitle className="sr-only">Infographic Full View</DialogTitle>
        <div className="relative w-full flex flex-col items-center justify-center">
           {imageUrl && (
             <div className="relative bg-background/95 backdrop-blur rounded-lg shadow-2xl overflow-hidden border">
                <div className="relative w-auto h-auto max-h-[85vh] overflow-auto">
                    {/* Render standard img tag for full size to allow natural aspect ratio within constraints, 
                        or use Next Image with object-contain. 
                        For infographics which can be long, scrolling might be better. 
                        But 'preview' suggests fitting on screen. 
                        Let's use a wrapper that fits in 85vh and an image that fits inside it.
                    */}
                   <img 
                      src={imageUrl} 
                      alt="Full Infographic" 
                      className="max-h-[80vh] w-auto max-w-[90vw] object-contain block"
                   />
                </div>
                
                {/* Download button in enlarged view */}
                <div className="absolute bottom-4 right-4 flex gap-2">
                   <Button 
                      onClick={handleDownload} 
                      disabled={isDownloading}
                      className="shadow-lg"
                      variant="default"
                   >
                     <Download className="mr-2 h-4 w-4" />
                     {isDownloading ? 'Downloading...' : 'Download'}
                   </Button>
                </div>
             </div>
           )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

