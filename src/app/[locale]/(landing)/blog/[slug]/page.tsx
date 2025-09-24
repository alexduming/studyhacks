import { findPost } from "@/services/post";
import { PostDetail } from "@/blocks/landing/blog-detail";
import { getTranslations } from "next-intl/server";
import { envConfigs } from "@/config";
import { Post as PostType } from "@/types/blocks/blog";
import { Empty } from "@/blocks/common";
import moment from "moment";
import { Crumb } from "@/blocks/common/crumb";
import { NavItem } from "@/types/blocks/common";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("blog");

  const { slug } = await params;
  const post = await findPost({ slug });
  if (!post) {
    return {
      title: t("page_title"),
      description: t("description"),
    };
  }

  return {
    title: post.title || "",
    description: post.description || "",
    alternates: {
      canonical: `${envConfigs.app_url}/blog/${slug}`,
    },
  };
}

export default async function BlogDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await getTranslations("blog");

  const post = await findPost({ slug });
  if (!post) {
    return <Empty message={t("post_not_found")} />;
  }

  const postData: PostType = {
    id: post.id,
    slug: post.slug,
    title: post.title || "",
    description: post.description || "",
    content: post.content || "",
    created_at: moment(post.createdAt).format("MMM D, YYYY") || "",
    author_name: post.authorName || "",
    author_image: post.authorImage || "",
    url: `/blog/${post.slug}`,
  };

  return (
    <>
      <PostDetail post={postData} />
    </>
  );
}
