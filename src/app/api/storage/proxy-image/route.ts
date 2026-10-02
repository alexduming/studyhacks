import { NextRequest, NextResponse } from 'next/server';

/**
 * 图片代理API
 * 说明：通过服务器端获取跨域图片，避免浏览器CORS限制
 * 用途：用于PPTX导出和ZIP下载功能中的图片获取
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const imageUrl = searchParams.get('url');

    // 验证URL参数
    if (!imageUrl) {
      return NextResponse.json(
        { error: '缺少url参数' },
        { status: 400 }
      );
    }

    // 验证URL格式（基本安全检查）
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
    } catch {
      return NextResponse.json(
        { error: '无效的URL格式' },
        { status: 400 }
      );
    }

    // 只允许http和https协议（安全限制）
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json(
        { error: '只支持HTTP和HTTPS协议' },
        { status: 400 }
      );
    }

    // 从目标URL获取图片
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*',
      },
      // 设置超时（30秒）
      signal: AbortSignal.timeout(30000),
    });

    // 检查响应状态
    if (!response.ok) {
      return NextResponse.json(
        { error: `获取图片失败: HTTP ${response.status}` },
        { status: response.status }
      );
    }

    // 检查Content-Type是否为图片
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      return NextResponse.json(
        { error: '返回的内容不是图片类型' },
        { status: 400 }
      );
    }

    // 获取图片数据
    const arrayBuffer = await response.arrayBuffer();

    // 返回图片数据，设置正确的Content-Type
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // 缓存1小时
        'Access-Control-Allow-Origin': '*', // 允许跨域访问
      },
    });
  } catch (error: any) {
    console.error('[Proxy Image] Error:', error);

    // 处理超时错误
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json(
        { error: '请求超时，请稍后重试' },
        { status: 504 }
      );
    }

    // 处理其他错误
    return NextResponse.json(
      { error: error.message || '获取图片失败' },
      { status: 500 }
    );
  }
}


