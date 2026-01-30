import { NextRequest, NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/core/db';
import { user, account } from '@/config/db/schema';

// 强制使用 Node.js 运行时
export const runtime = 'nodejs';

/**
 * 诊断最近创建的账户状态
 * 仅用于调试，生产环境应该删除或添加认证
 */
export async function GET(request: NextRequest) {
  // 简单的安全检查（生产环境应该使用更强的认证）
  const authHeader = request.headers.get('authorization');
  const adminSecret = process.env.ADMIN_SECRET || 'your-secret-key';
  
  if (authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const database = db();
    
    // 获取最近 3 个用户
    const recentUsers = await database
      .select()
      .from(user)
      .orderBy(desc(user.createdAt))
      .limit(3);
    
    const results = [];
    
    for (const u of recentUsers) {
      // 查找对应的 account
      const accounts = await database
        .select()
        .from(account)
        .where(eq(account.userId, u.id));
      
      results.push({
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          emailVerified: u.emailVerified,
          createdAt: u.createdAt.toISOString(),
        },
        accounts: accounts.map(acc => ({
          id: acc.id,
          accountId: acc.accountId,
          providerId: acc.providerId,
          hasPassword: !!acc.password,
          passwordLength: acc.password?.length || 0,
          passwordPrefix: acc.password ? acc.password.substring(0, 10) + '...' : null,
          isBcrypt: acc.password ? (acc.password.startsWith('$2a$') || acc.password.startsWith('$2b$') || acc.password.startsWith('$2y$')) : false,
          createdAt: acc.createdAt.toISOString(),
        })),
      });
    }
    
    // 统计信息
    const credentialAccounts = await database
      .select()
      .from(account)
      .where(eq(account.providerId, 'credential'));
    
    const stats = {
      totalCredentialAccounts: credentialAccounts.length,
      accountsWithPassword: credentialAccounts.filter(acc => acc.password).length,
      accountsWithoutPassword: credentialAccounts.filter(acc => !acc.password).length,
    };
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      recentUsers: results,
      stats,
    });
    
  } catch (error: any) {
    console.error('诊断 API 错误:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

