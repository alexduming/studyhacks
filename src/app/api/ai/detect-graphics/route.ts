import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60秒超时

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

interface GraphicElement {
  type: 'icon' | 'shape' | 'image' | 'chart' | 'decoration';
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  description: string;
  zIndex: number; // 图层顺序（越大越靠前）
}

interface DetectGraphicsResponse {
  success: boolean;
  elements: GraphicElement[];
  imageSize: {
    width: number;
    height: number;
  };
  error?: string;
}

/**
 * 图形检测 API - 检测图片中的图标、图形、装饰元素
 * 用于将这些元素提取为 PPTX 中的独立图层
 */
export async function POST(request: NextRequest): Promise<NextResponse<DetectGraphicsResponse>> {
  try {
    const { imageUrl, imageBase64 } = await request.json();

    if (!imageUrl && !imageBase64) {
      return NextResponse.json(
        {
          success: false,
          elements: [],
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
          elements: [],
          imageSize: { width: 0, height: 0 },
          error: 'OpenRouter API Key 未配置',
        },
        { status: 500 }
      );
    }

    console.log('[DETECT-GRAPHICS] 开始检测图形元素...');

    // 构建图形检测的提示词
    const prompt = `You are analyzing a presentation slide image to detect graphical elements (NOT text).

Identify ALL non-text visual elements including:
1. Icons (small symbolic graphics like arrows, checkmarks, social media icons, etc.)
2. Shapes (geometric shapes, lines, borders, dividers)
3. Images/Photos (embedded photographs or illustrations)
4. Charts/Graphs (data visualizations, pie charts, bar charts)
5. Decorations (background patterns, gradients, ornamental elements)

For EACH graphical element, provide:
1. "type": One of "icon" | "shape" | "image" | "chart" | "decoration"
2. "bbox": {"x", "y", "width", "height"} in pixels from top-left corner
   - Provide tight bounding box around the element
   - x, y: Position of top-left corner
   - width, height: Size of the element
3. "description": Brief description of what the element is (e.g., "blue checkmark icon", "orange circle shape")
4. "zIndex": Layer order (higher = more front, typically: background decorations=1, shapes=2, icons=3, images=4)

CRITICAL RULES:
- Do NOT include text elements (those are handled separately)
- Focus on visual graphics that should be separate layers in PowerPoint
- Ignore pure background colors (only include if there's a pattern/gradient)
- For grouped/composite graphics, identify individual components if separable
- Image dimensions are approximately 1920x1080 if not clear

Return ONLY valid JSON (no markdown, no explanation):
{
  "elements": [
    {
      "type": "icon",
      "bbox": {"x": 100, "y": 200, "width": 50, "height": 50},
      "description": "blue checkmark icon",
      "zIndex": 3
    },
    {
      "type": "shape",
      "bbox": {"x": 0, "y": 500, "width": 1920, "height": 5},
      "description": "horizontal divider line",
      "zIndex": 2
    }
  ],
  "imageSize": {"width": 1920, "height": 1080}
}

If no graphical elements are found (text-only slide), return:
{
  "elements": [],
  "imageSize": {"width": 1920, "height": 1080}
}`;

    // 使用 imageUrl 或 imageBase64
    const imageData = imageBase64 || imageUrl;

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
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[DETECT-GRAPHICS] OpenRouter API Error:', response.status, errorText);

      return NextResponse.json(
        {
          success: false,
          elements: [],
          imageSize: { width: 0, height: 0 },
          error: `API 调用失败 (${response.status})`,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[DETECT-GRAPHICS] 无效的 API 响应:', data);
      return NextResponse.json(
        {
          success: false,
          elements: [],
          imageSize: { width: 0, height: 0 },
          error: 'API 返回无效响应',
        },
        { status: 500 }
      );
    }

    const content = data.choices[0].message.content.trim();
    console.log('[DETECT-GRAPHICS] 原始响应:', content);

    // 解析 JSON 响应
    let parsedData: { elements: GraphicElement[]; imageSize: { width: number; height: number } };

    try {
      // 尝试提取 JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;

      parsedData = JSON.parse(jsonString);

      // 验证数据结构
      if (!parsedData.elements || !Array.isArray(parsedData.elements)) {
        parsedData = { elements: [], imageSize: { width: 1920, height: 1080 } };
      }

      if (!parsedData.imageSize || !parsedData.imageSize.width || !parsedData.imageSize.height) {
        parsedData.imageSize = { width: 1920, height: 1080 };
      }

      // 验证和清理数据
      const elements = (parsedData.elements || [])
        .filter((el: any) => {
          // 过滤掉太小的元素（可能是噪声）
          const minSize = 20;
          return el.bbox?.width >= minSize && el.bbox?.height >= minSize;
        })
        .map((el: any) => ({
          type: ['icon', 'shape', 'image', 'chart', 'decoration'].includes(el.type) ? el.type : 'decoration',
          bbox: {
            x: Number(el.bbox?.x) || 0,
            y: Number(el.bbox?.y) || 0,
            width: Number(el.bbox?.width) || 50,
            height: Number(el.bbox?.height) || 50,
          },
          description: String(el.description || ''),
          zIndex: Number(el.zIndex) || 1,
        }));

      console.log(`[DETECT-GRAPHICS] 成功检测到 ${elements.length} 个图形元素`);

      return NextResponse.json({
        success: true,
        elements,
        imageSize: parsedData.imageSize,
      });
    } catch (parseError) {
      console.error('[DETECT-GRAPHICS] JSON 解析失败:', parseError);
      console.error('[DETECT-GRAPHICS] 原始内容:', content);

      return NextResponse.json({
        success: false,
        elements: [],
        imageSize: { width: 1920, height: 1080 },
        error: 'JSON 解析失败，请重试',
      });
    }
  } catch (error) {
    console.error('[DETECT-GRAPHICS] 未预期的错误:', error);

    return NextResponse.json(
      {
        success: false,
        elements: [],
        imageSize: { width: 0, height: 0 },
        error: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
