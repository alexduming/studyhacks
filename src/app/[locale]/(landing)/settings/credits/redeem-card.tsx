'use client';

import { useState } from 'react';
import { Coins, Gift, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { redeemCodeAction } from '@/app/actions/redemption';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
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
import { Link } from '@/core/i18n/navigation';

interface RedeemCardProps {
  remainingCredits: number;
  t: {
    title: string;
    purchase: string;
    redeem: string;
    redeem_title: string;
    redeem_desc: string;
    code_label: string;
    code_placeholder: string;
    cancel: string;
    confirm: string;
    success: string;
    error: string;
  };
}

export function RedeemCard({ remainingCredits, t }: RedeemCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRedeem = async () => {
    if (!code) return;
    setLoading(true);
    try {
      const result = await redeemCodeAction(code);
      if (result.success) {
        toast.success(t.success + ` (+${result.credits})`);
        setOpen(false);
        setCode('');
        router.refresh();
      } else {
        toast.error(t.error);
      }
    } catch (e) {
      toast.error(t.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-md overflow-hidden pb-0">
      <CardHeader>
        <CardTitle>{t.title}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground">
        <div className="text-primary text-3xl font-bold">{remainingCredits}</div>
      </CardContent>
      <CardFooter className="bg-muted flex justify-start gap-4 py-4">
        <Button asChild>
          <Link href="/pricing" target="_blank">
            <Coins className="mr-2 h-4 w-4" />
            {t.purchase}
          </Link>
        </Button>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Gift className="mr-2 h-4 w-4" />
              {t.redeem}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t.redeem_title}</DialogTitle>
              <DialogDescription>{t.redeem_desc}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="code">{t.code_label}</Label>
                <Input
                  id="code"
                  placeholder={t.code_placeholder}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                {t.cancel}
              </Button>
              <Button onClick={handleRedeem} disabled={loading || !code}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t.confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
}

