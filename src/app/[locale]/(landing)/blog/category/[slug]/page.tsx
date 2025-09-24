import { Blog } from "@/blocks/landing";
import { getMetadata } from "@/lib/seo";
import { Blog as BlogType } from "@/types/blocks/blog";
import { getPosts, PostStatus, PostType } from "@/services/post";
import {
  findTaxonomy,
  getTaxonomies,
  TaxonomyStatus,
  TaxonomyType,
} from "@/services/taxonomy";
import { getTranslations, setRequestLocale } from "next-intl/server";
import moment from "moment";
import { envConfigs } from "@/config";
import { Empty } from "@/blocks/common";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return {
    title: "Blog",
    description:
      "Read about our latest product features, solutions, and updates.",
    alternates: {
      canonical: `${envConfigs.app_url}/blog/category/${slug}`,
    },
  };
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("blog");

  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 30;

  const category = await findTaxonomy({
    slug,
    status: TaxonomyStatus.PUBLISHED,
  });
  if (!category) {
    return <Empty message={t("category_not_found")} />;
  }

  const posts = await getPosts({
    category: category.id,
    type: PostType.ARTICLE,
    status: PostStatus.PUBLISHED,
    page,
    limit,
  });

  const categories = await getTaxonomies({
    type: TaxonomyType.CATEGORY,
    status: TaxonomyStatus.PUBLISHED,
  });

  // current category data
  const currentCategory = {
    id: category.id,
    slug: category.slug,
    title: category.title,
    url: `/blog/category/${category.slug}`,
  };

  // category data
  const categoryData = categories.map((category) => ({
    id: category.id,
    slug: category.slug,
    title: category.title,
    url: `/blog/category/${category.slug}`,
  }));
  categoryData.unshift({
    id: "all",
    slug: "all",
    title: t("all"),
    url: `/blog`,
  });

  // post data
  const postData = posts.map((post) => ({
    id: post.id,
    title: post.title || "",
    description: post.description || "",
    author_name: post.authorName || "",
    author_image: post.authorImage || "",
    created_at: moment(post.createdAt).format("MMM D, YYYY") || "",
    image: post.image || "",
    url: `/blog/${post.slug}`,
  }));

  const blog: BlogType = {
    title: t("title"),
    description: t("description"),
    categories: categoryData,
    posts: postData,
  };

  return (
    <Blog
      blog={blog}
      currentCategory={currentCategory}
      srOnlyTitle={t("page_title")}
    />
  );
}
