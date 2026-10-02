import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import { Crumb } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';
import { generateCodesAction } from '@/app/actions/redemption';

export default async function GenerateCreditsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check permission
  await requirePermission({
    code: PERMISSIONS.CREDITS_WRITE,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.credits');

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.credits'), url: '/admin/credits' },
    { title: 'Generate Codes', is_active: true }, // Simple string fallback until translation added
  ];

  const form: Form = {
    fields: [
      {
        name: 'amount',
        title: t('fields.amount'),
        type: 'number',
        validation: { required: true },
        placeholder: '200',
        metadata: {
          min: 1,
        },
      },
      {
        name: 'quantity',
        title: 'Quantity', // Hardcoded fallback
        type: 'number',
        validation: { required: true },
        placeholder: '50',
        metadata: {
          min: 1,
          max: 1000,
        },
      },
      {
        name: 'maxUses',
        title: 'Max Uses Per Code',
        type: 'number',
        validation: { required: true },
        placeholder: '1',
        metadata: {
          min: 1,
          description: 'How many times each code can be redeemed (by different users)',
        },
      },
      {
        name: 'creditValidityDays',
        title: 'Credit Validity (Days)',
        type: 'number',
        validation: { required: true },
        placeholder: '30',
        metadata: {
          min: 1,
          description: 'How long the redeemed credits remain valid',
        },
      },
      {
        name: 'expiresAt',
        title: 'Code Expiration Date',
        type: 'text', // Using text for date input for now as 'date' type might need component support
        placeholder: 'YYYY-MM-DD (Optional)',
        metadata: {
          description: 'Leave empty for no expiration',
        },
      },
    ],
    submit: {
      button: {
        title: 'Generate',
      },
      handler: async (data) => {
        'use server';
        
        const amount = Number(data.get('amount'));
        const quantity = Number(data.get('quantity'));
        const maxUses = Number(data.get('maxUses')) || 1;
        const creditValidityDays = Number(data.get('creditValidityDays')) || 30;
        const expiresAt = data.get('expiresAt') as string;

        if (!amount || !quantity) {
           throw new Error('Invalid input');
        }

        const result = await generateCodesAction(
          amount, 
          quantity, 
          maxUses, 
          creditValidityDays, 
          expiresAt || undefined, 
          locale
        );
        
        return {
          status: 'success',
          message: `Generated ${quantity} codes successfully.`,
          redirect_url: '/admin/credits', 
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title="Generate Redemption Codes" />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
