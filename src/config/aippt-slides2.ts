export const AUTO_MODE_PREFIX = '[AUTO_PAGE]';

/**
 * 🎨 视觉规范接口
 *
 * 非程序员解释：
 * - 这个接口定义了 PPT 风格的视觉规范
 * - 包含标题、背景、正文、强调色等基础属性
 * - visual_style 是扩展属性，用于存储更详细的视觉风格信息（由 AI 分析生成）
 */
export interface VisualSpecification {
  header?: {
    position: 'top-left' | 'top-right' | 'top-center' | 'variable';
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
  /**
   * 🎯 扩展视觉风格（由 AI 分析生成的详细规范）
   *
   * 非程序员解释：
   * - 这是一个可选的扩展字段，用于存储更详细的视觉风格信息
   * - 包含配色方案、字体排版、布局结构、图形元素、特效等
   * - 由 AI 分析参考图后自动生成
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visual_style?: Record<string, any>;
}

/**
 * 🌐 多语言文本结构
 *
 * 非程序员解释：
 * - 这个结构用于存储同一内容的不同语言版本
 * - zh: 中文版本
 * - en: 英文版本
 */
export interface LocalizedText {
  zh: string;
  en: string;
}

export interface PPTStyle {
  id: string;
  /** 风格标题（默认值，向后兼容） */
  title: string;
  /** 风格描述（默认值，向后兼容） */
  tagline: string;
  /** 🌐 多语言支持：包含中英文版本的标题和描述 */
  i18n?: {
    title: LocalizedText;
    tagline: LocalizedText;
  };
  preview: string;
  refs?: string[];
  prompt: string;
  visualSpec?: VisualSpecification;
}

/**
 * 🌐 获取风格的本地化标题
 *
 * 非程序员解释：
 * - 根据当前语言环境返回对应的标题
 * - 如果没有多语言配置，则返回默认标题
 *
 * @param style - PPT 风格对象
 * @param locale - 当前语言环境 ('zh' | 'en')
 * @returns 本地化后的标题
 */
export function getLocalizedTitle(style: PPTStyle, locale: string): string {
  if (style.i18n?.title) {
    return locale === 'zh' ? style.i18n.title.zh : style.i18n.title.en;
  }
  return style.title;
}

/**
 * 🌐 获取风格的本地化描述
 *
 * 非程序员解释：
 * - 根据当前语言环境返回对应的描述/标语
 * - 如果没有多语言配置，则返回默认描述
 *
 * @param style - PPT 风格对象
 * @param locale - 当前语言环境 ('zh' | 'en')
 * @returns 本地化后的描述
 */
export function getLocalizedTagline(style: PPTStyle, locale: string): string {
  if (style.i18n?.tagline) {
    return locale === 'zh' ? style.i18n.tagline.zh : style.i18n.tagline.en;
  }
  return style.tagline;
}

/**
 * 🎯 视觉规范提示词生成器
 */
export function generateVisualSpecPrompt(
  spec: VisualSpecification,
  deckContext?: { currentSlide: number; totalSlides: number }
): string {
  const parts = [];

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
 * 🎯 锚定提示词生成器（强化版 - 严格避免布局重复）
 * 
 * 非程序员解释：
 * - 锚定的目的是保持标题样式和整体风格一致，但**绝不是**复制页面布局
 * - 每页的内容区域必须根据具体内容灵活设计，严格避免所有页面看起来一模一样
 * - 特别强调：禁止重复使用四宫格、三栏等固定布局模式
 * 
 * 锚定内容（MUST 严格遵循）：
 * ✅ 标题：位置、字体、字号、颜色、粗细
 * ✅ 整体风格：配色方案、设计语言
 * 
 * 不锚定内容（必须根据内容灵活调整）：
 * ❌ 内容区域的布局方式（禁止重复使用四宫格、三栏等固定布局）
 * ❌ 元素的排列方式和数量
 * ❌ 图形和图表的具体形式
 */
export function generateAnchorPrompt(anchorImageUrl?: string | null): string {
  if (!anchorImageUrl) return '';
  return `\n\n--- STYLE CONTINUITY ANCHOR (Title & Color Only) ---
[REFERENCE IMAGE]: ${anchorImageUrl}

⚠️ CRITICAL WARNING: This reference is ONLY for title style and color palette. DO NOT replicate the content layout structure!

STRICT ANCHORING (Match Exactly):
✓ Title positioning (exact location on slide)
✓ Title typography (font family, size, weight, color - must match)
✓ Color scheme (primary/accent colors, background tone)
✓ Overall aesthetic (modern/professional/clean style)

MUST VARY (Do NOT Copy):
✗ Content area layout structure (AVOID repeating grid patterns like 4-box, 3-column, etc.)
✗ Element organization and arrangement
✗ Visual hierarchy in content area
✗ Chart/graphic types and positions
✗ Number and size of content blocks

LAYOUT DIVERSITY MANDATE:
Each slide MUST have a UNIQUE content layout. Think magazine design - consistent brand but diverse page layouts.

If reference uses 4-box grid → Use timeline, flowchart, or vertical list instead
If reference uses columns → Use horizontal flow, single focus, or comparison layout instead
If reference uses grid → Use pyramid, circular, or asymmetric layout instead

Layout variety examples:
• Data/stats → Timeline, progress bars, or metric dashboard (not grid)
• Comparisons → Side-by-side, vs. layout, or table (not boxes)
• Key message → Large central focus with minimal supporting text
• Process steps → Horizontal/vertical flow with arrows, numbered sequence
• Multiple points → Prioritized list, icon-based rows, or staggered layout

FORBIDDEN: Creating slides that look like "the same template with different text". Each slide's content area should be architecturally different while maintaining title consistency and color harmony.

Goal: Instant brand recognition (title + colors) + Visual diversity (unique layouts) = Professional, engaging presentation.`;
}

const CDN_BASE_URL = 'https://cdn.studyhacks.ai';

export const PPT_STYLES: PPTStyle[] = [
{
    "id": "work_result",
    "title": "Work Report",
    "tagline": "商务红蓝、结构化汇报",
    "i18n": {
      "title": {
        "zh": "工作汇报",
        "en": "Work Report"
      },
      "tagline": {
        "zh": "商务红蓝、结构化汇报",
        "en": "Business Red-Blue, Structured Reporting"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调成果量化、商务红蓝配色和多样化的高阶图表形式。",
    "preview": "https://cdn.studyhacks.ai/styles/work_result/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/work_result/preview.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref1.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref2.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref3.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref4.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref5.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref6.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref7.png",
      "https://cdn.studyhacks.ai/styles/work_result/ref8.png"
    ]
  },
  {
    "id": "red_tech",
    "title": "Red Tech",
    "tagline": "深红科技、高冲击力",
    "i18n": {
      "title": {
        "zh": "红色科技",
        "en": "Red Tech"
      },
      "tagline": {
        "zh": "深红科技、高冲击力",
        "en": "Deep Red Tech, High Impact"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调极高信息密度、强视觉冲击力和严谨的商务结构。",
    "preview": "https://cdn.studyhacks.ai/styles/red_tech/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/red_tech/preview.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref1.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref2.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref3.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref4.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref5.png",
      "https://cdn.studyhacks.ai/styles/red_tech/ref6.png"
    ]
  },
  {
    "id": "scholar",
    "title": "Scholar",
    "tagline": "深红褐、学术严谨",
    "i18n": {
      "title": {
        "zh": "学术风",
        "en": "Scholar"
      },
      "tagline": {
        "zh": "深红褐、学术严谨",
        "en": "Deep Burgundy, Academic Rigor"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调学术严谨性、深红配色和结构化呈现。",
    "preview": "https://cdn.studyhacks.ai/styles/scholar/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/scholar/preview.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref1.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref2.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref3.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref4.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref5.png",
      "https://cdn.studyhacks.ai/styles/scholar/ref6.png"
    ]
  },
  {
    "id": "scholar_green",
    "title": "Eco Scholar",
    "tagline": "墨绿自然、生态研究",
    "i18n": {
      "title": {
        "zh": "生态学术",
        "en": "Eco Scholar"
      },
      "tagline": {
        "zh": "墨绿自然、生态研究",
        "en": "Forest Green, Ecological Research"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调逻辑严密、多模块对比和学术美感。",
    "preview": "https://cdn.studyhacks.ai/styles/scholar_green/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/scholar_green/preview.png"
    ]
  },
  {
    "id": "claymation",
    "title": "Claymation",
    "tagline": "治愈黏土、3D 质感",
    "i18n": {
      "title": {
        "zh": "黏土动画",
        "en": "Claymation"
      },
      "tagline": {
        "zh": "治愈黏土、3D 质感",
        "en": "Healing Clay, 3D Texture"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调 3D 材质感、治愈色系和圆润的手工痕迹。",
    "preview": "https://cdn.studyhacks.ai/styles/claymation/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/claymation/ref1.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref2.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref3.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref4.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref5.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref6.png",
      "https://cdn.studyhacks.ai/styles/claymation/ref7.png"
    ],
    "visualSpec": {
      "header": {
        "position": "top-left" as const,
        "offsetY": "5-8%",
        "fontSize": "约40-48px（3D黏土立体字）",
        "fontWeight": "extra-bold" as const,
        "color": "#5D4037（深褐土色/Deep Earth）",
        "fontFamily": "圆润敦实的3D黏土质感字体"
      },
      "background": {
        "type": "solid" as const,
        "value": "#F6F2EA（温暖奶油白）或极浅暖灰",
        "texture": "细腻的纸张 or 布面纹理"
      },
      "body": {
        "fontSize": "16-18px",
        "lineHeight": "1.5",
        "color": "#4E342E（深灰褐）",
        "fontFamily": "圆角无衬线体（Rounded Sans-serif）"
      },
      "accentColor": "#8D6E63（陶土红/Terracotta）",
      "secondaryColor": "#81C784（薄荷绿）",
      "container": {
        "borderRadius": "12-16px（圆润边缘）",
        "backgroundColor": "压平的黏土片效果（#FAF8F5）",
        "shadow": "柔和自然阴影（Ambient Occlusion）"
      }
    }
  },
  {
    "id": "dieter-rams",
    "title": "Dieter Rams",
    "tagline": "少即是多、绝对秩序",
    "i18n": {
      "title": {
        "zh": "迪特·拉姆斯",
        "en": "Dieter Rams"
      },
      "tagline": {
        "zh": "少即是多、绝对秩序",
        "en": "Less is More, Absolute Order"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调极致克制、纯白背景、严谨网格和洋红色点缀。",
    "preview": "https://cdn.studyhacks.ai/styles/minimalism-magenta/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/minimalism-magenta/preview.png",
      "https://cdn.studyhacks.ai/styles/minimalism-magenta/ref1.png"
    ]
  },
  {
    "id": "illustration-lab",
    "title": "Illustration",
    "tagline": "现代插画、活力商务",
    "i18n": {
      "title": {
        "zh": "现代插画",
        "en": "Illustration"
      },
      "tagline": {
        "zh": "现代插画、活力商务",
        "en": "Modern Illustration, Vibrant Business"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调扁平化人物、明快配色和模块化内容组合。",
    "preview": "https://cdn.studyhacks.ai/styles/modern_illustration/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/modern_illustration/preview.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref1.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref2.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref3.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref4.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref5.png",
      "https://cdn.studyhacks.ai/styles/modern_illustration/ref6.png"
    ]
  },
  {
    "id": "data_vision",
    "title": "Data Vision",
    "tagline": "数据仪表板、科技质感",
    "i18n": {
      "title": {
        "zh": "数据可视化",
        "en": "Data Vision"
      },
      "tagline": {
        "zh": "数据仪表板、科技质感",
        "en": "Data Dashboard, Tech Aesthetic"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调网格化布局、专业图表和高密度数据展示。",
    "preview": "https://cdn.studyhacks.ai/styles/data_vision/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/data_vision/ref1.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref2.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref3.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref4.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref5.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref6.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref7.png",
      "https://cdn.studyhacks.ai/styles/data_vision/ref8.png"
    ]
  },
  {
    "id": "vintage-minimalism",
    "title": "复古简约",
    "tagline": "温暖学术、人文主义",
    "i18n": {
      "title": {
        "zh": "复古简约",
        "en": "Vintage Minimalism"
      },
      "tagline": {
        "zh": "温暖学术、人文主义",
        "en": "Warm Academic, Humanistic"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调纸张质感、赤陶红配色和优雅的衬线体。",
    "preview": "https://cdn.studyhacks.ai/styles/vintage-minimalism/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/vintage-minimalism/preview.png"
    ]
  },
  {
    "id": "leader_love",
    "title": "领导最爱",
    "tagline": "商务大气、科技蓝",
    "i18n": {
      "title": {
        "zh": "领导最爱",
        "en": "Executive Favorite"
      },
      "tagline": {
        "zh": "商务大气、科技蓝",
        "en": "Business Elegance, Tech Blue"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调商务大气、信息丰富和高可信度。",
    "preview": "https://cdn.studyhacks.ai/styles/leader_love/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/leader_love/ref1.png",
      "https://cdn.studyhacks.ai/styles/leader_love/ref4.png",
      "https://cdn.studyhacks.ai/styles/leader_love/ref5.png",
      "https://cdn.studyhacks.ai/styles/leader_love/ref6.png",
      "https://cdn.studyhacks.ai/styles/leader_love/ref7.png",
      "https://cdn.studyhacks.ai/styles/leader_love/ref8.png"
    ]
  },
  {
    "id": "simple_business",
    "title": "简约商务",
    "tagline": "现代简约、蓝黑配色",
    "i18n": {
      "title": {
        "zh": "简约商务",
        "en": "Simple Business"
      },
      "tagline": {
        "zh": "现代简约、蓝黑配色",
        "en": "Modern Minimal, Blue-Black Palette"
      }
    },
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调呼吸感、L型边框装饰和标志性的蓝黑配色。",
    "preview": "https://cdn.studyhacks.ai/styles/simple_business/preview.png",
    "refs": [
      "https://cdn.studyhacks.ai/styles/simple_business/ref1.png",
      "https://cdn.studyhacks.ai/styles/simple_business/ref2.png",
      "https://cdn.studyhacks.ai/styles/simple_business/ref3.png",
      "https://cdn.studyhacks.ai/styles/simple_business/ref4.png",
      "https://cdn.studyhacks.ai/styles/simple_business/ref5.png"
    ]
  },
  {
    "id": "Y2K",
    "title": "Y2K 数字复古",
    "tagline": "千禧复古",
    "preview": "https://cdn.studyhacks.ai/studyhacks-ppt/styles/admin-previews/e855d04977000db2cdbe1648dd496538.png",
    "refs": [
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/admin-previews/e855d04977000db2cdbe1648dd496538.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750891450-ffd524b6-2a74-4bb0-96f8-fd11ff98c120.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750892555-c4a48f0b-83bc-48ea-af22-c02eb4d88cec.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750892964-252064cb-a8b5-4499-ae1d-f51852469c54.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750893272-a7da00d0-f1ee-4cb6-9244-4ef6f1242e8c.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750893635-97d80b49-5f5a-42e6-b9ce-1c88a6aa6a16.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769750745625/1769750893989-2e85f7a7-7675-48de-a1c7-701db73d5916.png"
    ],
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成一套幻灯片。强调 Windows 95 复古风，糖果色，卡通手绘元素，不规则排版。",
    "visualSpec": {
      "header": {
        "position": "variable" as const,
        "fontSize": "36-60px",
        "fontWeight": "bold" as const,
        "color": "#4A90E2",
        "fontFamily": "Arial, sans-serif"
      },
      "background": {
        "type": "solid" as const,
        "value": "#FFFFF0",
        "texture": "none"
      },
      "body": {
        "fontSize": "14-16px",
        "lineHeight": "1.4",
        "color": "#000000",
        "fontFamily": "Arial, sans-serif"
      },
      "accentColor": "#FF69B4",
      "secondaryColor": "#90EE90",
      "container": {
        "borderRadius": "4px",
        "backgroundColor": "#FFFFFF",
        "shadow": "0px 2px 4px rgba(0, 0, 0, 0.1)"
      }
    }
  },
  {
    "id": "elegant_frosted_gold",
    "title": "优雅磨砂金",
    "tagline": "高雅内敛，精致品质，适合高端品牌展示",
    "preview": "https://cdn.studyhacks.ai/studyhacks-ppt/styles/admin-previews/3b413378e0bb242058d6df2d52d9273f.png",
    "refs": [
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/admin-previews/3b413378e0bb242058d6df2d52d9273f.png",
      "https://cdn.studyhacks.ai/studyhacks-ppt/styles/temp-1769778467705/1769779330610-6ffc7e81-9f08-4e73-93a4-34092ac7adca.jpg"
    ],
    "prompt": "你是一位专家级UI、UX演示设计师，请根据参考图风格生成幻灯片。核心特征：深色背景，金色文字和图标，磨砂玻璃卡片效果，整体风格高雅、内敛、具有品质感。",
    "visualSpec": {
      "visual_style": {
        "style_name": "优雅磨砂金 / Elegant Frosted Gold",
        "overall_vibe": "高雅、内敛、品质感、精致、现代",
        "color_palette": {
          "background": {
            "hex": "#222222",
            "description": "深灰色背景，营造内敛沉稳的氛围"
          },
          "accent_colors": [
            {
              "hex": "#D4A373",
              "name": "金色",
              "usage": "主标题、图标、强调文字，提升精致感"
            }
          ],
          "text_colors": {
            "title": "#D4A373",
            "body": "#FFFFFF",
            "muted": "#AAAAAA"
          },
          "gradient": {
            "type": "none" as const,
            "value": "none",
            "description": "无渐变"
          }
        },
        "typography": {
          "main_title": {
            "font_family": "思源黑体 / Source Han Sans CN",
            "characteristics": "笔画现代、字形端正",
            "size_range": "36-48px",
            "weight": "bold",
            "effects": "无特效"
          },
          "subtitle": {
            "font_family": "思源黑体 / Source Han Sans CN",
            "characteristics": "笔画现代、字形端正",
            "size_range": "24-32px"
          },
          "body_text": {
            "font_family": "思源黑体 / Source Han Sans CN",
            "line_height": "1.5",
            "size_range": "14-16px"
          }
        },
        "layout_composition": {
          "type": "居中对称" as const,
          "structure": [
            "卡片式布局，内容居中对齐",
            "视觉元素集中在中心区域"
          ],
          "spacing": "适中留白",
          "alignment": "居中",
          "layering": "磨砂玻璃卡片置于背景之上，形成视觉层级"
        },
        "graphic_elements": {
          "icons": [
            "线性图标，金色描边",
            "简约抽象"
          ],
          "decorations": [
            "无明显装饰元素"
          ],
          "shapes": [
            "矩形（卡片背景），边角圆润"
          ],
          "patterns": [
            "无明显图案纹理"
          ]
        },
        "photography_style": {
          "tone": "无照片",
          "scenes": [],
          "composition": "",
          "treatment": ""
        },
        "effects": {
          "corners": "大圆角",
          "shadows": "柔和投影",
          "blur": "磨砂玻璃模糊效果",
          "texture": "磨砂质感",
          "special": [
            "磨砂玻璃效果模拟，增加朦胧感和层次感"
          ]
        },
        "motifs": [
          "金色线性图标",
          "磨砂玻璃卡片"
        ]
      }
    }
  }
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
