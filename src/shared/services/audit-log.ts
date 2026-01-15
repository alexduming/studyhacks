/**
 * 操作审计日志服务
 * 
 * 非程序员解释：
 * - 这个服务用于记录所有重要的操作，特别是积分相关的操作
 * - 记录操作人、时间、操作类型、IP地址等信息
 * - 帮助追踪谁在什么时候做了什么操作，防止误操作和滥用
 */

import { getUuid } from '@/shared/lib/hash';
import { getUserInfo } from '@/shared/models/user';
import { headers } from 'next/headers';

export enum AuditActionType {
  CREDIT_GRANT = 'credit_grant', // 发放积分
  CREDIT_CONSUME = 'credit_consume', // 消费积分
  CREDIT_DELETE = 'credit_delete', // 删除积分记录
  USER_CREATE = 'user_create', // 创建用户
  USER_UPDATE = 'user_update', // 更新用户
  ADMIN_ACTION = 'admin_action', // 管理员操作
}

export interface AuditLogData {
  actionType: AuditActionType;
  targetType: string; // 'user', 'credit', 'order', etc.
  targetId?: string; // 目标对象ID
  description: string; // 操作描述
  metadata?: Record<string, any>; // 额外信息
  ipAddress?: string; // IP地址
  userAgent?: string; // 用户代理
}

/**
 * 记录审计日志
 * 
 * 非程序员解释：
 * - 自动获取当前登录用户信息
 * - 记录操作详情到控制台和文件（后续可以改为数据库）
 * - 如果记录失败，只记录错误但不影响主流程
 * 
 * 注意：当前使用控制台日志，后续可以改为数据库存储
 */
export async function logAuditEvent(data: AuditLogData): Promise<void> {
  try {
    // 获取当前用户信息
    const user = await getUserInfo();
    const userId = user?.id || null;
    const userEmail = user?.email || null;

    // 获取请求头信息（IP地址和User-Agent）
    let ipAddress: string | undefined;
    let userAgent: string | undefined;
    
    try {
      const headersList = await headers();
      ipAddress = 
        headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        headersList.get('x-real-ip') ||
        headersList.get('cf-connecting-ip') ||
        undefined;
      userAgent = headersList.get('user-agent') || undefined;
    } catch {
      // 如果获取headers失败（比如在非请求上下文中），忽略
    }

    // 构建审计日志对象
    const auditLogEntry = {
      id: getUuid(),
      timestamp: new Date().toISOString(),
      userId: userId,
      userEmail: userEmail,
      actionType: data.actionType,
      targetType: data.targetType,
      targetId: data.targetId,
      description: data.description,
      metadata: data.metadata,
      ipAddress: ipAddress || data.ipAddress,
      userAgent: userAgent || data.userAgent,
    };

    // 记录到控制台（结构化日志，便于后续解析）
    console.log('[AUDIT_LOG]', JSON.stringify(auditLogEntry));

    // TODO: 后续可以改为存储到数据库
    // await db().insert(auditLog).values({
    //   id: auditLogEntry.id,
    //   userId: auditLogEntry.userId,
    //   userEmail: auditLogEntry.userEmail,
    //   actionType: auditLogEntry.actionType,
    //   targetType: auditLogEntry.targetType,
    //   targetId: auditLogEntry.targetId,
    //   description: auditLogEntry.description,
    //   metadata: auditLogEntry.metadata ? JSON.stringify(auditLogEntry.metadata) : null,
    //   ipAddress: auditLogEntry.ipAddress,
    //   userAgent: auditLogEntry.userAgent,
    //   createdAt: new Date(),
    // });
  } catch (error) {
    // 审计日志记录失败不应该影响主流程
    // 只记录错误，不抛出异常
    console.error('❌ 审计日志记录失败:', error);
  }
}

/**
 * 验证描述字段，禁止使用测试相关关键词
 * 
 * 非程序员解释：
 * - 在生产环境，禁止使用"test"、"testing"等关键词
 * - 防止误操作或测试数据进入生产环境
 */
export function validateDescription(description: string): { valid: boolean; error?: string } {
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (!isProduction) {
    // 开发环境允许测试关键词
    return { valid: true };
  }

  // 生产环境禁止的关键词列表（不区分大小写）
  const forbiddenKeywords = [
    'test',
    'testing',
    '测试',
    'demo',
    'trial',
    'sample',
    'fake',
    'dummy',
    'mock',
  ];

  const lowerDescription = description.toLowerCase();
  
  for (const keyword of forbiddenKeywords) {
    if (lowerDescription.includes(keyword.toLowerCase())) {
      return {
        valid: false,
        error: `生产环境不允许使用包含"${keyword}"的描述。请使用更正式的业务描述。`,
      };
    }
  }

  return { valid: true };
}

