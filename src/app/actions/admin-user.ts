'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { deleteUser, findUserById, getUserInfo } from '@/shared/models/user';
import { AuditActionType, logAuditEvent } from '@/shared/services/audit-log';

const deleteUserSchema = z.object({
  userId: z.string().min(1),
});

type DeleteUserState = {
  success: boolean;
  error?: string;
};

const initialState: DeleteUserState = {
  success: false,
};

/**
 * 删除用户操作
 *
 * 非程序员解释：
 * - 这个函数用于管理员删除用户账户
 * - 安全措施：
 *   1. 验证管理员权限（需要 USERS_DELETE 权限）
 *   2. 防止管理员删除自己的账户
 *   3. 记录操作审计日志，追踪谁在什么时候删除了谁
 * - 删除用户后，关联数据（角色、积分、订阅等）会自动清理
 */
export async function deleteUserAction(
  _prevState: DeleteUserState,
  formData: FormData
): Promise<DeleteUserState> {
  // 1. 权限检查 - 需要用户删除权限
  try {
    await requirePermission({ code: PERMISSIONS.USERS_DELETE });
  } catch (error) {
    return { success: false, error: '权限不足，无法删除用户' };
  }

  const data = {
    userId: formData.get('userId'),
  };

  const validated = deleteUserSchema.safeParse(data);

  if (!validated.success) {
    return { success: false, error: '无效的用户 ID' };
  }

  const { userId } = validated.data;

  try {
    // 2. 获取操作人信息
    const operator = await getUserInfo();

    // 3. 防止删除自己
    if (operator?.id === userId) {
      return { success: false, error: '不能删除自己的账户' };
    }

    // 4. 获取被删除用户信息（用于审计日志）
    const targetUser = await findUserById(userId);
    if (!targetUser) {
      return { success: false, error: '用户不存在' };
    }

    // 5. 执行删除
    const deletedUser = await deleteUser(userId);

    if (!deletedUser) {
      return { success: false, error: '删除用户失败' };
    }

    // 6. 记录审计日志
    await logAuditEvent({
      actionType: AuditActionType.USER_DELETE,
      targetType: 'user',
      targetId: userId,
      description: `管理员删除用户: ${targetUser.email} (${targetUser.name})`,
      metadata: {
        operatorId: operator?.id,
        operatorEmail: operator?.email,
        deletedUserId: userId,
        deletedUserEmail: targetUser.email,
        deletedUserName: targetUser.name,
        source: 'admin_delete_user',
      },
    });

    // 7. 刷新页面缓存
    revalidatePath('/admin/users');
    return { success: true };
  } catch (error: any) {
    console.error('Delete User Error:', error);
    return {
      success: false,
      error: error.message || '删除用户失败',
    };
  }
}
