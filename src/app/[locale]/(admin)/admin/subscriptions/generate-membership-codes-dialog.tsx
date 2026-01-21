'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Key } from 'lucide-react';

import { generateMembershipCodesAction } from '@/app/actions/redemption';
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

export function GenerateMembershipCodesDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);

  const handleGenerate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    
    const formData = new FormData(e.currentTarget);
    const planId = formData.get('planId') as string;
    const quantity = parseInt(formData.get('quantity') as string);
    const days = parseInt(formData.get('days') as string);
    const expiresAt = formData.get('expiresAt') as string;

    try {
      const result = await generateMembershipCodesAction(planId, quantity, days, expiresAt || undefined);
      if (result.success && result.data) {
        setCodes(result.data);
        toast.success(`Generated ${result.data.length} codes`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to generate codes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) setCodes([]); // Clear codes when closing
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Key className="mr-2 h-4 w-4" />
          Generate Membership Codes
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Generate Membership Codes</DialogTitle>
          <DialogDescription>
            Create unique codes for users to redeem Plus or Pro memberships.
          </DialogDescription>
        </DialogHeader>
        
        {codes.length > 0 ? (
          <div className="mt-4">
            <Label>Generated Codes (Copy these now):</Label>
            <div className="mt-2 max-h-[200px] overflow-y-auto rounded-md bg-muted p-4 font-mono text-sm">
              {codes.map((code, i) => (
                <div key={i} className="py-1">{code}</div>
              ))}
            </div>
            <Button className="mt-4 w-full" onClick={() => {
              navigator.clipboard.writeText(codes.join('\n'));
              toast.success('Codes copied to clipboard');
            }}>
              Copy All to Clipboard
            </Button>
          </div>
        ) : (
          <form onSubmit={handleGenerate} className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="planId" className="text-right">Plan</Label>
              <div className="col-span-3">
                <Select name="planId" defaultValue="plus-monthly" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plus-monthly">Plus Monthly</SelectItem>
                    <SelectItem value="plus-yearly">Plus Yearly</SelectItem>
                    <SelectItem value="pro-monthly">Pro Monthly</SelectItem>
                    <SelectItem value="pro-yearly">Pro Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantity" className="text-right">Quantity</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min="1"
                max="100"
                defaultValue="10"
                required
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="days" className="text-right">Validity (Days)</Label>
              <Input
                id="days"
                name="days"
                type="number"
                min="1"
                defaultValue="30"
                required
                className="col-span-3"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="expiresAt" className="text-right">Code Expiration</Label>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                className="col-span-3"
              />
            </div>

            <DialogFooter>
              <Button type="submit" disabled={loading}>
                {loading ? 'Generating...' : 'Generate Codes'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}





