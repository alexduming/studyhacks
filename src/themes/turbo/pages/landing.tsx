/**
 * 直接复用 AI 笔记工具的核心组件：
 * - 非程序员理解：这个组件就是“上传课堂资料 → 一键生成聪明笔记”的那一整块功能。
 * - 在首页中，我们用 embedded 模式，只作为一个功能区块，不抢走整个页面的布局控制权。
 *
 * 这样首页用户一进来就能马上体验核心价值，同时保留单独的 /ai-note-taker 完整页面。
 */
import AINoteTaker from '@/app/[locale]/(landing)/ai-note-taker/page';

import { Landing } from '@/shared/types/blocks/landing';
import {
  CTA,
  FAQ,
  Features,
  FeaturesAccordion,
  FeaturesList,
  FeaturesStep,
  Hero,
  Logos,
  Stats,
  Subscribe,
  Testimonials,
} from '@/themes/turbo/blocks';

export default async function LandingPage({
  locale,
  page,
}: {
  locale?: string;
  page: Landing;
}) {
  return (
    <>
      {page.hero && <Hero hero={page.hero} />}
      <AINoteTaker variant="embedded" />
      {/* {page.logos && <Logos logos={page.logos} />} */}
      {page.introduce && <FeaturesList features={page.introduce} />}
      {/* {page.benefits && <FeaturesAccordion features={page.benefits} />}
      {page.usage && <FeaturesStep features={page.usage} />}
      {page.features && <Features features={page.features} />}
      {page.stats && <Stats stats={page.stats} className="bg-muted" />}
      {page.testimonials && <Testimonials testimonials={page.testimonials} />}
      {page.subscribe && (
        <Subscribe subscribe={page.subscribe} className="bg-muted" />
      )} */}
      {page.faq && <FAQ faq={page.faq} />}
      {page.cta && <CTA cta={page.cta} className="bg-muted" />}
    </>
  );
}
