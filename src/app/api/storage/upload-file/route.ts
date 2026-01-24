import { v4 as uuidv4 } from 'uuid';

import { respData, respErr } from '@/shared/lib/resp';
import { getStorageService } from '@/shared/services/storage';

/**
 * 通用文件上传接口
 * 支持 PDF, DOCX, TXT, MD 等大文件
 */
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];
    const customPath = formData.get('path') as string;

    console.log('[API Upload File] Received files:', files.length, 'Path:', customPath);
    files.forEach((file, i) => {
      console.log(`[API Upload File] File ${i}:`, {
        name: file.name,
        type: file.type,
        size: file.size,
      });
    });

    if (!files || files.length === 0) {
      return respErr('No files provided');
    }

    const uploadResults = [];

    for (const file of files) {
      // Validate file type - 支持文档和图片
      const allowedExtensions = /\.(pdf|docx|txt|md|jpg|jpeg|png|gif|webp)$/i;
      if (!allowedExtensions.test(file.name)) {
        return respErr(
          `File ${file.name} is not supported. Allowed: PDF, DOCX, TXT, MD, Images`
        );
      }

      // Generate unique key
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-${uuidv4()}.${ext}`;
      const key = customPath
        ? `${customPath.replace(/\/$/, '')}/${fileName}`
        : `uploads/documents/${fileName}`;

      // Convert file to buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const storageService = await getStorageService();

      // Upload to storage
      const result = await storageService.uploadFile({
        body: buffer,
        key: key,
        contentType: file.type || 'application/octet-stream',
        disposition: 'inline',
      });

      if (!result.success) {
        console.error('[API Upload File] Upload failed details:', result);
        return respErr(result.error || 'Upload failed');
      }

      console.log('[API Upload File] Upload success:', result.url);

      uploadResults.push({
        url: result.url,
        key: result.key,
        filename: file.name,
        size: file.size,
      });
    }

    console.log(
      '[API Upload File] All uploads complete. Returning URLs:',
      uploadResults.map((r) => r.url)
    );

    return respData({
      urls: uploadResults.map((r) => r.url),
      results: uploadResults,
    });
  } catch (e: any) {
    console.error('[API Upload File] Error:', e);
    return respErr(`Upload failed: ${e.message || 'Unknown error'}`);
  }
}

