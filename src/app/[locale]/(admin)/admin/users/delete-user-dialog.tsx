'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

import { deleteUserAction } from '@/app/actions/admin-user';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

type DeleteUserState = {
  success: boolean;
  error?: string;
};

const initialState: DeleteUserState = {
  success: false,
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="destructive"
      disabled={pending || disabled}
    >
      {pending ? '删除中...' : '确认删除'}
    </Button>
  );
}

/**
 * 删除用户确认对话框
 *
 * 非程序员解释：
 * - 这是一个危险操作确认对话框
 * - 用户需要输入 "DELETE" 才能确认删除，防止误操作
 * - 删除后用户的所有数据（积分、订阅、角色等）都会被清除
 */
export function DeleteUserDialog({
  userId,
  userName,
  userEmail,
}: {
  userId: string;
  userName: string | null;
  userEmail: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [state, formAction] = useFormState(deleteUserAction, initialState);

  // 确认文本是否正确
  const isConfirmed = confirmText === 'DELETE';

  useEffect(() => {
    if (state.success) {
      toast.success('用户已删除');
      setOpen(false);
      setConfirmText('');
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  // 关闭对话框时重置确认文本
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setConfirmText('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          删除用户
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="text-destructive">删除用户</DialogTitle>
          <DialogDescription className="space-y-2">
            <p>
              你确定要删除用户 <span className="font-bold">{userName || '未命名'}</span> ({userEmail}) 吗？
            </p>
            <p className="text-destructive font-medium">
              ⚠️ 此操作不可撤销！用户的所有数据（积分、订阅、角色等）都将被永久删除。
            </p>
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 py-4">
          <input type="hidden" name="userId" value={userId} />

          <div className="grid gap-2">
            <Label htmlFor="confirm">
              请输入 <span className="font-mono font-bold text-destructive">DELETE</span> 确认删除
            </Label>
            <Input
              id="confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="输入 DELETE 确认"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <SubmitButton disabled={!isConfirmed} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
