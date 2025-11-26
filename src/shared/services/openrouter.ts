// OpenRouter AI Service for handling various AI-powered features
export interface GenerateNotesParams {
  content: string;
  type: 'audio' | 'video' | 'pdf' | 'text';
  fileName: string;
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
   * Generate notes from various input sources (audio, video, PDF, text)
   */
  async generateNotes(input: {
    content: string;
    type: 'audio' | 'video' | 'pdf' | 'text';
    fileName?: string;
  }) {
    const prompt = `You are an AI-powered note-taking assistant for Turbo AI. Generate comprehensive, well-structured notes from the following ${input.type} content.

Content: ${input.content}
File name: ${input.fileName || 'Unknown'}

Please create notes that include:
1. **Main Topics**: Key concepts and themes
2. **Important Points**: Critical information and details
3. **Key Terms**: Important vocabulary with definitions
4. **Summary**: Brief overview of the content
5. **Action Items**: Practical applications or next steps

Format the notes in markdown with proper headings, bullet points, and emphasis where appropriate.
Make it educational and easy to understand for students.`;

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
  async generateFlashcards(content: string, count: number = 10) {
    const prompt = `Create ${count} high-quality educational flashcards from the following content for Turbo AI students. Each flashcard should have a front (question) and back (answer) side.

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
          count
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
    count: number
  ): Flashcard[] {
    const sentences = content.split('.').filter((s) => s.trim().length > 20);
    const flashcards: Flashcard[] = [];

    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        flashcards.push({
          front: `What is described in the following: "${sentence.substring(0, 100)}..."`,
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
