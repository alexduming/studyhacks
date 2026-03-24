import { NextRequest, NextResponse } from 'next/server';

import { getPodcastById } from '@/shared/models/podcast';
import { getUserInfo } from '@/shared/models/user';

export const runtime = 'nodejs';

function sanitizeFilename(input?: string) {
  const fallback = 'podcast';
  const value = (input || fallback).trim();

  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || fallback
  );
}

function isAllowedAudioHost(url: URL) {
  return (
    url.protocol === 'https:' &&
    (url.hostname === 'listenhub.ai' || url.hostname.endsWith('.listenhub.ai'))
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Please sign in to download podcasts' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const rawAudioUrl = searchParams.get('audioUrl');
    const rawTitle = searchParams.get('title');

    let audioUrl = rawAudioUrl || '';
    let title = rawTitle || 'podcast';

    if (id) {
      const podcast = await getPodcastById(id, user.id);

      if (!podcast?.audioUrl) {
        return NextResponse.json(
          { success: false, error: 'Podcast not found' },
          { status: 404 }
        );
      }

      audioUrl = podcast.audioUrl;
      title = podcast.title || title;
    }

    if (!audioUrl) {
      return NextResponse.json(
        { success: false, error: 'Missing audio source' },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(audioUrl);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid audio URL' },
        { status: 400 }
      );
    }

    if (!isAllowedAudioHost(parsedUrl)) {
      return NextResponse.json(
        { success: false, error: 'Audio host is not allowed' },
        { status: 400 }
      );
    }

    const upstream = await fetch(parsedUrl.toString(), {
      cache: 'no-store',
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch podcast audio' },
        { status: 502 }
      );
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const filename = `${sanitizeFilename(title)}.mp3`;

    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
        'Content-Length': String(arrayBuffer.byteLength),
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('API /api/podcast/download GET error:', error);

    return NextResponse.json(
      { success: false, error: 'Failed to download podcast audio' },
      { status: 500 }
    );
  }
}
