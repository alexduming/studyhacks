import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';

// 使用 Node.js 运行时，方便在服务端解析 PDF
export const runtime = 'nodejs';

interface AnalysisResult {
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  content: string;
}

/**
 * 从 PDF 文件中提取文本内容
 *
 * 非程序员解释：
 * - pdf-parse 是封装好的 PDF 解析库，专门用于 Node.js 环境
 * - 它内置了 PDF.js 以及各种浏览器 API 的 polyfill，不再需要我们手动补 DOMMatrix 等对象
 * - 把 PDF 文件转成 Buffer 后丢给 pdf-parse，它会返回整份文档的纯文本
 */
async function extractTextFromPDF(buffer: ArrayBuffer): Promise<{
  text: string;
  totalPages: number;
}> {
  try {
    const nodeBuffer = Buffer.from(buffer);
    const parsed = await pdf(nodeBuffer);

    console.log('[PDF Debug] Parsed Info:', {
      numpages: parsed.numpages,
      info: parsed.info,
      metadata: parsed.metadata,
      textLength: parsed.text?.length || 0,
      version: parsed.version
    });

    return {
      text: (parsed.text || '').trim(),
      totalPages: parsed.numpages || 0,
    };
  } catch (error) {
    console.error('❌ PDF 文本提取失败:', error);
    throw new Error(
      `提取 PDF 文本失败: ${error instanceof Error ? error.message : '未知错误'}`
    );
  }
}

async function analyzeContentWithAI(text: string): Promise<AnalysisResult> {
  // 这里原本可以集成真正的 AI 服务
  // 为了保持简单，我们先做一个「轻量级」的规则分析，返回结构化信息

  const lines = text.split('\n').filter((line) => line.trim());
  const firstLine = lines[0] || 'Untitled Document';

  // Extract potential title (usually the first line or a line with Title-like formatting)
  const title =
    firstLine.length > 100 ? firstLine.substring(0, 100) + '...' : firstLine;

  // Create summary from first few paragraphs
  const paragraphs = text.split('\n\n').filter((p) => p.trim());
  const summary = paragraphs.slice(0, 2).join(' ').substring(0, 500) + '...';

  // Extract key points (look for bullet points, numbered lists, or important sentences)
  const keyPoints = lines
    .filter((line) => {
      const trimmed = line.trim();
      return (
        trimmed.startsWith('•') ||
        trimmed.startsWith('-') ||
        trimmed.startsWith('*') ||
        /^\d+\./.test(trimmed) ||
        (trimmed.length > 50 && trimmed.includes('important'))
      );
    })
    .slice(0, 5)
    .map((point) => point.replace(/^[•\-*\d\.]\s*/, '').trim());

  // Extract topics (simple keyword extraction)
  const topicWords = [
    'biology',
    'cell',
    'molecule',
    'organism',
    'structure',
    'function',
  ];
  const topics = topicWords.filter((topic) =>
    text.toLowerCase().includes(topic)
  );

  return {
    title: `📚 ${title}`,
    summary,
    keyPoints:
      keyPoints.length > 0
        ? keyPoints
        : ['Key information extracted from the document'],
    topics: topics.length > 0 ? topics : ['General'],
    // content 字段保留完整原文文本，后续 /ai-note-taker 会用它来生成更高级的学习笔记
    content: text,
  };
}

export async function POST(request: NextRequest) {
  try {
    // Note: Authentication removed for demo purposes
    // In production, you would want to add proper authentication here

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('❌ PDF 解析失败: 未提供文件');
      return NextResponse.json(
        { success: false, error: '未提供文件，请选择要解析的 PDF 文件' },
        { status: 400 }
      );
    }

    // 检查文件类型：同时检查 MIME 类型和文件扩展名
    // 非程序员解释：
    // - 有些 PDF 文件可能没有正确的 MIME 类型（file.type 可能为空或错误）
    // - 所以我们也检查文件名的扩展名，确保能识别 .pdf 文件
    const fileName = file.name.toLowerCase();
    const isPdfByMime = file.type === 'application/pdf';
    const isPdfByExtension = fileName.endsWith('.pdf');

    if (!isPdfByMime && !isPdfByExtension) {
      console.error('❌ PDF 解析失败: 文件类型不正确', {
        fileName: file.name,
        mimeType: file.type,
      });
      return NextResponse.json(
        {
          success: false,
          error: `不支持的文件类型。请上传 PDF 文件（当前文件: ${file.name}, 类型: ${file.type || '未知'}）`,
        },
        { status: 400 }
      );
    }

    console.log('✅ 开始解析 PDF 文件:', {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });

    // Convert file to buffer
    // 非程序员解释：
    // - File 对象需要转换为 ArrayBuffer（二进制数据）才能被 PDF.js 解析
    const buffer = await file.arrayBuffer();

    console.log('📄 开始提取 PDF 文本内容...');

    // Extract text from PDF
    const { text: extractedText, totalPages } =
      await extractTextFromPDF(buffer);

    if (!extractedText || !extractedText.trim()) {
      console.warn('⚠️ PDF 文本提取为空，可能是扫描版 PDF，建议前端尝试 OCR');
      return NextResponse.json(
        {
          success: false,
          error: 'PDF 似乎是扫描版（无文本层），需要进行 OCR 识别。',
          needsOCR: true, // 告诉前端需要进行 OCR 处理
        },
        { status: 422 } // 422 Unprocessable Entity
      );
    }

    console.log('✅ PDF 文本提取成功:', {
      textLength: extractedText.length,
      totalPages,
    });

    // Analyze the content
    const analysis = await analyzeContentWithAI(extractedText);

    console.log('✅ PDF 分析完成:', {
      title: analysis.title,
      contentLength: analysis.content.length,
      keyPointsCount: analysis.keyPoints.length,
    });

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    // 详细的错误处理和日志记录
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('❌ PDF 解析错误:', {
      message: errorMessage,
      stack: errorStack,
      error: error,
    });

    return NextResponse.json(
      {
        success: false,
        error: '解析 PDF 文件时出现错误',
        details:
          process.env.NODE_ENV === 'development'
            ? errorMessage
            : '请检查文件格式是否正确，或稍后重试。',
      },
      { status: 500 }
    );
  }
}
