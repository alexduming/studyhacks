export const AUTO_MODE_PREFIX = '[AUTO_PAGE]';

export interface VisualSpecification {
  header?: {
    position: 'top-left' | 'top-right' | 'top-center';
    offsetY?: string;
    fontSize?: string;
    fontWeight?: 'normal' | 'bold' | 'extra-bold';
    color?: string;
    fontFamily?: string;
  };
  background?: {
    type: 'solid' | 'gradient' | 'textured';
    value: string;
    texture?: string;
  };
  body?: {
    fontSize?: string;
    lineHeight?: string;
    color?: string;
    fontFamily?: string;
  };
  accentColor?: string;
  secondaryColor?: string;
  container?: {
    borderRadius?: string;
    backgroundColor?: string;
    shadow?: string;
  };
}

export interface PPTStyle {
  id: string;
  title: string;
  tagline: string;
  preview: string;
  refs?: string[];
  prompt: string;
  visualSpec?: VisualSpecification;
}

/**
 * 🎯 视觉规范提示词生成器
 */
export function generateVisualSpecPrompt(
  spec: VisualSpecification,
  deckContext?: { currentSlide: number; totalSlides: number }
): string {
  const parts = [];

  if (deckContext) {
    parts.push(
      `[DECK POSITION] Current Slide: ${deckContext.currentSlide}, Total Slides: ${deckContext.totalSlides}.`
    );
  }

  if (spec.header) {
    parts.push(
      `[HEADER SYSTEM] Position: ${spec.header.position}, OffsetY: ${
        spec.header.offsetY
      }. Font: ${spec.header.fontSize} ${
        spec.header.fontWeight
      }, Color: ${spec.header.color}${
        spec.header.fontFamily ? `, Family: ${spec.header.fontFamily}` : ''
      }.`
    );
  }

  if (spec.background) {
    parts.push(
      `[BACKGROUND] Type: ${spec.background.type}, Value: ${
        spec.background.value
      }${spec.background.texture ? `, Texture: ${spec.background.texture}` : ''}.`
    );
  }

  if (spec.body) {
    parts.push(
      `[BODY TEXT] Size: ${spec.body.fontSize}, LineHeight: ${
        spec.body.lineHeight
      }, Color: ${spec.body.color}${
        spec.body.fontFamily ? `, Family: ${spec.body.fontFamily}` : ''
      }.`
    );
  }

  if (spec.accentColor) {
    parts.push(`[ACCENT COLOR] Primary: ${spec.accentColor}.`);
  }

  if (spec.secondaryColor) {
    parts.push(`[SECONDARY COLOR] Secondary: ${spec.secondaryColor}.`);
  }

  if (spec.container) {
    parts.push(
      `[CONTAINER STYLE] Radius: ${spec.container.borderRadius}, Background: ${
        spec.container.backgroundColor
      }${spec.container.shadow ? `, Shadow: ${spec.container.shadow}` : ''}.`
    );
  }

  return parts.length > 0
    ? `\n\n--- VISUAL CONSISTENCY SPECIFICATION ---\n${parts.join('\n')}`
    : '';
}

/**
 * 🎯 锚定提示词生成器
 */
export function generateAnchorPrompt(anchorImageUrl?: string | null): string {
  if (!anchorImageUrl) return '';
  return `\n\n--- CONSISTENCY ANCHOR ---\n[REFERENCE IMAGE FOR STYLE CONTINUITY]: ${anchorImageUrl}\nCRITICAL: Analyze the typography, spacing, color usage, and container styles from the reference image. The new slide MUST strictly adhere to these visual rules to maintain a seamless presentation deck experience. The content changes, but the 'design DNA' remains identical.`;
}

const CDN_BASE_URL = 'https://cdn.studyhacks.ai';

export const PPT_STYLES: PPTStyle[] = [
  {
    id: 'work_result',
    title: 'Work Report',
    tagline: '商务红蓝、结构化汇报',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调成果量化、商务红蓝配色和多样化的高阶图表形式。',
    preview: `${CDN_BASE_URL}/styles/work_result/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/work_result/preview.png`,
      `${CDN_BASE_URL}/styles/work_result/ref1.png`,
      `${CDN_BASE_URL}/styles/work_result/ref2.png`,
      `${CDN_BASE_URL}/styles/work_result/ref3.png`,
      `${CDN_BASE_URL}/styles/work_result/ref4.png`,
      `${CDN_BASE_URL}/styles/work_result/ref5.png`,
      `${CDN_BASE_URL}/styles/work_result/ref6.png`,
      `${CDN_BASE_URL}/styles/work_result/ref7.png`,
      `${CDN_BASE_URL}/styles/work_result/ref8.png`,
    ],
  },
  {
    id: 'red_tech',
    title: 'Red Tech',
    tagline: '深红科技、高冲击力',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调极高信息密度、强视觉冲击力和严谨的商务结构。',
    preview: `${CDN_BASE_URL}/styles/red_tech/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/red_tech/preview.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref1.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref2.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref3.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref4.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref5.png`,
      `${CDN_BASE_URL}/styles/red_tech/ref6.png`,
    ],
  },
  {
    id: 'scholar',
    title: 'Scholar',
    tagline: '深红褐、学术严谨',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调学术严谨性、深红配色和结构化呈现。',
    preview: `${CDN_BASE_URL}/styles/scholar/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/scholar/preview.png`,
      `${CDN_BASE_URL}/styles/scholar/ref1.png`,
      `${CDN_BASE_URL}/styles/scholar/ref2.png`,
      `${CDN_BASE_URL}/styles/scholar/ref3.png`,
      `${CDN_BASE_URL}/styles/scholar/ref4.png`,
      `${CDN_BASE_URL}/styles/scholar/ref5.png`,
      `${CDN_BASE_URL}/styles/scholar/ref6.png`,
    ],
  },
  {
    id: 'scholar_green',
    title: 'Eco Scholar',
    tagline: '墨绿自然、生态研究',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调逻辑严密、多模块对比和学术美感。',
    preview: `${CDN_BASE_URL}/styles/scholar_green/preview.png`,
    refs: [`${CDN_BASE_URL}/styles/scholar_green/preview.png`],
  },
  {
    id: 'claymation',
    title: 'Claymation',
    tagline: '治愈黏土、3D 质感',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调 3D 材质感、治愈色系和圆润的手工痕迹。',
    preview: `${CDN_BASE_URL}/styles/claymation/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/claymation/ref1.png`,
      `${CDN_BASE_URL}/styles/claymation/ref2.png`,
      `${CDN_BASE_URL}/styles/claymation/ref3.png`,
      `${CDN_BASE_URL}/styles/claymation/ref4.png`,
      `${CDN_BASE_URL}/styles/claymation/ref5.png`,
      `${CDN_BASE_URL}/styles/claymation/ref6.png`,
      `${CDN_BASE_URL}/styles/claymation/ref7.png`,
    ],
    visualSpec: {
      header: {
        position: 'top-left' as const,
        offsetY: '5-8%',
        fontSize: '约40-48px（3D黏土立体字）',
        fontWeight: 'extra-bold' as const,
        color: '#5D4037（深褐土色/Deep Earth）',
        fontFamily: '圆润敦实的3D黏土质感字体',
      },
      background: {
        type: 'solid' as const,
        value: '#F6F2EA（温暖奶油白）或极浅暖灰',
        texture: '细腻的纸张 or 布面纹理',
      },
      body: {
        fontSize: '16-18px',
        lineHeight: '1.5',
        color: '#4E342E（深灰褐）',
        fontFamily: '圆角无衬线体（Rounded Sans-serif）',
      },
      accentColor: '#8D6E63（陶土红/Terracotta）',
      secondaryColor: '#81C784（薄荷绿）',
      container: {
        borderRadius: '12-16px（圆润边缘）',
        backgroundColor: '压平的黏土片效果（#FAF8F5）',
        shadow: '柔和自然阴影（Ambient Occlusion）',
      },
    },
  },
  {
    id: 'dieter-rams',
    title: 'Dieter Rams',
    tagline: '少即是多、绝对秩序',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调极致克制、纯白背景、严谨网格和洋红色点缀。',
    preview: `${CDN_BASE_URL}/styles/minimalism-magenta/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/minimalism-magenta/preview.png`,
      `${CDN_BASE_URL}/styles/minimalism-magenta/ref1.png`,
    ],
  },
  {
    id: 'illustration-lab',
    title: 'Illustration',
    tagline: '现代插画、活力商务',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调扁平化人物、明快配色和模块化内容组合。',
    preview: `${CDN_BASE_URL}/styles/modern_illustration/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/modern_illustration/preview.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref1.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref2.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref3.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref4.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref5.png`,
      `${CDN_BASE_URL}/styles/modern_illustration/ref6.png`,
    ],
  },
  {
    id: 'data_vision',
    title: 'Data Vision',
    tagline: '数据仪表板、科技质感',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调网格化布局、专业图表和高密度数据展示。',
    preview: `${CDN_BASE_URL}/styles/data_vision/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/data_vision/ref1.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref2.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref3.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref4.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref5.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref6.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref7.png`,
      `${CDN_BASE_URL}/styles/data_vision/ref8.png`,
    ],
  },
  {
    id: 'vintage-minimalism',
    title: '复古简约',
    tagline: '温暖学术、人文主义',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调纸张质感、赤陶红配色和优雅的衬线体。',
    preview: `${CDN_BASE_URL}/styles/vintage-minimalism/preview.png`,
    refs: [`${CDN_BASE_URL}/styles/vintage-minimalism/preview.png`],
  },
  {
    id: 'leader_love',
    title: '领导最爱',
    tagline: '商务大气、科技蓝',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调商务大气、信息丰富和高可信度。',
    preview: `${CDN_BASE_URL}/styles/leader_love/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/leader_love/ref1.png`,
      `${CDN_BASE_URL}/styles/leader_love/ref4.png`,
      `${CDN_BASE_URL}/styles/leader_love/ref5.png`,
      `${CDN_BASE_URL}/styles/leader_love/ref6.png`,
      `${CDN_BASE_URL}/styles/leader_love/ref7.png`,
      `${CDN_BASE_URL}/styles/leader_love/ref8.png`,
    ],
  },
  {
    id: 'simple_business',
    title: '简约商务',
    tagline: '现代简约、蓝黑配色',
    prompt:
      '你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调呼吸感、L型边框装饰和标志性的蓝黑配色。',
    preview: `${CDN_BASE_URL}/styles/simple_business/preview.png`,
    refs: [
      `${CDN_BASE_URL}/styles/simple_business/ref1.png`,
      `${CDN_BASE_URL}/styles/simple_business/ref2.png`,
      `${CDN_BASE_URL}/styles/simple_business/ref3.png`,
      `${CDN_BASE_URL}/styles/simple_business/ref4.png`,
      `${CDN_BASE_URL}/styles/simple_business/ref5.png`,
    ],
  },
];

export const SLIDES2_STYLE_PRESETS = PPT_STYLES;

export const PPT_RATIOS = [
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '1:1', label: '1:1' },
  { value: '9:16', label: '9:16' },
  { value: '3:4', label: '3:4' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '21:9', label: '21:9' },
];

export const PPT_SIZES = [
  { value: '1K', label: '1K Standard' },
  { value: '2K', label: '2K HD' },
  { value: '4K', label: '4K Ultra HD' },
];
