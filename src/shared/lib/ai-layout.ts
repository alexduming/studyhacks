export const AI_LAYOUT_TEMPLATE_IDS = [
  'editorial',
  'bento',
  'spotlight',
  'mono',
  'newspaper',
  'gallery',
  'blueprint',
  'aurora',
  'dossier',
  'pulse',
] as const;

export type AiLayoutTemplateId = (typeof AI_LAYOUT_TEMPLATE_IDS)[number];

export const DEFAULT_AI_LAYOUT_TEMPLATE: AiLayoutTemplateId = 'editorial';

export const AI_LAYOUT_RENDER_MODES = ['desktop', 'mobile'] as const;

export type AiLayoutRenderMode = (typeof AI_LAYOUT_RENDER_MODES)[number];

export const DEFAULT_AI_LAYOUT_RENDER_MODE: AiLayoutRenderMode = 'desktop';

export function isAiLayoutTemplateId(
  value: string | null | undefined
): value is AiLayoutTemplateId {
  return AI_LAYOUT_TEMPLATE_IDS.includes(value as AiLayoutTemplateId);
}

export function normalizeAiLayoutTemplate(
  value: string | null | undefined
): AiLayoutTemplateId {
  return isAiLayoutTemplateId(value) ? value : DEFAULT_AI_LAYOUT_TEMPLATE;
}

export function isAiLayoutRenderMode(
  value: string | null | undefined
): value is AiLayoutRenderMode {
  return AI_LAYOUT_RENDER_MODES.includes(value as AiLayoutRenderMode);
}

export function normalizeAiLayoutRenderMode(
  value: string | null | undefined
): AiLayoutRenderMode {
  return isAiLayoutRenderMode(value) ? value : DEFAULT_AI_LAYOUT_RENDER_MODE;
}

export const AI_LAYOUT_TEMPLATE_PROMPT_HINTS: Record<
  AiLayoutTemplateId,
  string
> = {
  editorial:
    'Shape the content like a Monocle-style editorial feature: warm narrative flow, polished serif-style section titles, thoughtful transitions, and a sophisticated magazine reading experience.',
  bento:
    'Shape the content for Apple Keynote-style bento cards: concise modular blocks, crisp bullet points, dense insights, and highly scannable micro-sections with clear visual hierarchy.',
  spotlight:
    'Shape the content for a Stripe/Linear-style visual story: bold takeaways, punchy phrasing, highlight-worthy stats, memorable callouts, and a clean timeline progression.',
  mono: 'Shape the content for a Swiss International Typographic Style layout: strict hierarchy, minimal decoration, concise paragraphs, disciplined grid spacing, and Helvetica-inspired clarity.',
  newspaper:
    'Shape the content like a New York Times front page: assertive serif headlines, compact news summaries, column-friendly paragraphs, and digestible editorial blocks with factual clarity.',
  gallery:
    'Shape the content like a curated gallery exhibition: strong captions, alternating showcase panels, visual breaks between sections, and memorable exhibit-style storytelling.',
  blueprint:
    'Shape the content like a technical blueprint: methodical labels, numbered specifications, process-oriented breakdowns, monospace headers, and structured engineering-diagram clarity.',
  aurora:
    'Shape the content for a dreamy Nordic-inspired layout: fluid transitions, elegant highlights, atmospheric section framing, and a soft immersive reading experience.',
  dossier:
    'Shape the content like a McKinsey executive briefing: crisp key-findings summaries, data-forward organization, report-style subheads, and actionable evidence-based sections.',
  pulse:
    'Shape the content for a high-energy neon-style layout: punchy headers, sharp signal-to-noise ratio, dramatic emphasis on stats and actions, and bold rhythmic section movement.',
};
