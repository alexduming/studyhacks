import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { TableCard } from "@/shared/blocks/table";
import { type Table } from "@/shared/types/blocks/table";
import { getUsers } from "@/shared/services/user";
import { getTranslations } from "next-intl/server";
import { Crumb } from "@/shared/types/blocks/common";

export default async function AdminUsersPage() {
  const t = await getTranslations("admin.users");

  const users = await getUsers();

  const crumbs: Crumb[] = [
    { title: t("list.crumbs.admin"), url: "/admin" },
    { title: t("list.crumbs.users"), is_active: true },
  ];

  const table: Table = {
    columns: [
      { name: "id", title: t("fields.id"), type: "copy" },
      { name: "name", title: t("fields.name") },
      {
        name: "image",
        title: t("fields.avatar"),
        type: "image",
        placeholder: "-",
      },
      { name: "email", title: t("fields.email"), type: "copy" },
      {
        name: "emailVerified",
        title: t("fields.email_verified"),
        type: "label",
        placeholder: "-",
      },
      { name: "createdAt", title: t("fields.created_at"), type: "time" },
    ],
    data: users,
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("list.title")} />
        <TableCard table={table} />
      </Main>
    </>
  );
}
