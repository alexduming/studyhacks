import { Header, Main, MainHeader } from "@/shared/blocks/dashboard";
import { FormCard } from "@/shared/blocks/form";
import { Form } from "@/shared/types/blocks/form";
import { getUserInfo } from "@/shared/services/user";
import {
  updatePost,
  UpdatePost,
  PostType,
  findPost,
} from "@/shared/services/post";
import { PostStatus } from "@/shared/services/post";
import {
  getTaxonomies,
  TaxonomyStatus,
  TaxonomyType,
} from "@/shared/services/taxonomy";
import { Empty } from "@/shared/blocks/common";
import { Crumb } from "@/shared/types/blocks/common";
import { getTranslations } from "next-intl/server";

export default async function PostEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const post = await findPost({ id });
  if (!post) {
    return <Empty message="Post not found" />;
  }

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations("admin.posts");

  const crumbs: Crumb[] = [
    { title: t("edit.crumbs.admin"), url: "/admin" },
    { title: t("edit.crumbs.posts"), url: "/admin/posts" },
    { title: t("edit.crumbs.edit"), is_active: true },
  ];

  const categories = await getTaxonomies({
    type: TaxonomyType.CATEGORY,
    status: TaxonomyStatus.PUBLISHED,
  });
  const categoriesOptions = [
    ...categories.map((category) => ({
      title: category.title,
      value: category.id,
    })),
  ];

  const form: Form = {
    fields: [
      {
        name: "slug",
        type: "text",
        title: t("fields.slug"),
        tip: "unique slug for the post",
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
      {
        name: "categories",
        type: "select",
        title: t("fields.categories"),
        options: categoriesOptions,
      },
      {
        name: "content",
        type: "markdown_editor",
        title: t("fields.content"),
      },
    ],
    passby: {
      type: "post",
      user: user,
      post: post,
    },
    data: post,
    submit: {
      button: {
        title: t("edit.buttons.submit"),
      },
      handler: async (data, passby) => {
        "use server";

        const { user, post } = passby;
        if (!user || !post) {
          throw new Error("no auth");
        }

        const slug = data.get("slug") as string;
        const title = data.get("title") as string;
        const description = data.get("description") as string;
        const content = data.get("content") as string;
        const categories = data.get("categories") as string;

        if (!slug?.trim() || !title?.trim()) {
          throw new Error("slug and title are required");
        }

        const newPost: UpdatePost = {
          parentId: "", // todo: select parent category
          slug: slug.trim().toLowerCase(),
          type: PostType.ARTICLE,
          title: title.trim(),
          description: description.trim(),
          image: "",
          content: content.trim(),
          categories: categories.trim(),
          tags: "",
          authorName: "",
          authorImage: "",
          status: PostStatus.PUBLISHED,
        };

        const result = await updatePost(post.id, newPost);

        if (!result) {
          throw new Error("update post failed");
        }

        return {
          status: "success",
          message: "post updated",
          redirect_url: "/admin/posts",
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
