import Image from 'next/image';
import Link from 'next/link';
import { getUserPresentationsAction } from '@/app/actions/presentation';
import { ArrowLeft, Clock, Presentation } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

export default async function HistoryPage() {
  const t = await getTranslations('aippt');
  const presentations = await getUserPresentationsAction();

  return (
    <div className="container mx-auto mt-12 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/aippt">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">My Presentations</h1>
        </div>
        <Link href="/aippt">
          <Button>
            <Presentation className="mr-2 h-4 w-4" />
            New Presentation
          </Button>
        </Link>
      </div>

      {presentations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
          <div className="bg-muted mb-4 rounded-full p-4">
            <Presentation className="text-muted-foreground h-8 w-8" />
          </div>
          <h3 className="text-lg font-semibold">No presentations yet</h3>
          <p className="text-muted-foreground mb-4 text-sm">
            Create your first AI-generated presentation today.
          </p>
          <Link href="/aippt">
            <Button>Get Started</Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {presentations.map((item) => (
            <Link key={item.id} href={`/aippt?id=${item.id}`}>
              <Card className="hover:border-primary h-full overflow-hidden transition-all hover:shadow-md">
                <div className="bg-muted relative aspect-video w-full">
                  {item.thumbnailUrl ? (
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.title}
                      fill
                      className="object-cover"
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
          ))}
        </div>
      )}
    </div>
  );
}

