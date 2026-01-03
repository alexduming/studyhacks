import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';

export default function NotesPage() {
  return (
    <div className="bg-muted/10 flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
        <div className="bg-muted mb-4 rounded-full p-4">
            <FileText className="text-muted-foreground h-8 w-8" />
        </div>
        <h3 className="mb-2 text-xl font-semibold capitalize">Notes Library</h3>
        <p className="text-muted-foreground mb-6 max-w-md">
            Your generated notes will appear here. Start creating new content to build your library.
        </p>
        <Link href="/ai-note-taker">
            <Button variant="outline">Generate New Notes</Button>
        </Link>
    </div>
  );
}


