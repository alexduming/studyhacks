import { CTA, Showcases } from "@/blocks/landing";
import { getMetadata } from "@/lib/seo";
import { getTranslations } from "next-intl/server";
import { setRequestLocale } from "next-intl/server";

export const generateMetadata = getMetadata({
  metadataKey: "showcases",
  canonicalUrl: "/showcases",
});

export default async function ShowcasesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("landing");
  const tt = await getTranslations("showcases");

  return (
    <>
      <Showcases showcases={t.raw("showcases")} srOnlyTitle={tt.raw("title")} />

      <CTA cta={t.raw("cta")} className="bg-muted" />
    </>
  );
}
