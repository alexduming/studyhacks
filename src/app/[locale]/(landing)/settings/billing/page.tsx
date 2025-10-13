import { type Table } from "@/shared/types/blocks/table";
import { TableCard } from "@/shared/blocks/table";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import {
  getSubscriptions,
  getSubscriptionsCount,
  Subscription,
  getCurrentSubscription,
} from "@/shared/services/subscription";
import moment from "moment";
import { PanelCard } from "@/shared/blocks/panel";
import { Tab } from "@/shared/types/blocks/common";
import { getTranslations } from "next-intl/server";

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; status?: string }>;
}) {
  const { page: pageNum, pageSize, status } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("settings.billing");

  const currentSubscription = await getCurrentSubscription(user.id);

  const total = await getSubscriptionsCount({
    userId: user.id,
    status,
  });

  const subscriptions = await getSubscriptions({
    userId: user.id,
    status,
    page,
    limit,
  });

  const table: Table = {
    title: t("list.title"),
    columns: [
      {
        name: "subscriptionNo",
        title: t("fields.subscription_no"),
        type: "copy",
      },
      {
        name: "interval",
        title: t("fields.interval"),
        type: "label",
      },
      {
        name: "status",
        title: t("fields.status"),
        type: "label",
        metadata: { variant: "outline" },
      },
      {
        title: t("fields.amount"),
        callback: function (item) {
          return (
            <div className="text-primary">{`${item.amount / 100} ${
              item.currency
            }`}</div>
          );
        },
        type: "copy",
      },
      {
        name: "createdAt",
        title: t("fields.created_at"),
        type: "time",
      },
      {
        title: t("fields.current_period"),
        callback: function (item) {
          return (
            <div>
              {`${moment(item.currentPeriodStart).format("YYYY-MM-DD")}`} ~
              <br />
              {`${moment(item.currentPeriodEnd).format("YYYY-MM-DD")}`}
            </div>
          );
        },
      },
    ],
    data: subscriptions,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const tabs: Tab[] = [
    {
      title: t("list.tabs.all"),
      name: "all",
      url: "/settings/billing",
      is_active: !status || status === "all",
    },
    {
      title: t("list.tabs.active"),
      name: "active",
      url: "/settings/billing?status=active",
      is_active: status === "active",
    },
    {
      title: t("list.tabs.canceled"),
      name: "canceled",
      url: "/settings/billing?status=canceled",
      is_active: status === "canceled",
    },
  ];

  return (
    <div className="space-y-8">
      <PanelCard
        title={t("view.title")}
        buttons={[
          {
            title: t("view.buttons.adjust"),
            url: "/pricing",
            target: "_blank",
            icon: "Pencil",
            size: "sm",
          },
        ]}
        className="max-w-md"
      >
        <div className="text-3xl font-bold text-primary">
          {currentSubscription?.planName}
        </div>
        <div className="text-sm font-normal text-muted-foreground mt-4">
          {t("view.tip", {
            date: moment(currentSubscription?.currentPeriodEnd).format(
              "YYYY-MM-DD"
            ),
          })}
        </div>
      </PanelCard>
      <TableCard title={t("list.title")} tabs={tabs} table={table} />
    </div>
  );
}
