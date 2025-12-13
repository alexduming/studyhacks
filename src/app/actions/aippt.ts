'use server';

/**
 * 根据画幅比例和分辨率等级计算实际像素尺寸
 */
function calculateResolution(
  aspectRatio: string,
  sizeLevel: string
): { width: number; height: number } {
  // Google Gemini 3 Pro Image 的官方分辨率规格（16:9为基准）
  // 1K: 1376×768
  // 2K: 2752×1536
  // 4K: 5504×3072
  const geminiResolutions: Record<string, { width: number; height: number }> = {
    '1K': { width: 1376, height: 768 },
    '2K': { width: 2752, height: 1536 },
    '4K': { width: 5504, height: 3072 },
  };

  // 获取基准分辨率（16:9）
  const base = geminiResolutions[sizeLevel] || geminiResolutions['2K'];

  // 解析画幅比例
  const [w, h] = aspectRatio.split(':').map(Number);

  // 如果是16:9，直接返回 Gemini 官方分辨率
  if (w === 16 && h === 9) {
    return base;
  }

  // 对于其他比例，保持总像素数相近，调整宽高
  const totalPixels = base.width * base.height;
  const ratio = w / h;

  // 计算新的宽高（保持总像素数接近，同时符合比例）
  const height = Math.round(Math.sqrt(totalPixels / ratio));
  const width = Math.round(height * ratio);

  // 确保是偶数（视频编码友好）
  return {
    width: width % 2 === 0 ? width : width + 1,
    height: height % 2 === 0 ? height : height + 1,
  };
}

/**
 * AI PPT 生成服务端操作
 * 通过 OpenRouter API 调用 Google Gemini 3 Pro Image Preview 模型生成 PPT 截图
 */
export async function generatePPTAction(
  apiKey: string | undefined,
  params: {
    model: string;
    prompt: string;
    aspect_ratio?: string;
    image_size?: string;
    image?: string[]; // base64 images for reference
  }
) {
  const key = apiKey || process.env.AIPPT_OPENROUTER_API_KEY;

  if (!key) {
    throw new Error(
      'API Key is missing. Please configure AIPPT_OPENROUTER_API_KEY in server environment.'
    );
  }

  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

  // 构造消息内容数组
  const messageContent: any[] = [{ type: 'text', text: params.prompt }];

  // 添加参考图片
  if (params.image && params.image.length > 0) {
    params.image.forEach((imgBase64) => {
      const url = imgBase64.startsWith('data:')
        ? imgBase64
        : `data:image/png;base64,${imgBase64}`;
      messageContent.push({
        type: 'image_url',
        image_url: { url },
      });
    });
  }

  // 计算实际像素尺寸并附加到 Prompt
  if (params.aspect_ratio && params.image_size) {
    const resolution = calculateResolution(
      params.aspect_ratio,
      params.image_size
    );
    messageContent[0].text += `\n\n【重要：必须严格按照以下分辨率生成图片】\n分辨率要求：${resolution.width}x${resolution.height}像素 (${params.image_size} ${params.aspect_ratio})\n画幅比例：${params.aspect_ratio}\n请确保生成的图片分辨率精确为 ${resolution.width}x${resolution.height} 像素。`;
  } else if (params.aspect_ratio) {
    messageContent[0].text += `\n\n画幅比例：${params.aspect_ratio}`;
  } else if (params.image_size) {
    messageContent[0].text += `\n\n分辨率：${params.image_size}`;
  }

  // 计算目标分辨率用于请求体
  let targetResolution = null;
  if (params.aspect_ratio && params.image_size) {
    targetResolution = calculateResolution(
      params.aspect_ratio,
      params.image_size
    );
  }

  const requestBody: any = {
    model: params.model,
    messages: [
      {
        role: 'user',
        content: messageContent,
      },
    ],
    modalities: ['image', 'text'],
    // 强制使用 "image" 对象传递分辨率，这是 XAI Router/OpenRouter 对 Gemini 3 Pro 的特定要求
    image: {
      aspect_ratio: params.aspect_ratio || '16:9',
      image_size: params.image_size || '4K',
    },
  };

  // 尝试添加分辨率参数（某些模型可能支持）
  if (targetResolution) {
    // 同时保留 size 参数作为备用
    // OpenRouter may normalize this too.
    requestBody.size = `${targetResolution.width}x${targetResolution.height}`;

    // Vertex AI style (just in case OpenRouter passes it through)
    requestBody.generationConfig = {
      imageConfig: {
        // Some docs suggest 'imageSize' enum string, others suggest pixel count is not supported this way.
        // Let's rely on the 'image' block above as primary.
      },
    };
  }

  console.log('[AIPPT] Sending request...');
  console.log('[AIPPT] Model:', params.model);
  console.log('[AIPPT] Prompt length:', params.prompt.length);
  console.log('[AIPPT] Reference images:', params.image?.length || 0);
  if (targetResolution) {
    console.log(
      '[AIPPT] Target resolution:',
      `${targetResolution.width}x${targetResolution.height}`
    );
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://studyhacks.ai',
        'X-Title': 'StudyHacks',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIPPT] API Error:', errorText.substring(0, 500));
      try {
        const errorData = JSON.parse(errorText);
        throw new Error(
          errorData.error?.message || `API Error: ${response.status}`
        );
      } catch {
        throw new Error(
          `API Error (${response.status}): ${errorText.substring(0, 200)}`
        );
      }
    }

    const data = await response.json();

    // 简化日志，只打印关键信息
    console.log('[AIPPT] ✓ Response received');
    console.log('[AIPPT] Choices count:', data.choices?.length || 0);

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Invalid API response: no choices');
    }

    const message = data.choices[0]?.message;
    if (!message) {
      throw new Error('Invalid API response: no message');
    }

    // 打印 message 对象的所有字段以便调试
    console.log('[AIPPT] Message keys:', Object.keys(message));
    console.log(
      '[AIPPT] Message object:',
      JSON.stringify(message).substring(0, 500)
    );

    const content = message.content;
    console.log('[AIPPT] Content type:', typeof content);
    console.log('[AIPPT] Content is array:', Array.isArray(content));
    console.log(
      '[AIPPT] Content value:',
      typeof content === 'string' ? `"${content.substring(0, 100)}"` : content
    );
    if (Array.isArray(content)) {
      console.log('[AIPPT] Content length:', content.length);
    }

    // === 核心逻辑：解析图片 ===

    // 检查 message 对象是否有其他包含图片的字段（OpenRouter 特定）
    // @ts-ignore - OpenRouter 可能有自定义字段
    if (
      message.images &&
      Array.isArray(message.images) &&
      message.images.length > 0
    ) {
      console.log('[AIPPT] ✓ Found images field!');
      console.log('[AIPPT] Images count:', message.images.length);
      // @ts-ignore
      const imageUrls = message.images
        .map((img: any) => {
          // 可能的结构: { url: "...", image_url: { url: "..." } }
          return img.url || img.image_url?.url || img;
        })
        .filter(
          (url: any) => typeof url === 'string' && url.startsWith('data:image')
        );

      if (imageUrls.length > 0) {
        console.log('[AIPPT] ✓ Extracted', imageUrls.length, 'image URLs');
        // 记录第一张图片的大小信息
        const firstImageUrl = imageUrls[0];
        const base64Data = firstImageUrl.split(',')[1];
        if (base64Data) {
          const sizeInBytes = Math.round((base64Data.length * 3) / 4);
          const sizeInKB = Math.round(sizeInBytes / 1024);
          console.log('[AIPPT] First image size: ~', sizeInKB, 'KB');
        }
        return imageUrls;
      }
    }

    // 情况1: content 为空或空数组
    if (
      !content ||
      content === '' ||
      (Array.isArray(content) && content.length === 0)
    ) {
      console.error('[AIPPT] ✗ Content is empty');
      console.error('[AIPPT] Full message object:', JSON.stringify(message));
      throw new Error('No content in API response');
    }

    // 情况2: content 是数组（标准 Multimodal 格式）
    if (Array.isArray(content)) {
      console.log('[AIPPT] Processing array content...');

      // 遍历所有部分，查找 image_url
      for (let i = 0; i < content.length; i++) {
        const part = content[i];
        console.log(`[AIPPT] Part ${i}: type=${part?.type}`);

        if (part && part.type === 'image_url') {
          const url = part.image_url?.url;
          if (url && typeof url === 'string') {
            console.log(`[AIPPT] ✓ Found image at part ${i}`);
            console.log('[AIPPT] Image URL length:', url.length);
            console.log('[AIPPT] Image URL prefix:', url.substring(0, 50));
            return [url]; // 返回图片 URL 数组
          }
        }
      }

      // 如果没找到 image_url，尝试从 text 部分提取
      console.log('[AIPPT] No image_url found, checking text parts...');
      const textParts = content.filter((p: any) => p?.type === 'text');
      if (textParts.length > 0) {
        const textContent = textParts.map((p: any) => p.text || '').join('\n');
        const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
        const matches = textContent.match(base64Regex);
        if (matches && matches.length > 0) {
          console.log(
            `[AIPPT] ✓ Found ${matches.length} base64 images in text`
          );
          return matches;
        }
      }

      console.error('[AIPPT] ✗ No images found in content array');
      console.error(
        '[AIPPT] Content structure:',
        JSON.stringify(content).substring(0, 500)
      );
      throw new Error('No images found in response');
    }

    // 情况3: content 是字符串
    if (typeof content === 'string') {
      console.log('[AIPPT] Processing string content...');
      const base64Regex = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g;
      const matches = content.match(base64Regex);
      if (matches && matches.length > 0) {
        console.log(
          `[AIPPT] ✓ Found ${matches.length} base64 images in string`
        );
        return matches;
      }

      console.error('[AIPPT] ✗ No images in string content');
      console.error('[AIPPT] Content preview:', content.substring(0, 200));
      throw new Error('No images found in text response');
    }

    // 情况4: content 是其他类型
    console.error('[AIPPT] ✗ Unexpected content type:', typeof content);
    throw new Error('Unexpected content format');
  } catch (error: any) {
    console.error('[AIPPT] ✗ Error:', error.message);
    throw error;
  }
}
