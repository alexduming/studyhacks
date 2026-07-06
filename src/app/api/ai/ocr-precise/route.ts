import { NextRequest, NextResponse } from 'next/server';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 120; // Tesseract 可能需要较长时间

interface TextBlock {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  fontSizePx: number;
  color: string;
  isBold: boolean;
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
}

interface OCRResponse {
  success: boolean;
  blocks: TextBlock[];
  imageSize: {
    width: number;
    height: number;
  };
  error?: string;
}

/**
 * 精确 OCR API - 使用 Tesseract.js 获取真实边界框坐标
 *
 * Tesseract 的优势：
 * - 返回真实的像素坐标（非估算）
 * - 支持多语言（中英文）
 * - 无需额外 API 密钥
 */
export async function POST(request: NextRequest): Promise<NextResponse<OCRResponse>> {
  console.log('[OCR-PRECISE] ========== 开始精确 OCR ==========');

  try {
    const { imageUrl, imageBase64 } = await request.json();

    if (!imageUrl && !imageBase64) {
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: { width: 0, height: 0 },
          error: '未提供图片 URL 或 base64 数据',
        },
        { status: 400 }
      );
    }

    // 使用 imageUrl 或 imageBase64
    let imageSource = imageBase64 || imageUrl;
    console.log('[OCR-PRECISE] 图片来源:', imageSource.substring(0, 80));

    // 如果是 URL，需要先下载图片
    let imageBuffer: Buffer | null = null;
    let actualWidth = 0;
    let actualHeight = 0;

    if (!imageSource.startsWith('data:')) {
      console.log('[OCR-PRECISE] 下载远程图片...');
      try {
        const response = await fetch(imageSource);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        imageBuffer = Buffer.from(arrayBuffer);

        // 使用 sharp 获取实际图片尺寸
        const metadata = await sharp(imageBuffer).metadata();
        actualWidth = metadata.width || 0;
        actualHeight = metadata.height || 0;
        console.log(`[OCR-PRECISE] 图片实际尺寸: ${actualWidth}x${actualHeight}`);

        // 将 Buffer 转换为 base64 供 Tesseract 使用
        const base64 = imageBuffer.toString('base64');
        const mimeType = metadata.format === 'png' ? 'image/png' : 'image/jpeg';
        imageSource = `data:${mimeType};base64,${base64}`;
      } catch (fetchError) {
        console.error('[OCR-PRECISE] 下载图片失败:', fetchError);
        throw new Error(`无法下载图片: ${fetchError instanceof Error ? fetchError.message : '未知错误'}`);
      }
    } else {
      // 如果是 base64，解析获取实际尺寸
      try {
        const base64Data = imageSource.split(',')[1];
        imageBuffer = Buffer.from(base64Data, 'base64');
        const metadata = await sharp(imageBuffer).metadata();
        actualWidth = metadata.width || 0;
        actualHeight = metadata.height || 0;
        console.log(`[OCR-PRECISE] Base64 图片尺寸: ${actualWidth}x${actualHeight}`);
      } catch (parseError) {
        console.warn('[OCR-PRECISE] 无法解析 base64 图片尺寸');
      }
    }

    // 使用 Tesseract 进行 OCR
    console.log('[OCR-PRECISE] 正在初始化 Tesseract...');

    const result = await Tesseract.recognize(
      imageSource,
      'chi_sim+eng', // 支持简体中文和英文
      {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`[OCR-PRECISE] 识别进度: ${Math.round(m.progress * 100)}%`);
          }
        },
      }
    );

    console.log('[OCR-PRECISE] Tesseract 识别完成');

    // Tesseract.js v5+ 的数据结构
    const data = result.data as any;
    console.log('[OCR-PRECISE] 页面信息:', {
      text: data.text?.substring(0, 50),
      confidence: data.confidence,
    });

    // 获取实际图片尺寸（使用 sharp 检测的尺寸）
    const imageWidth = actualWidth || 1920;
    const imageHeight = actualHeight || 1080;

    // 处理行级别的结果（比单词更适合 PPT）
    const blocks: TextBlock[] = [];

    // Tesseract 返回的数据结构：paragraphs > lines > words
    // v5+ 使用 blocks > paragraphs > lines
    const tesseractBlocks = data.blocks || [];
    for (const block of tesseractBlocks) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          // 过滤低置信度的结果
          if (line.confidence < 30) continue;

          // 过滤空白文本
          const text = line.text?.trim();
          if (!text) continue;

          // 获取边界框（Tesseract 返回的是真实像素坐标）
          const bbox = {
            x: line.bbox?.x0 || 0,
            y: line.bbox?.y0 || 0,
            width: (line.bbox?.x1 || 0) - (line.bbox?.x0 || 0),
            height: (line.bbox?.y1 || 0) - (line.bbox?.y0 || 0),
          };

          // 估算字体大小（基于行高）
          const fontSizePx = Math.round(bbox.height * 0.75); // 行高的约75%是字号

          // 判断对齐方式（基于 x 位置）
          let alignment: 'left' | 'center' | 'right' = 'left';
          const centerX = bbox.x + bbox.width / 2;
          const imageCenterX = imageWidth / 2;
          const tolerance = imageWidth * 0.1; // 10% 容差

          if (Math.abs(centerX - imageCenterX) < tolerance) {
            alignment = 'center';
          } else if (bbox.x > imageWidth * 0.6) {
            alignment = 'right';
          }

          blocks.push({
            text,
            bbox,
            confidence: line.confidence,
            fontSizePx,
            color: '#000000', // Tesseract 不返回颜色，默认黑色
            isBold: false, // Tesseract 不直接返回粗细
            alignment,
            lineHeight: 1.2,
          });
        }
      }
    }

    // 合并相邻的行（如果它们属于同一段落）
    const mergedBlocks = mergeAdjacentLines(blocks, imageHeight);

    console.log(`[OCR-PRECISE] ✅ 识别到 ${mergedBlocks.length} 个文本块`);
    mergedBlocks.slice(0, 5).forEach((block, idx) => {
      console.log(`[OCR-PRECISE] 文本 ${idx + 1}:`, {
        text: block.text.substring(0, 30) + (block.text.length > 30 ? '...' : ''),
        bbox: block.bbox,
        fontSizePx: block.fontSizePx,
        confidence: block.confidence,
      });
    });

    return NextResponse.json({
      success: true,
      blocks: mergedBlocks,
      imageSize: {
        width: imageWidth,
        height: imageHeight,
      },
    });

  } catch (error) {
    console.error('[OCR-PRECISE] ❌ 错误:', error);

    return NextResponse.json(
      {
        success: false,
        blocks: [],
        imageSize: { width: 0, height: 0 },
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

/**
 * 合并相邻的行（如果它们属于同一段落）
 * 规则：如果两行的 y 坐标差小于平均行高的 1.5 倍，且 x 坐标接近，则合并
 */
function mergeAdjacentLines(blocks: TextBlock[], imageHeight: number): TextBlock[] {
  if (blocks.length <= 1) return blocks;

  // 按 y 坐标排序
  const sorted = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);

  const merged: TextBlock[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const yGap = next.bbox.y - (current.bbox.y + current.bbox.height);
    const avgHeight = (current.bbox.height + next.bbox.height) / 2;
    const xOverlap = Math.abs(current.bbox.x - next.bbox.x) < avgHeight;

    // 如果行间距小于 1.5 倍行高，且 x 位置接近，则合并
    if (yGap < avgHeight * 1.5 && xOverlap) {
      // 合并文本
      current = {
        ...current,
        text: current.text + '\n' + next.text,
        bbox: {
          x: Math.min(current.bbox.x, next.bbox.x),
          y: current.bbox.y,
          width: Math.max(
            current.bbox.x + current.bbox.width,
            next.bbox.x + next.bbox.width
          ) - Math.min(current.bbox.x, next.bbox.x),
          height: next.bbox.y + next.bbox.height - current.bbox.y,
        },
        confidence: Math.min(current.confidence, next.confidence),
        fontSizePx: Math.max(current.fontSizePx, next.fontSizePx),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}
