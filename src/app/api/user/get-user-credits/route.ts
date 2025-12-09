import { respData, respErr } from '@/shared/lib/resp';
import { getRemainingCredits } from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';

/**
 * 获取用户积分 API
 * 非程序员解释：
 * - 这个接口用于获取当前登录用户的剩余积分
 * - 如果用户未登录，返回 401 错误
 * - 如果遇到临时错误（如数据库连接问题），会返回 500 错误，但不会暴露详细错误信息
 */
export async function POST(req: Request) {
  try {
    // 获取用户信息（已包含错误处理和重试机制）
    const user = await getUserInfo();
    if (!user) {
      // 用户未登录或认证失败
      return respErr('no auth, please sign in');
    }

    // 获取剩余积分
    const credits = await getRemainingCredits(user.id);

    return respData({ remainingCredits: credits });
  } catch (e) {
    // 记录详细错误信息（仅在服务器日志中）
    const errorMessage =
      e instanceof Error ? e.message : String(e);
    const errorCode = (e as any)?.code || '';
    const statusCode = (e as any)?.statusCode || (e as any)?.status;

    // 只在开发环境显示详细错误
    if (process.env.NODE_ENV === 'development') {
      console.error('get user credits failed:', {
        message: errorMessage,
        code: errorCode,
        statusCode,
        error: e,
      });
    } else {
      // 生产环境：只记录简要错误信息
      console.error('get user credits failed:', errorMessage);
    }

    // 返回通用错误信息，不暴露内部错误详情（安全考虑）
    return respErr('get user credits failed');
  }
}
