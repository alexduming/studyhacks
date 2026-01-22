'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Clock, Presentation, Trash2, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

import { deletePresentationAction } from '@/app/actions/presentation';
import { Card, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { Link } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';

interface PresentationCardProps {
  item: {
    id: string;
    title: string;
    status: string;
    createdAt: Date;
    thumbnailUrl: string | null;
    content: string | null;
  };
}

export function PresentationCard({ item }: PresentationCardProps) {
  const t = useTranslations('library.presentations');
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const result = await deletePresentationAction(item.id);
      if (result.success) {
        toast.success(t('actions.delete_success'));
        router.refresh();
      } else {
        toast.error(t('actions.delete_failed'));
      }
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(t('actions.delete_failed'));
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  // 🎯 修复：如果 thumbnailUrl 为空，尝试从 content 解析第一张图作为兜底
  let displayThumbnail = item.thumbnailUrl;
  if (!displayThumbnail && item.content) {
    try {
      const slides = JSON.parse(item.content);
      if (Array.isArray(slides) && slides.length > 0) {
        displayThumbnail = slides.find((s: any) => s.imageUrl)?.imageUrl || null;
      }
    } catch (e) {
      // ignore parse error
    }
  }

  return (
    <>
      <div className="group relative">
        <Link href={`/slides?id=${item.id}`} className="block h-full">
          <Card className="hover:border-primary group h-full overflow-hidden transition-all hover:shadow-md">
            <div className="bg-muted relative aspect-video w-full overflow-hidden">
              {displayThumbnail ? (
                <Image
                  src={displayThumbnail}
                  alt={item.title}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  unoptimized
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="bg-secondary/50 flex h-full w-full items-center justify-center">
                  <Presentation className="text-muted-foreground/50 h-12 w-12" />
                </div>
              )}
              <div className="absolute top-2 right-2">
                <Badge
                  variant={
                    item.status === 'completed'
                      ? 'default'
                      : item.status === 'failed'
                        ? 'destructive'
                        : 'secondary'
                  }
                >
                  {item.status}
                </Badge>
              </div>
            </div>
            <CardHeader className="p-4">
              <CardTitle className="line-clamp-1 text-lg">
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardFooter className="text-muted-foreground flex items-center justify-between p-4 pt-0 text-sm">
              <div className="flex items-center">
                <Clock className="mr-1 h-3 w-3" />
                {new Date(item.createdAt).toLocaleDateString()}
              </div>
            </CardFooter>
          </Card>
        </Link>

        {/* Delete Button - Positioned absolutely so it doesn't trigger the Link */}
        <Button
          variant="destructive"
          size="icon"
          className="absolute bottom-4 right-4 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowDeleteDialog(true);
          }}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.delete')}</DialogTitle>
            <DialogDescription>{t('actions.delete_confirm')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

