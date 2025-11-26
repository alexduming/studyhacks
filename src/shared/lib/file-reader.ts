/**
 * 通用学习文件读取工具
 *
 * 非程序员解释：
 * - 这个文件专门负责“把各种格式的学习文件，变成一大段干净的文字”
 * - txt：直接读成文字
 * - pdf：交给后端 /api/pdf/analyze，用专业库拆成文字
 * - docx：交给后端 /api/docx/extract，用 Word 解析库拆成文字
 * - audio/video：暂时只返回一段“这是音频/视频文件，可以做什么”的说明文字
 *
 * 好处：
 * - 所有需要“从文件生成笔记 / 闪卡 / 测验”的页面，都可以复用这里的逻辑
 * - 后面要升级解析方式（比如接入语音转写）时，只改这里一处即可
 */

export type LearningFileType = 'audio' | 'video' | 'pdf' | 'text';

/**
 * 智能读取学习文件内容，返回可供 AI 使用的纯文本
 */
export const readLearningFileContent = async (file: File): Promise<string> => {
  const mime = file.type;
  const name = file.name.toLowerCase();

  // 1. 图片：不用真正解析，只给 AI 文件信息和用途说明
  if (mime.startsWith('image/')) {
    return `文件: ${file.name}\n大小: ${file.size} bytes\n类型: ${file.type}\n\n这是一个图片文件，AI 可以帮助您分析图片内容并生成相关笔记。`;
  }

  // 2. 音频 / 视频：目前仍然只用文件信息+提示文案，后续可以接语音识别
  if (mime.startsWith('audio/') || mime.startsWith('video/')) {
    return `文件: ${file.name}\n大小: ${file.size} bytes\n类型: ${
      file.type
    }\n\n这是一个${
      file.type.startsWith('audio/') ? '音频' : '视频'
    }文件。Turbo AI 可以帮助您：\n\n1. 转录音频内容为文字\n2. 提取关键信息和要点\n3. 生成结构化的学习笔记\n4. 创建相关的闪卡和测验\n\n请稍候，AI 正在处理您的文件...`;
  }

  // 3. PDF：走后端 /api/pdf/analyze，用 pdfjs-dist 在服务器解析
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/pdf/analyze', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `PDF 解析失败：${response.status} ${response.statusText || text}`
      );
    }

    const data = await response.json();
    const content =
      data?.content || data?.data?.content || data?.data?.text || '';

    if (!content || !content.trim()) {
      throw new Error('PDF 文件中未提取到任何可用文本');
    }

    return content;
  }

  // 4. DOCX：走后端 /api/docx/extract，用 mammoth 在服务器解析 Word 正文
  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/docx/extract', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `DOCX 解析失败：${response.status} ${response.statusText || text}`
      );
    }

    const data = await response.json();
    const content = data?.content || data?.text || '';

    if (!content || !content.trim()) {
      throw new Error('Word 文档中未提取到任何可用文本');
    }

    return content;
  }

  // 5. 默认：按纯文本读取（适用于 .txt / .md 等）
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      resolve((e.target?.result as string) || '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));

    reader.readAsText(file);
  });
};

/**
 * 根据 MIME 类型判断学习文件的大类（主要给统计 / 元数据用）
 */
export const detectLearningFileType = (mimeType: string): LearningFileType => {
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.includes('pdf')) return 'pdf';
  return 'text';
};
