import { NextResponse } from 'next/server';

import { checkApiOrigin } from '@/shared/lib/security';

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<img[^>]*>/gi, ' ')
    .replace(/<\/(p|div|section|article|h1|h2|h3|h4|li|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

export async function POST(request: Request) {
  const securityCheck = checkApiOrigin(request);
  if (!securityCheck.valid && securityCheck.response) {
    return securityCheck.response;
  }

  try {
    const body = await request.json();
    const rawUrl = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!rawUrl) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing url field',
        },
        { status: 400 }
      );
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid URL',
        },
        { status: 400 }
      );
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only http and https URLs are supported',
        },
        { status: 400 }
      );
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudyHacksAI/1.0; +https://www.studyhacks.ai)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch url: ${response.status}`,
        },
        { status: 400 }
      );
    }

    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]
      ? normalizeWhitespace(stripHtml(titleMatch[1]))
      : '';
    const text = stripHtml(html)
      .split('\n')
      .map((line) => normalizeWhitespace(line))
      .filter((line) => line.length > 0)
      .join('\n');

    const content = [title ? `# ${title}` : '', text]
      .filter(Boolean)
      .join('\n\n');

    if (!content.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'No readable content found on this page',
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      content,
    });
  } catch (error: any) {
    console.error('API /api/ai/extract-link error:', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to extract link content.',
      },
      { status: 500 }
    );
  }
}
