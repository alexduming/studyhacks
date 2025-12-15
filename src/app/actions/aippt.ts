'use server';

import pdf from 'pdf-parse';

import { PPT_STYLES } from '@/config/aippt';

const KIE_API_KEY = '75a2809b76cfae9675cbdddd1af5f488';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Parse PDF to Text
 */
export async function parsePdfAction(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file uploaded');
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdf(buffer);
    return data.text;
  } catch (e: any) {
    console.error('PDF Parse Error:', e);
    throw new Error('Failed to parse PDF');
  }
}

/**
 * Analyze content using DeepSeek to generate slide outline
 */
export async function analyzeContentAction(
  content: string,
  mode: 'text' | 'pdf' | 'topic' = 'text'
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key is missing');
  }

  const systemPrompt = `
You are a professional presentation designer.
Your goal is to create a JSON structure for a slide deck based on the user's input.
The output must be a valid JSON array where each object represents a slide.

Each slide object must have:
- 'title': The title of the slide.
- 'content': Key points (bullet points separated by \\n).
- 'visualDescription': A highly detailed prompt for an AI image generator (Stable Diffusion/Flux/Midjourney style). Describe the visual composition, style, colors, and subject. DO NOT include text in the image description.

Input Content:
${content.substring(0, 15000)} // Truncate to avoid context limit if needed

Format:
[
  {
    "title": "Slide Title",
    "content": "Point 1\\nPoint 2",
    "visualDescription": "A futuristic city skyline..."
  }
]
`;

  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://studyhacks.ai',
          'X-Title': 'StudyHacks',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-v3.2-exp', // Using user requested model name
          messages: [{ role: 'user', content: systemPrompt }],
          response_format: { type: 'json_object' },
        }),
      }
    );

    if (!response.ok) {
      // Fallback to V3 if V3.2-exp fails (common with exp models)
      if (response.status === 404 || response.status === 400) {
        console.log('DeepSeek V3.2 Exp failed, retrying with V3...');
        return await analyzeContentFallback(systemPrompt);
      }
      const errText = await response.text();
      throw new Error(`DeepSeek API Error: ${response.status} ${errText}`);
    }

    const data = await response.json();
    let text = data.choices[0].message.content;

    if (text.includes('```json')) {
      text = text.split('```json')[1].split('```')[0];
    } else if (text.includes('```')) {
      text = text.split('```')[1].split('```')[0];
    }

    return JSON.parse(text);
  } catch (error: any) {
    console.error('Analysis Error:', error);
    // If primary model fails, try fallback
    return await analyzeContentFallback(systemPrompt);
  }
}

async function analyzeContentFallback(systemPrompt: string) {
  try {
    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://studyhacks.ai',
          'X-Title': 'StudyHacks',
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat',
          messages: [{ role: 'user', content: systemPrompt }],
          response_format: { type: 'json_object' },
        }),
      }
    );
    if (!response.ok) throw new Error('Fallback failed');
    const data = await response.json();
    let text = data.choices[0].message.content;
    if (text.includes('```json'))
      text = text.split('```json')[1].split('```')[0];
    else if (text.includes('```')) text = text.split('```')[1].split('```')[0];
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to analyze content with both models');
  }
}

/**
 * Create Image Generation Task via KIE API
 */
export async function createKieTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[]; // base64
}) {
  const endpoint = 'https://api.kie.ai/api/v1/jobs/createTask';

  // Styles
  let styleSuffix = '';
  let referenceImages: string[] = params.customImages || [];

  if (params.styleId) {
    const style = PPT_STYLES.find((s) => s.id === params.styleId);
    if (style) {
      styleSuffix = style.suffix;
      // Note: Preset reference images should be handled by client
      // and passed in customImages/referenceImages to keep this action pure
    }
  }

  // Combine prompts
  const finalPrompt = params.prompt + ' ' + styleSuffix;

  // New payload structure per documentation: wrap params in 'input'
  const body = {
    model: 'nano-banana-pro',
    input: {
        prompt: finalPrompt,
        aspect_ratio: params.aspectRatio || '16:9',
        resolution: params.imageSize || '4K', // doc says 'resolution' (1K/2K/4K)
        image_input: referenceImages.length > 0 ? referenceImages : undefined, // doc says 'image_input'
        output_format: 'png'
    }
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    console.log('[KIE] Raw Create Response:', JSON.stringify(data, null, 2));

    // Response structure check: data.data.taskId
    if (data.code !== 200 || !data.data?.taskId) {
      throw new Error(data.message || 'Failed to create KIE task');
    }

    // Return flattened object with snake_case task_id for frontend compatibility
    return { task_id: data.data.taskId }; 
  } catch (e: any) {
    console.error('[KIE] Create Error:', e);
    throw e;
  }
}

/**
 * Query KIE Task Status
 */
export async function queryKieTaskAction(taskId: string) {
  // Documentation says query param is 'taskId', not 'task_id'
  const endpoint = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
      },
    });

    const data = await res.json();
    
    // Normalize response for frontend
    // API returns { data: { state: "success", resultJson: "{\"resultUrls\":[...]}" } }
    
    if (data.code === 200 && data.data) {
        let results: string[] = [];
        try {
            if (data.data.resultJson) {
                const parsed = JSON.parse(data.data.resultJson);
                results = parsed.resultUrls || [];
            }
        } catch (e) {
            console.error("Failed to parse resultJson", e);
        }

        return {
            data: {
                status: data.data.state === 'success' ? 'SUCCESS' : (data.data.state === 'fail' ? 'FAILED' : 'PENDING'),
                results: results
            }
        };
    }
    
    return data;
  } catch (e: any) {
    console.error('[KIE] Query Error:', e);
    throw e;
  }
}
