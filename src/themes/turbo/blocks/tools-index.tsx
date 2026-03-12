'use client';

import { Link } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Section } from '@/shared/types/blocks/landing';

const glowStyles = [
  'from-cyan-500/20 via-blue-500/10 to-transparent',
  'from-emerald-500/20 via-teal-500/10 to-transparent',
  'from-orange-500/20 via-amber-500/10 to-transparent',
  'from-fuchsia-500/20 via-rose-500/10 to-transparent',
  'from-sky-500/20 via-indigo-500/10 to-transparent',
  'from-lime-500/20 via-green-500/10 to-transparent',
];

export function ToolsIndex({
  section,
  className,
}: {
  section: Section;
  className?: string;
}) {
  return (
    <section
      id={section.id}
      className={cn('relative overflow-hidden py-16 md:py-24', className)}
    >
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.14),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.1),transparent_35%),radial-gradient(circle_at_50%_100%,rgba(16,185,129,0.08),transparent_45%)]" />

      <div className="container">
        <ScrollAnimation>
          <div className="mb-10 text-center md:mb-14">
            <h2 className="text-4xl font-black tracking-tight md:text-6xl">
              {section.title}
            </h2>
            {section.description && (
              <p className="text-muted-foreground mx-auto mt-4 max-w-2xl text-base md:text-lg">
                {section.description}
              </p>
            )}
          </div>
        </ScrollAnimation>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {section.items?.map((item, index) => (
            <ScrollAnimation
              key={`${item.title}-${index}`}
              delay={index * 0.06}
            >
              <Link
                href={item.url || '/'}
                target={item.target || '_self'}
                className="group bg-card/80 ring-foreground/10 relative flex h-full min-h-[210px] flex-col justify-between overflow-hidden rounded-2xl border border-white/15 p-6 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.35)] ring-1 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(34,197,94,0.35)]"
              >
                <div
                  className={cn(
                    'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70 transition-opacity duration-300 group-hover:opacity-100',
                    glowStyles[index % glowStyles.length]
                  )}
                />

                <div className="relative flex items-start gap-4">
                  <span className="bg-background/95 ring-foreground/15 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1">
                    <SmartIcon
                      name={
                        typeof item.icon === 'string' ? item.icon : 'Sparkles'
                      }
                      size={24}
                      className="text-foreground"
                    />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold md:text-xl">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>

                <span className="bg-primary text-primary-foreground relative mt-8 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-semibold tracking-wide transition-all duration-300 group-hover:brightness-110">
                  {item.title}
                </span>
              </Link>
            </ScrollAnimation>
          ))}
        </div>
      </div>
    </section>
  );
}
