// OpenRouter AI Service for handling various AI-powered features
export interface GenerateNotesParams {
  content: string;
  type: 'audio' | 'video' | 'pdf' | 'text';
  fileName: string;
  outputLanguage?: string; // 输出语言，如 'auto', 'zh', 'en' 等
}

export interface GenerateFlashcardsParams {
  content: string;
  count: number;
}

export interface GenerateQuizParams {
  content: string;
  questionCount: number;
  questionTypes?: string[];
}

export interface GeneratePodcastParams {
  notes: string;
  voiceStyle?: 'narrator' | 'conversational' | 'energetic';
  duration?: number;
}

export interface Flashcard {
  front: string;
  back: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface QuizQuestion {
  question: string;
  type: 'multiple-choice' | 'true-false' | 'fill-blank';
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
  // 为了在兜底题目里标记“难度”，这里补充一个可选 difficulty 字段
  // 不影响现有使用方，只有我们在 createFallbackQuiz 里会用到
  difficulty?: 'easy' | 'medium' | 'hard';
}

export interface AIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class OpenRouterService {
  private static instance: OpenRouterService;
  private apiKey: string;
  private baseURL = 'https://openrouter.ai/api/v1';

  private constructor() {
    // 非程序员解释：
    // 1. 这里从前端可用的环境变量中读取 OpenRouter 的密钥
    // 2. 变量名必须以 NEXT_PUBLIC_ 开头，Next.js 才会把它注入到浏览器里
    // 3. 请在 .env.local 中新增（或确认已有）这一行：
    //    NEXT_PUBLIC_OPENROUTER_API_KEY=你的 OpenRouter API Key
    this.apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || '';
  }

  static getInstance(): OpenRouterService {
    if (!OpenRouterService.instance) {
      OpenRouterService.instance = new OpenRouterService();
    }
    return OpenRouterService.instance;
  }

  private async callAI(prompt: string, systemPrompt?: string): Promise<string> {
    try {
      // 防御性检查：如果没有配置密钥，直接给出清晰错误，方便排查
      if (!this.apiKey) {
        // 这一条信息只会出现在浏览器控制台，真实页面仍然只会显示“生成失败”之类的文案
        throw new Error(
          'OpenRouter API 密钥未配置：请在 .env.local 中设置 NEXT_PUBLIC_OPENROUTER_API_KEY=你的密钥'
        );
      }

      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Turbo AI Study Platform',
        },
        body: JSON.stringify({
          // 使用 DeepSeek V3.2 Exp 模型
          // 对应你给出的文档：https://openrouter.ai/deepseek/deepseek-v3.2-exp
          // 如果未来要换模型，只需要改这一行（或做成可配置）
          model: 'deepseek/deepseek-v3.2-exp',
          messages: [
            ...(systemPrompt
              ? [{ role: 'system', content: systemPrompt }]
              : []),
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        // 为了更精准地找到问题，这里把 HTTP 状态码和返回文本尽量带出来
        let errorText = '';
        try {
          errorText = await response.text();
        } catch {
          // 如果读取 body 失败，也不影响后续抛错
        }

        throw new Error(
          `API request failed (HTTP ${response.status}): ${
            response.statusText || errorText || 'Unknown error'
          }`
        );
      }

      const data = await response.json();
      return data.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('OpenRouter API error:', error);
      throw error;
    }
  }

  /**
   * 检测文本内容的主要语言
   * 简单实现：通过中文字符比例判断
   */
  private detectLanguage(content: string): string {
    if (!content || content.trim().length === 0) {
      return 'en'; // 默认英文
    }

    // 统计中文字符数量
    const chineseCharCount = (content.match(/[\u4e00-\u9fff]/g) || []).length;
    const totalCharCount = content.replace(/\s/g, '').length;

    // 如果中文字符占比超过30%，认为是中文
    if (totalCharCount > 0 && chineseCharCount / totalCharCount > 0.3) {
      return 'zh';
    }

    return 'en'; // 默认英文
  }

  /**
   * Generate notes from various input sources (audio, video, PDF, text)
   * 生成笔记，支持指定输出语言
   */
  async generateNotes(input: {
    content: string;
    type: 'audio' | 'video' | 'pdf' | 'text';
    fileName?: string;
    outputLanguage?: string; // 输出语言：'auto' | 'zh' | 'en' | 其他语言代码
  }) {
    // 确定实际使用的输出语言
    let targetLanguage = input.outputLanguage || 'auto';

    // 如果选择"自动"，则检测输入内容的语言
    if (targetLanguage === 'auto') {
      targetLanguage = this.detectLanguage(input.content);
    }

    // 构建语言指令
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

    // 根据目标语言生成相应的提示词
    // 中文使用详细的中文提示词，其他语言使用英文提示词（AI 模型通常能理解英文指令）
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
      // 非程序员解释：
      // - 这里捕获的是“调用 OpenRouter 失败”的所有情况
      // - 比如：没配密钥、密钥无效、模型名称写错、网络被墙/CORS 拒绝等
      // - 之前我们只返回一句“生成失败”，看不到真正原因，现在把具体错误信息透传出去，方便你排查
      console.error('Error generating notes:', error);
      return {
        success: false,
        // 如果是 Error 对象，就把 message 传给前端 UI；否则用一个兜底文案
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate notes. Please check OpenRouter configuration.',
        notes: '',
      };
    }
  }

  /**
   * Generate flashcards from content
   */
  async generateFlashcards(
    content: string,
    count: number = 10,
    outputLanguage: string = 'auto'
  ) {
    // 非程序员解释：
    // - outputLanguage = 'auto' 时，我们会自动检测资料内容的主语言
    // - 这样就能做到“上传中文 -> 默认生成中文闪卡；上传英文 -> 默认英文”
    // - 用户也可以在前端强制指定英文或中文
    let targetLanguage = outputLanguage || 'auto';
    if (targetLanguage === 'auto') {
      targetLanguage = this.detectLanguage(content);
    }

    const languageInstructions: Record<string, string> = {
      zh: '请使用中文生成每一张闪卡。问句（front）与答案（back）都必须是中文，保持教学友好语气。',
      en: 'Please generate each flashcard in English. Both the question (front) and the answer (back) must be written in English.',
    };

    const languageInstruction =
      languageInstructions[targetLanguage] ||
      `Please generate each flashcard in ${targetLanguage}. All questions and answers must consistently use ${targetLanguage}.`;

    const prompt = `Create ${count} high-quality educational flashcards from the following content for Turbo AI students. Each flashcard should have a front (question) and back (answer) side.

${languageInstruction}

Content: ${content}

Generate flashcards in the following JSON format:
{
  "flashcards": [
    {
      "front": "Question or term here",
      "back": "Answer or definition here",
      "difficulty": "easy" | "medium" | "hard"
    }
  ]
}

Make sure the flashcards:
- Cover key concepts from the content
- Have clear, concise questions
- Provide comprehensive answers
- Include appropriate difficulty ratings
- Are suitable for spaced repetition learning
- Are educational and student-friendly

Return ONLY valid JSON.`;

    try {
      const result = await this.callAI(prompt);

      // Parse JSON response
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No valid JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
          success: true,
          flashcards: parsed.flashcards || [],
          metadata: {
            count: parsed.flashcards?.length || 0,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (parseError) {
        console.error('Error parsing flashcard JSON:', parseError);
        // Fallback: create simple flashcards from the text
        const fallbackFlashcards = this.createFallbackFlashcards(
          content,
          count,
          targetLanguage
        );
        return {
          success: true,
          flashcards: fallbackFlashcards,
          metadata: {
            count: fallbackFlashcards.length,
            generatedAt: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      console.error('Error generating flashcards:', error);
      return {
        success: false,
        error: 'Failed to generate flashcards. Please try again.',
        flashcards: [],
      };
    }
  }

  /**
   * Generate quiz questions from content
   */
  async generateQuiz(content: string, questionCount: number = 5) {
    const prompt = `Create ${questionCount} diverse educational quiz questions from the following content for Turbo AI. Include multiple choice, true/false, and fill-in-the-blank questions.

Content: ${content}

Generate questions in the following JSON format:
{
  "questions": [
    {
      "type": "multiple-choice" | "true-false" | "fill-blank",
      "question": "Question text here",
      "options": ["Option A", "Option B", "Option C", "Option D"], // for multiple choice only
      "correctAnswer": "correct answer here", // actual answer text
      "explanation": "Explanation of why this is the correct answer",
      "difficulty": "easy" | "medium" | "hard",
      "topic": "Topic category"
    }
  ]
}

Make sure questions:
- Test understanding of key concepts
- Have clear, unambiguous correct answers
- Include helpful explanations
- Cover different difficulty levels
- Are appropriate for students

Return ONLY valid JSON.`;

    try {
      const result = await this.callAI(prompt);

      // Parse JSON response
      try {
        const jsonMatch = result.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No valid JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
          success: true,
          questions: parsed.questions || [],
          metadata: {
            count: parsed.questions?.length || 0,
            generatedAt: new Date().toISOString(),
          },
        };
      } catch (parseError) {
        console.error('Error parsing quiz JSON:', parseError);
        // Fallback: create simple quiz from the text
        const fallbackQuiz = this.createFallbackQuiz(content, questionCount);
        return {
          success: true,
          questions: fallbackQuiz,
          metadata: {
            count: fallbackQuiz.length,
            generatedAt: new Date().toISOString(),
          },
        };
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      return {
        success: false,
        error: 'Failed to generate quiz. Please try again.',
        questions: [],
      };
    }
  }

  /**
   * Generate podcast script from notes
   */
  async generatePodcastScript(
    content: string,
    voiceStyle: 'professional' | 'friendly' | 'academic' = 'professional'
  ) {
    const styleInstructions = {
      professional:
        'Use formal, clear language suitable for educational content. Maintain a professional tone while being engaging.',
      friendly:
        'Use conversational, approachable language. Include friendly transitions and a warm, encouraging tone.',
      academic:
        'Use precise, scholarly language. Maintain academic rigor while ensuring clarity and accessibility.',
    };

    const prompt = `Convert the following content into an engaging educational podcast script for Turbo AI. ${styleInstructions[voiceStyle]}

Content: ${content}

Create a podcast script that:
1. Has a clear introduction and conclusion
2. Flows naturally between topics
3. Is conversational and engaging
4. Is approximately 5-10 minutes when read aloud
5. Includes natural transitions and pacing cues
6. Maintains listener interest throughout
7. Is educational and student-friendly

Format as a complete script with speaker notes and timing cues where appropriate.`;

    try {
      const result = await this.callAI(prompt);

      // Estimate duration based on word count (average 150 words per minute)
      const estimatedDuration = Math.ceil(result.split(' ').length / 150);

      return {
        success: true,
        script: result,
        metadata: {
          wordCount: result.split(' ').length,
          estimatedDuration: estimatedDuration,
          voiceStyle,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('Error generating podcast script:', error);
      return {
        success: false,
        error: 'Failed to generate podcast script. Please try again.',
        script: '',
      };
    }
  }

  /**
   * Fallback method to create simple flashcards
   */
  private createFallbackFlashcards(
    content: string,
    count: number,
    language: string = 'en'
  ): Flashcard[] {
    // 防御性兜底：若 AI JSON 解析失败，仍然返回基础可用的闪卡
    const sentences = content
      .split(/[\n。.!?]/)
      .filter((s) => s.trim().length > 20);
    const flashcards: Flashcard[] = [];
    const isChinese = language === 'zh';

    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        flashcards.push({
          front: isChinese
            ? `这段内容的考点是什么：「${sentence.substring(0, 100)}...」`
            : `What is described in the following: "${sentence.substring(0, 100)}..."`,
          back: sentence,
          difficulty: 'medium',
        });
      }
    }

    return flashcards;
  }

  /**
   * Fallback method to create simple quiz questions
   */
  private createFallbackQuiz(content: string, count: number): QuizQuestion[] {
    const questions: QuizQuestion[] = [];
    const sentences = content.split('.').filter((s) => s.trim().length > 20);

    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        // 这里的 QuizQuestion 类型在上面已经包含 difficulty 字段
        // 为了消除 TS 报错，显式断言为 QuizQuestion
        const question: QuizQuestion = {
          type: 'true-false',
          question: `True or False: ${sentence}`,
          correctAnswer: 0, // True
          explanation: 'Based on the provided content.',
          difficulty: 'medium',
        };
        questions.push(question);
      }
    }

    return questions;
  }
}

export default OpenRouterService;
