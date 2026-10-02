import { 
  AIManager, 
  KieProvider, 
  ReplicateProvider,
  TogetherProvider,
  NovitaProvider,
} from '@/extensions/ai';
import { Configs, getAllConfigs } from '@/shared/models/config';

/**
 * get ai manager with configs
 * 
 * 非程序员解释：
 * - 这个函数根据配置创建AI管理器
 * - 支持多个AI提供商（KIE、Replicate、Together、Novita）
 * - 可以实现自动降级：如果一个服务失败，自动尝试下一个
 */
export function getAIManagerWithConfigs(configs: Configs) {
  const aiManager = new AIManager();

  // KIE - 主要服务
  if (configs.kie_api_key) {
    aiManager.addProvider(
      new KieProvider({
        apiKey: configs.kie_api_key,
      }),
      true // 设为默认提供商
    );
  }

  // Replicate - 托底服务1（稳定可靠）
  if (configs.replicate_api_token) {
    aiManager.addProvider(
      new ReplicateProvider({
        apiToken: configs.replicate_api_token,
      })
    );
  }

  // Together AI - 托底服务2（快速便宜）
  if (configs.together_api_key) {
    aiManager.addProvider(
      new TogetherProvider({
        apiKey: configs.together_api_key,
      })
    );
  }

  // Novita AI - 托底服务3（最便宜）
  if (configs.novita_api_key) {
    aiManager.addProvider(
      new NovitaProvider({
        apiKey: configs.novita_api_key,
      })
    );
  }

  return aiManager;
}

/**
 * global ai service
 */
let aiService: AIManager | null = null;

/**
 * get ai service manager
 */
export async function getAIService(): Promise<AIManager> {
  if (true) {
    const configs = await getAllConfigs();
    aiService = getAIManagerWithConfigs(configs);
  }
  return aiService;
}
