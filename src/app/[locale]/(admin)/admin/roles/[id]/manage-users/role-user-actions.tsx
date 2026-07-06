'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';

/**
 * 角色用户操作按钮组件
 * 用于添加或移除用户到/从角色
 */
export function RoleUserActions({
  roleId,
  userId,
  hasRole,
  onSuccess,
}: {
  roleId: string;
  userId: string;
  hasRole: boolean;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: 'add' | 'remove') => {
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch(`/api/admin/roles/${roleId}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          action,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(data.message || '操作成功');
        // 刷新页面以更新列表
        router.refresh();
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch (error: any) {
      console.error('Error managing role user:', error);
      toast.error('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  if (hasRole) {
    return (
      <Button
        variant="destructive"
        size="sm"
        onClick={() => handleAction('remove')}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            移除中...
          </>
        ) : (
          '从角色移除'
        )}
      </Button>
    );
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => handleAction('add')}
      disabled={loading}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          添加中...
        </>
      ) : (
        '添加到角色'
      )}
    </Button>
  );
}

