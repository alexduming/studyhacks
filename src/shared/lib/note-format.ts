import MarkdownIt from 'markdown-it';

/**
 * Markdown 渲染器
 * 非程序员解释：
 * - 这个小工具负责把 Markdown 文本转换成 HTML，便于图文混排预览
 * - 关闭 HTML 直通，避免用户输入 <script> 之类的恶意标签
 */
const markdownRenderer = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

export function renderMarkdownToHtml(markdown: string) {
  return markdownRenderer.render(markdown);
}

/**
 * 从 Markdown 中提取第一个 # 标题，作为笔记名称
 */
export function extractTitle(markdown: string, fallback: string) {
  const match = markdown.match(/^\s*#\s+(.+)$/m);
  if (match && match[1]) {
    return match[1].trim();
  }
  return fallback || 'Untitled Note';
}

/**
 * 生成摘要：取首个非空段落，去掉 Markdown 语法符号
 */
export function extractSummary(markdown: string, maxLength = 160) {
  const lines = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.startsWith('>'));

  if (lines.length === 0) {
    return '';
  }

  const raw = lines[0]
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1');

  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

/**
 * 基础字数统计，用于估算内容规模
 */
export function countWords(markdown: string) {
  const plain = markdown.replace(/\s+/g, ' ').trim();
  if (!plain) {
    return 0;
  }
  return plain.split(' ').length;
}


