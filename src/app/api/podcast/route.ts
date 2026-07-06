import { NextResponse } from 'next/server';
import { getUserInfo } from '@/shared/models/user';
import {
  savePodcast,
  getUserPodcasts,
  deletePodcast,
  getPodcastById,
} from '@/shared/models/podcast';

export const dynamic = 'force-dynamic';

/**
 * 获取用户的播客列表
 * GET /api/podcast
 */
export async function GET(request: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to view podcasts',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    const podcastId = searchParams.get('id');

    // 如果提供了 ID，返回单个播客
    if (podcastId) {
      const podcast = await getPodcastById(podcastId, user.id);
      if (!podcast) {
        return NextResponse.json(
          {
            success: false,
            error: 'Podcast not found',
          },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        podcast,
      });
    }

    // 否则返回播客列表
    const podcasts = await getUserPodcasts(user.id, { limit, offset });

    return NextResponse.json({
      success: true,
      podcasts,
      total: podcasts.length,
    });
  } catch (error: any) {
    console.error('API /api/podcast GET error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to get podcasts',
      },
      { status: 500 }
    );
  }
}

/**
 * 保存播客
 * POST /api/podcast
 */
export async function POST(request: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to save podcast',
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      id,
      episodeId,
      title,
      description,
      audioUrl,
      duration,
      mode,
      language,
      speakerIds,
      coverUrl,
      outline,
      scripts,
      status,
    } = body;

    // 验证必填字段
    if (!id || !episodeId || !title || !audioUrl || !duration || !mode || !language) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields',
        },
        { status: 400 }
      );
    }

    const podcast = await savePodcast({
      id,
      userId: user.id,
      episodeId,
      title,
      description,
      audioUrl,
      duration,
      mode,
      language,
      speakerIds,
      coverUrl,
      outline,
      scripts,
      status,
    });

    return NextResponse.json({
      success: true,
      podcast,
    });
  } catch (error: any) {
    console.error('API /api/podcast POST error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to save podcast',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除播客
 * DELETE /api/podcast?id=xxx
 */
export async function DELETE(request: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to delete podcast',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const podcastId = searchParams.get('id');

    if (!podcastId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing podcast ID',
        },
        { status: 400 }
      );
    }

    const deleted = await deletePodcast(podcastId, user.id);

    if (!deleted) {
      return NextResponse.json(
        {
          success: false,
          error: 'Podcast not found or already deleted',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Podcast deleted successfully',
    });
  } catch (error: any) {
    console.error('API /api/podcast DELETE error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to delete podcast',
      },
      { status: 500 }
    );
  }
}

