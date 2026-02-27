'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';

import { manageUserMembership } from '@/app/actions/admin-membership';
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
import { Label } from '@/shared/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';

type ManageMembershipState = {
  success: boolean;
  error?: string;
};

const initialState: ManageMembershipState = {
  success: false,
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Processing...' : 'Confirm'}
    </Button>
  );
}

export function ManageMembershipDialog({
  userId,
  userName,
  currentLevel,
}: {
  userId: string;
  userName: string;
  currentLevel: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(manageUserMembership, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success('Membership updated successfully');
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <ShieldCheck className="mr-2 h-4 w-4" />
          Manage Membership
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Membership</DialogTitle>
          <DialogDescription>
            Change membership level for {userName}. Current level: <span className="font-bold uppercase text-primary">{currentLevel}</span>
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 py-4">
          <input type="hidden" name="userId" value={userId} />
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="planId" className="text-right">
              Plan
            </Label>
            <div className="col-span-3">
              <Select name="planId" defaultValue="free" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free (Cancel active)</SelectItem>
                  <SelectItem value="plus-monthly">Plus Monthly</SelectItem>
                  <SelectItem value="plus-yearly">Plus Yearly</SelectItem>
                  <SelectItem value="pro-monthly">Pro Monthly</SelectItem>
                  <SelectItem value="pro-yearly">Pro Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

