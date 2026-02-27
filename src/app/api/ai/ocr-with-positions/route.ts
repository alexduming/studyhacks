import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60秒超时

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * 下载并处理图片 - 获取尺寸并压缩（如果超过大小限制）
 * 返回：原始尺寸 + 压缩后的 base64（如果需要）
 */
async function processImage(
  imageUrl: string,
  imageBase64?: string
): Promise<{
  originalSize: { width: number; height: number } | null;
  imageData: string; // URL 或 base64
  wasCompressed: boolean;
}> {
  const MAX_SIZE_MB = 4; // OpenRouter 限制 5MB，保留余量
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  try {
    let imageBuffer: Buffer;

    if (imageBase64) {
      const base64Data = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;
      imageBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        console.warn('[OCR-POSITIONS] 无法下载图片');
        return { originalSize: null, imageData: imageUrl, wasCompressed: false };
      }
      const arrayBuffer = await response.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    }

    const metadata = await sharp(imageBuffer).metadata();
    const originalSize = metadata.width && metadata.height
      ? { width: metadata.width, height: metadata.height }
      : null;

    console.log(`[OCR-POSITIONS] 原始图片: ${originalSize?.width}x${originalSize?.height}, ${(imageBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    // 如果图片小于限制，直接返回原始 URL
    if (imageBuffer.length <= MAX_SIZE_BYTES) {
      return {
        originalSize,
        imageData: imageBase64 || imageUrl,
        wasCompressed: false,
      };
    }

    // 需要压缩：降低分辨率并使用 JPEG 压缩
    console.log('[OCR-POSITIONS] 图片过大，开始压缩...');

    // 计算目标尺寸（保持宽高比，最大 1920px）
    const maxDimension = 1920;
    let targetWidth = metadata.width || 1920;
    let targetHeight = metadata.height || 1080;

    if (targetWidth > maxDimension || targetHeight > maxDimension) {
      const scale = maxDimension / Math.max(targetWidth, targetHeight);
      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }

    const compressedBuffer = await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, { fit: 'inside' })
      .jpeg({ quality: 85 })
      .toBuffer();

    console.log(`[OCR-POSITIONS] 压缩后: ${targetWidth}x${targetHeight}, ${(compressedBuffer.length / 1024 / 1024).toFixed(2)}MB`);

    const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;

    return {
      originalSize,
      imageData: compressedBase64,
      wasCompressed: true,
    };
  } catch (error) {
    console.warn('[OCR-POSITIONS] 图片处理失败:', error);
    return {
      originalSize: null,
      imageData: imageBase64 || imageUrl,
      wasCompressed: false,
    };
  }
}

interface TextBlock {
  text: string;
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color: string;           // hex color like "#FFFFFF"
  fontSizePx: number;      // precise pixel size
  isBold: boolean;         // is text bold
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;      // line spacing multiplier
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
 * 增强的 OCR API - 提取文本及其位置信息
 * 用于生成可编辑的 PPTX 文件
 */
export async function POST(request: NextRequest): Promise<NextResponse<OCRResponse>> {
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

    if (!OPENROUTER_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: { width: 0, height: 0 },
          error: 'OpenRouter API Key 未配置',
        },
        { status: 500 }
      );
    }

    console.log('[OCR-POSITIONS] 开始提取文本和位置信息...');

    // 🎯 关键改进：获取图片尺寸并压缩大图片（避免 5MB 限制）
    const { originalSize: actualImageSize, imageData, wasCompressed } = await processImage(imageUrl, imageBase64);
    console.log('[OCR-POSITIONS] 实际图片尺寸:', actualImageSize);
    if (wasCompressed) {
      console.log('[OCR-POSITIONS] 图片已压缩以符合 API 限制');
    }

    // 构建增强的提示词 - 强调像素级精确定位
    const prompt = `You are a PRECISION OCR system analyzing a presentation slide image. Your task is to extract ALL text elements with PIXEL-PERFECT positioning for recreating an editable PowerPoint file.

⚠️ CRITICAL: Position accuracy is paramount. The text boxes will be placed EXACTLY at the coordinates you provide. Any offset will cause misalignment.

For EACH text block (group semantically related text), provide:

1. "text": Exact text content (preserve language, use \\n for line breaks)

2. "bbox": {"x", "y", "width", "height"} - PIXEL-PERFECT coordinates
   ⚠️ CRITICAL PRECISION RULES:
   - x: The EXACT horizontal pixel position where the FIRST character STARTS (leftmost edge of first letter)
   - y: The EXACT vertical pixel position where the TOP of the text STARTS (top of capital letters)
   - width: EXACT width from first character's left edge to last character's right edge
     * For single-line text: measure precisely from first to last character
     * For multi-line text: use the LONGEST line's width
     * DO NOT add extra padding - we will add it programmatically
   - height: EXACT height from text top to text bottom (including all lines and line spacing)

   ⚠️ MEASUREMENT TECHNIQUE:
   - Imagine drawing a tight rectangle around JUST the text pixels
   - x,y is the TOP-LEFT corner of this rectangle
   - width,height define the exact text bounds
   - Exclude shadows, glows, or background effects

3. "color": EXACT hex color (6 uppercase characters, e.g., "#FFFFFF")
   - Analyze the dominant color of the text pixels
   - Common colors: "#FFFFFF" (white), "#000000" (black), "#333333" (dark gray)
   - For colored text, provide precise hex (e.g., "#FF5722", "#2196F3")
   - Ignore shadows/outlines - use the main fill color

4. "fontSizePx": EXACT font size in pixels
   - Measure the height of a capital letter (cap height)
   - Title: 36-72px, Subtitle: 24-36px, Body: 16-28px, Small: 12-16px
   - Be PRECISE - this affects text rendering

5. "isBold": true/false - is the font weight >= 600?

6. "alignment": Determine by text position relative to slide center
   - "left": text left edge aligned, common for body text
   - "center": text horizontally centered on slide
   - "right": text right edge aligned

7. "lineHeight": Line spacing multiplier (1.0 = normal, 1.2 = loose, 1.5 = very loose)

📐 REFERENCE DIMENSIONS:
- Standard slide: 1920x1080 pixels
- If image appears different, estimate actual dimensions first

✅ QUALITY CHECKLIST:
- [ ] Each bbox x,y is the EXACT top-left corner of the text
- [ ] Each bbox width,height tightly fits the text (no extra padding)
- [ ] Colors are accurate 6-digit hex codes
- [ ] Font sizes match actual rendered sizes
- [ ] Titles are usually centered and at the top
- [ ] Body text is usually left-aligned

Return ONLY valid JSON (no markdown, no explanations, no comments):
{
  "blocks": [
    {
      "text": "Sample Title",
      "bbox": {"x": 460, "y": 100, "width": 1000, "height": 60},
      "color": "#FFFFFF",
      "fontSizePx": 48,
      "isBold": true,
      "alignment": "center",
      "lineHeight": 1.0
    }
  ],
  "imageSize": {"width": 1920, "height": 1080}
}`;

    // 使用处理后的图片数据（可能已压缩）
    // imageData 已在上面的 processImage 中获取

    // 调用 OpenRouter API
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'StudyHacks AI PPT Generator',
      },
      body: JSON.stringify({
        model: 'qwen/qwen2.5-vl-32b-instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData,
                },
              },
            ],
          },
        ],
        temperature: 0.1, // 低温度确保准确性
        max_tokens: 8000, // 增加 token 限制以支持更多文本块
      }),
    });

    console.log('[OCR-POSITIONS] OpenRouter API 响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR-POSITIONS] OpenRouter API Error:', response.status, errorText);

      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: actualImageSize || { width: 0, height: 0 },
          error: `API 调用失败 (${response.status})`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();
    console.log('[OCR-POSITIONS] API 响应数据结构:', {
      hasChoices: !!data.choices,
      choicesLength: data.choices?.length,
      hasMessage: !!data.choices?.[0]?.message,
      usage: data.usage,
    });

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[OCR-POSITIONS] 无效的 API 响应:', JSON.stringify(data).substring(0, 500));
      return NextResponse.json(
        {
          success: false,
          blocks: [],
          imageSize: actualImageSize || { width: 0, height: 0 },
          error: 'API 返回无效响应',
        },
        { status: 500 }
      );
    }

    const content = data.choices[0].message.content?.trim() || '';
    console.log('[OCR-POSITIONS] 原始响应长度:', content.length);
    console.log('[OCR-POSITIONS] 原始响应前500字符:', content.substring(0, 500));

    // 解析 JSON 响应
    let parsedData: { blocks: TextBlock[]; imageSize: { width: number; height: number } };

    try {
      // 尝试提取 JSON（可能被包裹在 markdown 代码块中）
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      parsedData = JSON.parse(jsonString);

      // 验证数据结构
      if (!parsedData.blocks || !Array.isArray(parsedData.blocks)) {
        throw new Error('响应中缺少 blocks 数组');
      }

      // VLM 返回的图片尺寸（可能是估计值，如 1920x1080）
      const vlmImageSize = parsedData.imageSize || { width: 1920, height: 1080 };

      // 使用实际图片尺寸（如果获取成功）
      const finalImageSize = actualImageSize || vlmImageSize;

      // 计算坐标校正比例：如果 VLM 假设了错误的尺寸，需要将坐标映射到真实尺寸
      // 例如：VLM 假设 1920x1080，实际是 2752x1536
      // 则坐标需要乘以 (实际宽度/VLM宽度)
      const scaleX = actualImageSize ? finalImageSize.width / vlmImageSize.width : 1;
      const scaleY = actualImageSize ? finalImageSize.height / vlmImageSize.height : 1;

      console.log('[OCR-POSITIONS] 坐标校正比例:', {
        vlmSize: vlmImageSize,
        actualSize: finalImageSize,
        scaleX,
        scaleY
      });

      // 验证和清理数据，同时应用坐标校正
      const blocks = (parsedData.blocks || []).map((block: any) => {
        const rawX = Number(block.bbox?.x) || 0;
        const rawY = Number(block.bbox?.y) || 0;
        const rawWidth = Number(block.bbox?.width) || 100;
        const rawHeight = Number(block.bbox?.height) || 50;
        const rawFontSize = Number(block.fontSizePx) || 24;

        return {
          text: String(block.text || ''),
          bbox: {
            // 应用坐标校正
            x: Math.round(rawX * scaleX),
            y: Math.round(rawY * scaleY),
            width: Math.round(rawWidth * scaleX),
            height: Math.round(rawHeight * scaleY),
          },
          color: String(block.color || '#000000'),
          // 字体大小也需要按比例调整（基于高度比例）
          fontSizePx: Math.round(rawFontSize * scaleY),
          isBold: Boolean(block.isBold),
          alignment: ['left', 'center', 'right'].includes(block.alignment) ? block.alignment : 'left',
          lineHeight: Number(block.lineHeight) || 1.0,
        };
      });

      console.log(`[OCR-POSITIONS] 成功提取 ${blocks.length} 个文本块`);

      // 打印第一个文本块的坐标用于调试
      if (blocks.length > 0) {
        console.log('[OCR-POSITIONS] 第一个文本块（校正后）:', {
          text: blocks[0].text.substring(0, 30),
          bbox: blocks[0].bbox,
          fontSizePx: blocks[0].fontSizePx,
        });
      }

      return NextResponse.json({
        success: true,
        blocks,
        imageSize: finalImageSize, // 返回真实尺寸
      });
    } catch (parseError) {
      console.error('[OCR-POSITIONS] JSON 解析失败:', parseError);
      console.error('[OCR-POSITIONS] 原始内容长度:', content.length);
      console.error('[OCR-POSITIONS] 原始内容前1000字符:', content.substring(0, 1000));

      // 降级方案：返回空结果但不报错（使用真实图片尺寸如果有）
      return NextResponse.json({
        success: false,
        blocks: [],
        imageSize: actualImageSize || { width: 1920, height: 1080 },
        error: `JSON 解析失败: ${parseError instanceof Error ? parseError.message : '未知错误'}`,
      });
    }
  } catch (error) {
    console.error('[OCR-POSITIONS] 未预期的错误:', error);

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
