import {
  Blog as BlogType,
  Category as CategoryType,
} from "@/types/blocks/blog";
import { Link } from "@/core/i18n/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function Blog({
  blog,
  currentCategory,
  className,
  srOnlyTitle,
}: {
  blog: BlogType;
  currentCategory?: CategoryType;
  className?: string;
  srOnlyTitle?: string;
}) {
  const t = useTranslations();

  return (
    <section
      id={blog.id}
      className={cn("py-16 md:py-36", blog.className, className)}
    >
      <div className="mx-auto mb-12 text-center">
        {srOnlyTitle && <h1 className="sr-only">{srOnlyTitle}</h1>}
        <h2 className="mb-6 text-pretty text-3xl font-bold lg:text-4xl">
          {blog.title}
        </h2>
        <p className="mb-4 max-w-xl text-muted-foreground lg:max-w-none lg:text-lg">
          {blog.description}
        </p>
      </div>

      <div className="container flex flex-col items-center gap-8 lg:px-16">
        {blog.categories && (
          <div className="mb-2 flex flex-wrap items-center justify-center gap-4">
            {blog.categories?.map((c) => (
              <Link
                key={c.id}
                href={c.url || ""}
                className={`px-4 py-1 rounded-md text-sm border ${
                  currentCategory && currentCategory.slug === c.slug
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-foreground"
                }`}
              >
                {c.title}
              </Link>
            ))}
          </div>
        )}

        {blog.posts && blog.posts.length > 0 ? (
          <div className="w-full flex flex-wrap items-start">
            {blog.posts?.map((item, idx) => (
              <a
                key={idx}
                href={item.url || ""}
                target={item.target || "_self"}
                className="w-full md:w-1/3 p-4"
              >
                <div className="flex flex-col overflow-clip rounded-xl border border-border">
                  {item.image && (
                    <div>
                      <img
                        src={item.image}
                        alt={item.title || ""}
                        className="aspect-16/9 h-full w-full object-cover object-center"
                      />
                    </div>
                  )}
                  <div className="px-4 py-4 md:px-4 md:py-4 lg:px-4 lg:py-4">
                    <h3 className="mb-3 text-lg font-semibold md:mb-4 md:text-xl lg:mb-6">
                      {item.title}
                    </h3>
                    <p className="mb-3 text-muted-foreground md:mb-4 lg:mb-6">
                      {item.description}
                    </p>

                    {/* {blog.readMoreText && (
                      <p className="flex items-center hover:underline">
                        {blog.readMoreText}
                        <ArrowRight className="ml-2 size-4" />
                      </p>
                    )} */}
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-md py-8">
            {t("blog.no_content")}
          </div>
        )}
      </div>
    </section>
  );
}
