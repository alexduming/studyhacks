'use client';

/**
 * 非程序员解释：
 * 这是注册完成页面的路由包装器
 * 
 * 为什么使用 'use client'：
 * 1. 这个页面需要访问客户端的 searchParams（URL参数）
 * 2. 它渲染的 RegisterCompletePage 是客户端组件
 * 3. 使用客户端组件可以直接处理 URL 参数，避免服务器/客户端混用问题
 * 
 * 修复内容（2026-01-21）：
 * - 将页面改为客户端组件，与 RegisterCompletePage 保持一致
 * - 使用 useSearchParams hook 获取 URL 参数
 * - 移除了 generateMetadata（客户端组件不支持）
 */

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { RegisterCompletePage } from '@/shared/components/auth/register-complete-page';

export default function RegisterCompletePageWrapper() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const email = searchParams.get('email');
  const token = searchParams.get('token');
  const verified = searchParams.get('verified');

  useEffect(() => {
    // 验证必要参数
    if (!email || !token || verified !== 'true') {
      console.error('❌ 注册完成页面：缺少必要参数', { email, token, verified });
      // 重定向到注册页面
      router.push('/sign-up');
    } else {
      console.log('✅ 注册完成页面：参数验证通过', { email });
    }
  }, [email, token, verified, router]);

  // 如果参数无效，显示加载状态（等待重定向）
  if (!email || !token || verified !== 'true') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <RegisterCompletePage
      email={email}
      token={token}
    />
  );
}