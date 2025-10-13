import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Button, Crumb } from "@/shared/types/blocks/common";
import { Empty } from "@/shared/blocks/common";
import { getApikeys, getApikeysCount } from "@/shared/services/apikey";
import { getTranslations } from "next-intl/server";

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("admin.apikeys");

  const crumbs: Crumb[] = [
    { title: t("list.crumbs.admin"), url: "/admin" },
    { title: t("list.crumbs.apikeys"), is_active: true },
  ];

  const total = await getApikeysCount({});

  const apiKeys = await getApikeys({
    getUser: true,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      { name: "title", title: t("fields.title") },
      { name: "key", title: t("fields.key"), type: "copy" },
      { name: "user", title: t("fields.user"), type: "user" },
      { name: "status", title: t("fields.status"), type: "label" },
      { name: "createdAt", title: t("fields.created_at"), type: "time" },
    ],
    data: apiKeys,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const actions: Button[] = [];

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("list.title")} actions={actions} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
