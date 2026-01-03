import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { FormCard } from '@/shared/blocks/form';
import { getSnowId, getUuid } from '@/shared/lib/hash';
import {
  consumeCredits,
  createCredit,
  CreditStatus,
  CreditTransactionScene,
  CreditTransactionType,
} from '@/shared/models/credit';
import { getUsers } from '@/shared/models/user';
import { Crumb } from '@/shared/types/blocks/common';
import { Form } from '@/shared/types/blocks/form';

export default async function CreateCreditPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Check if user has permission to write credits
  await requirePermission({
    code: PERMISSIONS.CREDITS_WRITE,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.credits');

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.credits'), url: '/admin/credits' },
    { title: t('create.title'), is_active: true },
  ];

  const form: Form = {
    fields: [
      {
        name: 'email',
        type: 'text',
        title: t('fields.user_email'),
        validation: { required: true },
        placeholder: 'user@example.com',
      },
      {
        name: 'type',
        type: 'select',
        title: t('fields.type'),
        validation: { required: true },
        options: [
          { title: t('list.tabs.grant'), value: 'grant' },
          { title: t('list.tabs.consume'), value: 'consume' },
        ],
        value: 'grant',
      },
      {
        name: 'amount',
        type: 'number',
        title: t('fields.amount'),
        validation: { required: true, min: 1 },
      },
      {
        name: 'description',
        type: 'text',
        title: t('fields.description'),
        validation: { required: true },
      },
    ],
    submit: {
      button: {
        title: t('create.buttons.submit'),
      },
      handler: async (data) => {
        'use server';

        const email = data.get('email') as string;
        const type = data.get('type') as string;
        const amount = Number(data.get('amount'));
        const description = data.get('description') as string;

        if (!email || !amount || !description) {
          throw new Error('Missing required fields');
        }

        // Find user by email
        const users = await getUsers({ email: email.trim() });
        if (!users || users.length === 0) {
          throw new Error('User not found');
        }
        const user = users[0];

        if (type === 'grant') {
          await createCredit({
            id: getUuid(),
            userId: user.id,
            userEmail: user.email,
            transactionNo: getSnowId(),
            transactionType: CreditTransactionType.GRANT,
            transactionScene: CreditTransactionScene.AWARD,
            credits: amount,
            remainingCredits: amount,
            description: description,
            status: CreditStatus.ACTIVE,
          });
        } else if (type === 'consume') {
          await consumeCredits({
            userId: user.id,
            credits: amount,
            scene: CreditTransactionScene.AWARD,
            description: description,
          });
        }

        return {
          status: 'success',
          message: 'Credits updated successfully',
          redirect_url: '/admin/credits',
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t('create.title')} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}

