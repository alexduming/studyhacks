import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 30; // 腾讯云 OCR 通常 1-3 秒

// 腾讯云配置
const SECRET_ID = process.env.TENCENT_SECRET_ID || '';
const SECRET_KEY = process.env.TENCENT_SECRET_KEY || '';
const REGION = 'ap-guangzhou';
const SERVICE = 'ocr';
const HOST = 'ocr.tencentcloudapi.com';

interface TextBlock {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color: string;
  fontSizePx: number;
  isBold: boolean;
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
  confidence: number;
}

interface OCRResponse {
  success: boolean;
  blocks: TextBlock[];
  imageSize: {
    width: number;
    height: number;
  };
  error?: string;
  duration?: number;
}

/**
 * 生成腾讯云 API 签名 (TC3-HMAC-SHA256)
 */
function generateSignature(
  secretId: string,
  secretKey: string,
  timestamp: number,
  payload: string
): { authorization: string; timestamp: string } {
  const date = new Date(timestamp * 1000).toISOString().split('T')[0];
  const algorithm = 'TC3-HMAC-SHA256';

  // 1. 拼接规范请求串
  const httpRequestMethod = 'POST';
  const canonicalUri = '/';
  const canonicalQueryString = '';
  const canonicalHeaders = `content-type:application/json\nhost:${HOST}\nx-tc-action:generalaccurateocr\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const hashedRequestPayload = crypto
    .createHash('sha256')
    .update(payload)
    .digest('hex');
  const canonicalRequest = `${httpRequestMethod}\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedRequestPayload}`;

  // 2. 拼接待签名字符串
  const credentialScope = `${date}/${SERVICE}/tc3_request`;
  const hashedCanonicalRequest = crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex');
  const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;

  // 3. 计算签名
  const secretDate = crypto
    .createHmac('sha256', `TC3${secretKey}`)
    .update(date)
    .digest();
  const secretService = crypto
    .createHmac('sha256', secretDate)
    .update(SERVICE)
    .digest();
  const secretSigning = crypto
    .createHmac('sha256', secretService)
    .update('tc3_request')
    .digest();
  const signature = crypto
    .createHmac('sha256', secretSigning)
    .update(stringToSign)
    .digest('hex');

  // 4. 拼接 Authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { authorization, timestamp: timestamp.toString() };
}

/**
 * 从图片区域提取文字颜色（改进版）
 * 原理：
 * 1. 分析文本区域中心的像素（文字通常在中心）
 * 2. 使用 K-means 风格的聚类找到主要颜色
 * 3. 选择与背景对比度最高且出现次数较多的颜色
 */
async function extractTextColor(
  imageBuffer: Buffer,
  bbox: { x: number; y: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number
): Promise<{ color: string; isBold: boolean }> {
  try {
    // 确保边界有效
    const left = Math.max(0, Math.round(bbox.x));
    const top = Math.max(0, Math.round(bbox.y));
    const width = Math.min(Math.round(bbox.width), imageWidth - left);
    const height = Math.min(Math.round(bbox.height), imageHeight - top);

    if (width <= 0 || height <= 0) {
      return { color: '#000000', isBold: false };
    }

    // 提取文本区域
    const regionBuffer = await sharp(imageBuffer)
      .extract({ left, top, width, height })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { data, info } = regionBuffer;
    const channels = info.channels;
    const totalPixels = width * height;

    // 收集所有像素颜色（更精细的量化，每通道 16 级）
    const colorCounts: Map<string, { r: number; g: number; b: number; count: number }> = new Map();

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // 更精细的量化（每通道 16 级，共 4096 种颜色）
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const key = `${qr},${qg},${qb}`;

      const existing = colorCounts.get(key);
      if (existing) {
        existing.r += r;
        existing.g += g;
        existing.b += b;
        existing.count++;
      } else {
        colorCounts.set(key, { r, g, b, count: 1 });
      }
    }

    // 找到出现次数最多的颜色（前 10 种）
    const sortedColors = Array.from(colorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    if (sortedColors.length < 2) {
      const c = sortedColors[0];
      const avgR = Math.round(c.r / c.count);
      const avgG = Math.round(c.g / c.count);
      const avgB = Math.round(c.b / c.count);
      return { color: rgbToHex(avgR, avgG, avgB), isBold: false };
    }

    // 计算每种颜色的平均值和占比
    const colors = sortedColors.map(c => ({
      r: Math.round(c.r / c.count),
      g: Math.round(c.g / c.count),
      b: Math.round(c.b / c.count),
      count: c.count,
      ratio: c.count / totalPixels,
    }));

    // 背景是出现次数最多的颜色
    const bgColor = colors[0];
    const bgLuminance = getLuminance(bgColor.r, bgColor.g, bgColor.b);

    // 找到文字颜色：
    // 1. 必须与背景有足够对比度（> 0.1）
    // 2. 占比在合理范围内（5%-50%，文字通常不会超过一半）
    // 3. 优先选择对比度最高的
    let textColor = colors[1];
    let maxScore = 0;

    for (let i = 1; i < colors.length; i++) {
      const c = colors[i];
      const luminance = getLuminance(c.r, c.g, c.b);
      const contrast = Math.abs(luminance - bgLuminance);

      // 跳过对比度太低的颜色（可能是背景的变体）
      if (contrast < 0.1) continue;

      // 跳过占比太低的颜色（可能是噪点）
      if (c.ratio < 0.02) continue;

      // 评分：对比度 * log(占比)，平衡对比度和出现频率
      const score = contrast * (1 + Math.log10(c.ratio * 100 + 1));

      if (score > maxScore) {
        maxScore = score;
        textColor = c;
      }
    }

    const hex = rgbToHex(textColor.r, textColor.g, textColor.b);

    // 判断粗体：文字像素占比 > 20%
    const isBold = textColor.ratio > 0.20;

    console.log(`[OCR-TENCENT] 颜色提取: bg=${rgbToHex(bgColor.r, bgColor.g, bgColor.b)}, text=${hex}, ratio=${(textColor.ratio * 100).toFixed(1)}%`);

    return { color: hex, isBold };
  } catch (error) {
    console.warn('[OCR-TENCENT] 颜色提取失败:', error);
    return { color: '#000000', isBold: false };
  }
}

/**
 * RGB 转 Hex
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 计算相对亮度 (0-1)
 */
function getLuminance(r: number, g: number, b: number): number {
  // sRGB 相对亮度公式
  const rs = r / 255;
  const gs = g / 255;
  const bs = b / 255;
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 腾讯云 OCR API - 通用印刷体识别（高精度版）+ 颜色提取增强
 *
 * 增强功能：
 * - 精确颜色：在每个文本区域采样像素，提取真实文字颜色
 * - 精确字号：基于单行高度计算，避免过大
 * - 精确边界：添加适当 padding，避免文本框过窄
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<OCRResponse>> {
  console.log('[OCR-TENCENT] ========== 开始腾讯云 OCR（增强版）==========');
  const startTime = Date.now();

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

    if (!SECRET_ID || !SECRET_KEY) {
      console.error('[OCR-TENCENT] ❌ 腾讯云密钥未配置');
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: { width: 0, height: 0 },
          error: '腾讯云 OCR 密钥未配置',
        },
        { status: 500 }
      );
    }

    // 准备请求参数 - 始终使用 base64（避免腾讯云无法访问外部 URL）
    let imageBase64Data: string;
    let imageBuffer: Buffer;
    let actualImageWidth = 1920;
    let actualImageHeight = 1080;

    if (imageBase64) {
      // 移除 data:image/xxx;base64, 前缀
      imageBase64Data = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;
      imageBuffer = Buffer.from(imageBase64Data, 'base64');
    } else if (imageUrl) {
      // 下载图片并转为 base64（带超时和重试）
      console.log('[OCR-TENCENT] 下载图片:', imageUrl.substring(0, 80));

      const maxRetries = 2;
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          // 设置 20 秒超时（大图片需要更长时间）
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);

          const imageResponse = await fetch(imageUrl, {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (!imageResponse.ok) {
            throw new Error(`HTTP ${imageResponse.status}`);
          }
          const arrayBuffer = await imageResponse.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          imageBase64Data = imageBuffer.toString('base64');
          console.log('[OCR-TENCENT] 图片下载成功，大小:', Math.round(arrayBuffer.byteLength / 1024), 'KB');
          lastError = null;
          break; // 成功，跳出重试循环
        } catch (downloadError) {
          lastError = downloadError instanceof Error ? downloadError : new Error('未知错误');
          if (attempt < maxRetries) {
            console.warn(`[OCR-TENCENT] 下载失败 (尝试 ${attempt + 1}/${maxRetries + 1}): ${lastError.message}，正在重试...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // 递增等待
          }
        }
      }

      if (lastError) {
        console.error('[OCR-TENCENT] 图片下载失败（已重试）:', lastError);
        return NextResponse.json(
          {
            success: false,
            blocks: [],
            imageSize: { width: 0, height: 0 },
            error: `图片下载失败: ${lastError.message}`,
          },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: { width: 0, height: 0 },
          error: '未提供有效的图片数据',
        },
        { status: 400 }
      );
    }

    // 使用 sharp 获取精确的图片尺寸
    try {
      const metadata = await sharp(imageBuffer).metadata();
      actualImageWidth = metadata.width || 1920;
      actualImageHeight = metadata.height || 1080;
      console.log(`[OCR-TENCENT] 图片实际尺寸: ${actualImageWidth}x${actualImageHeight}`);
    } catch (metaError) {
      console.warn('[OCR-TENCENT] 无法获取图片尺寸，使用默认值');
    }

    const requestBody: Record<string, any> = { ImageBase64: imageBase64Data };
    const payload = JSON.stringify(requestBody);
    const timestamp = Math.floor(Date.now() / 1000);

    // 生成签名
    const { authorization } = generateSignature(
      SECRET_ID,
      SECRET_KEY,
      timestamp,
      payload
    );

    console.log('[OCR-TENCENT] 正在调用腾讯云 OCR API...');

    // 调用腾讯云 API
    const response = await fetch(`https://${HOST}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: HOST,
        'X-TC-Action': 'GeneralAccurateOCR',
        'X-TC-Version': '2018-11-19',
        'X-TC-Region': REGION,
        'X-TC-Timestamp': timestamp.toString(),
        Authorization: authorization,
      },
      body: payload,
    });

    const data = await response.json();
    console.log('[OCR-TENCENT] API 响应状态:', response.status);

    if (data.Response?.Error) {
      console.error('[OCR-TENCENT] API 错误:', data.Response.Error);
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: { width: 0, height: 0 },
          error: `腾讯云 OCR 错误: ${data.Response.Error.Message}`,
        },
        { status: 500 }
      );
    }

    const textDetections = data.Response?.TextDetections || [];
    console.log(`[OCR-TENCENT] 识别到 ${textDetections.length} 个文本块`);

    const imageWidth = actualImageWidth;
    const imageHeight = actualImageHeight;

    // 转换为标准格式（带颜色提取）
    const blocksPromises = textDetections.map(async (item: any) => {
      // 腾讯云返回的是四边形坐标 Polygon: [{X, Y}, {X, Y}, {X, Y}, {X, Y}]
      const polygon = item.Polygon || [];
      let minX = Infinity,
        minY = Infinity,
        maxX = 0,
        maxY = 0;

      for (const point of polygon) {
        minX = Math.min(minX, point.X);
        minY = Math.min(minY, point.Y);
        maxX = Math.max(maxX, point.X);
        maxY = Math.max(maxY, point.Y);
      }

      // 🎯 直接使用腾讯云返回的精确坐标（不添加任何 padding）
      const bbox = {
        x: minX === Infinity ? 0 : Math.round(minX),
        y: minY === Infinity ? 0 : Math.round(minY),
        width: Math.round(maxX - minX) || 100,
        height: Math.round(maxY - minY) || 30,
      };

      const text = item.DetectedText || '';

      // 🎯 关键修复：字体大小使用非线性映射
      // 实测发现：大字号偏大（32→44），小字号也偏大（14→22, 11→13）
      // 但中等字号（33, 37）准确，说明关系不是简单的线性
      // 使用更保守的基础系数 0.38，然后根据字号微调
      const rawFontSize = bbox.height * 0.38;

      // 非线性校正：大字号需要更小的系数
      let fontSizePx: number;
      if (rawFontSize > 40) {
        // 大字号（标题）：进一步缩小
        fontSizePx = Math.round(rawFontSize * 0.75);
      } else if (rawFontSize > 25) {
        // 中等字号：基本保持
        fontSizePx = Math.round(rawFontSize * 0.95);
      } else if (rawFontSize > 15) {
        // 较小字号：略微缩小
        fontSizePx = Math.round(rawFontSize * 0.85);
      } else {
        // 很小字号：保持
        fontSizePx = Math.round(rawFontSize * 0.9);
      }

      // 确保字号在合理范围内
      fontSizePx = Math.max(10, Math.min(72, fontSizePx));

      // 🎯 增强：提取真实文字颜色
      const { color, isBold: colorBasedBold } = await extractTextColor(
        imageBuffer,
        bbox,
        imageWidth,
        imageHeight
      );

      // 判断对齐方式（基于文本框在图片中的位置）
      let alignment: 'left' | 'center' | 'right' = 'left';
      const centerX = bbox.x + bbox.width / 2;
      const imageCenterX = imageWidth / 2;
      const tolerance = imageWidth * 0.08; // 8% 容差

      if (Math.abs(centerX - imageCenterX) < tolerance) {
        alignment = 'center';
      } else if (bbox.x > imageWidth * 0.6) {
        alignment = 'right';
      }

      // 粗体判断：基于颜色分析 + 字号
      const isBold = colorBasedBold || fontSizePx > 36;

      return {
        text,
        bbox,
        color,
        fontSizePx,
        isBold,
        alignment,
        lineHeight: 1.15, // 稍微紧凑的行高
        confidence: item.Confidence || 0,
      };
    });

    const blocks: TextBlock[] = await Promise.all(blocksPromises);

    // 合并相邻的文本行（属于同一段落的）
    const mergedBlocks = mergeAdjacentBlocks(blocks, imageHeight, imageWidth);

    const duration = Date.now() - startTime;
    console.log(
      `[OCR-TENCENT] ✅ 完成，识别 ${mergedBlocks.length} 个文本块，耗时 ${duration}ms`
    );

    // 打印前几个文本块用于调试
    mergedBlocks.slice(0, 3).forEach((block, idx) => {
      console.log(`[OCR-TENCENT] 文本 ${idx + 1}:`, {
        text: block.text.substring(0, 30),
        bbox: block.bbox,
        fontSizePx: block.fontSizePx,
        color: block.color,
      });
    });

    return NextResponse.json({
      success: true,
      blocks: mergedBlocks,
      imageSize: { width: imageWidth, height: imageHeight },
      duration,
    });
  } catch (error) {
    console.error('[OCR-TENCENT] ❌ 错误:', error);

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
 * 合并相邻的文本块（如果它们属于同一段落）
 * 增强版：保留颜色信息，更智能的合并逻辑
 */
function mergeAdjacentBlocks(
  blocks: TextBlock[],
  imageHeight: number,
  imageWidth: number
): TextBlock[] {
  if (blocks.length <= 1) return blocks;

  // 按 y 坐标排序
  const sorted = [...blocks].sort((a, b) => a.bbox.y - b.bbox.y);

  const merged: TextBlock[] = [];
  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const yGap = next.bbox.y - (current.bbox.y + current.bbox.height);

    // 🎯 使用 bbox 高度来判断间距（更准确）
    const avgBboxHeight = (current.bbox.height + next.bbox.height) / 2;

    // 检查是否应该合并：
    // 1. 行间距小于 0.5 倍行高（更严格，避免错误合并）
    // 2. x 位置接近（同一列）
    // 3. 字号相近（差异在 20% 以内）
    // 4. 颜色相同
    const xOverlap = Math.abs(current.bbox.x - next.bbox.x) < avgBboxHeight;
    const fontSizeRatio = Math.min(current.fontSizePx, next.fontSizePx) /
                          Math.max(current.fontSizePx, next.fontSizePx);
    const similarFontSize = fontSizeRatio > 0.8;
    const sameColor = current.color === next.color;

    if (yGap < avgBboxHeight * 0.5 && xOverlap && similarFontSize && sameColor) {
      // 合并文本
      const newX = Math.min(current.bbox.x, next.bbox.x);
      const newY = current.bbox.y;
      const newWidth = Math.max(
        current.bbox.x + current.bbox.width,
        next.bbox.x + next.bbox.width
      ) - newX;
      const newHeight = next.bbox.y + next.bbox.height - newY;

      current = {
        ...current,
        text: current.text + '\n' + next.text,
        bbox: {
          x: newX,
          y: newY,
          width: newWidth,
          height: newHeight,
        },
        // 合并后重新计算字号（取平均）
        fontSizePx: Math.round((current.fontSizePx + next.fontSizePx) / 2),
        confidence: Math.min(current.confidence, next.confidence),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}
