import {
  AIConfigs,
  AIGenerateParams,
  AIMediaType,
  AIProvider,
  AITaskResult,
  AITaskStatus,
  AIImage,
} from '.';

/**
 * Together AI 配置
 * @docs https://docs.together.ai/
 * 
 * 非程序员解释：
 * - Together AI 是一个高性价比的AI图片生成平台
 * - 价格比FAL便宜很多，速度也很快
 * - 支持FLUX、SDXL等热门模型
 */
export interface TogetherConfigs extends AIConfigs {
  apiKey: string;
}

/**
 * Together AI Provider
 * @docs https://docs.together.ai/reference/images
 * 
 * 非程序员解释：
 * - 这个类负责与Together AI API通信
 * - 当KIE服务失败时，可以自动切换到这个服务
 */
export class TogetherProvider implements AIProvider {
  // 提供商名称
  readonly name = 'together';
  
  // 提供商配置
  configs: TogetherConfigs;

  // API基础URL
  private baseUrl = 'https://api.together.xyz/v1';

  // 初始化提供商
  constructor(configs: TogetherConfigs) {
    this.configs = configs;
  }

  /**
   * 生成图片
   * 非程序员解释：
   * - 这个方法发送图片生成请求到Together AI
   * - 支持多种FLUX和Stable Diffusion模型
   * - 支持自定义分辨率（宽度和高度）
   */
  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    // 只支持图片生成
    if (params.mediaType !== AIMediaType.IMAGE) {
      throw new Error('Together AI only supports image generation');
    }

    try {
      // 从options中获取图片参数
      const {
        width = 1024,
        height = 1024,
        steps = 4,
        n = 1,
      } = params.options || {};

      // 准备请求体
      const requestBody: any = {
        model: params.model || 'black-forest-labs/FLUX.1-schnell',
        prompt: params.prompt,
        width,
        height,
        steps,
        n,
      };

      console.log('🔄 Together AI - 发送生成请求:', {
        model: requestBody.model,
        prompt: params.prompt.substring(0, 100) + '...',
        width,
        height,
      });

      // 调用Together AI API
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Together AI API 错误:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(
          `Together AI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      
      console.log('✅ Together AI - 生成成功，返回', result.data?.length || 0, '张图片');

      // 转换为统一的图片格式
      const images: AIImage[] = [];
      if (result.data && Array.isArray(result.data)) {
        for (const item of result.data) {
          if (item.url || item.b64_json) {
            images.push({
              imageUrl: item.url || `data:image/png;base64,${item.b64_json}`,
            });
          }
        }
      }

      return {
        taskStatus: AITaskStatus.SUCCESS,
        taskId: result.id || `together-${Date.now()}`,
        taskInfo: {
          images,
          status: 'completed',
        },
        taskResult: result,
      };
    } catch (error: any) {
      console.error('❌ Together AI - 生成失败:', error);
      
      return {
        taskStatus: AITaskStatus.FAILED,
        taskId: `together-error-${Date.now()}`,
        taskInfo: {
          status: 'failed',
          errorMessage: error.message,
        },
      };
    }
  }

  /**
   * 查询任务状态
   * 非程序员解释：
   * - Together AI是同步API，直接返回结果，不需要轮询
   * - 这个方法保留是为了接口兼容性
   */
  async query({ taskId }: { taskId: string }): Promise<AITaskResult> {
    // Together AI是同步API，不需要轮询
    return {
      taskStatus: AITaskStatus.SUCCESS,
      taskId,
      taskInfo: {
        status: 'completed',
      },
    };
  }

  /**
   * 获取支持的模型列表
   * 非程序员解释：
   * - 这些是Together AI支持的图片生成模型
   * - FLUX.1-schnell: 最快最便宜（推荐作为托底）
   * - FLUX.1-dev: 质量更高但稍慢
   * - SDXL: 经典的Stable Diffusion XL模型
   */
  static getSupportedModels() {
    return [
      {
        id: 'black-forest-labs/FLUX.1-schnell',
        name: 'FLUX.1 Schnell',
        description: '快速生成，低成本（推荐）',
        maxResolution: 1440,
      },
      {
        id: 'black-forest-labs/FLUX.1-dev',
        name: 'FLUX.1 Dev',
        description: '高质量生成',
        maxResolution: 1440,
      },
      {
        id: 'stabilityai/stable-diffusion-xl-base-1.0',
        name: 'Stable Diffusion XL',
        description: '经典SDXL模型',
        maxResolution: 1024,
      },
    ];
  }
}

