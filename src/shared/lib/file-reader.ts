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
    }文件。StudyHacks 可以帮助您：\n\n1. 转录音频内容为文字\n2. 提取关键信息和要点\n3. 生成结构化的学习笔记\n4. 创建相关的闪卡和测验\n\n请稍候，AI 正在处理您的文件...`;
  }

  // 3. PDF：走后端 /api/pdf/analyze，用 pdfjs-dist 在服务器解析
  // 非程序员解释：
  // - PDF 文件不能直接在浏览器中读取文本，需要服务器端解析
  // - 我们把文件发送到 /api/pdf/analyze 接口，服务器用 PDF.js 库解析
  // - 解析完成后，服务器返回提取的文本内容
  if (mime === 'application/pdf' || name.endsWith('.pdf')) {
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/pdf/analyze', {
        method: 'POST',
        body: formData,
      });

      // 检查 HTTP 响应状态
      if (!response.ok) {
        // 如果是 422 且标记了 needsOCR，抛出特殊错误供前端处理
        if (response.status === 422) {
          const errorData = await response.json();
          if (errorData.needsOCR) {
            const error = new Error('PDF needs OCR');
            (error as any).code = 'NEEDS_OCR';
            throw error;
          }
        }

        // Response 的 body 只能读取一次，这里克隆一份做兜底解析
        const fallbackResponse = response.clone();
        let errorMessage = `PDF 解析失败：HTTP ${response.status}`;

        try {
          // 尝试解析错误响应（可能是 JSON 格式）
          const errorData = await response.json();
          if (errorData?.error) {
            errorMessage = errorData.error;
            if (errorData?.details) {
              errorMessage += ` (${errorData.details})`;
            }
          }
        } catch {
          try {
            // 如果不是 JSON，尝试读取文本
            const text = await fallbackResponse.text();
            if (text) {
              errorMessage += ` - ${text}`;
            }
          } catch {
            // ignore secondary failure
          }
        }

        throw new Error(errorMessage);
      }

      // 解析响应数据
      const data = await response.json();

      // 检查 API 返回的 success 字段
      if (data.success === false) {
        throw new Error(data.error || 'PDF 解析失败，请稍后重试');
      }

      // 从多个可能的路径提取内容
      // 非程序员解释：
      // - API 可能返回不同的数据结构
      // - 我们尝试从多个可能的路径获取内容，确保兼容性
      const content =
        data?.content || // 直接返回 content
        data?.data?.content || // 嵌套在 data 对象中（标准格式）
        data?.data?.text || // 备用路径
        data?.text || // 另一个备用路径
        '';

      if (!content || !content.trim()) {
        throw new Error(
          'PDF 文件中未提取到任何可用文本。这可能是因为 PDF 是扫描版（图片格式）或文件已损坏。'
        );
      }

      return content;
    } catch (error) {
      // 重新抛出错误，让调用者处理
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('读取 PDF 文件时出现未知错误');
    }
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
