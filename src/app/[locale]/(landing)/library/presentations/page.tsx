import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import Image from 'next/image';
import { Clock, Presentation } from 'lucide-react';

import { getUserPresentationsAction } from '@/app/actions/presentation';
import { Button } from '@/shared/components/ui/button';
import { Card, CardFooter, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';

export default async function PresentationsPage() {
  const presentations = await getUserPresentationsAction();

  return (
    <div className="space-y-6">
       {/* 说明：这里的按钮链接原来指向 /aippt，为了让 URL 更好理解，已统一改成 /slides */}
       <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">My Presentations</h2>
          <Link href="/slides">
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
            {/* 说明：空列表时的“Create Now”按钮，同样从 /aippt 改为 /slides */}
            <Link href="/slides" className="mt-4">
              <Button>Create Now</Button>
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {presentations.map((item) => (
              <Link key={item.id} href={`/slides?id=${item.id}`}>
                <Card className="hover:border-primary group h-full overflow-hidden transition-all hover:shadow-md">
                  <div className="bg-muted relative aspect-video w-full overflow-hidden">
                    {item.thumbnailUrl ? (
                      <Image
                        src={item.thumbnailUrl}
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
                       <Badge variant={item.status === 'completed' ? 'default' : item.status === 'failed' ? 'destructive' : 'secondary'}>
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

