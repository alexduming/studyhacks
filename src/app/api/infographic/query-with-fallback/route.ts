import { NextRequest, NextResponse } from 'next/server';
import { getAllConfigs } from '@/shared/models/config';
import { getStorageServiceWithConfigs } from '@/shared/services/storage';
import { getUserInfo } from '@/shared/models/user';
import { nanoid } from 'nanoid';
import { db } from '@/core/db';
import { aiTask } from '@/config/db/schema';
import { eq, and } from 'drizzle-orm';

export const runtime = 'nodejs';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

/**
 * 查询任务状态（支持多提供商）
 * 
 * 非程序员解释：
 * - 这个接口用于查询图片生成任务的状态
 * - 支持KIE、Replicate、Together AI、Novita AI
 * - 根据taskId的前缀判断使用哪个提供商
 */

/**
 * 查询KIE任务状态
 */
async function queryKieTask(
  taskId: string,
  apiKey: string
): Promise<{ success: boolean; status?: string; resultUrls?: string[]; error?: string }> {
  try {
    const resp = await fetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `KIE query error: ${resp.status}` };
    }

    const data = await resp.json();

    if (data.code !== 200) {
      return { 
        success: false, 
        error: data.message || data.msg || 'Unknown error' 
      };
    }

    const state = data.data?.state;
    const resultJson = data.data?.resultJson;

    let resultUrls: string[] = [];
    
    if (resultJson) {
      if (typeof resultJson === 'string') {
        try {
          const parsed = JSON.parse(resultJson);
          resultUrls = parsed.resultUrls || [];
        } catch (e) {
          console.warn('Failed to parse resultJson:', e);
        }
      } else if (resultJson.resultUrls) {
        resultUrls = resultJson.resultUrls;
      }
    }

    const status = state === 'success' ? 'SUCCESS' : state === 'fail' ? 'FAILED' : 'PENDING';

    return {
      success: true,
      status,
      resultUrls,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * 查询Replicate任务状态
 * 说明：现在 Replicate 也改为异步模式，需要查询 prediction 状态
 */
async function queryReplicateTask(
  predictionId: string,
  apiToken: string
): Promise<{ success: boolean; status?: string; resultUrls?: string[]; error?: string }> {
  try {
    const Replicate = require('replicate');
    const replicate = new Replicate({ auth: apiToken });

    // 查询 prediction 状态
    const prediction = await replicate.predictions.get(predictionId);

    console.log('[Replicate Query] 预测状态:', prediction.status);

    if (prediction.status === 'succeeded') {
      // 提取输出 URL
      let resultUrls: string[] = [];
      
      if (Array.isArray(prediction.output)) {
        resultUrls = prediction.output.filter((url: any) => 
          typeof url === 'string' && url.startsWith('http')
        );
      } else if (typeof prediction.output === 'string') {
        resultUrls = [prediction.output];
      }

      console.log('[Replicate Query] 提取的 URLs:', resultUrls);

      return {
        success: true,
        status: 'SUCCESS',
        resultUrls,
      };
    } else if (prediction.status === 'failed' || prediction.status === 'canceled') {
      return {
        success: true,
        status: 'FAILED',
        resultUrls: [],
      };
    } else {
      // starting, processing 等状态
      return {
        success: true,
        status: 'PENDING',
        resultUrls: [],
      };
    }
  } catch (error: any) {
    console.error('[Replicate Query] 错误:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 查询Novita任务状态
 */
async function queryNovitaTask(
  taskId: string,
  apiKey: string
): Promise<{ success: boolean; status?: string; resultUrls?: string[]; error?: string }> {
  try {
    const resp = await fetch(
      `https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      return { success: false, error: `Novita query error: ${resp.status}` };
    }

    const data = await resp.json();

    if (data.task?.status === 'TASK_STATUS_SUCCEED') {
      const resultUrls = data.images?.map((img: any) => img.image_url).filter(Boolean) || [];
      return {
        success: true,
        status: 'SUCCESS',
        resultUrls,
      };
    } else if (data.task?.status === 'TASK_STATUS_FAILED') {
      return {
        success: true,
        status: 'FAILED',
        resultUrls: [],
      };
    } else {
      return {
        success: true,
        status: 'PENDING',
        resultUrls: [],
      };
    }
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const taskId = searchParams.get('taskId');
    const provider = searchParams.get('provider');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少 taskId 参数' },
        { status: 400 }
      );
    }

    // 获取配置
    const configs = await getAllConfigs();

    // 根据provider或taskId前缀判断使用哪个提供商
    let result: any;

    if (provider === 'Together AI' || (!provider && taskId.startsWith('together-')) ||
        provider === 'FAL' || (!provider && taskId.startsWith('fal-'))) {
      // Together AI 和 FAL 是同步API，不需要查询
      return NextResponse.json({
        success: true,
        status: 'SUCCESS',
        results: [],
      });
    } else if (provider === 'Replicate' || (!provider && (taskId.startsWith('replicate-') || 
               (!taskId.includes('-') && taskId.length > 20)))) {
      // ✅ Replicate 异步查询
      // 说明：Replicate 的 predictionId 格式类似 "ufawqhfynnddngldkgtslldrkq"（无前缀）
      const apiToken = configs.replicate_api_token || process.env.REPLICATE_API_TOKEN;
      if (!apiToken) {
        return NextResponse.json(
          { success: false, error: 'Replicate API Token 未配置' },
          { status: 500 }
        );
      }
      result = await queryReplicateTask(taskId, apiToken);
    } else if (provider === 'Novita AI' || (!provider && taskId.startsWith('novita-'))) {
      // Novita AI异步API
      const apiKey = configs.novita_api_key || process.env.NOVITA_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'Novita API Key 未配置' },
          { status: 500 }
        );
      }
      result = await queryNovitaTask(taskId, apiKey);
    } else {
      // 默认使用KIE
      const apiKey = configs.kie_api_key || process.env.KIE_NANO_BANANA_PRO_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { success: false, error: 'KIE API Key 未配置' },
          { status: 500 }
        );
      }
      result = await queryKieTask(taskId, apiKey);
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // ✅ 新增：如果任务成功且有结果，自动保存到 R2
    let savedUrls: string[] = [];
    if (result.status === 'SUCCESS' && result.resultUrls && result.resultUrls.length > 0) {
      try {
        // 获取当前用户信息
        const user = await getUserInfo();
        
        // 检查 R2 是否配置
        if (user && configs.r2_bucket_name && configs.r2_access_key) {
          console.log(`[Infographic] 开始保存 ${result.resultUrls.length} 张图片到 R2`);
          
          const storageService = getStorageServiceWithConfigs(configs);
          
          // 并行保存所有图片
          const savePromises = result.resultUrls.map(async (imageUrl: string, index: number) => {
            try {
              const timestamp = Date.now();
              const randomId = nanoid(8);
              const fileExtension = imageUrl.includes('.jpg') || imageUrl.includes('.jpeg') 
                ? 'jpg' 
                : 'png';
              
              const fileName = `${timestamp}_${randomId}_${index}.${fileExtension}`;
              const storageKey = `infographic/${user.id}/${fileName}`;

              console.log(`[Infographic] 保存图片 ${index + 1}: ${storageKey}`);

              const uploadResult = await storageService.downloadAndUpload({
                url: imageUrl,
                key: storageKey,
                contentType: `image/${fileExtension}`,
                disposition: 'inline',
              });

              if (uploadResult.success && uploadResult.url) {
                console.log(`[Infographic] ✅ 图片 ${index + 1} 保存成功: ${uploadResult.url}`);
                return uploadResult.url;
              } else {
                console.warn(`[Infographic] ⚠️ 图片 ${index + 1} 保存失败: ${uploadResult.error}`);
                return imageUrl; // 失败时返回原始 URL
              }
            } catch (error: any) {
              console.error(`[Infographic] ❌ 图片 ${index + 1} 保存异常:`, error);
              return imageUrl; // 异常时返回原始 URL
            }
          });

          savedUrls = await Promise.all(savePromises);
          console.log(`[Infographic] 保存完成，成功 ${savedUrls.filter((url, i) => url !== result.resultUrls![i]).length}/${result.resultUrls.length} 张`);
          
          // ✅ 更新 ai_task 记录，保存 R2 URL
          try {
            // 根据 taskId 查找对应的 ai_task 记录
            const [existingTask] = await db()
              .select()
              .from(aiTask)
              .where(
                and(
                  eq(aiTask.taskId, taskId),
                  eq(aiTask.userId, user.id),
                  eq(aiTask.scene, 'ai_infographic')
                )
              )
              .limit(1);

            if (existingTask) {
              // 更新 taskResult 字段，保存 R2 URL
              await db()
                .update(aiTask)
                .set({
                  taskResult: JSON.stringify({
                    imageUrls: savedUrls,
                    originalUrls: result.resultUrls,
                    savedToR2: true,
                    savedAt: new Date().toISOString(),
                  }),
                  status: 'success',
                })
                .where(eq(aiTask.id, existingTask.id));

              console.log(`[Infographic] ✅ 已更新 ai_task 记录: ${existingTask.id}`);
            } else {
              console.log(`[Infographic] ⚠️ 未找到对应的 ai_task 记录: taskId=${taskId}`);
            }
          } catch (updateError: any) {
            console.error('[Infographic] 更新 ai_task 记录失败:', updateError);
          }
        } else {
          // R2 未配置或用户未登录，直接返回原始 URL
          savedUrls = result.resultUrls;
          if (!user) {
            console.log('[Infographic] 用户未登录，跳过 R2 保存');
          } else if (!configs.r2_bucket_name || !configs.r2_access_key) {
            console.log('[Infographic] R2 未配置，跳过保存');
          }
        }
      } catch (error: any) {
        console.error('[Infographic] 保存图片到 R2 失败:', error);
        // 保存失败不影响返回结果，使用原始 URL
        savedUrls = result.resultUrls;
      }
    } else {
      savedUrls = result.resultUrls || [];
    }

    return NextResponse.json({
      success: true,
      status: result.status,
      results: savedUrls,
    });
  } catch (error) {
    console.error('Query with fallback error:', error);
    return NextResponse.json(
      {
        success: false,
        error: process.env.NODE_ENV === 'development'
          ? (error as Error).message
          : '查询任务状态时出现错误',
      },
      { status: 500 }
    );
  }
}

