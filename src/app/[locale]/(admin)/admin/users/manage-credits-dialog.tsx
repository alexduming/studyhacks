'use client';

import { useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { toast } from 'sonner';
import { Coins } from 'lucide-react';

import { manageUserCredits } from '@/app/actions/admin-credit';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';

const initialState = {
  error: '',
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

export function ManageCreditsDialog({
  userId,
  userName,
  currentCredits,
}: {
  userId: string;
  userName: string;
  currentCredits: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState(manageUserCredits, initialState);

  useEffect(() => {
    if (state.success) {
      toast.success('Credits updated successfully');
      setOpen(false);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-start">
          <Coins className="mr-2 h-4 w-4" />
          Manage Credits
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Manage Credits</DialogTitle>
          <DialogDescription>
            Adjust credits for {userName}. Current balance: <span className="font-mono font-bold">{currentCredits}</span>
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 py-4">
          <input type="hidden" name="userId" value={userId} />
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">
              Action
            </Label>
            <div className="col-span-3">
              <Select name="type" defaultValue="add" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Credits (+)</SelectItem>
                  <SelectItem value="deduct">Deduct Credits (-)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="amount" className="text-right">
              Amount
            </Label>
            <Input
              id="amount"
              name="amount"
              type="number"
              min="1"
              required
              className="col-span-3"
              placeholder="e.g. 100"
            />
          </div>

          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="reason" className="text-right">
              Reason
            </Label>
            <Textarea
              id="reason"
              name="reason"
              className="col-span-3"
              placeholder="Reason for adjustment..."
            />
          </div>

          <DialogFooter>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

