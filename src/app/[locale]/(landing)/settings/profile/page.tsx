import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Form as FormType } from "@/shared/types/blocks/form";
import { FormCard } from "@/shared/blocks/form";
import { UpdateUser, updateUser } from "@/shared/services/user";
import { getTranslations } from "next-intl/server";

export default async function ProfilePage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("settings.profile");

  const form: FormType = {
    fields: [
      {
        name: "email",
        title: t("fields.email"),
        type: "email",
        attributes: { disabled: true },
      },
      { name: "name", title: t("fields.name"), type: "text" },
      {
        name: "image",
        title: t("fields.avatar"),
        type: "upload_image",
        metadata: {
          max: 1,
        },
      },
    ],
    data: user,
    passby: {
      user: user,
    },
    submit: {
      handler: async (data: FormData, passby: any) => {
        "use server";

        const { user } = passby;
        if (!user) {
          throw new Error("no auth");
        }

        const name = data.get("name") as string;
        if (!name?.trim()) {
          throw new Error("name is required");
        }

        const image = data.get("image");
        console.log("image", image, typeof image);

        const updatedUser: UpdateUser = {
          name: name.trim(),
          image: image as string,
        };

        await updateUser(user.id, updatedUser);

        return {
          status: "success",
          message: "Profile updated",
          redirect_url: "/settings/profile",
        };
      },
      button: {
        title: t("edit.buttons.submit"),
      },
    },
  };

  return (
    <div className="space-y-8">
      <FormCard
        title={t("edit.title")}
        description={t("edit.description")}
        form={form}
      />
    </div>
  );
}
