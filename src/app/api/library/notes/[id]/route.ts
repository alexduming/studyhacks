import { NextResponse } from 'next/server';

import {
  getNoteDocumentById,
  updateNoteDocument,
  type NoteDocumentStatus,
} from '@/shared/models/note-document';
import { getUserInfo } from '@/shared/models/user';
import {
  countWords,
  extractSummary,
  extractTitle,
  renderMarkdownToHtml,
} from '@/shared/lib/note-format';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUserInfo();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Please sign in to view notes' },
      { status: 401 }
    );
  }

  const note = await getNoteDocumentById(id, user.id);
  if (!note) {
    return NextResponse.json(
      { success: false, error: 'Note not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    note,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getUserInfo();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'Please sign in to update notes' },
      { status: 401 }
    );
  }

  const existingNote = await getNoteDocumentById(id, user.id);
  if (!existingNote) {
    return NextResponse.json(
      { success: false, error: 'Note not found' },
      { status: 404 }
    );
  }

  const body = await request.json();
  const {
    title,
    markdown,
    language,
    tags,
    status,
    sourceType,
    sourceName,
  } = body || {};

  if (!title && !markdown && !language && !tags && !status) {
    return NextResponse.json(
      {
        success: false,
        error: 'Nothing to update',
      },
      { status: 400 }
    );
  }

  const payload: {
    title?: string;
    markdown?: string;
    html?: string | null;
    language?: string | null;
    tags?: string[];
    status?: NoteDocumentStatus;
    summary?: string | null;
    wordCount?: number;
    sourceType?: string | null;
    sourceName?: string | null;
  } = {
    title,
    language,
    tags,
    status,
    sourceType,
    sourceName,
  };

  if (typeof markdown === 'string') {
    payload.markdown = markdown;
    payload.html = renderMarkdownToHtml(markdown);
    payload.summary = extractSummary(markdown);
    payload.wordCount = countWords(markdown);
    // 如果标题为空，尝试从 Markdown 中提取
    if (!title) {
      payload.title = extractTitle(markdown, 'AI Note');
    }
  }

  let note = await updateNoteDocument(id, user.id, payload);
  if (!note) {
    note = (await getNoteDocumentById(id, user.id)) || existingNote;
  }

  return NextResponse.json({
    success: true,
    note,
  });
}

