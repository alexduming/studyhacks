import * as pdfjsLib from 'pdfjs-dist';

// 设置 Worker
// 注意：为了避免 Next.js 构建问题，我们使用 CDN 加载 Worker
// 必须确保 CDN 版本与安装的版本一致
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

/**
 * 将 PDF 文件转换为图片列表 (Base64)
 * @param file PDF 文件
 * @param maxPages 最大转换页数（防止扫描整本书导致浏览器崩溃或 OCR 超时）
 * @returns 图片 Base64 数组
 */
export async function convertPdfToImages(file: File, maxPages: number = 5): Promise<string[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // 加载 PDF 文档
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    const pageCount = Math.min(pdf.numPages, maxPages);
    const images: string[] = [];

    for (let i = 1; i <= pageCount; i++) {
      const page = await pdf.getPage(i);
      
      // 设置缩放比例（2.0 保证清晰度）
      const viewport = page.getViewport({ scale: 2.0 });
      
      // 创建 Canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('Canvas context not available');
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // 渲染页面到 Canvas
      await page.render({
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // 转换为 Base64 (JPEG 格式压缩，减小体积)
      const base64 = canvas.toDataURL('image/jpeg', 0.8);
      images.push(base64);
      
      // 清理
      canvas.remove();
    }

    return images;
  } catch (error) {
    console.error('PDF to Image conversion failed:', error);
    throw error;
  }
}

