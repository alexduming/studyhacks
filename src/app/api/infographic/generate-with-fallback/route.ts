import { NextRequest, NextResponse } from 'next/server';
import { getUserInfo } from '@/shared/models/user';
import { consumeCredits, getRemainingCredits } from '@/shared/models/credit';
import { getAllConfigs } from '@/shared/models/config';

// 使用 Node.js 运行时，保证可以安全调用外部 API 并使用环境变量
export const runtime = 'nodejs';

/**
 * 多提供商图片生成API（带自动降级）
 * 
 * 非程序员解释：
 * - 这个接口实现了"托底服务"功能
 * - 首先尝试使用KIE生成图片
 * - 如果KIE失败或不稳定，自动切换到Replicate
 * - 如果Replicate也失败，尝试Together AI
 * - 如果Together AI也失败，最后尝试Novita AI
 * - 这样可以大大提高生成成功率
 * 
 * 降级策略：
 * KIE (主服务) → Replicate (托底1) → Together AI (托底2) → Novita AI (托底3)
 */

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';

interface GenerateParams {
  content: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
}

/**
 * 尝试使用KIE生成（nano-banana-pro）
 */
async function tryGenerateWithKie(
  params: GenerateParams,
  apiKey: string
): Promise<{ success: boolean; taskId?: string; imageUrls?: string[]; error?: string }> {
  try {
    console.log('🔄 尝试使用 KIE (nano-banana-pro) 生成...');
    
    const prompt = `Create an educational infographic explaining the provided file or text. You select some typical visual elements. Style: Flat vector. Labels in the language the same as provided information.\n\nContent:\n${params.content}`;

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
 * 尝试使用Replicate生成（FLUX模型）
 */
async function tryGenerateWithReplicate(
  params: GenerateParams,
  apiToken: string
): Promise<{ success: boolean; taskId?: string; imageUrls?: string[]; error?: string }> {
  try {
    console.log('🔄 尝试使用 Replicate (FLUX) 生成...');
    
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
        const scale = 4096 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      } else {
        const scale = 1024 / Math.max(w, h);
        width = Math.round(w * scale);
        height = Math.round(h * scale);
      }
    }

    const Replicate = require('replicate').default;
    const replicate = new Replicate({ auth: apiToken });

    const output = await replicate.run(
      'black-forest-labs/flux-schnell',
      {
        input: {
          prompt,
          width,
          height,
          num_outputs: 1,
        },
      }
    );

    console.log('✅ Replicate 生成成功');
    
    return { 
      success: true, 
      taskId: `replicate-${Date.now()}`,
      imageUrls: Array.isArray(output) ? output : [output],
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
): Promise<{ success: boolean; taskId?: string; imageUrls?: string[]; error?: string }> {
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

    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn('⚠️ Together AI 请求失败:', response.status, errorText);
      return { success: false, error: `Together AI error: ${response.status}` };
    }

    const result = await response.json();
    const imageUrls = result.data?.map((item: any) => item.url).filter(Boolean) || [];

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
): Promise<{ success: boolean; taskId?: string; imageUrls?: string[]; error?: string }> {
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
    const requiredCredits = 3;

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

    // 降级策略：依次尝试各个提供商
    const providers = [
      { 
        name: 'KIE', 
        key: configs.kie_api_key,
        envKey: process.env.KIE_NANO_BANANA_PRO_KEY,
        fn: tryGenerateWithKie 
      },
      { 
        name: 'Replicate', 
        key: configs.replicate_api_token,
        envKey: process.env.REPLICATE_API_TOKEN,
        fn: tryGenerateWithReplicate 
      },
      { 
        name: 'Together AI', 
        key: configs.together_api_key,
        envKey: process.env.TOGETHER_API_KEY,
        fn: tryGenerateWithTogether 
      },
      { 
        name: 'Novita AI', 
        key: configs.novita_api_key,
        envKey: process.env.NOVITA_API_KEY,
        fn: tryGenerateWithNovita 
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

