import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { FormCard } from "@/shared/blocks/form";
import { Form } from "@/shared/types/blocks/form";
import {
  findTaxonomy,
  TaxonomyStatus,
  updateTaxonomy,
  UpdateTaxonomy,
} from "@/shared/services/taxonomy";
import { getUserInfo } from "@/shared/services/user";
import { Empty } from "@/shared/blocks/common";
import { Crumb } from "@/shared/types/blocks/common";
import { getTranslations } from "next-intl/server";

export default async function CategoryEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const category = await findTaxonomy({ id });
  if (!category) {
    return <Empty message="Category not found" />;
  }

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("admin.categories");

  if (!user || category.userId !== user.id) {
    return <Empty message="access denied" />;
  }

  const crumbs: Crumb[] = [
    { title: t("edit.crumbs.admin"), url: "/admin" },
    { title: t("edit.crumbs.categories"), url: "/admin/categories" },
    { title: t("edit.crumbs.edit"), is_active: true },
  ];

  const form: Form = {
    fields: [
      {
        name: "slug",
        type: "text",
        title: t("fields.slug"),
        tip: "unique slug for the category",
        validation: { required: true },
      },
      {
        name: "title",
        type: "text",
        title: t("fields.title"),
        validation: { required: true },
      },
      {
        name: "description",
        type: "textarea",
        title: t("fields.description"),
      },
    ],
    passby: {
      type: "category",
      category: category,
      user: user,
    },
    data: category,
    submit: {
      button: {
        title: t("edit.buttons.submit"),
      },
      handler: async (data, passby) => {
        "use server";

        const { user, category } = passby;
        if (!user || !category || category.userId !== user.id) {
          throw new Error("access denied");
        }

        const slug = data.get("slug") as string;
        const title = data.get("title") as string;
        const description = data.get("description") as string;

        if (!slug?.trim() || !title?.trim()) {
          throw new Error("slug and title are required");
        }

        const updateCategory: UpdateTaxonomy = {
          parentId: "", // todo: select parent category
          slug: slug.trim().toLowerCase(),
          title: title.trim(),
          description: description.trim(),
          image: "",
          icon: "",
          status: TaxonomyStatus.PUBLISHED,
        };

        const result = await updateTaxonomy(category.id, updateCategory);

        if (!result) {
          throw new Error("update category failed");
        }

        return {
          status: "success",
          message: "category updated",
          redirect_url: "/admin/categories",
        };
      },
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title={t("edit.title")} />
        <FormCard form={form} className="md:max-w-xl" />
      </Main>
    </>
  );
}
