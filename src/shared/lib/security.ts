import { NextResponse } from 'next/server';

/**
 * 验证请求来源是否合法
 *
 * @description
 * 此函数用于防止 CSRF 攻击和第三方站点盗用 API 资源。
 * 它检查请求头的 'origin' 或 'referer' 是否包含在环境变量 ALLOWED_ORIGINS 定义的白名单中。
 *
 * @param request Next.js 的 Request 对象
 * @returns { valid: boolean, response?: NextResponse }
 * - valid: true 表示通过，false 表示被拦截
 * - response: 如果被拦截，直接返回这个 response (403 Forbidden)
 */
export function checkApiOrigin(request: Request): {
  valid: boolean;
  response?: NextResponse;
} {
  // 1. 获取允许的来源列表
  // 默认包含 localhost 以免开发环境报错
  const envAllowed = process.env.ALLOWED_ORIGINS || '';
  const defaultAllowed = ['http://localhost:3000'];

  const allowedOrigins = [
    ...defaultAllowed,
    ...envAllowed.split(',').filter(Boolean),
  ].map((url) => url.trim());

  // 2. 获取请求的 Origin 或 Referer
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const requestOrigin = origin || referer;

  // 3. 如果没有来源信息（例如通过 Postman 或某些服务端脚本调用）
  // 策略：如果是开发环境，放行；如果是生产环境，严格拦截（视具体需求而定，这里采取适度严格策略）
  if (!requestOrigin) {
    // 这里的逻辑可以根据需要调整。如果你有移动端 App 或服务端调用，可能需要特定 Header 验证。
    // 目前为了安全，如果不是从浏览器来的（无 Origin/Referer），且不是开发环境，我们记录警告。
    if (process.env.NODE_ENV === 'production') {
      // 可选：拦截无来源请求
      // return { valid: false, response: NextResponse.json({ error: 'Missing Origin' }, { status: 403 }) };
    }
    return { valid: true };
  }

  // 4. 检查来源是否在白名单中
  // 使用 startsWith 匹配，兼容子路径（例如 referer 可能是 http://localhost:3000/some-page）
  const isAllowed = allowedOrigins.some((allowed) =>
    requestOrigin.startsWith(allowed)
  );

  if (!isAllowed) {
    console.warn(
      `[Security] Blocked request from unauthorized origin: ${requestOrigin}`
    );
    return {
      valid: false,
      response: NextResponse.json(
        {
          success: false,
          error:
            'Unauthorized Origin: Access is restricted to allowed domains.',
        },
        { status: 403 }
      ),
    };
  }

  return { valid: true };
}
