import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import {
  getCredits,
  getCreditsCount,
  Credit,
  CreditStatus,
  CreditTransactionType,
} from "@/shared/services/credit";

import { Crumb, Tab } from "@/shared/types/blocks/common";
import { Empty } from "@/shared/blocks/common";
import { getTranslations } from "next-intl/server";

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("admin.credits");

  const { page: pageNum, pageSize, type } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const crumbs: Crumb[] = [
    { title: t("list.crumbs.admin"), url: "/admin" },
    { title: t("list.crumbs.credits"), is_active: true },
  ];

  const tabs: Tab[] = [
    {
      name: "all",
      title: t("list.tabs.all"),
      url: "/admin/credits",
      is_active: !type || type === "all",
    },
    {
      name: "grant",
      title: t("list.tabs.grant"),
      url: "/admin/credits?type=grant",
      is_active: type === "grant",
    },
    {
      name: "consume",
      title: t("list.tabs.consume"),
      url: "/admin/credits?type=consume",
      is_active: type === "consume",
    },
  ];

  const total = await getCreditsCount({
    transactionType: type as CreditTransactionType,
    status: CreditStatus.ACTIVE,
  });

  const credits = await getCredits({
    transactionType: type as CreditTransactionType,
    status: CreditStatus.ACTIVE,
    getUser: true,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      {
        name: "transactionNo",
        title: t("fields.transaction_no"),
        type: "copy",
      },
      { name: "user", title: t("fields.user"), type: "user" },
      {
        name: "credits",
        title: t("fields.amount"),
        callback: (item) => {
          if (item.credits > 0) {
            return <div className="text-green-500">+{item.credits}</div>;
          } else {
            return <div className="text-red-500">{item.credits}</div>;
          }
        },
      },
      {
        name: "remainingCredits",
        title: t("fields.remaining"),
        type: "label",
        placeholder: "-",
      },
      { name: "transactionType", title: t("fields.type") },
      { name: "transactionScene", title: t("fields.scene"), placeholder: "-" },
      { name: "description", title: t("fields.description"), placeholder: "-" },
      { name: "createdAt", title: t("fields.created_at"), type: "time" },
      {
        name: "expiresAt",
        title: t("fields.expires_at"),
        type: "time",
        placeholder: "-",
        metadata: { format: "YYYY-MM-DD HH:mm:ss" },
      },
    ],
    data: credits,
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("list.title")} tabs={tabs} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
