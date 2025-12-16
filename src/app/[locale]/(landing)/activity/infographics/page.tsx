import Link from 'next/link';
import { Image as ImageIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

export default function InfographicsPage() {
  return (
    <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
            <ImageIcon className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold capitalize">Infographics Library</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
            Your generated infographics will appear here. Start creating new content to build your library.
        </p>
        <Link href="/infographic">
            <Button variant="outline">Generate New Infographics</Button>
        </Link>
    </div>
  );
}

