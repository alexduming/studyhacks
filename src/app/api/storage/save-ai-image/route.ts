import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { getStorageServiceWithConfigs } from '@/shared/services/storage';
import { getAllConfigs } from '@/shared/models/config';
import { getUserInfo } from '@/shared/models/user';

export const runtime = 'nodejs';

/**
 * 保存 AI 生成的图片到 R2 存储
 * 
 * 非程序员解释：
 * - 这个 API 的作用是把 AI 生成的图片（比如 Infographic 或 PPT）从临时地址下载下来
 * - 然后上传到我们自己的 R2 存储桶，这样图片就不会失效了
 * - Infographic 会存到 "infographic/" 文件夹，PPT 会存到 "slides/" 文件夹
 * 
 * 工作流程：
 * 1. 接收图片的临时 URL
 * 2. 从临时 URL 下载图片
 * 3. 上传到 R2 指定的文件夹
 * 4. 返回 R2 的永久访问 URL
 */
export async function POST(request: NextRequest) {
  try {
    // 1. 验证用户登录状态
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. 解析请求参数
    const body = await request.json();
    const { imageUrl, type, metadata } = body;

    // type: 'infographic' | 'slide'
    // metadata: { taskId?, slideIndex?, userId? }

    if (!imageUrl || typeof imageUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: '缺少图片 URL' },
        { status: 400 }
      );
    }

    if (!type || !['infographic', 'slide'].includes(type)) {
      return NextResponse.json(
        { success: false, error: '类型必须是 infographic 或 slide' },
        { status: 400 }
      );
    }

    // 3. 获取 R2 配置
    const configs = await getAllConfigs();
    const storageService = getStorageServiceWithConfigs(configs);

    // 检查 R2 是否配置
    if (!configs.r2_bucket_name || !configs.r2_access_key) {
      return NextResponse.json(
        {
          success: false,
          error: 'R2 存储未配置，请在后台设置中配置 R2',
        },
        { status: 500 }
      );
    }

    // 4. 构建 R2 存储路径
    // 格式：infographic/{userId}/{timestamp}_{randomId}.png
    //      slides/{userId}/{timestamp}_{randomId}.png
    const timestamp = Date.now();
    const randomId = nanoid(8);
    const fileExtension = imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') 
      ? 'jpg' 
      : 'png';
    
    const folder = type === 'infographic' ? 'infographic' : 'slides';
    const fileName = `${timestamp}_${randomId}.${fileExtension}`;
    const storageKey = `${folder}/${user.id}/${fileName}`;

    console.log(`[Storage] 开始保存图片到 R2: ${storageKey}`);
    console.log(`[Storage] 源 URL: ${imageUrl.substring(0, 100)}...`);

    // 5. 下载并上传图片到 R2
    const uploadResult = await storageService.downloadAndUpload({
      url: imageUrl,
      key: storageKey,
      contentType: `image/${fileExtension}`,
      disposition: 'inline', // 浏览器内直接显示，而不是下载
    });

    if (!uploadResult.success) {
      console.error('[Storage] 上传失败:', uploadResult.error);
      return NextResponse.json(
        {
          success: false,
          error: `图片保存失败: ${uploadResult.error}`,
        },
        { status: 500 }
      );
    }

    console.log(`[Storage] ✅ 图片保存成功: ${uploadResult.url}`);

    // 6. 返回结果
    return NextResponse.json({
      success: true,
      data: {
        r2Url: uploadResult.url, // R2 的永久访问地址
        key: uploadResult.key, // 在 R2 中的完整路径
        originalUrl: imageUrl, // 原始临时地址
        metadata: {
          ...metadata,
          savedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error: any) {
    console.error('[Storage] 保存图片异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '保存图片时发生未知错误',
      },
      { status: 500 }
    );
  }
}

