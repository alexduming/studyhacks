import { AIResponse, GenerateNotesParams } from './openrouter';

export class DeepSeekService {
  private static instance: DeepSeekService;
  private apiKey: string;
  private baseURL = 'https://api.deepseek.com';

  private constructor() {
    /**
     * DeepSeek 官方 API 服务
     *
     * 配置方式：
     * 在 .env.local 或 Vercel 环境变量中设置 DEEPSEEK_API_KEY
     */
    this.apiKey = process.env.DEEPSEEK_API_KEY || '';
  }

  static getInstance(): DeepSeekService {
    if (!DeepSeekService.instance) {
      DeepSeekService.instance = new DeepSeekService();
    }
    return DeepSeekService.instance;
  }

  /**
   * 执行带超时和重试的 fetch 请求
   * 复用 OpenRouterService 的稳健网络请求逻辑
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    timeoutMs: number = 60000 // DeepSeek 有时响应较慢，给 60 秒
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, timeoutMs);

        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          return response;
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error(`请求超时（${timeoutMs}ms）`);
          }
          throw fetchError;
        }
      } catch (error: any) {
        lastError = error;
        // 简单重试逻辑
        if (attempt > maxRetries) throw error;
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    throw lastError || new Error('Request failed');
  }

  /**
   * 调用 DeepSeek API
   */
  private async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error(
        'DeepSeek API 密钥未配置：请设置 DEEPSEEK_API_KEY 环境变量'
      );
    }

    try {
      const response = await this.fetchWithRetry(
        `${this.baseURL}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // 使用 deepseek-chat (V3)
            // 原因：deepseek-reasoner (R1) 包含思考过程，响应较慢，容易导致 Vercel Serverless 函数超时 (60s)
            // V3 在文本摘要和格式化任务上表现已经非常出色
            model: 'deepseek-chat',
            messages: [
              ...(systemPrompt
                ? [{ role: 'system', content: systemPrompt }]
                : []),
              { role: 'user', content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 8192, // DeepSeek V3 最大支持 8K 输出
            stream: false,
          }),
        }
      );

      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {}
        throw new Error(
          `DeepSeek API Error (${response.status}): ${errorText}`
        );
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('DeepSeek API error:', error);
      throw error;
    }
  }

  /**
   * 检测语言 (复用逻辑)
   */
  private detectLanguage(content: string): string {
    if (!content || content.trim().length === 0) return 'en';
    const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalCharCount = content.replace(/\s/g, '').length;
    if (totalCharCount > 0 && chineseCharCount / totalCharCount > 0.3)
      return 'zh';
    return 'en';
  }

  /**
   * 生成笔记 - 迁移自 OpenRouterService
   * 使用 DeepSeek 官方模型
   */
  async generateNotes(input: GenerateNotesParams): Promise<{
    success: boolean;
    notes?: string;
    error?: string;
    metadata?: {
      wordCount: number;
      type: string;
      fileName?: string;
      generatedAt: string;
    };
  }> {
    let targetLanguage = input.outputLanguage || 'auto';
    if (targetLanguage === 'auto') {
      targetLanguage = this.detectLanguage(input.content);
    }

    // 复用之前的 Prompt 逻辑
    const languageInstructions: Record<string, string> = {
      zh: '请使用中文生成笔记。所有内容（包括标题、要点、总结等）都必须是中文。',
      en: 'Please generate notes in English. All content (including titles, points, summaries, etc.) must be in English.',
      es: 'Por favor, genera las notas en español. Todo el contenido debe estar en español.',
      fr: 'Veuillez générer les notes en français. Tout le contenu doit être en français.',
      de: 'Bitte generieren Sie die Notizen auf Deutsch. Alle Inhalte müssen auf Deutsch sein.',
      ja: '日本語でノートを生成してください。すべてのコンテンツは日本語である必要があります。',
      ko: '한국어로 노트를 생성해주세요. 모든 내용은 한국어여야 합니다.',
      pt: 'Por favor, gere as notas em português. Todo o conteúdo deve estar em português.',
      ru: 'Пожалуйста, создайте заметки на русском языке. Весь контент должен быть на русском языке.',
      ar: 'يرجى إنشاء الملاحظات باللغة العربية. يجب أن يكون كل المحتوى باللغة العربية.',
    };

    const languageInstruction =
      languageInstructions[targetLanguage] ||
      `Please generate notes in ${targetLanguage}. All content must be in ${targetLanguage}.`;

    const isChinese = targetLanguage === 'zh';

    const prompt = isChinese
      ? `你是一个专业的 AI 笔记生成助手。请分析以下${input.type}内容，并将其转化为美观、结构化的可视化笔记，参考 Bento Grid 设计风格。

${languageInstruction}

## 设计风格要求
- **Bento Grid 风格**：单列布局，每个章节占据全宽，避免左右分栏
- **超大字体突出要点**：重要数字、核心概念使用超大字体或单独强调
- **视觉层次**：标题使用超大字体（# 一级标题），章节使用大字体（## 二级标题）
- **高对比度**：内容适合深色背景展示，重点内容高亮显示
- **可视化元素**：简洁的勾线图形化描述，运用 Font Awesome/Material Icons 风格的 emoji 或图表描述

## 输出格式要求
请使用 Markdown 格式，严格按照以下结构组织内容：

1. **主标题**（使用 # 一级标题）
   - 简洁概括整个文档的主题，不要遗漏核心信息
   - 标题要醒目，适合超大字体显示

2. **概述/简介**（在标题后，第一个 ## 二级标题之前的内容）
   - 简要介绍文档的核心内容，保留关键数据
   - 必须包含关键数字或统计信息，用 **粗体** 或单独段落突出

3. **章节内容**（使用 ## 二级标题）
   - 将内容分解为多个逻辑清晰的章节
   - **每个章节使用 ## 二级标题开始，占据全宽**
   - 章节内使用三级标题（###）、列表、强调等 Markdown 语法
   - 每个章节应该是一个完整的知识点或主题
   - **重要数字、百分比、统计数据**：使用单独段落，用超大字体描述（例如：**85%** 或 **3个核心要点**）

## 内容组织建议
- **核心概念**：重要理论和定义，使用 ### 三级标题，中英文混用（关键术语附英文）
- **关键要点**：需要重点掌握的信息，用列表或单独段落突出
- **重要数字**：统计数据、百分比、数量等，用 **粗体** 或单独强调
- **重要术语**：专业词汇及其解释，使用 \`代码格式\` 或 **粗体**
- **实际应用**：案例、示例或实践建议
- **总结要点**：章节或主题的总结

## 格式规范
- 使用适当的 Markdown 语法：标题、列表、强调、代码块等
- **字体大小**：标题要大，正文也要足够大
- 保持段落简洁，每段不超过 5 行
- 使用列表来组织要点，提高可读性
- 重要内容使用 **粗体** 强调
- 代码或术语使用 \`代码格式\` 显示
- 可以使用 emoji 作为主要图标，同时注重排版和字体大小对比

## 可视化建议
- 对于数据、统计信息，建议使用文字描述配合数字突出（例如："**85%** 的用户表示满意"）
- 对于流程、步骤，使用有序列表
- 对于对比、分类，使用表格形式（Markdown 表格）
- 对于重要概念，使用引用块（>）突出显示

## 风格要求
- 语言简洁明了，避免冗余
- 结构清晰，层次分明
- **单列布局**：所有内容垂直排列，不要左右分栏
- **深色主题友好**：颜色对比度要足够，适合深色背景
- **不遗漏信息**：确保核心要点完整

---

文件内容：
${input.content}

文件名称：${input.fileName || 'Unknown'}

请开始生成笔记：`
      : `You are a professional AI note-taking assistant. Analyze the following ${input.type} content and transform it into beautiful, well-structured visual notes in Bento Grid style.

${languageInstruction}

## Design Style Requirements
- **Bento Grid Style**: Single-column layout, each section takes full width
- **Large Fonts for Key Points**: Important numbers and core concepts should use extra-large fonts or separate emphasis
- **Visual Hierarchy**: Titles use extra-large fonts (# heading), sections use large fonts (## heading)
- **High Contrast**: Content suitable for dark background display, key points highlighted
- **Visual Elements**: Concise graphical descriptions, using Font Awesome/Material Icons style descriptions or charts

## Output Format Requirements
Please use Markdown format and strictly follow this structure:

1. **Main Title** (use # heading)
   - Briefly summarize the theme of the entire document, do not omit core information
   - Title should be eye-catching, suitable for extra-large font display

2. **Overview/Introduction** (content after title, before first ## heading)
   - Briefly introduce the core content of the document, retaining key data
   - Must include key numbers or statistics, highlighted with **bold** or separate paragraphs

3. **Section Content** (use ## heading)
   - Break content into multiple logically clear sections
   - **Each section uses ## heading and takes full width**
   - Use ### headings, lists, emphasis, and other Markdown syntax within sections
   - Each section should be a complete knowledge point or theme
   - **Important numbers, percentages, statistics**: Use separate paragraphs with extra-large font descriptions (e.g., **85%** or **3 Key Points**)

## Content Organization Suggestions
- **Core Concepts**: Important theories and definitions, use ### headings, mix English/Chinese where appropriate
- **Key Points**: Information that needs to be mastered, highlighted with lists or separate paragraphs
- **Important Numbers**: Statistics, percentages, quantities, etc., use **bold** or separate emphasis
- **Important Terms**: Professional vocabulary and explanations, use \`code format\` or **bold**
- **Practical Applications**: Cases, examples, or practical suggestions
- **Summary Points**: Summaries of sections or themes

## Format Specifications
- Use appropriate Markdown syntax: headings, lists, emphasis, code blocks, etc.
- **Font Sizes**: Titles should be large, body text should also be large enough
- Keep paragraphs concise, no more than 5 lines per paragraph
- Use lists to organize points for better readability
- Use **bold** to emphasize important content
- Use \`code format\` for code or terms
- **Avoid using emojis as main icons**, focus on typography and contrast

## Visualization Suggestions
- For data and statistics, suggest using text descriptions with highlighted numbers (e.g., "**85%** of users are satisfied")
- For processes and steps, use ordered lists
- For comparisons and classifications, use tables (Markdown tables)
- For important concepts, use blockquotes (>) to highlight

## Style Requirements
- Language should be concise and clear, avoid redundancy
- Clear structure with distinct hierarchy
- **Single-column layout**: All content arranged vertically, no left-right columns
- **Dark theme friendly**: Color contrast should be sufficient, suitable for dark backgrounds
- **Do not omit information**: Ensure core points are complete

---

File Content:
${input.content}

File Name: ${input.fileName || 'Unknown'}

Please start generating notes:`;

    try {
      const result = await this.callAI(prompt);

      return {
        success: true,
        notes: result,
        metadata: {
          wordCount: result.split(' ').length,
          type: input.type,
          fileName: input.fileName,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      console.error('Error generating notes with DeepSeek:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'DeepSeek API Error',
        notes: '',
      };
    }
  }
}
