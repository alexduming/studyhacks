/**
 * 修复 Super Admin 角色权限分配问题
 * 
 * 问题描述：
 * - 用户有 super_admin 角色，但没有权限
 * - 这是因为 super_admin 角色没有正确关联到 '*' 权限
 * 
 * 使用方法：
 *   npx tsx scripts/fix-super-admin-permissions.ts
 */

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/core/db';
import {
  permission,
  role,
  rolePermission,
} from '@/config/db/schema';
import { getUuid } from '@/shared/lib/hash';

async function fixSuperAdminPermissions() {
  console.log('🔧 开始修复 Super Admin 角色权限...\n');

  try {
    // 1. 查找 super_admin 角色
    console.log('📋 查找 super_admin 角色...');
    const [superAdminRole] = await db()
      .select()
      .from(role)
      .where(eq(role.name, 'super_admin'));

    if (!superAdminRole) {
      console.error('❌ 未找到 super_admin 角色！');
      console.log('💡 请先运行: npx tsx scripts/init-rbac.ts');
      process.exit(1);
    }

    console.log(`   ✅ 找到角色: ${superAdminRole.name} (ID: ${superAdminRole.id})\n`);

    // 2. 查找或创建 '*' 权限
    console.log('🔐 查找或创建 "*" 权限...');
    let [wildcardPermission] = await db()
      .select()
      .from(permission)
      .where(eq(permission.code, '*'));

    if (!wildcardPermission) {
      console.log('   ⚠️  "*" 权限不存在，正在创建...');
      [wildcardPermission] = await db()
        .insert(permission)
        .values({
          id: getUuid(),
          code: '*',
          resource: 'all',
          action: 'all',
          title: 'Super Admin',
          description: 'All permissions (super admin only)',
        })
        .returning();
      console.log(`   ✅ 已创建 "*" 权限 (ID: ${wildcardPermission.id})`);
    } else {
      console.log(`   ✅ "*" 权限已存在 (ID: ${wildcardPermission.id})`);
    }
    console.log('');

    // 3. 检查角色是否已有该权限
    console.log('🔍 检查角色权限关联...');
    const [existingRolePermission] = await db()
      .select()
      .from(rolePermission)
      .where(
        and(
          eq(rolePermission.roleId, superAdminRole.id),
          eq(rolePermission.permissionId, wildcardPermission.id)
        )
      );

    if (existingRolePermission) {
      console.log('   ✅ super_admin 角色已正确关联到 "*" 权限');
      console.log('   ℹ️  无需修复，权限配置正常\n');
    } else {
      console.log('   ⚠️  super_admin 角色未关联到 "*" 权限，正在修复...');

      // 先清除该角色的所有现有权限（可选，如果需要的话）
      // 或者只添加 '*' 权限，保留其他权限
      // 这里我们选择只添加 '*' 权限，不删除其他权限

      // 检查是否已有其他权限
      const existingPermissions = await db()
        .select()
        .from(rolePermission)
        .where(eq(rolePermission.roleId, superAdminRole.id));

      if (existingPermissions.length > 0) {
        console.log(`   ℹ️  发现 ${existingPermissions.length} 个现有权限关联`);
        console.log('   💡 将添加 "*" 权限，保留现有权限');
      }

      // 添加 '*' 权限到 super_admin 角色
      // 注意：根据错误信息，数据库中的 role_permission 表有 id 字段
      // 但 schema 定义中没有，所以我们需要使用原始 SQL
      const permissionId = getUuid();
      
      // 先检查是否已存在，避免重复插入
      const [existing] = await db()
        .select()
        .from(rolePermission)
        .where(
          and(
            eq(rolePermission.roleId, superAdminRole.id),
            eq(rolePermission.permissionId, wildcardPermission.id)
          )
        );
      
      if (!existing) {
        // 使用原始 SQL 插入，因为表有 id 和 updated_at 字段但 schema 中没有定义
        await db().execute(
          sql`INSERT INTO role_permission (id, role_id, permission_id, created_at, updated_at) 
              VALUES (${permissionId}, ${superAdminRole.id}, ${wildcardPermission.id}, NOW(), NOW())`
        );
      }

      console.log('   ✅ 已成功将 "*" 权限关联到 super_admin 角色\n');
    }

    // 4. 验证修复结果
    console.log('✅ 验证修复结果...');
    const rolePermissions = await db()
      .select({
        id: permission.id,
        code: permission.code,
        title: permission.title,
      })
      .from(rolePermission)
      .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
      .where(eq(rolePermission.roleId, superAdminRole.id));

    console.log(`   📊 super_admin 角色现在拥有 ${rolePermissions.length} 个权限：`);
    rolePermissions.forEach((perm) => {
      console.log(`      - ${perm.code} (${perm.title})`);
    });

    // 检查是否包含 '*' 权限
    const hasWildcard = rolePermissions.some((p) => p.code === '*');
    if (hasWildcard) {
      console.log('\n   ✅ 修复成功！super_admin 角色现在拥有 "*" 权限');
      console.log('   💡 这意味着 super_admin 拥有所有权限\n');
    } else {
      console.log('\n   ⚠️  警告：未找到 "*" 权限，请检查数据库\n');
    }

    console.log('✅ 修复完成！');
    console.log('\n💡 下一步：');
    console.log('   1. 重新登录以刷新权限缓存');
    console.log('   2. 访问 /admin 页面验证权限\n');
  } catch (error) {
    console.error('\n❌ 修复过程中出现错误:', error);
    process.exit(1);
  }
}

// 运行修复
fixSuperAdminPermissions()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

