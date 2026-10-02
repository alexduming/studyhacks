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
 * Novita AI 配置
 * @docs https://novita.ai/
 * 
 * 非程序员解释：
 * - Novita AI 是一个性价比极高的AI图片生成平台
 * - 价格比Replicate便宜30-50%
 * - 支持FLUX、SDXL等多种模型和分辨率
 */
export interface NovitaConfigs extends AIConfigs {
  apiKey: string;
}

/**
 * Novita AI Provider
 * @docs https://novita.ai/docs
 * 
 * 非程序员解释：
 * - 这个类负责与Novita AI API通信
 * - 作为第二层托底服务，价格最便宜
 */
export class NovitaProvider implements AIProvider {
  // 提供商名称
  readonly name = 'novita';
  
  // 提供商配置
  configs: NovitaConfigs;

  // API基础URL
  private baseUrl = 'https://api.novita.ai/v3';

  // 初始化提供商
  constructor(configs: NovitaConfigs) {
    this.configs = configs;
  }

  /**
   * 生成图片
   * 非程序员解释：
   * - 这个方法发送图片生成请求到Novita AI
   * - 支持多种模型和分辨率（512px-2048px）
   * - API是异步的，需要轮询查询结果
   */
  async generate({
    params,
  }: {
    params: AIGenerateParams;
  }): Promise<AITaskResult> {
    // 只支持图片生成
    if (params.mediaType !== AIMediaType.IMAGE) {
      throw new Error('Novita AI only supports image generation');
    }

    try {
      // 从options中获取图片参数
      const {
        width = 1024,
        height = 1024,
        image_num = 1,
        steps = 20,
        guidance_scale = 7.5,
      } = params.options || {};

      // 准备请求体
      const requestBody = {
        model_name: params.model || 'flux1-dev-fp8_v2.0',
        prompt: params.prompt,
        width,
        height,
        image_num,
        steps,
        guidance_scale,
        seed: -1, // 随机种子
      };

      console.log('🔄 Novita AI - 发送生成请求:', {
        model: requestBody.model_name,
        prompt: params.prompt.substring(0, 100) + '...',
        width,
        height,
      });

      // 调用Novita AI API
      const response = await fetch(`${this.baseUrl}/async/txt2img`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Novita AI API 错误:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
        });
        throw new Error(
          `Novita AI API error: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const result = await response.json();
      
      console.log('✅ Novita AI - 任务创建成功, taskId:', result.task_id);

      // Novita是异步API，返回任务ID
      return {
        taskStatus: AITaskStatus.PENDING,
        taskId: result.task_id,
        taskInfo: {
          status: 'pending',
        },
        taskResult: result,
      };
    } catch (error: any) {
      console.error('❌ Novita AI - 生成失败:', error);
      
      return {
        taskStatus: AITaskStatus.FAILED,
        taskId: `novita-error-${Date.now()}`,
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
   * - Novita AI是异步API，需要轮询查询结果
   * - 当任务完成后，会返回图片URL
   */
  async query({ taskId }: { taskId: string }): Promise<AITaskResult> {
    try {
      const response = await fetch(`${this.baseUrl}/async/task-result`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.configs.apiKey}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Novita AI query error: ${response.status} ${errorText}`
        );
      }

      const result = await response.json();
      
      // 根据任务状态返回结果
      if (result.task.status === 'TASK_STATUS_SUCCEED') {
        const images: AIImage[] = [];
        
        if (result.images && Array.isArray(result.images)) {
          for (const image of result.images) {
            if (image.image_url) {
              images.push({
                imageUrl: image.image_url,
              });
            }
          }
        }

        console.log('✅ Novita AI - 任务完成，返回', images.length, '张图片');

        return {
          taskStatus: AITaskStatus.SUCCESS,
          taskId,
          taskInfo: {
            images,
            status: 'completed',
          },
          taskResult: result,
        };
      } else if (result.task.status === 'TASK_STATUS_FAILED') {
        console.error('❌ Novita AI - 任务失败:', result.task.reason);
        
        return {
          taskStatus: AITaskStatus.FAILED,
          taskId,
          taskInfo: {
            status: 'failed',
            errorMessage: result.task.reason,
          },
          taskResult: result,
        };
      } else {
        // 任务仍在处理中
        return {
          taskStatus: AITaskStatus.PENDING,
          taskId,
          taskInfo: {
            status: 'pending',
          },
          taskResult: result,
        };
      }
    } catch (error: any) {
      console.error('❌ Novita AI - 查询失败:', error);
      
      return {
        taskStatus: AITaskStatus.FAILED,
        taskId,
        taskInfo: {
          status: 'failed',
          errorMessage: error.message,
        },
      };
    }
  }

  /**
   * 获取支持的模型列表
   * 非程序员解释：
   * - 这些是Novita AI支持的图片生成模型
   * - flux1-dev-fp8: 高质量FLUX模型（推荐）
   * - sdxl: 经典的Stable Diffusion XL模型
   */
  static getSupportedModels() {
    return [
      {
        id: 'flux1-dev-fp8_v2.0',
        name: 'FLUX.1 Dev FP8',
        description: '高质量FLUX模型（推荐）',
        maxResolution: 2048,
      },
      {
        id: 'flux1-schnell-fp8_v2.0',
        name: 'FLUX.1 Schnell FP8',
        description: '快速FLUX模型',
        maxResolution: 2048,
      },
      {
        id: 'sdxl_v1.0',
        name: 'Stable Diffusion XL',
        description: '经典SDXL模型',
        maxResolution: 1024,
      },
    ];
  }
}

