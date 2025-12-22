import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import { fal } from '@fal-ai/client';

import { AIMediaType, AITaskStatus } from '@/extensions/ai';
import { createAITaskRecordOnly } from '@/shared/models/ai_task';
import { getAllConfigs } from '@/shared/models/config';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

/**
 * 多提供商图片生成API（带自动降级）
 *
 * 非程序员解释：
 * - 这个接口实现了"托底服务"功能
 * - 首先尝试使用 Replicate (google/nano-banana-pro) 生成图片（主力）
 * - 如果 Replicate 失败或不稳定，自动切换到 KIE（托底）
 * - 这样可以大大提高生成成功率
 *
 * 降级策略：
 * Replicate (主服务) → KIE (托底服务)
 */

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

interface GenerateParams {
  content: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
}

/**
 * 尝试使用FAL生成（nano-banana-pro）
 */
async function tryGenerateWithFal(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 FAL (nano-banana-pro) 生成...');

    // 配置 FAL Client
    fal.config({
      credentials: apiKey,
    });

    const prompt = `Create an educational infographic explaining the provided file or text. You select some typical visual elements. Style: Flat vector.
IMPORTANT: The text labels inside the infographic MUST be in the SAME LANGUAGE as the provided content.
- If the content is in English, use English labels.
- If the content is in Chinese, use Chinese labels.
- If the content is in another language, use that language.
Do NOT translate the content.

Content:
${params.content}`;

    // 映射宽高比到 FAL (nano-banana-pro) 支持的值
    // 支持的值: "16:9" | "4:3" | "1:1" | "9:16" | "3:4" | "3:2" | "2:3" | "5:4" | "4:5" | "21:9"
    let falAspectRatio = '1:1';
    switch (params.aspectRatio) {
      case '16:9':
        falAspectRatio = '16:9';
        break;
      case '9:16':
        falAspectRatio = '9:16';
        break;
      case '4:3':
        falAspectRatio = '4:3';
        break;
      case '3:4':
        falAspectRatio = '3:4';
        break;
      case '1:1':
      default:
        falAspectRatio = '1:1';
        break;
    }

    const input = {
      prompt,
      num_images: 1,
      aspect_ratio: falAspectRatio,
      output_format: 'png',
      resolution: params.resolution || '2K', // 支持 1K, 2K, 4K
    };

    console.log('[FAL] 请求参数:', {
      model: 'fal-ai/nano-banana-pro',
      prompt: input.prompt.substring(0, 100) + '...',
    });

    const startTime = Date.now();

    // 使用 subscribe 等待结果
    const result: any = await fal.subscribe('fal-ai/nano-banana-pro', {
      input: input as any,
      logs: true,
      onQueueUpdate: (update: any) => {
        if (update.status === 'IN_PROGRESS') {
          // console.log(update.logs.map((log: any) => log.message));
        }
      },
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FAL] API 调用完成，耗时: ${elapsed}s`);

    if (
      !result.data ||
      !result.data.images ||
      result.data.images.length === 0
    ) {
      throw new Error('FAL 未返回图片');
    }

    const imageUrl = result.data.images[0].url;
    console.log('✅ FAL 生成成功，URL:', imageUrl);

    // 自动保存到 R2
    let finalImageUrl = imageUrl;
    try {
      // 动态导入以避免循环依赖或在某些环境中出错
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[FAL] 开始保存图片到 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = imageUrl.includes('.jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `infographic/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: imageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          console.log(`[FAL] ✅ 图片保存成功: ${uploadResult.url}`);
          finalImageUrl = uploadResult.url;
        }
      }
    } catch (saveError) {
      console.error('[FAL] 保存图片异常:', saveError);
    }

    return {
      success: true,
      taskId: `fal-${result.requestId || Date.now()}`,
      imageUrls: [finalImageUrl],
    };
  } catch (error: any) {
    console.warn('⚠️ FAL 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用KIE生成（nano-banana-pro）
 */
async function tryGenerateWithKie(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 KIE (nano-banana-pro) 生成...');

    const prompt = `Create an educational infographic explaining the provided file or text. You select some typical visual elements. Style: Flat vector.
IMPORTANT: The text labels inside the infographic MUST be in the SAME LANGUAGE as the provided content.
- If the content is in English, use English labels.
- If the content is in Chinese, use Chinese labels.
- If the content is in another language, use that language.
Do NOT translate the content.

Content:
${params.content}`;

    const payload = {
      model: 'nano-banana-pro',
      input: {
        prompt,
        aspect_ratio: params.aspectRatio || '1:1',
        resolution: params.resolution || '1K',
        output_format: params.outputFormat || 'png',
      },
    };

    const resp = await fetch(`${KIE_BASE_URL}/jobs/createTask`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.warn('⚠️ KIE 请求失败:', resp.status, text);
      return { success: false, error: `KIE API error: ${resp.status}` };
    }

    const data = await resp.json();

    if (data.code !== 200 || !data.data?.taskId) {
      console.warn('⚠️ KIE 返回错误:', data);
      return { success: false, error: data.message || 'Unknown error' };
    }

    console.log('✅ KIE 任务创建成功, taskId:', data.data.taskId);
    return { success: true, taskId: data.data.taskId };
  } catch (error: any) {
    console.warn('⚠️ KIE 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Replicate生成（google/nano-banana-pro模型）
 */
async function tryGenerateWithReplicate(
  params: GenerateParams,
  apiToken: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 Replicate (google/nano-banana-pro) 生成...');

    const prompt = `Create an educational infographic explaining the provided file or text. You select some typical visual elements. Style: Flat vector.
IMPORTANT: The text labels inside the infographic MUST be in the SAME LANGUAGE as the provided content.
- If the content is in English, use English labels.
- If the content is in Chinese, use Chinese labels.
- If the content is in another language, use that language.
Do NOT translate the content.

Content:
${params.content}`;

    const Replicate = require('replicate');
    const replicate = new Replicate({ auth: apiToken });

    // google/nano-banana-pro 的参数结构（与 KIE 类似）
    const input: any = {
      prompt,
      aspect_ratio: params.aspectRatio || '1:1',
      resolution: params.resolution || '1K', // 1K/2K/4K
      output_format: params.outputFormat || 'png',
    };

    console.log('[Replicate] 请求参数:', {
      model: 'google/nano-banana-pro',
      input: {
        ...input,
        prompt: input.prompt.substring(0, 100) + '...',
      },
    });

    // ✅ 改为异步模式：创建预测任务但不等待完成（避免 Vercel 超时）
    // 说明：
    // - 使用 predictions.create() 立即返回 taskId，不会阻塞 Serverless 函数
    // - 前端将通过轮询 query API 查询任务状态
    // - 这样可以避免超过 Vercel 的 10 秒超时限制
    const prediction = await replicate.predictions.create({
      model: 'google/nano-banana-pro',
      input,
    });

    console.log('[Replicate] 任务创建成功, predictionId:', prediction.id);
    console.log('[Replicate] 任务状态:', prediction.status);

    // ✅ 返回 taskId，前端将通过轮询查询任务状态
    // 注意：这里不等待生成完成，避免超过 Vercel 10 秒超时限制
    return {
      success: true,
      taskId: prediction.id, // 返回 Replicate 的 prediction ID
      imageUrls: undefined, // 异步模式下不立即返回图片，需要前端轮询查询
    };
  } catch (error: any) {
    console.warn('⚠️ Replicate 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Together AI生成（FLUX模型）
 */
async function tryGenerateWithTogether(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 Together AI (FLUX) 生成...');

    const prompt = `Educational infographic, flat vector style: ${params.content}`;

    // 解析分辨率
    let width = 1024;
    let height = 1024;
    if (params.aspectRatio) {
      const [w, h] = params.aspectRatio.split(':').map(Number);
      if (params.resolution === '2K') {
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else if (params.resolution === '4K') {
        // Together AI不支持4K，降级到2K
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else {
        const scale = 1024 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    const requestBody = {
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt,
      width,
      height,
      steps: 4,
      n: 1,
    };

    const response = await fetch(
      'https://api.together.xyz/v1/images/generations',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Together AI 请求失败:', response.status, errorText);
      return { success: false, error: `Together AI error: ${response.status}` };
    }

    const result = await response.json();
    const imageUrls =
      result.data?.map((item: any) => item.url).filter(Boolean) || [];

    console.log('✅ Together AI 生成成功，返回', imageUrls.length, '张图片');

    return {
      success: true,
      taskId: result.id || `together-${Date.now()}`,
      imageUrls,
    };
  } catch (error: any) {
    console.warn('⚠️ Together AI 异常:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 尝试使用Novita AI生成（FLUX模型）
 */
async function tryGenerateWithNovita(
  params: GenerateParams,
  apiKey: string
): Promise<{
  success: boolean;
  taskId?: string;
  imageUrls?: string[];
  error?: string;
}> {
  try {
    console.log('🔄 尝试使用 Novita AI (FLUX) 生成...');

    const prompt = `Educational infographic, flat vector style: ${params.content}`;

    // 解析分辨率
    let width = 1024;
    let height = 1024;
    if (params.aspectRatio) {
      const [w, h] = params.aspectRatio.split(':').map(Number);
      if (params.resolution === '2K') {
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else if (params.resolution === '4K') {
        // Novita AI最大支持2048px
        const scale = 2048 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else {
        const scale = 1024 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    const requestBody = {
      model_name: 'flux1-schnell-fp8_v2.0',
      prompt,
      width,
      height,
      image_num: 1,
      steps: 20,
      seed: -1,
    };

    const response = await fetch('https://api.novita.ai/v3/async/txt2img', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Novita AI 请求失败:', response.status, errorText);
      return { success: false, error: `Novita AI error: ${response.status}` };
    }

    const result = await response.json();

    console.log('✅ Novita AI 任务创建成功, taskId:', result.task_id);

    return {
      success: true,
      taskId: result.task_id,
    };
  } catch (error: any) {
    console.warn('⚠️ Novita AI 异常:', error.message);
    return { success: false, error: error.message };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      content,
      aspectRatio = '1:1',
      resolution = '1K',
      outputFormat = 'png',
    } = body || {};

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        { success: false, error: '缺少用于生成信息图的文本内容' },
        { status: 400 }
      );
    }

    // 积分验证和消耗
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please sign in to use AI features',
        },
        { status: 401 }
      );
    }

    const remainingCredits = await getRemainingCredits(user.id);
    // 动态计算积分消耗：4K=12积分，其他(1K/2K)=6积分
    const requiredCredits = resolution === '4K' ? 12 : 6;

    if (remainingCredits < requiredCredits) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient credits. Required: ${requiredCredits}, Available: ${remainingCredits}`,
          insufficientCredits: true,
          requiredCredits,
          remainingCredits,
        },
        { status: 402 }
      );
    }

    // 消耗积分
    try {
      await consumeCredits({
        userId: user.id,
        credits: requiredCredits,
        scene: 'ai_infographic',
        description: `AI Infographic - Generate with fallback`,
        metadata: JSON.stringify({ aspectRatio, resolution, outputFormat }),
      });
    } catch (creditError: any) {
      console.error('Failed to consume credits:', creditError);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to consume credits. Please try again.',
        },
        { status: 500 }
      );
    }

    // 获取配置
    const configs = await getAllConfigs();

    const params: GenerateParams = {
      content,
      aspectRatio,
      resolution,
      outputFormat,
    };

    // 降级策略：依次尝试各个提供商（FAL 主力 → KIE 托底 → Replicate 最终托底）
    const providers = [
      {
        name: 'FAL',
        key: configs.fal_key, // 优先从数据库配置获取
        envKey: process.env.FAL_KEY, // 回退到环境变量
        fn: tryGenerateWithFal,
      },
      {
        name: 'KIE',
        key: configs.kie_api_key,
        envKey: process.env.KIE_NANO_BANANA_PRO_KEY,
        fn: tryGenerateWithKie,
      },
      {
        name: 'Replicate',
        key: configs.replicate_api_token,
        envKey: process.env.REPLICATE_API_TOKEN,
        fn: tryGenerateWithReplicate,
      },
    ];

    const errors: string[] = [];

    for (const provider of providers) {
      const apiKey = provider.key || provider.envKey;

      if (!apiKey) {
        console.log(`⏭️ 跳过 ${provider.name}（未配置API Key）`);
        continue;
      }

      console.log(`\n🎯 尝试提供商: ${provider.name}`);

      const result = await provider.fn(params, apiKey);

      if (result.success) {
        console.log(`✅ ${provider.name} 生成成功！`);

        // --- 记录到通用 AI 任务表（ai_task），方便在 /library/infographics 里统一展示 ---
        // 非程序员解释：
        // - 这里不会再次扣积分（上面已经调用过 consumeCredits），只是在 ai_task 这张“任务流水表”里记一笔
        // - 以后不管是 Infographic、PPT 还是别的图片任务，都可以用一套通用的历史列表组件来查看
        try {
          // 简单归一化一下"模型名称"，方便后续筛选/统计（只是记录用途，不影响实际调用）
          const modelName =
            provider.name === 'KIE'
              ? 'nano-banana-pro'
              : provider.name === 'Replicate'
                ? 'google/nano-banana-pro'
                : 'unknown';

          // 如果已经直接拿到了图片 URL（同步接口），可以直接把结果标记为 SUCCESS；
          // 如果只是拿到了 taskId（异步接口），先记录为 PENDING，后续有需要再扩展为回调/轮询更新。
          const hasImages =
            Array.isArray(result.imageUrls) && result.imageUrls.length > 0;
          const taskStatus = hasImages
            ? AITaskStatus.SUCCESS
            : AITaskStatus.PENDING;

          await createAITaskRecordOnly({
            // 必填字段：谁、什么类型、用哪个提供商
            userId: user.id,
            mediaType: AIMediaType.IMAGE,
            provider: provider.name,
            model: modelName,
            // 为了避免把整篇原文塞进表里，这里只存一个简要描述；
            // 真正的全文内容依然只保留在前端/你的原始文件里。
            prompt: `Infographic from study content (len=${content.length})`,
            options: JSON.stringify({
              aspectRatio,
              resolution,
              outputFormat,
            }),
            scene: 'ai_infographic',
            costCredits: requiredCredits,
            status: taskStatus,
            taskId: result.taskId || null,
            taskInfo: hasImages
              ? JSON.stringify({
                  status: 'SUCCESS',
                })
              : null,
            taskResult:
              hasImages && result.imageUrls
                ? JSON.stringify({
                    imageUrls: result.imageUrls,
                  })
                : null,
          });
        } catch (logError) {
          // 记录历史失败不影响用户正常使用，只打印日志方便排查
          console.error(
            '[Infographic] Failed to create ai_task record:',
            logError
          );
        }

        return NextResponse.json({
          success: true,
          taskId: result.taskId,
          imageUrls: result.imageUrls, // 如果是同步API，直接返回图片URL
          provider: provider.name,
          fallbackUsed: provider.name !== 'KIE', // 是否使用了托底服务
        });
      } else {
        errors.push(`${provider.name}: ${result.error}`);
        console.log(`❌ ${provider.name} 失败，尝试下一个提供商...`);
      }
    }

    // 所有提供商都失败
    console.error('❌ 所有提供商都失败:', errors);

    return NextResponse.json(
      {
        success: false,
        error: '所有图片生成服务都暂时不可用，请稍后重试',
        details: errors,
      },
      { status: 500 }
    );
  } catch (error) {
    console.error('Generate with fallback error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : '生成信息图时出现错误，请稍后重试。',
      },
      { status: 500 }
    );
  }
}
