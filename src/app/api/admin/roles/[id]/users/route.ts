import { NextRequest, NextResponse } from 'next/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { assignRoleToUser, getUserRoles, removeRoleFromUser } from '@/shared/services/rbac';

/**
 * 添加用户到角色
 * POST /api/admin/roles/[id]/users
 * Body: { userId: string, action: 'add' | 'remove' }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roleId } = await params;
    const body = await request.json();
    const { userId, action } = body;

    if (!userId || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or action' },
        { status: 400 }
      );
    }

    if (action !== 'add' && action !== 'remove') {
      return NextResponse.json(
        { success: false, error: 'Invalid action. Must be "add" or "remove"' },
        { status: 400 }
      );
    }

    // 检查权限
    await requirePermission({
      code: PERMISSIONS.ROLES_WRITE,
    });

    if (action === 'add') {
      // 检查用户是否已有该角色
      const userRoles = await getUserRoles(userId);
      const hasRole = userRoles.some((r) => r.id === roleId);

      if (hasRole) {
        return NextResponse.json({
          success: false,
          error: 'User already has this role',
        });
      }

      await assignRoleToUser(userId, roleId);
      return NextResponse.json({
        success: true,
        message: 'User added to role successfully',
      });
    } else {
      // 移除用户角色
      const userRoles = await getUserRoles(userId);
      const userRole = userRoles.find((r) => r.id === roleId);

      if (!userRole) {
        return NextResponse.json({
          success: false,
          error: 'User does not have this role',
        });
      }

      await removeRoleFromUser(userId, roleId);
      return NextResponse.json({
        success: true,
        message: 'User removed from role successfully',
      });
    }
  } catch (error: any) {
    console.error('Error managing role users:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to manage role users',
      },
      { status: 500 }
    );
  }
}

