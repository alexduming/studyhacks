import { notFound } from 'next/navigation';

import { getNoteDocumentById } from '@/shared/models/note-document';
import { getUserInfo } from '@/shared/models/user';

import { NoteEditorShell } from './note-editor-shell';

type NoteEditorParams = {
  locale?: string;
  id: string;
};

export default async function NoteEditorPage({
  params,
}: {
  params: Promise<NoteEditorParams> | NoteEditorParams;
}) {
  const resolvedParams = await Promise.resolve(params);

  const user = await getUserInfo();
  if (!user) {
    notFound();
  }

  const note = await getNoteDocumentById(resolvedParams.id, user.id);
  if (!note) {
    notFound();
  }

  return (
    <NoteEditorShell
      locale={resolvedParams.locale}
      initialNote={{
        ...note,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      }}
    />
  );
}

