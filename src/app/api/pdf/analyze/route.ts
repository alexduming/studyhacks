import { NextRequest, NextResponse } from 'next/server';
import * as pdfjsLib from 'pdfjs-dist';

// 使用 Node.js 运行时，方便在服务端解析 PDF
export const runtime = 'nodejs';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface AnalysisResult {
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  content: string;
}

async function extractTextFromPDF(buffer: ArrayBuffer): Promise<string> {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n';
  }

  return fullText;
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
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const buffer = await file.arrayBuffer();

    // Extract text from PDF
    const extractedText = await extractTextFromPDF(buffer);

    if (!extractedText.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF' },
        { status: 400 }
      );
    }

    // Analyze the content
    const analysis = await analyzeContentWithAI(extractedText);

    return NextResponse.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('PDF Analysis Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to analyze PDF',
        details:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : undefined,
      },
      { status: 500 }
    );
  }
}
