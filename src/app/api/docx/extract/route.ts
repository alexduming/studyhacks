import { NextRequest, NextResponse } from 'next/server';
import mammoth from 'mammoth';

// 强制使用 Node.js 运行时，方便使用 Buffer 和第三方解析库
export const runtime = 'nodejs';

/**
 * 非程序员解释：
 * - 这个接口专门用来“拆解” Word 文档（.docx），把里面的纯文字内容提取出来
 * - 前端上传文件到这里，这里用 mammoth 库把复杂的二进制 / XML 结构还原成正常的文本
 * - 提取出的文本会再交给 AI 去生成真正的学习笔记
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const fileName = file.name || 'document.docx';
    const lowerName = fileName.toLowerCase();

    // 只处理 .docx，其他格式直接拒绝，避免解析出错
    if (
      !lowerName.endsWith('.docx') &&
      file.type !==
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return NextResponse.json(
        {
          error:
            'Only .docx files are supported. Please convert .doc files to .docx first.',
        },
        { status: 400 }
      );
    }

    // 把上传的 File 转成 Node.js Buffer，方便 mammoth 处理
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 使用 mammoth 提取 Word 文档中的纯文本
    // 说明：extractRawText 会忽略样式，只保留文字内容，更适合后续做 AI 总结
    const result = await (mammoth as any).extractRawText({ buffer });
    const text: string = result?.value || '';

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the DOCX file' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      content: text,
      meta: {
        fileName,
        length: text.length,
      },
    });
  } catch (error) {
    console.error('DOCX Extract Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to extract text from DOCX file',
        details:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : undefined,
      },
      { status: 500 }
    );
  }
}






