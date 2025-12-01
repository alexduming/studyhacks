import { Blog as BlogType } from '@/shared/types/blocks/blog';
import { Blog } from '@/themes/turbo/blocks/blog';

export default async function BlogPage({
  locale,
  blog,
}: {
  locale?: string;
  blog: BlogType;
}) {
  return <Blog blog={blog} />;
}
