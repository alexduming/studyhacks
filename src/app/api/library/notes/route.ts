import { NextResponse } from 'next/server';

import {
  listNoteDocuments,
  type NoteDocumentStatus,
} from '@/shared/models/note-document';
import { getUserInfo } from '@/shared/models/user';

export const dynamic = 'force-dynamic';

/**
 * 获取当前用户的笔记列表
 */
export async function GET(request: Request) {
  const user = await getUserInfo();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Please sign in to view notes' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const offset = parseInt(searchParams.get('offset') || '0', 10);
  const status = searchParams.get('status') as NoteDocumentStatus | null;

  const notes = await listNoteDocuments(user.id, {
    limit,
    offset,
    status: status || undefined,
  });

  return NextResponse.json({
    success: true,
    notes,
  });
}

