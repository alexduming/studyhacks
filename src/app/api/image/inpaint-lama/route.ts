import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120; // KIE 任务可能需要更长时间

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface InpaintRequest {
  imageUrl: string;
  textBoxes: BoundingBox[];
  imageSize: { width: number; height: number };
  /** OCR 识别出的文本内容，用于构建精确移除提示词 */
  ocrTexts?: string[];
}

interface InpaintResponse {
  success: boolean;
  imageUrl: string;
  error?: string;
  duration?: number;
}

// KIE API 配置
const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';
const KIE_CREATE_ENDPOINT = 'https://api.kie.ai/api/v1/jobs/createTask';
const KIE_QUERY_ENDPOINT = 'https://api.kie.ai/api/v1/jobs/recordInfo';

/**
 * 背景文字擦除 API - 使用 KIE Nano-Banana
 *
 * 优势：
 * - 效果出色：Google 最新 Gemini 图像编辑模型
 * - 无需 mask：使用自然语言指令
 * - 智能填充：自动理解上下文并填充背景
 * - 已验证配置：KIE 是 slides 功能的托底服务
 *
 * 文档：https://kie.ai/
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<InpaintResponse>> {
  console.log(
    '[INPAINT-KIE] ========== 开始 KIE Nano-Banana 背景清理 =========='
  );
  const startTime = Date.now();

  let requestBody: InpaintRequest;
  try {
    requestBody = (await request.json()) as InpaintRequest;
  } catch (parseError) {
    console.error('[INPAINT-KIE] ❌ 请求体解析失败:', parseError);
    return NextResponse.json(
      {
        success: false,
        imageUrl: '',
        error: '请求体解析失败',
      },
      { status: 400 }
    );
  }

  // 移除了未使用的 textBoxes
  const { imageUrl, ocrTexts } = requestBody;

  console.log('[INPAINT-KIE] 输入参数:', {
    imageUrlLength: imageUrl?.length || 0,
    imageUrlPreview: imageUrl?.substring(0, 80),
    textBoxesCount: requestBody.textBoxes?.length || 0,
    ocrTextsCount: ocrTexts?.length || 0,
  });

  try {
    if (!imageUrl) {
      return NextResponse.json(
        {
          success: false,
          imageUrl: '',
          error: '未提供图片 URL',
        },
        { status: 400 }
      );
    }

    // 检查 KIE API Key
    if (!KIE_API_KEY) {
      console.error('[INPAINT-KIE] ❌ KIE_NANO_BANANA_PRO_KEY 未配置');
      return NextResponse.json(
        {
          success: false,
          imageUrl: imageUrl,
          error: 'KIE_NANO_BANANA_PRO_KEY 未配置',
        },
        { status: 500 }
      );
    }

    console.log(`[INPAINT-KIE] ✅ 开始清理图片中的文字...`);

    // Nano-Banana-Edit 使用自然语言指令
    // 如果有 OCR 文本，构建精确的移除提示词；否则使用通用提示词
    let prompt: string;

    if (ocrTexts && ocrTexts.length > 0) {
      // 🎯 精确模式：基于 OCR 识别结果构建提示词
      // 1. 数据清洗：去重、去除空白、去除单字符（避免误删线条/图形）
      const uniqueTexts = [...new Set(ocrTexts)]
        .map((t) => t.trim())
        .filter((t) => t.length > 1) // 过滤掉单字符，防止误删图形元素
        .slice(0, 100); // 增加处理数量上限

      // 构建要移除的文本列表
      const textList = uniqueTexts.map((t) => `"${t}"`).join(', ');

      // 2. 构建强化版 Prompt
      // 策略变化：
      // - 强调 "Visual Preservation" (视觉保留)
      // - 结合 "All Text" 通用指令和 "Specific List" 枚举指令
      prompt = `TASK: Intelligent Text Removal
OBJECTIVE: Remove text while strictly preserving all underlying graphics, diagrams, and background textures.

TARGETS TO REMOVE:
1. All detected text content in the image.
2. Specifically these identified text elements: ${textList}

STRICT CONSTRAINTS (MUST FOLLOW):
- PROTECT GRAPHICS: Do NOT touch any lines, arrows, icons, logos, shapes, or illustrations.
- BACKGROUND RESTORATION: Inpaint the removed text areas to seamlessly match the surrounding background texture/color.
- PRECISION: If text overlaps with a graphic, remove ONLY the pixels belonging to the text.
- NO HALLUCINATIONS: Do not add new objects or change the image style.

ACTION:
Detect all text regions -> Mask them internally -> Inpaint using context -> Output clean image.`;

      console.log(
        `[INPAINT-KIE] 精确模式: 移除 ${uniqueTexts.length} 个文本元素 (已过滤短字符)`
      );
    } else {
      // 没有 OCR 结果，直接返回原图
      console.log('[INPAINT-KIE] 无 OCR 结果，跳过背景清理');
      const duration = Date.now() - startTime;
      return NextResponse.json({
        success: true,
        imageUrl: imageUrl,
        duration,
      });
    }

    console.log('[INPAINT-KIE] 正在调用 KIE API (nano-banana)...');
    console.log('[INPAINT-KIE] Prompt:', prompt.substring(0, 200) + '...');

    // 1. 创建任务
    const createResponse = await fetch(KIE_CREATE_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify({
        model: 'google/nano-banana-edit',
        input: {
          prompt: prompt,
          image_urls: [imageUrl],
          output_format: 'png',
        },
      }),
    });

    const createData = await createResponse.json();
    console.log(
      '[INPAINT-KIE] 创建任务响应:',
      JSON.stringify(createData, null, 2).substring(0, 1000)
    );

    if (createData.code !== 200 || !createData.data?.taskId) {
      const errorMsg =
        createData.message ||
        createData.msg ||
        createData.error ||
        JSON.stringify(createData);
      console.error(
        '[INPAINT-KIE] 任务创建失败，完整响应:',
        JSON.stringify(createData, null, 2)
      );
      throw new Error(`创建 KIE 任务失败: ${errorMsg}`);
    }

    const taskId = createData.data.taskId;
    console.log('[INPAINT-KIE] ✅ 任务创建成功，TaskId:', taskId);

    // 2. 轮询查询任务状态
    let resultUrl: string | null = null;
    const maxPollingTime = 90000; // 最长等待90秒
    const pollingInterval = 2000; // 每2秒查询一次
    let pollingStart = Date.now();

    while (Date.now() - pollingStart < maxPollingTime) {
      await new Promise((resolve) => setTimeout(resolve, pollingInterval));

      const queryResponse = await fetch(
        `${KIE_QUERY_ENDPOINT}?taskId=${taskId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${KIE_API_KEY}`,
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }
      );

      const queryData = await queryResponse.json();
      console.log('[INPAINT-KIE] 查询状态:', queryData.data?.state);

      if (queryData.data?.state === 'success') {
        // 解析结果
        let results: string[] = [];
        try {
          if (typeof queryData.data.resultJson === 'string') {
            const parsed = JSON.parse(queryData.data.resultJson);
            results = parsed.resultUrls || [];
          } else if (queryData.data.resultJson?.resultUrls) {
            results = queryData.data.resultJson.resultUrls;
          }
        } catch (e) {
          console.warn('[INPAINT-KIE] 解析 resultJson 失败:', e);
        }

        if (results.length > 0) {
          resultUrl = results[0];
          console.log('[INPAINT-KIE] ✅ 任务成功，结果URL:', resultUrl);
          break;
        } else {
          throw new Error('KIE 任务成功但没有返回图片 URL');
        }
      } else if (queryData.data?.state === 'fail') {
        throw new Error(
          'KIE 任务失败: ' + (queryData.data.errorMessage || '未知错误')
        );
      }

      // 继续轮询
      console.log(
        `[INPAINT-KIE] 任务处理中... (已等待 ${Math.round(
          (Date.now() - pollingStart) / 1000
        )}s)`
      );
    }

    if (!resultUrl) {
      throw new Error('KIE 任务超时（超过90秒）');
    }

    const duration = Date.now() - startTime;
    console.log(`[INPAINT-KIE] ✅ 处理完成，耗时: ${duration}ms`);
    console.log('[INPAINT-KIE] ========== 背景清理完成 ==========');

    return NextResponse.json({
      success: true,
      imageUrl: resultUrl,
      duration,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[INPAINT-KIE] ❌ 错误:', error);
    console.error(
      '[INPAINT-KIE] 错误详情:',
      error instanceof Error ? error.message : String(error)
    );

    // 优雅降级：返回原图
    return NextResponse.json({
      success: false,
      imageUrl: requestBody.imageUrl || '',
      error: error instanceof Error ? error.message : '背景清理失败',
      duration,
    });
  }
}
