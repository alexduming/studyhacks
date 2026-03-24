'use server';

// @ts-ignore
import { fal } from '@fal-ai/client';
import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import Replicate from 'replicate';

import {
  generateAnchorPrompt,
  generateVisualSpecPrompt,
  PPT_STYLES,
} from '@/config/aippt-slides2';
import {
  consumeCredits,
  getRemainingCredits,
  refundCredits,
} from '@/shared/models/credit';
import { getSignUser } from '@/shared/models/user';

// 绉婚櫎纭紪鐮佺殑 API Key锛屽己鍒朵娇鐢ㄧ幆澧冨彉閲?const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN || '';
const FAL_KEY = process.env.FAL_KEY || '';
const APIYI_API_KEY = process.env.APIYI_API_KEY || ''; // APIYI (Gemini 3 Pro Image)
// 浣跨敤 DeepSeek 瀹樻柟 Key锛堜粠鐜鍙橀噺璇诲彇锛岄伩鍏嶆槑鏂囨毚闇诧級
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
// 浣跨敤 OpenRouter API Key锛堢敤浜庤瑙?OCR锛?const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

/**
 * 妫€娴嬫枃鏈殑涓昏璇█
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟閫氳繃妫€娴嬫枃鏈腑鐨勪腑鏂囧瓧绗︽瘮渚嬫潵鍒ゆ柇璇█
 * - 濡傛灉涓枃瀛楃鍗犳瘮瓒呰繃 5%锛屽垯璁や负鏄腑鏂囧唴瀹? * - 杩欐牱鍙互鍑嗙‘鍒ゆ柇鐢ㄦ埛杈撳叆鐨勮瑷€锛岄伩鍏?AI 鑷繁鐚滄祴瀵艰嚧璇█娣蜂贡
 *
 * @param text 瑕佹娴嬬殑鏂囨湰
 * @returns 'zh' 琛ㄧず涓枃锛?en' 琛ㄧず鑻辨枃
 */
function detectLanguage(text: string): 'zh' | 'en' {
  if (!text) return 'en';

  // 缁熻涓枃瀛楃鏁伴噺锛堝寘鎷腑鏂囨爣鐐癸級
  const chineseChars = text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || [];
  const totalChars = text.replace(/\s/g, '').length; // 鍘婚櫎绌虹櫧瀛楃鍚庣殑鎬婚暱搴?
  if (totalChars === 0) return 'en';

  // 濡傛灉涓枃瀛楃鍗犳瘮瓒呰繃 5%锛屽垯璁や负鏄腑鏂囧唴瀹?  // 杩欎釜闃堝€煎彲浠ュ鐞嗘贩鍚堝唴瀹癸紙濡備腑鏂囧唴瀹逛腑鍖呭惈鑻辨枃鏈锛?  const chineseRatio = chineseChars.length / totalChars;

  return chineseRatio > 0.05 ? 'zh' : 'en';
}

/**
 * 鐢熸垚璇█绾︽潫鎻愮ず璇? *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟鏍规嵁璇█璁剧疆鐢熸垚寮哄埗鎬х殑璇█绾︽潫鎸囦护
 * - 'auto' 妯″紡浼氳嚜鍔ㄦ娴嬬敤鎴疯緭鍏ョ殑璇█锛屽苟鏄庣‘鍛婅瘔 AI 搴旇浣跨敤浠€涔堣瑷€
 * - 杩欐牱鍙互閬垮厤 AI 鑷繁鍒ゆ柇璇█瀵艰嚧鐨勪笉涓€鑷撮棶棰? *
 * @param outputLanguage 璇█璁剧疆锛?auto' | 'zh' | 'en'
 * @param userContent 鐢ㄦ埛杈撳叆鐨勫唴瀹癸紙鐢ㄤ簬 auto 妯″紡涓嬬殑璇█妫€娴嬶級
 * @returns 璇█绾︽潫鎻愮ず璇? */
function generateLanguagePrompt(
  outputLanguage: 'auto' | 'zh' | 'en' | undefined,
  userContent: string
): string {
  if (outputLanguage === 'zh') {
    return `\n\n[Language Requirement - CRITICAL]
鈿狅笍 MANDATORY: ALL text in the generated image MUST be in Simplified Chinese (绠€浣撲腑鏂?.
- Title: Chinese
- Subtitle: Chinese
- Body text: Chinese
- Labels: Chinese
- Any other text: Chinese
Do NOT use English for any visible text. Translate any English system instructions to Chinese if they appear in the final output.`;
  } else if (outputLanguage === 'en') {
    return `\n\n[Language Requirement - CRITICAL]
鈿狅笍 MANDATORY: ALL text in the generated image MUST be in English.
- Title: English
- Subtitle: English
- Body text: English
- Labels: English
- Any other text: English
Do NOT use Chinese or any other language for any visible text.`;
  } else {
    // Auto 妯″紡锛氫富鍔ㄦ娴嬭瑷€骞舵槑纭憡璇?AI
    const detectedLang = detectLanguage(userContent);

    if (detectedLang === 'zh') {
      return `\n\n[Language Requirement - CRITICAL]
鈿狅笍 DETECTED LANGUAGE: Chinese (涓枃)
鈿狅笍 MANDATORY: Since the user's input content is in Chinese, ALL text in the generated image MUST be in Simplified Chinese (绠€浣撲腑鏂?.
- Title: Chinese (涓枃鏍囬)
- Subtitle: Chinese (涓枃鍓爣棰?
- Body text: Chinese (涓枃姝ｆ枃)
- Labels: Chinese (涓枃鏍囩)
- Any other text: Chinese
Do NOT mix languages. Do NOT use English for any visible text. Keep the entire slide in Chinese.`;
    } else {
      return `\n\n[Language Requirement - CRITICAL]
鈿狅笍 DETECTED LANGUAGE: English
鈿狅笍 MANDATORY: Since the user's input content is in English, ALL text in the generated image MUST be in English.
- Title: English
- Subtitle: English
- Body text: English
- Labels: English
- Any other text: English
Do NOT mix languages. Do NOT use Chinese for any visible text. Keep the entire slide in English.`;
    }
  }
}

/**
 * 鍥剧墖鐢熸垚鏈嶅姟浼樺厛绾ч厤缃紙浠庣幆澧冨彉閲忚鍙栵級
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 閫氳繃淇敼 .env.local 鏂囦欢涓殑 IMAGE_PROVIDER_PRIORITY 灏辫兘蹇€熷垏鎹富鍔?鎵樺簳椤哄簭
 * - 鏍煎紡锛氱敤閫楀彿鍒嗛殧鐨勬彁渚涘晢鍚嶇О锛屼粠宸﹀埌鍙充緷娆″皾璇? * - 鏀寔鐨勬彁渚涘晢锛欶AL銆並IE銆丷eplicate銆丄PIYI
 * - 绀轰緥锛欰PIYI,FAL,KIE,Replicate 琛ㄧず APIYI涓诲姏锛孎AL鎵樺簳锛孠IE鍐嶆墭搴曪紝Replicate鏈€缁堟墭搴? * - 濡傛灉鐜鍙橀噺鏈缃垨鏍煎紡閿欒锛岄粯璁や娇鐢?FAL,KIE,Replicate,APIYI
 */
function getProviderPriority(): Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'> {
  const priorityStr = process.env.IMAGE_PROVIDER_PRIORITY || 'FAL,KIE,Replicate,APIYI';

  // 瑙ｆ瀽閫楀彿鍒嗛殧鐨勫瓧绗︿覆锛屽幓闄ょ┖鏍?  const providers = priorityStr
    .split(',')
    .map(p => p.trim())
    .filter(p => ['FAL', 'KIE', 'Replicate', 'APIYI'].includes(p)) as Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'>;

  // 濡傛灉瑙ｆ瀽鍚庝负绌烘垨灏戜簬1涓彁渚涘晢锛屼娇鐢ㄩ粯璁ら厤缃?  if (providers.length === 0) {
    console.warn('鈿狅笍 IMAGE_PROVIDER_PRIORITY 閰嶇疆鏃犳晥锛屼娇鐢ㄩ粯璁ら『搴? FAL,KIE,Replicate,APIYI');
    return ['FAL', 'KIE', 'Replicate', 'APIYI'];
  }

  // 纭繚鎵€鏈夊洓涓彁渚涘晢閮藉瓨鍦紙闃叉閰嶇疆閬楁紡锛?  const allProviders: Array<'FAL' | 'KIE' | 'Replicate' | 'APIYI'> = ['FAL', 'KIE', 'Replicate', 'APIYI'];
  const missingProviders = allProviders.filter(p => !providers.includes(p));

  // 灏嗛仐婕忕殑鎻愪緵鍟嗚拷鍔犲埌鏈熬
  const finalProviders = [...providers, ...missingProviders];

  console.log(`馃搵 鍥剧墖鐢熸垚浼樺厛绾э紙鐜鍙橀噺閰嶇疆锛? ${finalProviders.join(' -> ')}`);
  return finalProviders;
}

// 璧勬簮鐨勫熀纭€ URL
// 浼樺厛浣跨敤 R2 鍩熷悕锛屽叾娆℃槸 App URL锛屾渶鍚庢槸鐢熶骇鐜鍩熷悕
// 娉ㄦ剰锛欰I 鏈嶅姟鏃犳硶璁块棶 localhost锛屽繀椤讳娇鐢ㄥ叕缃?URL
const ASSETS_BASE_URL =
  process.env.NEXT_PUBLIC_ASSETS_URL || 'https://cdn.studyhacks.ai';

/**
 * 澶勭悊鍥剧墖 URL锛岀‘淇濇槸鍏綉鍙闂殑
 */
function resolveImageUrl(url: string): string {
  if (!url) return '';

  // 濡傛灉宸茬粡鏄?http 寮€澶达紝妫€鏌ユ槸鍚︽槸 localhost
  if (url.startsWith('http')) {
    if (url.includes('localhost') || url.includes('127.0.0.1')) {
      // 灏?localhost 鏇挎崲涓哄叕缃戝煙鍚?      // 鍋囪璺緞缁撴瀯淇濇寔涓€鑷达細http://localhost:3000/styles/... -> https://cdn.xxx.com/styles/...
      const urlPath = new URL(url).pathname;
      return `${ASSETS_BASE_URL}${urlPath}`;
    }
    return url;
  }

  // 濡傛灉鏄浉瀵硅矾寰勶紝娣诲姞 Base URL
  if (url.startsWith('/')) {
    return `${ASSETS_BASE_URL}${url}`;
  }

  return url;
}

/**
 * Parse Image to Text using Vision AI (OCR)
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟浣跨敤瑙嗚AI妯″瀷锛圙oogle Gemini Pro Vision锛夋潵璇嗗埆鍥剧墖涓殑鏂囧瓧
 * - 姣斾紶缁烵CR鏇存櫤鑳斤紝鑳界悊瑙ｆ枃瀛楃殑涓婁笅鏂囧拰鎺掔増缁撴瀯
 * - 鏀寔 JPG銆丳NG銆乄EBP 绛夊父瑙佸浘鐗囨牸寮? */
export async function parseImageAction(formData: FormData): Promise<string> {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file uploaded');
  }

  // 妫€鏌?API Key
  if (!OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API Key 鏈厤缃紝鍥剧墖 OCR 鍔熻兘闇€瑕佹瀵嗛挜');
  }

  try {
    // 灏嗗浘鐗囪浆鎹负 base64
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64Image = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';

    // 鏋勫缓 data URL 鏍煎紡
    const imageDataUrl = `data:${mimeType};base64,${base64Image}`;

    console.log('[OCR] 寮€濮嬭瘑鍒浘鐗囨枃瀛楋紝浣跨敤 Qwen2.5 VL 32B...');
    console.log('[OCR] 鍥剧墖澶у皬:', (buffer.length / 1024).toFixed(2), 'KB');

    // 浣跨敤 OpenRouter 鐨?Qwen2.5 VL 32B Instruct 杩涜 OCR
    // Qwen2.5-VL-32B 涓撻棬浼樺寲鐢ㄤ簬瑙嗚鍒嗘瀽锛屼环鏍间究瀹滀笖鏁堟灉濂?    const response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer':
            process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': 'StudyHacks AI PPT Generator',
        },
        body: JSON.stringify({
          model: 'qwen/qwen2.5-vl-32b-instruct', // 浣跨敤 Qwen2.5 VL 32B Instruct 妯″瀷
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Extract all text content from this image. Preserve the original text structure, formatting, and language. Output only the extracted text without any additional comments, explanations, or formatting.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageDataUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.1, // 浣庢俯搴︾‘淇濆噯纭€?          max_tokens: 4000,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[OCR] OpenRouter API Error:', response.status, errorText);

      // 鎻愪緵鏇磋缁嗙殑閿欒淇℃伅
      if (response.status === 401) {
        throw new Error('API 瀵嗛挜鏃犳晥鎴栨湭鎺堟潈');
      } else if (response.status === 429) {
        throw new Error('API 璇锋眰棰戠巼闄愬埗锛岃绋嶅悗閲嶈瘯');
      } else {
        throw new Error(`API 璋冪敤澶辫触 (${response.status})`);
      }
    }

    const data = await response.json();

    // 妫€鏌ュ搷搴旀牸寮?    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('[OCR] 鏃犳晥鐨?API 鍝嶅簲:', data);
      throw new Error('API 杩斿洖浜嗘棤鏁堢殑鍝嶅簲鏍煎紡');
    }

    const extractedText = data.choices[0].message.content;

    if (!extractedText || extractedText.trim().length === 0) {
      console.warn('[OCR] 鍥剧墖涓湭璇嗗埆鍒版枃瀛?);
      return '锛堟湭璇嗗埆鍒版枃瀛楀唴瀹癸級';
    }

    console.log(
      '[OCR] 鍥剧墖鏂囧瓧璇嗗埆鎴愬姛锛屾彁鍙栦簡',
      extractedText.length,
      '涓瓧绗?
    );

    return extractedText.trim();
  } catch (error: any) {
    console.error('[OCR] 鍥剧墖瑙ｆ瀽閿欒:', error);

    // 鎻愪緵鏇村弸濂界殑閿欒淇℃伅
    if (error.message.includes('API 瀵嗛挜')) {
      throw new Error('API 瀵嗛挜閰嶇疆閿欒锛岃妫€鏌?OPENROUTER_API_KEY 鐜鍙橀噺');
    } else if (error.message.includes('缃戠粶')) {
      throw new Error('缃戠粶杩炴帴澶辫触锛岃妫€鏌ョ綉缁滆繛鎺ュ悗閲嶈瘯');
    } else {
      throw new Error('鍥剧墖鏂囧瓧璇嗗埆澶辫触锛? + (error.message || '鏈煡閿欒'));
    }
  }
}

/**
 * Parse Multiple Images to Text (Batch OCR)
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟鏀寔鎵归噺璇嗗埆澶氬紶鍥剧墖涓殑鏂囧瓧
 * - 骞惰澶勭悊澶氬紶鍥剧墖锛屾彁楂樻晥鐜? * - 鑷姩鍚堝苟鎵€鏈夎瘑鍒粨鏋? */
export async function parseMultipleImagesAction(
  formData: FormData
): Promise<string> {
  const files = formData.getAll('files') as File[];
  if (!files || files.length === 0) {
    throw new Error('No files uploaded');
  }

  console.log(`[Batch OCR] 寮€濮嬫壒閲忚瘑鍒?${files.length} 寮犲浘鐗?..`);

  try {
    // 骞惰澶勭悊鎵€鏈夊浘鐗?    const results = await Promise.all(
      files.map(async (file, index) => {
        try {
          console.log(
            `[Batch OCR] 姝ｅ湪璇嗗埆绗?${index + 1}/${files.length} 寮犲浘鐗? ${file.name}`
          );

          // 涓烘瘡涓枃浠跺垱寤哄崟鐙殑 FormData
          const singleFormData = new FormData();
          singleFormData.append('file', file);

          // 璋冪敤鍗曞浘鐗?OCR
          const text = await parseImageAction(singleFormData);

          console.log(
            `[Batch OCR] 绗?${index + 1} 寮犲浘鐗囪瘑鍒垚鍔燂紝鎻愬彇浜?${text.length} 涓瓧绗
          );

          return {
            success: true,
            fileName: file.name,
            text: text,
            index: index,
          };
        } catch (error: any) {
          console.error(
            `[Batch OCR] 绗?${index + 1} 寮犲浘鐗囪瘑鍒け璐?`,
            error.message
          );
          return {
            success: false,
            fileName: file.name,
            error: error.message,
            index: index,
          };
        }
      })
    );

    // 缁熻鎴愬姛鍜屽け璐ユ暟閲?    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    console.log(
      `[Batch OCR] 鎵归噺璇嗗埆瀹屾垚: 鎴愬姛 ${successCount}/${files.length}, 澶辫触 ${failedCount}`
    );

    // 濡傛灉鎵€鏈夊浘鐗囬兘澶辫触浜嗭紝鎻愪緵璇︾粏鐨勯敊璇俊鎭?    if (successCount === 0) {
      const failedDetails = results
        .filter((r) => !r.success)
        .map((r) => `${r.fileName}: ${r.error}`)
        .join('\n');

      console.error('[Batch OCR] 鎵€鏈夊浘鐗囪瘑鍒け璐ワ紝璇︾粏淇℃伅:');
      console.error(failedDetails);

      // 妫€鏌ュ父瑙侀敊璇被鍨?      const hasApiKeyError = results.some(
        (r) => r.error && r.error.includes('API 瀵嗛挜')
      );
      const hasNetworkError = results.some(
        (r) =>
          r.error && (r.error.includes('缃戠粶') || r.error.includes('fetch'))
      );

      if (hasApiKeyError) {
        throw new Error(
          '鍥剧墖璇嗗埆澶辫触锛歄penRouter API 瀵嗛挜鏈厤缃垨鏃犳晥銆傝妫€鏌ョ幆澧冨彉閲?OPENROUTER_API_KEY'
        );
      } else if (hasNetworkError) {
        throw new Error('鍥剧墖璇嗗埆澶辫触锛氱綉缁滆繛鎺ラ敊璇€傝妫€鏌ョ綉缁滆繛鎺ユ垨绋嶅悗閲嶈瘯');
      } else {
        throw new Error(
          `鎵€鏈夊浘鐗囪瘑鍒兘澶辫触浜嗐€傚父瑙佸師鍥狅細\n1. API 瀵嗛挜鏈厤缃甛n2. 鍥剧墖鏍煎紡涓嶆敮鎸乗n3. 鍥剧墖杩囧ぇ鎴栨崯鍧廫n4. 缃戠粶闂\n\n璇︾粏閿欒锛?{results[0].error}`
        );
      }
    }

    // 鍚堝苟鎵€鏈夋垚鍔熻瘑鍒殑鏂囧瓧
    const combinedText = results
      .filter((r) => r.success)
      .map((r, idx) => {
        // 涓烘瘡寮犲浘鐗囩殑鍐呭娣诲姞鍒嗛殧绗?        const separator = idx === 0 ? '' : '\n\n---\n\n';
        return `${separator}[鍥剧墖 ${r.index + 1}: ${r.fileName}]\n${r.text}`;
      })
      .join('');

    // 濡傛灉鏈夊け璐ョ殑锛屽湪缁撴灉涓彁绀?    if (failedCount > 0) {
      const failedFiles = results
        .filter((r) => !r.success)
        .map((r) => r.fileName)
        .join(', ');
      console.warn(`[Batch OCR] 浠ヤ笅鍥剧墖璇嗗埆澶辫触: ${failedFiles}`);

      // 鍦ㄥ悎骞剁殑鏂囨湰鏈熬娣诲姞鎻愮ず
      return (
        combinedText.trim() +
        `\n\n[娉ㄦ剰锛?{failedCount} 寮犲浘鐗囪瘑鍒け璐? ${failedFiles}]`
      );
    }

    return combinedText.trim();
  } catch (error: any) {
    console.error('[Batch OCR] 鎵归噺璇嗗埆閿欒:', error);
    throw error; // 鐩存帴鎶涘嚭閿欒锛屼繚鐣欒缁嗕俊鎭?  }
}

/**
 * Parse public webpage link into clean text.
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟浼氳闂敤鎴风矘璐寸殑缃戦〉閾炬帴
 * - 鑷姩鍘绘帀鑴氭湰銆佹牱寮忋€佸箍鍛婄瓑鍣煶
 * - 鍙繚鐣欐鏂囨枃瀛楋紝渚夸簬缁х画鍋氳嚜鍔ㄥ垎椤? */
export async function parseLinkContentAction(rawUrl: string): Promise<string> {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('璇峰厛杈撳叆瑕佹姄鍙栫殑閾炬帴');
  }

  let normalizedUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    const target = new URL(normalizedUrl);
    const res = await fetch(target, {
      cache: 'no-store',
      headers: {
        'User-Agent': 'StudyHacksSlidesBot/1.0 (+https://studyhacks.ai/ai-ppt)',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!res.ok) {
      throw new Error(`閾炬帴璁块棶澶辫触锛圚TTP ${res.status}锛塦);
    }

    const html = await res.text();
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?(svg|canvas|iframe|picture|noscript)[\s\S]*?>/gi, '');

    const text = stripped
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|section|article|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (!text) {
      throw new Error('娌℃湁浠庤閾炬帴鎻愬彇鍒版湁鏁堟鏂?);
    }

    return text.slice(0, 20000); // 闄愬埗鏈€澶ч暱搴︼紝閬垮厤瓒呴暱 prompt
  } catch (error: any) {
    console.error('[Link Parser] 瑙ｆ瀽缃戦〉澶辫触', error);
    throw new Error(
      error.message || '瑙ｆ瀽缃戦〉鍐呭澶辫触锛岃妫€鏌ラ摼鎺ユ槸鍚﹀彲鍏紑璁块棶'
    );
  }
}

/**
 * Parse File (PDF/DOCX/TXT/Image) to Text
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟鐜板湪鏀寔鏇村鏂囦欢鏍煎紡锛屽寘鎷浘鐗? * - 浼氳嚜鍔ㄨ瘑鍒枃浠剁被鍨嬪苟浣跨敤瀵瑰簲鐨勮В鏋愭柟娉? * - 鍥剧墖鏂囦欢浼氫娇鐢?AI 瑙嗚妯″瀷杩涜 OCR 璇嗗埆
 */
export async function parseFileAction(input: FormData | { fileUrl: string; fileType?: string; fileName?: string }) {
  let buffer: Buffer;
  let fileType = '';
  let fileName = '';

  // 鏂瑰紡1锛氶€氳繃 FormData 浼犻€掞紙灏忔枃浠讹級
  if (input instanceof FormData) {
    const file = input.get('file') as File;
    if (!file) {
      throw new Error('No file uploaded');
    }
    buffer = Buffer.from(await file.arrayBuffer());
    fileType = file.type;
    fileName = file.name.toLowerCase();
  }
  // 鏂瑰紡2锛氶€氳繃 URL 浼犻€掞紙澶ф枃浠讹紝宸蹭笂浼犲埌 R2锛?  else {
    const { fileUrl } = input;
    if (!fileUrl) {
      throw new Error('No file URL provided');
    }
    console.log('[Parse] Downloading file from URL:', fileUrl);
    
    // 涓嬭浇鏂囦欢
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`);
    }
    
    buffer = Buffer.from(await response.arrayBuffer());
    
    // 灏濊瘯浠?input 鎴?Content-Type 鎺ㄦ柇绫诲瀷
    fileType = input.fileType || response.headers.get('content-type') || '';
    fileName = input.fileName?.toLowerCase() || fileUrl.split('/').pop()?.toLowerCase() || '';
    
    console.log('[Parse] File downloaded. Size:', (buffer.length / 1024 / 1024).toFixed(2), 'MB');
  }

  try {
    let extractedText = '';

    // 妫€鏌ユ槸鍚︿负鍥剧墖鏂囦欢
    const isImage =
      fileType.startsWith('image/') ||
      fileName.endsWith('.jpg') ||
      fileName.endsWith('.jpeg') ||
      fileName.endsWith('.png') ||
      fileName.endsWith('.webp') ||
      fileName.endsWith('.gif');

    if (isImage) {
      // 浣跨敤 AI OCR 璇嗗埆鍥剧墖涓殑鏂囧瓧
      console.log('[Parse] 妫€娴嬪埌鍥剧墖鏂囦欢锛屼娇鐢?OCR 璇嗗埆...');
      
      // 濡傛灉鏄?FormData 涓旀槸鍥剧墖锛屽鐢ㄧ幇鏈夌殑 parseImageAction
      // 娉ㄦ剰锛歱arseImageAction 闇€瑕?FormData锛屽鏋滄槸 URL 妯″紡锛屾垜浠渶瑕侀噸鏋?OCR 閫昏緫鏀寔 URL
      if (input instanceof FormData) {
        extractedText = await parseImageAction(input);
      } else {
        // 瀵逛簬澶у浘鐗?URL锛岀洰鍓嶆殏鏃朵笉鏀寔 OCR锛堝洜涓?OCR 閫昏緫寮虹粦瀹氫簡 FormData锛?        // 浣嗛€氬父澶ф枃浠舵槸 PDF/DOCX锛屽浘鐗囧緢灏戣秴杩?4.5MB
        // 濡傛灉鐪熸湁闇€姹傦紝闇€瑕佹敼閫?parseImageAction 鏀寔 URL
        throw new Error('OCR via URL is not supported yet. Please use smaller images.');
      }
    } else if (fileType === 'application/pdf' || fileName.endsWith('.pdf')) {
      const data = await pdf(buffer);
      extractedText = data.text;
    } else if (
      fileType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      fileName.endsWith('.docx')
    ) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (
      fileType === 'text/plain' ||
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md')
    ) {
      extractedText = buffer.toString('utf-8');
    } else {
      throw new Error(
        'Unsupported file type. Please upload PDF, DOCX, TXT, or Image files.'
      );
    }

    // Basic cleaning
    return extractedText.trim();
  } catch (error) {
    console.error('File parsing error:', error);
    throw new Error('Failed to parse file');
  }
}

/**
 * Generate PPT Outline via DeepSeek V3
 */
export async function generateOutlineAction(
  content: string,
  slideCount: number = 8
) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DeepSeek API Key is not configured');
  }

  // 绠€鍗曠殑璇█妫€娴嬶細濡傛灉鏈変腑鏂囧瓧绗︼紝鍒欏€惧悜浜庝腑鏂囷紱鍚﹀垯榛樿涓鸿嫳鏂囷紙閽堝绾嫳鏂囪緭鍏ョ殑鎯呭喌锛?  const hasChineseChar = /[\u4e00-\u9fa5]/.test(content);
  const languageInstruction = hasChineseChar
    ? 'The user input contains Chinese characters. Output MUST be in Chinese (绠€浣撲腑鏂?.'
    : 'The user input is in English. Output MUST be in English. Do NOT use Chinese.';

  const systemPrompt = `You are an expert presentation designer.
Create a structured outline for a presentation based on the user's content.

CRITICAL RULE:
- ${languageInstruction}
- Strictly maintain the same language as the user's input content.
- If the input is in Chinese, ALL titles and content in the output JSON MUST be in Chinese.
- If the input is in English, output in English.
- Do NOT translate unless explicitly asked.
- **The first slide MUST be a COVER PAGE.** It should only contain a Main Title (title) and a Subtitle (content). The content field for the first slide should be short and act as a subtitle or tagline (e.g. "Presentation by [Name]" or "Date").

The output must be a valid JSON object with the following structure:
{
  "title": "Presentation Title",
  "slides": [
  {
    "title": "Slide Title",
    "content": "Key bullet points (max 50 words). For the first slide (Cover), this is the subtitle."
  }
]
}
Generate exactly ${slideCount} slides.
Ensure the content is concise, professional, and suitable for a presentation.
Do not include any markdown formatting (like \`\`\`json), just the raw JSON object.`;

  try {
    const response: Response = await fetch(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: hasChineseChar
                ? content
                : content + '\n\n(Please generate the outline in English)',
            },
          ],
          stream: false,
          response_format: { type: 'json_object' },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', errorText);
      throw new Error(`DeepSeek API error: ${response.status}`);
    }

    const data = await response.json();
    const responseContent = data.choices[0].message.content;

    try {
      return JSON.parse(responseContent);
    } catch (e) {
      console.error(
        'Failed to parse DeepSeek response as JSON:',
        responseContent
      );
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Outline generation error:', error);
    throw error;
  }
}

/**
 * Consume Credits Action (Server Side)
 */
export async function consumeCreditsAction(params: {
  credits: number;
  description: string;
  metadata?: any;
}) {
  const user = await getSignUser();
  if (!user) {
    return {
      success: false as const,
      code: 'UNAUTHORIZED' as const,
      message: 'Unauthorized',
    };
  }

  const remaining = await getRemainingCredits(user.id);
  if (remaining < params.credits) {
    return {
      success: false as const,
      code: 'INSUFFICIENT_CREDITS' as const,
      message: `Insufficient credits. Required: ${params.credits}, Available: ${remaining}`,
      requiredCredits: params.credits,
      remainingCredits: remaining,
    };
  }

  await consumeCredits({
    userId: user.id,
    credits: params.credits,
    scene: 'ai_ppt',
    description: params.description,
    metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
  });

  return { success: true as const, remaining: remaining - params.credits };
}
/**
 * Refund Credits Action (Server Side)
 */
export async function refundCreditsAction(params: {
  credits: number;
  description: string;
}) {
  const user = await getSignUser();
  if (!user) {
    throw new Error('Unauthorized');
  }

  await refundCredits({
    userId: user.id,
    credits: params.credits,
    description: params.description,
  });

  return { success: true };
}

/**
 * Create Image Generation Task via KIE API
 *
 * 馃幆 2026-02-10 鏇存柊锛氭敮鎸佺紪杈戞ā寮? * KIE 鐨?nano-banana-pro 妯″瀷閫氳繃 image_input 鍙傛暟鏀寔缂栬緫鍔熻兘
 * 缂栬緫妯″紡涓嬶紝灏嗗甫鏍囪鐨勫浘鐗囦綔涓?image_input 浼犲叆鍗冲彲
 */
export async function createKieTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[]; // Array of publicly accessible image URLs
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** 馃幆 缂栬緫妯″紡锛氬師濮嬪浘鐗嘦RL锛堢敤浜庡眬閮ㄧ紪杈戯級 */
  editImageUrl?: string;
  /** 馃幆 缂栬緫妯″紡锛歮ask 鍥剧墖锛圔ase64 鎴?URL锛?*/
  maskImage?: string;
  /** 馃幆 缂栬緫妯″紡锛氬甫鏍囪鐨勫浘鐗囷紙鐢ㄤ簬缂栬緫锛?*/
  markedImage?: string;
  /** Deck涓婁笅鏂囷細浼犻€掑綋鍓嶉〉鐮佷俊鎭互澧炲己瑙嗚涓€鑷存€?*/
  deckContext?: DeckContext;
}) {
  const endpoint = 'https://api.kie.ai/api/v1/jobs/createTask';

  // 馃幆 鍒ゆ柇鏄惁涓虹紪杈戞ā寮?  const isEditMode = !!(params.editImageUrl || params.markedImage);

  // Styles
  let styleSuffix = '';
  // 澶勭悊鍙傝€冨浘鐗?URL锛氱‘淇濇槸鍏綉鍙闂殑
  let referenceImages: string[] = [];

  // 馃幆 缂栬緫妯″紡涓嬶紝浣跨敤甯︽爣璁扮殑鍥剧墖浣滀负鍙傝€?  if (isEditMode && params.markedImage) {
    referenceImages = [params.markedImage];
    console.log('[KIE] 馃帹 缂栬緫妯″紡锛氫娇鐢ㄥ甫鏍囪鐨勫浘鐗?);
  } else {
    // 闈炵紪杈戞ā寮忥細姝ｅ父澶勭悊鍙傝€冨浘鐗?    referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 馃幆 鍏抽敭锛氬鏋滈鏍煎畾涔変簡鍙傝€冨浘鎴栭瑙堝浘锛屽皢鍏跺姞鍏ュ弬鑰冨浘鍒楄〃
        let styleRefs: string[] = [];
        if (style.preview) {
          styleRefs.push(resolveImageUrl(style.preview));
        }
        if (style.refs && style.refs.length > 0) {
          styleRefs = [...styleRefs, ...style.refs.map(resolveImageUrl)];
        }

        if (styleRefs.length > 0) {
          // 鍘婚噸
          const uniqueStyleRefs = Array.from(new Set(styleRefs));
          // 灏嗛鏍煎弬鑰冨浘鏀惧湪鍓嶉潰
          referenceImages = [...uniqueStyleRefs, ...referenceImages];
        }
      }
    }
  }

  // 馃幆 2026-02-10 鏇存柊锛氫娇鐢ㄧ粺涓€鐨勮瑷€妫€娴嬪拰鎻愮ず璇嶇敓鎴愬嚱鏁?  // 杩欐牱鍙互纭繚 auto 妯″紡涓嬪噯纭娴嬬敤鎴疯緭鍏ョ殑璇█锛岄伩鍏嶈瑷€娣蜂贡
  const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

  // Content Strategy Prompt
  const contentStrategy = params.isEnhancedMode
    ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
    : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

  // Combine prompts
  // 馃幆 璇█绾︽潫鏀惧湪鏈€鍚庯紝纭繚 AI 浼樺厛閬靛畧璇█瑕佹眰
  let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy + languagePrompt;

  // 馃幆 缂栬緫妯″紡锛氭坊鍔犵壒娈婄紪杈戞寚浠?  if (isEditMode && params.markedImage) {
    finalPrompt += `\n\n[閲嶈缂栬緫鎸囦护]\n鍥剧墖涓殑绾㈣壊妗嗘爣璁颁簡闇€瑕佷慨鏀圭殑鍖哄煙銆傝浠呬慨鏀圭孩妗嗗唴鐨勫唴瀹癸紝淇濇寔绾㈡澶栫殑鎵€鏈夊厓绱犱笉鍙樸€備慨鏀瑰畬鎴愬悗锛岃绉婚櫎鎵€鏈夌孩鑹叉爣璁版銆俙;
    console.log('[KIE] 馃帹 宸叉坊鍔犵紪杈戞ā寮忔寚浠?);
  }

  // Log reference images info
  if (referenceImages.length > 0) {
    const limitedImages = referenceImages.slice(0, 8);
    console.log(
      `[KIE] Reference images (${limitedImages.length} URLs):`,
      limitedImages.map(url => url.substring(0, 80) + '...')
    );
    // 闈炵紪杈戞ā寮忎笅娣诲姞椋庢牸鍙傝€冩寚浠?    if (!isEditMode) {
      finalPrompt +=
        '锛堣瑙夐鏍煎弬鑰冿細璇蜂弗鏍奸伒寰墍鎻愪緵鍙傝€冨浘鐨勮璁￠鏍笺€侀厤鑹叉柟妗堝拰鏋勫浘甯冨眬锛?;
    }

    referenceImages = limitedImages;
  }

  // New payload structure per documentation: wrap params in 'input'
  // Note: image_input expects array of publicly accessible URLs, NOT base64
  const body = {
    model: 'nano-banana-pro',
    input: {
      prompt: finalPrompt,
      aspect_ratio: params.aspectRatio || '16:9',
      resolution: params.imageSize || '4K', // doc says 'resolution' (1K/2K/4K)
      image_input: referenceImages.length > 0 ? referenceImages : undefined, // array of URLs
      output_format: 'png',
    },
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
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
 * Query Task Status via KIE API
 */
export async function queryKieTaskAction(taskId: string) {
  // Kie Query Endpoint
  const endpoint = `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${KIE_API_KEY}`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    const data = await res.json();

    // Check if task succeeded
    // Data structure: data.data.state (success/fail/processing)
    // Results: data.data.resultJson (stringified JSON) -> { resultUrls: string[] }

    if (data.data && data.data.resultJson) {
      let results: string[] = [];
      try {
        if (typeof data.data.resultJson === 'string') {
          const parsed = JSON.parse(data.data.resultJson);
          results = parsed.resultUrls || [];
        } else if (data.data.resultJson.resultUrls) {
          results = data.data.resultJson.resultUrls;
        }
      } catch (e) {
        console.warn('Failed to parse resultJson', e);
      }

      return {
        data: {
          status:
            data.data.state === 'success'
              ? 'SUCCESS'
              : data.data.state === 'fail'
                ? 'FAILED'
                : 'PENDING',
          results: results,
        },
      };
    }

    return data;
  } catch (e: any) {
    console.error('[KIE] Query Error:', e);
    throw e;
  }
}

/**
 * APIYI API 绔偣
 * - 缁熶竴浣跨敤 Gemini 鍘熺敓鏍煎紡锛堟敮鎸佹枃鐢熷浘鍜屽浘鐢熷浘锛屼笖鏀寔鍒嗚鲸鐜囧弬鏁帮級
 */
const APIYI_TEXT2IMG_URL = 'https://api.apiyi.com/v1beta/models/gemini-3-pro-image-preview:generateContent';

/**
 * 涓嬭浇鍥剧墖骞惰浆鎹负 base64
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 浠?URL 涓嬭浇鍥剧墖鏂囦欢
 * - 灏嗗浘鐗囨暟鎹浆鎹负 base64 缂栫爜瀛楃涓? * - 鐢ㄤ簬 APIYI 鍥剧敓鍥炬ā寮忥紙Gemini 鍘熺敓鏍煎紡闇€瑕?base64 鍥剧墖锛? */
async function downloadImageAsBase64ForApiyi(imageUrl: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    console.log('[APIYI] 馃摜 涓嬭浇鍙傝€冨浘:', imageUrl.substring(0, 80) + '...');

    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(30000), // 30绉掕秴鏃?    });

    if (!response.ok) {
      console.warn('[APIYI] 涓嬭浇鍙傝€冨浘澶辫触:', response.status);
      return null;
    }

    // 鑾峰彇 MIME 绫诲瀷
    const contentType = response.headers.get('content-type') || 'image/png';
    const mimeType = contentType.split(';')[0].trim();

    // 杞崲涓?base64
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    console.log(`[APIYI] 鉁?鍙傝€冨浘涓嬭浇鎴愬姛锛屽ぇ灏? ${(base64.length / 1024).toFixed(1)} KB, 绫诲瀷: ${mimeType}`);

    return { base64, mimeType };
  } catch (error: any) {
    console.warn('[APIYI] 涓嬭浇鍙傝€冨浘寮傚父:', error.message);
    return null;
  }
}

/**
 * Create Image Generation Task via APIYI API (鍚屾妯″紡)
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - APIYI 缁熶竴浣跨敤 Google Gemini 鍘熺敓鏍煎紡锛屾敮鎸?aspectRatio 鍜?imageSize
 * - 鏂囩敓鍥撅細鐩存帴浼犻€掓枃鏈?prompt
 * - 鍥剧敓鍥撅細灏嗗弬鑰冨浘杞负 base64锛岄€氳繃 inline_data 浼犻€? * - 鍚屾鎺ュ彛锛氱洿鎺ョ瓑寰呯敓鎴愬畬鎴愶紝杩斿洖 base64 鍥剧墖鏁版嵁
 * - 閫熷害蹇紙绾?8-22 绉掞級锛屼环鏍间究瀹滐紙$0.05/寮狅級
 *
 * 馃幆 娉ㄦ剰锛欰PIYI 鏄悓姝?API锛屼細鐩存帴杩斿洖鍥剧墖鏁版嵁
 * 涓轰簡涓庡叾浠栧紓姝ユ彁渚涘晢淇濇寔涓€鑷寸殑鎺ュ彛锛岃繖閲岃繑鍥炰竴涓壒娈婄殑 task_id
 * 鍓嶇杞鏃朵細绔嬪嵆杩斿洖宸插畬鎴愮姸鎬佸拰鍥剧墖 URL
 *
 * 閲嶈淇锛?026-02-12锛夛細
 * - 涔嬪墠鍥剧敓鍥句娇鐢?OpenAI 鍏煎鏍煎紡锛屼笉鏀寔鍒嗚鲸鐜囧弬鏁? * - 鐜板湪缁熶竴浣跨敤 Gemini 鍘熺敓鏍煎紡 + base64 鍥剧墖锛屾敮鎸佸畬鏁寸殑鍒嗚鲸鐜囨帶鍒? */
export async function createApiyiTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  editImageUrl?: string;
  maskImage?: string;
  markedImage?: string;
  deckContext?: DeckContext;
}) {
  // 馃幆 鍒ゆ柇鏄惁涓虹紪杈戞ā寮?  const isEditMode = !!(params.editImageUrl || params.markedImage);

  // Styles
  let styleSuffix = '';
  let referenceImages: string[] = [];

  // 馃幆 缂栬緫妯″紡涓嬶紝浣跨敤甯︽爣璁扮殑鍥剧墖浣滀负鍙傝€?  if (isEditMode && params.markedImage) {
    referenceImages = [params.markedImage];
    console.log('[APIYI] 馃帹 缂栬緫妯″紡锛氫娇鐢ㄥ甫鏍囪鐨勫浘鐗?);
  } else {
    referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        let styleRefs: string[] = [];
        if (style.preview) {
          styleRefs.push(resolveImageUrl(style.preview));
        }
        if (style.refs && style.refs.length > 0) {
          styleRefs = [...styleRefs, ...style.refs.map(resolveImageUrl)];
        }

        if (styleRefs.length > 0) {
          const uniqueStyleRefs = Array.from(new Set(styleRefs));
          referenceImages = [...uniqueStyleRefs, ...referenceImages];
        }
      }
    }
  }

  // 浣跨敤缁熶竴鐨勮瑷€妫€娴嬪拰鎻愮ず璇嶇敓鎴愬嚱鏁?  const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

  // Content Strategy Prompt
  const contentStrategy = params.isEnhancedMode
    ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
    : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

  // Combine prompts
  let finalPrompt = params.prompt + ' ' + styleSuffix + contentStrategy + languagePrompt;

  // 馃幆 缂栬緫妯″紡锛氭坊鍔犵壒娈婄紪杈戞寚浠?  if (isEditMode && params.markedImage) {
    finalPrompt += `\n\n[閲嶈缂栬緫鎸囦护]\n鍥剧墖涓殑绾㈣壊妗嗘爣璁颁簡闇€瑕佷慨鏀圭殑鍖哄煙銆傝浠呬慨鏀圭孩妗嗗唴鐨勫唴瀹癸紝淇濇寔绾㈡澶栫殑鎵€鏈夊厓绱犱笉鍙樸€備慨鏀瑰畬鎴愬悗锛岃绉婚櫎鎵€鏈夌孩鑹叉爣璁版銆俙;
    console.log('[APIYI] 馃帹 宸叉坊鍔犵紪杈戞ā寮忔寚浠?);
  }

  // Log reference images info
  if (referenceImages.length > 0) {
    const limitedImages = referenceImages.slice(0, 8);
    console.log(
      `[APIYI] Reference images (${limitedImages.length} URLs):`,
      limitedImages.map((url) => url.substring(0, 80) + '...')
    );
  }

  // 鏄犲皠瀹介珮姣斿拰鍒嗚鲸鐜?  const aspectRatio = params.aspectRatio || '16:9';
  const imageSize = params.imageSize || '2K';

  // 鏍规嵁鍒嗚鲸鐜囪缃秴鏃舵椂闂?  const timeoutMap: Record<string, number> = { '1K': 180000, '2K': 300000, '4K': 360000 };
  const timeout = timeoutMap[imageSize] || 300000;

  // 馃幆 缁熶竴浣跨敤 Gemini 鍘熺敓鏍煎紡绔偣锛堟敮鎸佸垎杈ㄧ巼鍙傛暟锛?  const hasReferenceImages = referenceImages.length > 0;
  const apiUrl = APIYI_TEXT2IMG_URL;

  // 鏋勫缓璇锋眰浣擄紙Gemini 鍘熺敓鏍煎紡锛?  let parts: any[] = [{ text: finalPrompt }];

  // 濡傛灉鏈夊弬鑰冨浘锛屼笅杞藉苟杞负 base64锛屾坊鍔犲埌 parts 涓?  if (hasReferenceImages) {
    const limitedImages = referenceImages.slice(0, 8); // 鏈€澶?8 寮犲弬鑰冨浘
    console.log('[APIYI] 馃帹 寮€濮嬩笅杞藉弬鑰冨浘锛屾暟閲?', limitedImages.length);

    // 骞惰涓嬭浇鎵€鏈夊弬鑰冨浘
    const downloadPromises = limitedImages.map(url => downloadImageAsBase64ForApiyi(url));
    const downloadResults = await Promise.all(downloadPromises);

    // 灏嗘垚鍔熶笅杞界殑鍥剧墖娣诲姞鍒?parts 鏁扮粍
    let successCount = 0;
    for (const imageData of downloadResults) {
      if (imageData) {
        parts.push({
          inline_data: {
            mime_type: imageData.mimeType,
            data: imageData.base64,
          },
        });
        successCount++;
      }
    }

    if (successCount > 0) {
      console.log(`[APIYI] 馃帹 浣跨敤鍥剧敓鍥炬ā寮忥紙Gemini 鍘熺敓鏍煎紡 + base64 鍥剧墖锛夛紝鎴愬姛鍔犺浇 ${successCount}/${limitedImages.length} 寮犲弬鑰冨浘`);
    } else {
      console.warn('[APIYI] 鈿狅笍 鎵€鏈夊弬鑰冨浘涓嬭浇澶辫触锛岄檷绾т负绾枃鐢熷浘妯″紡');
    }
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: {
        aspectRatio: aspectRatio,
        imageSize: imageSize,
      },
    },
  };

  console.log('[APIYI] 璇锋眰鍙傛暟:', {
    apiUrl: 'Gemini 鍘熺敓鏍煎紡',
    aspectRatio,
    imageSize,
    promptLength: finalPrompt.length,
    isEditMode,
    hasReferenceImages,
    partsCount: parts.length,
  });

  try {
    // 鍙戦€佽姹傦紙鍚屾绛夊緟锛?    const startTime = Date.now();
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[APIYI] 璇锋眰鑰楁椂: ${elapsed.toFixed(1)} 绉抈);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[APIYI] 璇锋眰澶辫触:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 瑙ｆ瀽 Gemini 鍘熺敓鏍煎紡鐨勫搷搴?    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[APIYI] 鍐呭琚嫆缁?', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[APIYI] 鍝嶅簲鏍煎紡寮傚父:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`鉁?[APIYI] 鐢熸垚鎴愬姛锛佸浘鐗囧ぇ灏? ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 馃幆 鍏抽敭淇锛氬皢 base64 鍥剧墖涓婁紶鍒?R2锛岄伩鍏嶅ぇ鏁版嵁閫氳繃 Server Action 浼犺緭
    // 鍘熷洜锛歜ase64 鏁版嵁绾?4-6MB锛岄€氳繃 Server Action 杩斿洖浼氳秴杩?Next.js middleware 鐨?10MB 闄愬埗
    // 瑙ｅ喅锛氬厛涓婁紶鍒?R2 CDN锛岀劧鍚庡彧缂撳瓨 CDN URL
    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[APIYI] 寮€濮嬩笂浼犲浘鐗囧埌 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        // 灏?base64 杞崲涓?Buffer 骞朵笂浼?        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[APIYI] 鉁?鍥剧墖涓婁紶鎴愬姛: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          // 涓婁紶澶辫触锛岄檷绾т娇鐢?data URL锛堝彲鑳戒細瀵艰嚧澶ф暟鎹棶棰橈紝浣嗚嚦灏戜笉浼氬畬鍏ㄥけ璐ワ級
          console.warn('[APIYI] 鈿狅笍 R2 涓婁紶澶辫触锛岄檷绾т娇鐢?data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        // 鏈厤缃?R2锛屼娇鐢?data URL
        console.warn('[APIYI] 鈿狅笍 R2 鏈厤缃紝浣跨敤 data URL锛堝彲鑳藉鑷村ぇ鍥剧墖浼犺緭闂锛?);
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      // 涓婁紶寮傚父锛岄檷绾т娇鐢?data URL
      console.error('[APIYI] 鈿狅笍 R2 涓婁紶寮傚父:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    // 杩斿洖鐗规畩鏍煎紡鐨?task_id
    const taskId = `apiyi-sync-${Date.now()}`;

    // 灏嗙粨鏋滃瓨鍌ㄥ埌鍏ㄥ眬缂撳瓨涓紙鐜板湪瀛樺偍鐨勬槸 CDN URL 鑰岄潪 data URL锛?    apiyiResultCache.set(taskId, {
      status: 'SUCCESS',
      imageUrl: finalImageUrl,
      createdAt: Date.now(),
    });

    return { task_id: taskId };
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error('[APIYI] 璇锋眰瓒呮椂');
      throw new Error('APIYI request timeout');
    }
    console.error('[APIYI] Create Error:', e);
    throw e;
  }
}

/**
 * APIYI 缁撴灉缂撳瓨
 * 鐢变簬 APIYI 鏄悓姝?API锛岀敓鎴愬畬鎴愬悗鐩存帴杩斿洖缁撴灉
 * 杩欓噷鐢ㄧ紦瀛樺瓨鍌ㄧ粨鏋滐紝渚?queryApiyiTaskAction 鏌ヨ
 */
const apiyiResultCache = new Map<string, {
  status: 'SUCCESS' | 'FAILED';
  imageUrl?: string;
  error?: string;
  createdAt: number;
}>();

// 瀹氭湡娓呯悊杩囨湡缂撳瓨锛堣秴杩?10 鍒嗛挓鐨勭紦瀛橈級
setInterval(() => {
  const now = Date.now();
  const expireTime = 10 * 60 * 1000; // 10 鍒嗛挓
  for (const [key, value] of apiyiResultCache.entries()) {
    if (now - value.createdAt > expireTime) {
      apiyiResultCache.delete(key);
    }
  }
}, 60 * 1000); // 姣忓垎閽熸鏌ヤ竴娆?
/**
 * Query Task Status via APIYI (浠庣紦瀛樿鍙?
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - APIYI 鏄悓姝?API锛宑reateApiyiTaskAction 宸茬粡瀹屾垚浜嗙敓鎴? * - 杩欎釜鍑芥暟鍙槸浠庣紦瀛樹腑璇诲彇缁撴灉锛岀珛鍗宠繑鍥? */
export async function queryApiyiTaskAction(taskId: string) {
  // 浠庣紦瀛樹腑鑾峰彇缁撴灉
  const cached = apiyiResultCache.get(taskId);

  if (!cached) {
    // 缂撳瓨涓嶅瓨鍦紝鍙兘宸茶繃鏈熸垨 taskId 鏃犳晥
    return {
      data: {
        status: 'FAILED',
        results: [],
        error: 'Task not found or expired',
      },
    };
  }

  if (cached.status === 'SUCCESS' && cached.imageUrl) {
    return {
      data: {
        status: 'SUCCESS',
        results: [cached.imageUrl],
      },
    };
  }

  return {
    data: {
      status: 'FAILED',
      results: [],
      error: cached.error || 'Unknown error',
    },
  };
}

/**
 * Create Image Generation Task with Load Balancing (涓夌骇鏈哄埗 - 鏀寔鐜鍙橀噺閰嶇疆)
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 瀹炵幇浜嗕笁绾ч檷绾х瓥鐣ワ紝涓诲姏/鎵樺簳椤哄簭鍙€氳繃鐜鍙橀噺蹇€熷垏鎹? * - 閰嶇疆鏂瑰紡锛氬湪 .env.local 鏂囦欢涓慨鏀?IMAGE_PROVIDER_PRIORITY
 * - 榛樿椤哄簭锛欶AL -> KIE -> Replicate
 * - 鍒囨崲绀轰緥锛? *   - 鎯宠 KIE 鍋氫富鍔涳細IMAGE_PROVIDER_PRIORITY=KIE,FAL,Replicate
 *   - 鎯宠 FAL 鍋氫富鍔涳細IMAGE_PROVIDER_PRIORITY=FAL,KIE,Replicate
 * - 浼樺娍锛氫笉闇€瑕佹敼浠ｇ爜锛岄噸鍚湇鍔″悗绔嬪嵆鐢熸晥
 */
/**
 * Deck涓婁笅鏂囦俊鎭?- 鐢ㄤ簬澶氶〉PPT鐢熸垚鏃朵繚鎸佷竴鑷存€? */
export interface DeckContext {
  /** 褰撳墠鏄鍑犻〉锛堜粠1寮€濮嬶級 */
  currentSlide: number;
  /** 鎬诲叡澶氬皯椤?*/
  totalSlides: number;
  /** 绗竴寮犲凡鐢熸垚鐨勫浘鐗嘦RL锛堜綔涓鸿瑙夐敋瀹氬弬鑰冿級 */
  anchorImageUrl?: string;
}

export async function createKieTaskWithFallbackAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  preferredProvider?: 'FAL' | 'Replicate' | 'KIE'; // 棣栭€夋彁渚涘晢
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  refundCredits?: number; // 澶辫触鏃惰嚜鍔ㄩ€€杩樼殑绉垎鏁伴噺
  /** Deck涓婁笅鏂囷細浼犻€掑綋鍓嶉〉鐮佸拰鎬婚〉鏁帮紝甯姪AI淇濇寔涓€鑷存€?*/
  deckContext?: DeckContext;
  /** 馃幆 缂栬緫妯″紡锛氬師濮嬪浘鐗嘦RL锛堢敤浜庡眬閮ㄧ紪杈戯級 */
  editImageUrl?: string;
  /** 馃幆 缂栬緫妯″紡锛歮ask 鍥剧墖锛圔ase64 鎴?URL锛?*/
  maskImage?: string;
  /** 馃幆 缂栬緫妯″紡锛氬甫鏍囪鐨勫浘鐗囷紙闄嶇骇鏂规锛?*/
  markedImage?: string;
}) {
  const {
    preferredProvider,
    isEnhancedMode = true,
    isPromptEnhancedMode = true,
    outputLanguage = 'auto',
    refundCredits: refundAmount,
    deckContext,
    editImageUrl,
    maskImage,
    markedImage,
    ...taskParams
  } = params;

  // 棰勫鐞嗗浘鐗?URL锛岀‘淇濆鎵€鏈夋彁渚涘晢閮芥槸鍏綉鍙闂殑
  // 濡傛灉鏈夐敋瀹氬浘鐗囷紙绗竴寮犲凡鐢熸垚鐨勫浘鐗囷級锛屽皢鍏舵坊鍔犲埌鍙傝€冨浘鐗囧垪琛ㄧ殑鏈€鍓嶉潰
  let customImagesWithAnchor = (taskParams.customImages || []).map(
    resolveImageUrl
  );

  // 棣栧紶閿氬畾鏈哄埗锛氬鏋滀笉鏄涓€寮狅紝涓旀湁閿氬畾鍥剧墖锛屽垯灏嗗叾浣滀负棣栬鍙傝€?  if (deckContext?.anchorImageUrl && deckContext.currentSlide > 1) {
    const anchorUrl = resolveImageUrl(deckContext.anchorImageUrl);
    // 灏嗛敋瀹氬浘鐗囨斁鍦ㄦ渶鍓嶉潰锛岀‘淇滱I浼樺厛鍙傝€?    customImagesWithAnchor = [anchorUrl, ...customImagesWithAnchor];
    console.log(
      `[涓€鑷存€ч敋瀹歖 绗?${deckContext.currentSlide}/${deckContext.totalSlides} 椤典娇鐢ㄩ寮犱綔涓洪鏍奸敋瀹歚
    );
  }

  const processedParams = {
    ...taskParams,
    isEnhancedMode,
    isPromptEnhancedMode,
    outputLanguage,
    customImages: customImagesWithAnchor,
    deckContext, // 浼犻€抎eck涓婁笅鏂?    editImageUrl, // 馃幆 浼犻€掔紪杈戞ā寮忓弬鏁?    maskImage, // 馃幆 浼犻€?mask
    markedImage, // 馃幆 浼犻€掑甫鏍囪鐨勫浘鐗?  };

  // 瀹氫箟浼樺厛绾ч『搴忥紙浠庣幆澧冨彉閲忚鍙栵紝鍙湪 .env.local 涓慨鏀?IMAGE_PROVIDER_PRIORITY锛?  // 闈炵▼搴忓憳瑙ｉ噴锛氱幇鍦ㄤ笉闇€瑕佹敼浠ｇ爜锛屽彧闇€瑕佷慨鏀?.env.local 鏂囦欢灏辫兘鍒囨崲涓诲姏/鎵樺簳椤哄簭
  let providerChain = getProviderPriority();

  // 馃幆 缂栬緫妯″紡鍒ゆ柇閫昏緫浼樺寲
  // 1. 灞€閮ㄧ紪杈戯細鏈夊師鍥?+ 鏍囪鍥?  // 2. 鏁翠綋缂栬緫锛氭湁鍘熷浘锛坋ditImageUrl锛?  // 3. 瀹归敊澶勭悊锛氬鏋?customImages 涓彧鏈変竴寮犲浘涓旀病鏈?styleId锛岄€氬父涔熸槸缂栬緫琛屼负
  const isEditMode = !!(editImageUrl || markedImage || (taskParams.customImages && taskParams.customImages.length === 1 && !params.styleId));

  // 馃幆 2026-02-10 鏇存柊锛欿IE 鐨?nano-banana-pro 涔熸敮鎸佺紪杈戝姛鑳斤紙閫氳繃 image_input 鍙傛暟锛?  // 鍥犳缂栬緫妯″紡涓嶅啀寮哄埗浣跨敤 FAL锛岃€屾槸鎸夌収鐜鍙橀噺閰嶇疆鐨勪紭鍏堢骇椤哄簭灏濊瘯
  // 鍙湁 Replicate 涓嶆敮鎸佺紪杈戞ā寮忥紝闇€瑕佷粠閾句腑绉婚櫎
  if (isEditMode) {
    // 缂栬緫妯″紡涓嬬Щ闄?Replicate锛堜笉鏀寔缂栬緫锛?    providerChain = providerChain.filter(p => p !== 'Replicate');
    console.log(`\n馃帹 缂栬緫妯″紡纭锛?{markedImage ? '灞€閮ㄦ爣璁扮紪杈? : '鏁翠綋鏁堟灉缂栬緫'}`);
    console.log(`馃搵 缂栬緫妯″紡鍙敤鎻愪緵鍟? ${providerChain.join(' -> ')}`);
  } else if (preferredProvider && providerChain.includes(preferredProvider)) {
    // 灏嗛閫?provider 绉诲埌绗竴浣?    providerChain = [
      preferredProvider,
      ...providerChain.filter((p) => p !== preferredProvider),
    ];
  }

  console.log(`\n馃幆 鐢熸垚浠诲姟 - 浼樺厛绾ч『搴? ${providerChain.join(' -> ')}`);

  // 馃幆 璁板綍涓诲姏鎻愪緵鍟嗭紙浼樺厛绾ч摼鐨勭涓€涓級
  const primaryProvider = providerChain[0];

  let lastError: any = null;

  for (const provider of providerChain) {
    try {
      if (provider === 'FAL') {
        if (!FAL_KEY) {
          console.warn('鈿狅笍 FAL Key 鏈厤缃紝璺宠繃');
          continue;
        }
        console.log(
          `馃攧 [${provider === primaryProvider ? '涓诲姏' : '鎵樺簳'}] 浣跨敤 FAL (nano-banana-pro)...`
        );
        const result = await createFalTaskAction(processedParams);
        console.log('鉁?FAL 浠诲姟鎴愬姛');
        return {
          ...result,
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'KIE') {
        if (!KIE_API_KEY) {
          console.warn('鈿狅笍 KIE Key 鏈厤缃紝璺宠繃');
          continue;
        }
        console.log(
          `馃攧 [${provider === primaryProvider ? '涓诲姏' : '鎵樺簳'}] 浣跨敤 KIE (nano-banana-pro)...`
        );
        const result = await createKieTaskAction(processedParams);
        console.log('鉁?KIE 浠诲姟鍒涘缓鎴愬姛:', result.task_id);
        return {
          success: true,
          task_id: result.task_id,
          provider: 'KIE',
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'Replicate') {
        if (!REPLICATE_API_TOKEN) {
          console.warn('鈿狅笍 Replicate Token 鏈厤缃紝璺宠繃');
          continue;
        }
        console.log(
          `馃攧 [${provider === primaryProvider ? '涓诲姏' : '鎵樺簳'}] 浣跨敤 Replicate (nano-banana-pro)...`
        );
        const result = await createReplicateTaskAction(processedParams);
        console.log('鉁?Replicate 浠诲姟鎴愬姛');
        return {
          ...result,
          fallbackUsed: provider !== primaryProvider,
        };
      } else if (provider === 'APIYI') {
        if (!APIYI_API_KEY) {
          console.warn('鈿狅笍 APIYI Key 鏈厤缃紝璺宠繃');
          continue;
        }
        console.log(
          `馃攧 [${provider === primaryProvider ? '涓诲姏' : '鎵樺簳'}] 浣跨敤 APIYI (gemini-3-pro-image)...`
        );
        const result = await createApiyiTaskAction(processedParams);
        console.log('鉁?APIYI 浠诲姟鎴愬姛:', result.task_id);
        return {
          success: true,
          task_id: result.task_id,
          provider: 'APIYI',
          fallbackUsed: provider !== primaryProvider,
        };
      }
    } catch (error: any) {
      console.warn(`鈿狅笍 ${provider} 澶辫触:`, error.message);
      lastError = error;

      // 馃幆 缂栬緫妯″紡涓嬭褰曡缁嗛敊璇紝浣嗙户缁皾璇曚笅涓€涓彁渚涘晢
      if (isEditMode) {
        console.error(`鉂?缂栬緫妯″紡 ${provider} 澶辫触:`, error.message);
      }
      // 缁х画涓嬩竴涓?loop
    }
  }

  // 濡傛灉鎵€鏈夐兘澶辫触浜?  console.error(`鉂?鎵€鏈夊浘鐗囩敓鎴愭湇鍔￠兘澶辫触`);

  // 鑷姩閫€杩樼Н鍒?  if (refundAmount && refundAmount > 0) {
    try {
      const user = await getSignUser();
      if (user) {
        console.log(`馃挵 鐢熸垚澶辫触锛岃嚜鍔ㄩ€€杩樼敤鎴?${refundAmount} 绉垎`);
        await refundCredits({
          userId: user.id,
          credits: refundAmount,
          description: 'Refund for failed PPT slide generation',
        });
      }
    } catch (refundError) {
      console.error('Failed to refund credits:', refundError);
    }
  }

  throw new Error(
    `鎵€鏈夊浘鐗囩敓鎴愭湇鍔￠兘鏆傛椂涓嶅彲鐢? ${lastError?.message || '鏈煡閿欒'}`
  );
}

/**
 * Force Create FAL Task (浣跨敤 fal-ai/nano-banana-pro/edit)
 */
export async function createFalTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** Deck涓婁笅鏂囷細浼犻€掑綋鍓嶉〉鐮佷俊鎭互澧炲己瑙嗚涓€鑷存€?*/
  deckContext?: DeckContext;
  /** 馃幆 缂栬緫妯″紡锛氬師濮嬪浘鐗嘦RL锛堢敤浜庡眬閮ㄧ紪杈戯級 */
  editImageUrl?: string;
  /** 馃幆 缂栬緫妯″紡锛歮ask 鍥剧墖锛圔ase64 鎴?URL锛?*/
  maskImage?: string;
  /** 馃幆 缂栬緫妯″紡锛氬甫鏍囪鐨勫浘鐗囷紙闄嶇骇鏂规锛岀敤浜庝笉鏀寔 mask 鐨勬ā鍨嬶級 */
  markedImage?: string;
  /** 馃幆 缂栬緫妯″紡锛氭槸鍚︿娇鐢?inpainting 涓撶敤妯″瀷 */
  useInpaintingModel?: boolean;
}) {
  if (!FAL_KEY) {
    throw new Error('FAL API Key 鏈厤缃?);
  }

  try {
    // 閰嶇疆 FAL Client
    fal.config({
      credentials: FAL_KEY,
    });

    // 澶勭悊鏍峰紡鍜岃瑙夎鑼?    let styleSuffix = '';
    let visualSpecPrompt = '';

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 馃幆 鍏抽敭锛氬鏋滈鏍兼湁瑙嗚瑙勮寖锛岀敓鎴愬己鍒舵€х殑瑙嗚绾︽潫鎻愮ず璇?        if (style.visualSpec) {
          visualSpecPrompt = generateVisualSpecPrompt(
            style.visualSpec,
            params.deckContext
              ? {
                  currentSlide: params.deckContext.currentSlide,
                  totalSlides: params.deckContext.totalSlides,
                }
              : undefined
          );
        }
      }
    }

    // 馃幆 棣栧紶閿氬畾鎻愮ず璇嶏細濡傛灉涓嶆槸绗竴寮犱笖鏈夐敋瀹氬浘鐗?    const anchorPrompt = generateAnchorPrompt(
      params.deckContext?.currentSlide && params.deckContext.currentSlide > 1
        ? params.deckContext.anchorImageUrl
        : null
    );

    // 馃幆 2026-02-10 鏇存柊锛氫娇鐢ㄧ粺涓€鐨勮瑷€妫€娴嬪拰鎻愮ず璇嶇敓鎴愬嚱鏁?    // 杩欐牱鍙互纭繚 auto 妯″紡涓嬪噯纭娴嬬敤鎴疯緭鍏ョ殑璇█锛岄伩鍏嶈瑷€娣蜂贡
    const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    // 馃幆 鏋勫缓鏈€缁堟彁绀鸿瘝锛氬唴瀹?+ 椋庢牸 + 瑙嗚瑙勮寖 + 閿氬畾 + 绛栫暐 + 璇█绾︽潫
    // 璇█绾︽潫鏀惧湪鏈€鍚庯紝纭繚 AI 浼樺厛閬靛畧璇█瑕佹眰
    let finalPrompt =
      params.prompt +
      ' ' +
      styleSuffix +
      visualSpecPrompt +
      anchorPrompt +
      contentStrategy +
      languagePrompt;

    // 馃幆 鍒ゆ柇鏄惁涓虹紪杈戞ā寮忥紙鏈夊師鍥惧拰mask锛?    const isEditMode = !!(params.editImageUrl && params.maskImage);

    // 澶勭悊鍙傝€冨浘鐗囷紙缂栬緫妯″紡涓嬩笉浣跨敤鍙傝€冨浘锛?    let referenceImages: string[] = [];

    if (!isEditMode) {
      // 鍙湪闈炵紪杈戞ā寮忎笅娣诲姞鍙傝€冨浘
      referenceImages = (params.customImages || []).map(resolveImageUrl);

      if (params.styleId) {
        const style = PPT_STYLES.find((s) => s.id === params.styleId);
        if (style && style.refs && style.refs.length > 0) {
          const styleRefs = style.refs.map(resolveImageUrl);
          referenceImages = [...styleRefs, ...referenceImages];
        }
      }
    }

    const input: any = {
      prompt: finalPrompt,
      num_images: 1,
      aspect_ratio: params.aspectRatio === '16:9' ? '16:9' : 'auto',
      output_format: 'png',
      resolution: params.imageSize || '2K', // 鏀寔 1K, 2K, 4K
    };

    let falModel = 'fal-ai/nano-banana-pro';

    if (isEditMode) {
      // 馃幆 缂栬緫妯″紡锛氫娇鐢ㄨ瑙夋爣璁版柟妗堬紙鍦ㄥ浘鐗囦笂缁樺埗閫夊尯妗嗭級
      // 鍥犱负 nano-banana-pro/edit 闇€瑕?image_urls 鍙傛暟锛屼笉鏀寔鍗曠嫭鐨?mask
      if (params.markedImage) {
        // 浣跨敤甯︽爣璁扮殑鍥剧墖浣滀负鍙傝€冨浘
        falModel = 'fal-ai/nano-banana-pro/edit';
        input.image_urls = [params.markedImage];

        // 澧炲己鎻愮ず璇嶏細鏄庣‘鎸囧嚭瑕佺紪杈戠孩妗嗗尯鍩?        finalPrompt = `${finalPrompt}\n\n[閲嶈缂栬緫鎸囦护]\n鍥剧墖涓殑绾㈣壊妗嗘爣璁颁簡闇€瑕佷慨鏀圭殑鍖哄煙銆傝浠呬慨鏀圭孩妗嗗唴鐨勫唴瀹癸紝淇濇寔绾㈡澶栫殑鎵€鏈夊厓绱犱笉鍙樸€備慨鏀瑰畬鎴愬悗锛岃绉婚櫎鎵€鏈夌孩鑹叉爣璁版銆俙;

        console.log('[FAL] 馃帹 缂栬緫妯″紡锛氫娇鐢ㄨ瑙夋爣璁版柟妗堬紙绾㈡鏍囪缂栬緫鍖哄煙锛?);
        console.log('[FAL] 鏍囪鍥剧墖闀垮害:', params.markedImage.length, '瀛楃');
      } else {
        throw new Error('缂栬緫妯″紡闇€瑕佸甫鏍囪鐨勫浘鐗?);
      }
    } else if (referenceImages.length > 0) {
      // 馃幆 鍙傝€冨浘妯″紡锛氫娇鐢?edit 妯″瀷 + 鍙傝€冨浘锛堥潪灞€閮ㄧ紪杈戯級
      falModel = 'fal-ai/nano-banana-pro/edit';
      const limitedImages = referenceImages.slice(0, 8);
      finalPrompt +=
        '锛堣瑙夐鏍煎弬鑰冿細璇蜂弗鏍奸伒寰墍鎻愪緵鍙傝€冨浘鐨勮璁￠鏍笺€侀厤鑹叉柟妗堝拰鏋勫浘甯冨眬锛?;
      console.log(`[FAL] 浣跨敤 ${limitedImages.length} 寮犲弬鑰冨浘`);
      input.image_urls = limitedImages;
    }

    console.log('[FAL] 璇锋眰鍙傛暟:', {
      model: falModel,
      prompt: input.prompt.substring(0, 100) + '...',
      hasReferenceImages: referenceImages.length > 0,
      isEditMode: isEditMode,
    });

    const startTime = Date.now();
    const maxRetries = 2; // 鏈€澶ч噸璇曟鏁?    let attempt = 0;
    let result: any;

    while (attempt <= maxRetries) {
      try {
        // 浣跨敤 subscribe 绛夊緟缁撴灉
        result = await fal.subscribe(falModel, {
          input,
          logs: true,
          onQueueUpdate: (update: any) => {
            if (update.status === 'IN_PROGRESS') {
              // update.logs.map((log) => log.message).forEach(console.log);
            }
          },
        });
        // 濡傛灉鎴愬姛锛岃烦鍑洪噸璇曞惊鐜?        break;
      } catch (error: any) {
        attempt++;
        // 鍙湁鍦ㄧ綉缁滈敊璇紙fetch failed锛夋垨鏈嶅姟鍣?5xx 閿欒鏃舵墠閲嶈瘯
        const isNetworkError =
          error.message?.includes('fetch failed') ||
          error.status >= 500 ||
          error.status === 429; // 429 涔熷€煎緱閲嶈瘯

        if (attempt <= maxRetries && isNetworkError) {
          console.warn(
            `鈿狅笍 [FAL] 绗?${attempt} 娆″皾璇曞け璐?(${error.message})锛屾鍦ㄨ繘琛岀 ${
              attempt + 1
            } 娆￠噸璇?..`
          );
          // 鎸囨暟閫€閬匡細绗竴娆￠噸璇曠瓑 1s锛岀浜屾閲嶈瘯绛?2s
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          continue;
        }

        // 璁板綍澶辫触鏃ュ織骞舵姏鍑洪敊璇紝瑙﹀彂 providerChain 鐨勬墭搴曢€昏緫
        console.error('鉂?FAL 澶辫触:', error.message);
        if (error.body) {
          console.error('[FAL] 閿欒璇︽儏:', JSON.stringify(error.body, null, 2));
        }
        if (error.status) {
          console.error('[FAL] HTTP 鐘舵€佺爜:', error.status);
        }
        throw error;
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[FAL] API 璋冪敤瀹屾垚锛屾€昏€楁椂: ${elapsed}s (灏濊瘯娆℃暟: ${attempt + 1})`);

    // 杩斿洖鐢熸垚缁撴灉
    if (!result || !result.data || !result.data.images || result.data.images.length === 0) {
      throw new Error('FAL API 鏈繑鍥炴湁鏁堢殑鍥剧墖缁撴灉');
    }

    const tempImageUrl = result.data.images[0].url;
    console.log('[FAL] 鉁?鐢熸垚鎴愬姛:', tempImageUrl.substring(0, 60) + '...');

    // 馃幆 2026-02-13 淇锛氬悓姝ョ瓑寰?R2 涓婁紶瀹屾垚锛岀洿鎺ヨ繑鍥炴案涔呴摼鎺?    // 鍘熷洜锛氬悗鍙板紓姝ユ洿鏂版暟鎹簱鐨勬柟妗堝お澶嶆潅涓斿鏄撳嚭闂锛圧eact 鐘舵€佹洿鏂板紓姝ャ€乸resentationId 鍙兘涓虹┖绛夛級
    // 鏂版柟妗堬細鐗虹壊鍑犵绛夊緟鏃堕棿锛屾崲鍙栨暟鎹竴鑷存€у拰鍙潬鎬?    let finalImageUrl = tempImageUrl;
    try {
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[FAL] 寮€濮嬪悓姝ヤ繚瀛樺浘鐗囧埌 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = tempImageUrl.includes('.jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: tempImageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[FAL] 鉁?鍥剧墖宸蹭繚瀛樺埌 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[FAL] 鈿狅笍 R2 涓婁紶澶辫触锛屼娇鐢ㄤ复鏃堕摼鎺?', uploadResult.error);
        }
      }
    } catch (saveError) {
      console.error('[FAL] R2 淇濆瓨寮傚父锛屼娇鐢ㄤ复鏃堕摼鎺?', saveError);
    }

    return {
      imageUrl: finalImageUrl,
      prompt: params.prompt,
    };
  } catch (error: any) {
    console.error('[FAL] 鉂?createFalTaskAction 閿欒:', error.message);
    throw error;
  }
}

/**
 * Force Create Replicate Task (浣跨敤 google/nano-banana-pro)
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟寮哄埗浣跨敤 Replicate 鐨?google/nano-banana-pro 妯″瀷鐢熸垚鍥剧墖
 * - 鏀寔 1K/2K/4K 鍒嗚鲸鐜囧拰澶氬浘鍙傝€冿紙鏈€澶?寮狅級
 * - 鐢ㄤ簬涓诲姏鐢熸垚鎴?KIE 瓒呮椂/澶辫触鏃剁殑鐩存帴璋冪敤
 */
export async function createReplicateTaskAction(params: {
  prompt: string;
  styleId?: string;
  aspectRatio?: string;
  imageSize?: string;
  customImages?: string[];
  isEnhancedMode?: boolean;
  isPromptEnhancedMode?: boolean;
  outputLanguage?: 'auto' | 'zh' | 'en';
  /** Deck涓婁笅鏂囷細浼犻€掑綋鍓嶉〉鐮佷俊鎭互澧炲己瑙嗚涓€鑷存€?*/
  deckContext?: DeckContext;
}) {
  if (!REPLICATE_API_TOKEN) {
    console.log('鈴笍 璺宠繃 Replicate锛堟湭閰嶇疆API Token锛?);
    throw new Error('Replicate API Token 鏈厤缃?);
  }

  try {
    console.log('馃攧 灏濊瘯浣跨敤 Replicate (google/nano-banana-pro)...');

    // 棰勫鐞嗗浘鐗?URL
    const processedParams = {
      ...params,
      customImages: (params.customImages || []).map(resolveImageUrl),
    };

    // 澶勭悊鏍峰紡鍜岃瑙夎鑼?    let styleSuffix = '';
    let visualSpecPrompt = '';

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && params.isPromptEnhancedMode !== false) {
        styleSuffix = style.prompt;

        // 馃幆 鍏抽敭锛氬鏋滈鏍兼湁瑙嗚瑙勮寖锛岀敓鎴愬己鍒舵€х殑瑙嗚绾︽潫鎻愮ず璇?        if (style.visualSpec) {
          visualSpecPrompt = generateVisualSpecPrompt(
            style.visualSpec,
            params.deckContext
              ? {
                  currentSlide: params.deckContext.currentSlide,
                  totalSlides: params.deckContext.totalSlides,
                }
              : undefined
          );
        }
      }
    }

    // 馃幆 棣栧紶閿氬畾鎻愮ず璇?    const anchorPrompt = generateAnchorPrompt(
      params.deckContext?.currentSlide && params.deckContext.currentSlide > 1
        ? params.deckContext.anchorImageUrl
        : null
    );

    // 馃幆 2026-02-10 鏇存柊锛氫娇鐢ㄧ粺涓€鐨勮瑷€妫€娴嬪拰鎻愮ず璇嶇敓鎴愬嚱鏁?    // 杩欐牱鍙互纭繚 auto 妯″紡涓嬪噯纭娴嬬敤鎴疯緭鍏ョ殑璇█锛岄伩鍏嶈瑷€娣蜂贡
    const languagePrompt = generateLanguagePrompt(params.outputLanguage, params.prompt);

    // Content Strategy Prompt
    const contentStrategy = params.isEnhancedMode
      ? `\n\n[Content Enhancement Strategy]\nIf user provided content is detailed, use it directly. If content is simple/sparse, use your professional knowledge to expand on the subject to create a rich, complete slide, BUT you must STRICTLY preserve any specific data, numbers, and professional terms provided. Do NOT invent false data. For sparse content, use advanced layout techniques (grid, whitespace, font size) to fill the space professionally without forced filling.`
      : `\n\n[Strict Mode]\nSTRICTLY follow the provided text for Title and Content. Do NOT add, remove, or modify any words. Do NOT expand or summarize. Render the text exactly as given.`;

    // 馃幆 鏋勫缓鏈€缁堟彁绀鸿瘝锛氬唴瀹?+ 椋庢牸 + 瑙嗚瑙勮寖 + 閿氬畾 + 绛栫暐 + 璇█绾︽潫
    // 璇█绾︽潫鏀惧湪鏈€鍚庯紝纭繚 AI 浼樺厛閬靛畧璇█瑕佹眰
    let finalPrompt =
      params.prompt +
      ' ' +
      styleSuffix +
      visualSpecPrompt +
      anchorPrompt +
      contentStrategy +
      languagePrompt;

    // 澶勭悊鍙傝€冨浘鐗?    let referenceImages = (params.customImages || []).map(resolveImageUrl);

    if (params.styleId) {
      const style = PPT_STYLES.find((s) => s.id === params.styleId);
      if (style && style.refs && style.refs.length > 0) {
        const styleRefs = style.refs.map(resolveImageUrl);
        referenceImages = [...styleRefs, ...referenceImages];
      }
    }

    if (referenceImages.length > 0) {
      // nano-banana-pro 鏀寔澶氬浘铻嶅悎锛屾渶澶?寮?      const limitedImages = referenceImages.slice(0, 8);
      finalPrompt +=
        '锛堣瑙夐鏍煎弬鑰冿細璇蜂弗鏍奸伒寰墍鎻愪緵鍙傝€冨浘鐨勮璁￠鏍笺€侀厤鑹叉柟妗堝拰鏋勫浘甯冨眬锛?;
      console.log(
        `[Replicate] 浣跨敤 ${limitedImages.length} 寮犲弬鑰冨浘:`,
        limitedImages
      );
    }

    // 璋冪敤 Replicate API
    const replicate = new Replicate({ auth: REPLICATE_API_TOKEN });

    // google/nano-banana-pro 鐨勫弬鏁扮粨鏋勶紙涓?KIE 绫讳技锛?    const input: any = {
      prompt: finalPrompt,
      aspect_ratio: params.aspectRatio || '16:9',
      resolution: params.imageSize || '4K', // 1K/2K/4K
      output_format: 'png',
    };

    // 濡傛灉鏈夊弬鑰冨浘锛屼紶鍏?image_input锛坣ano-banana-pro 鏀寔澶氬浘铻嶅悎锛?    if (referenceImages.length > 0) {
      input.image_input = referenceImages.slice(0, 8); // 鏈€澶?寮?    }

    console.log('[Replicate] 璇锋眰鍙傛暟:', {
      model: 'google/nano-banana-pro',
      input: {
        ...input,
        prompt: input.prompt.substring(0, 100) + '...', // 鍙樉绀洪儴鍒唒rompt
      },
    });

    // 浣跨敤 run() 骞剁瓑寰呭畬鎴?    // run() 浼氳嚜鍔ㄥ鐞嗚疆璇紝鐩村埌浠诲姟瀹屾垚
    console.log('[Replicate] 寮€濮嬭皟鐢?API...');

    const startTime = Date.now();
    let output = await replicate.run('google/nano-banana-pro', {
      input,
      wait: { mode: 'poll', interval: 2000 }, // 姣?2 绉掓鏌ヤ竴娆＄姸鎬?    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Replicate] API 璋冪敤瀹屾垚锛岃€楁椂: ${elapsed}s`);
    console.log('[Replicate] 鍘熷杈撳嚭绫诲瀷:', typeof output);
    console.log(
      '[Replicate] 鍘熷杈撳嚭:',
      typeof output === 'string'
        ? output
        : JSON.stringify(output).substring(0, 200)
    );

    // 澶勭悊鍚勭鍙兘鐨勮緭鍑烘牸寮?    let imageUrl: string;

    if (typeof output === 'string') {
      console.log(
        '[Replicate] 鉁?杈撳嚭鏄瓧绗︿覆绫诲瀷锛岄暱搴?',
        (output as string).length
      );
      imageUrl = output;
    } else if (Array.isArray(output)) {
      console.log(
        '[Replicate] 鉁?杈撳嚭鏄暟缁勶紝闀垮害:',
        (output as any[]).length,
        ', 绗竴椤圭被鍨?',
        typeof (output as any[])[0]
      );

      const firstItem = output[0];

      // 濡傛灉鏁扮粍绗竴椤规槸瀵硅薄涓旀湁 url 灞炴€э紙FileOutput锛?      if (firstItem && typeof firstItem === 'object' && 'url' in firstItem) {
        const urlValue = (firstItem as any).url;
        console.log('[Replicate] 鏁扮粍绗竴椤?url 绫诲瀷:', typeof urlValue);

        if (typeof urlValue === 'function') {
          console.log('[Replicate] url 鏄嚱鏁帮紝姝ｅ湪璋冪敤...');
          const result = await urlValue();
          console.log('[Replicate] 鍑芥暟杩斿洖鍊肩被鍨?', typeof result);
          console.log('[Replicate] 鍑芥暟杩斿洖鍊?', result);

          // 濡傛灉杩斿洖鐨勬槸 URL 瀵硅薄锛岄渶瑕佽浆鎹负瀛楃涓?          if (result && typeof result === 'object' && 'href' in result) {
            imageUrl = result.href; // URL 瀵硅薄鐨?href 灞炴€ф槸瀛楃涓?            console.log('[Replicate] 浠?URL 瀵硅薄鎻愬彇 href:', imageUrl);
          } else if (typeof result === 'string') {
            imageUrl = result;
          } else {
            imageUrl = String(result); // 寮哄埗杞崲涓哄瓧绗︿覆
          }
        } else {
          imageUrl = urlValue;
        }
      } else {
        // 鐩存帴浣跨敤绗竴椤癸紙鍋囪鏄瓧绗︿覆锛?        imageUrl = firstItem;
      }
    } else if (output && typeof output === 'object') {
      console.log(
        '[Replicate] 鉁?杈撳嚭鏄璞★紝灞炴€?',
        Object.keys(output).slice(0, 10)
      );
      console.log('[Replicate] 鉁?Constructor name:', output.constructor?.name);

      // 濡傛灉鏄?ReadableStream锛岄渶瑕佽鍙栧唴瀹?      if (
        'readable' in output ||
        output.constructor?.name === 'ReadableStream'
      ) {
        console.log('[Replicate] 妫€娴嬪埌 ReadableStream锛屾鍦ㄨ鍙?..');
        const reader = (output as any).getReader();
        const chunks: any[] = [];
        let chunkCount = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(`[Replicate] Stream 璇诲彇瀹屾垚锛屽叡 ${chunkCount} 鍧楁暟鎹甡);
            break;
          }
          chunks.push(value);
          chunkCount++;
          if (chunkCount % 10 === 0) {
            console.log(`[Replicate] 宸茶鍙?${chunkCount} 鍧?..`);
          }
        }

        // 灏?chunks 鍚堝苟骞惰浆鎹负瀛楃涓?        const blob = new Blob(chunks as BlobPart[]);
        const text = await blob.text();

        console.log(
          `[Replicate] Stream 鍐呭闀垮害: ${text.length}, 鍓?00瀛楃:`,
          text.substring(0, 100)
        );

        try {
          // 灏濊瘯瑙ｆ瀽涓?JSON
          const parsed = JSON.parse(text);
          console.log('[Replicate] JSON 瑙ｆ瀽鎴愬姛:', typeof parsed);
          imageUrl = Array.isArray(parsed) ? parsed[0] : parsed.url || parsed;
        } catch (e) {
          // 濡傛灉涓嶆槸 JSON锛岀洿鎺ヤ娇鐢ㄦ枃鏈?          console.log('[Replicate] 涓嶆槸 JSON锛岀洿鎺ヤ娇鐢ㄦ枃鏈?);
          imageUrl = text.trim();
        }
      } else if ('url' in output) {
        console.log('[Replicate] 鉁?瀵硅薄鍖呭惈 url 灞炴€?);
        const urlValue = (output as any).url;
        console.log('[Replicate] url 绫诲瀷:', typeof urlValue);

        // Replicate SDK 鐨?FileOutput 绫诲瀷锛寀rl 鍙兘鏄嚱鏁?        if (typeof urlValue === 'function') {
          console.log('[Replicate] url 鏄嚱鏁帮紝姝ｅ湪璋冪敤...');
          const result = await urlValue(); // 璋冪敤鍑芥暟鑾峰彇瀹為檯 URL
          console.log('[Replicate] 鍑芥暟杩斿洖鍊肩被鍨?', typeof result);
          console.log('[Replicate] 鍑芥暟杩斿洖鍊?', result);

          // 濡傛灉杩斿洖鐨勬槸 URL 瀵硅薄锛岄渶瑕佽浆鎹负瀛楃涓?          if (result && typeof result === 'object' && 'href' in result) {
            imageUrl = result.href; // URL 瀵硅薄鐨?href 灞炴€ф槸瀛楃涓?            console.log('[Replicate] 浠?URL 瀵硅薄鎻愬彇 href:', imageUrl);
          } else if (typeof result === 'string') {
            imageUrl = result;
          } else {
            imageUrl = String(result); // 寮哄埗杞崲涓哄瓧绗︿覆
            console.log('[Replicate] 寮哄埗杞崲涓哄瓧绗︿覆:', imageUrl);
          }
        } else {
          imageUrl = urlValue;
        }
      } else if ('output' in output) {
        console.log('[Replicate] 鉁?瀵硅薄鍖呭惈 output 灞炴€?);
        const innerOutput = (output as any).output;
        imageUrl = Array.isArray(innerOutput) ? innerOutput[0] : innerOutput;
      } else {
        console.warn('[Replicate] 鈿?鏈瘑鍒殑瀵硅薄鏍煎紡锛岃浆涓哄瓧绗︿覆');
        imageUrl = String(output);
      }
    } else {
      console.error('[Replicate] 鉁?瀹屽叏鏃犳硶瑙ｆ瀽鐨勮緭鍑虹被鍨?);
      throw new Error('Replicate 杩斿洖浜嗘棤娉曡В鏋愮殑缁撴灉鏍煎紡');
    }

    if (
      !imageUrl ||
      typeof imageUrl !== 'string' ||
      !imageUrl.startsWith('http')
    ) {
      console.error('[Replicate] 鉁?鏃犳晥鐨勫浘鐗?URL:', imageUrl);
      console.error('[Replicate] 鉁?imageUrl 绫诲瀷:', typeof imageUrl);
      throw new Error('Replicate 杩斿洖浜嗘棤鏁堢殑鍥剧墖 URL');
    }

    console.log('鉁?Replicate 鐢熸垚鎴愬姛锛孶RL:', imageUrl);

    // 馃幆 2026-02-13 淇锛氬悓姝ョ瓑寰?R2 涓婁紶瀹屾垚锛岀洿鎺ヨ繑鍥炴案涔呴摼鎺?    let finalImageUrl = imageUrl;
    try {
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Replicate] 寮€濮嬪悓姝ヤ繚瀛樺浘鐗囧埌 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension =
          imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')
            ? 'jpg'
            : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `slides/${user.id}/${fileName}`;

        const uploadResult = await storageService.downloadAndUpload({
          url: imageUrl,
          key: storageKey,
          contentType: `image/${fileExtension}`,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[Replicate] 鉁?鍥剧墖宸蹭繚瀛樺埌 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Replicate] 鈿狅笍 R2 涓婁紶澶辫触锛屼娇鐢ㄤ复鏃堕摼鎺?', uploadResult.error);
        }
      }
    } catch (saveError: any) {
      console.error('[Replicate] R2 淇濆瓨寮傚父锛屼娇鐢ㄤ复鏃堕摼鎺?', saveError);
    }

    // 杩斿洖绫讳技KIE鐨勬牸寮忥紝浣嗘爣璁颁负鍚屾缁撴灉
    const result = {
      success: true,
      task_id: `replicate-${Date.now()}`,
      provider: 'Replicate',
      fallbackUsed: false,
      imageUrl: finalImageUrl, // 杩斿洖 R2 姘镐箙閾炬帴
    };

    console.log('[Replicate] 杩斿洖鍊?', {
      ...result,
      imageUrl: result.imageUrl.substring(0, 80) + '...',
    });

    return result;
  } catch (error: any) {
    console.error('鉂?Replicate 澶辫触:', error.message);
    throw error;
  }
}

/**
 * Query Task Status with Fallback Support
 *
 * 闈炵▼搴忓憳瑙ｉ噴锛? * - 杩欎釜鍑芥暟鏌ヨ浠诲姟鐘舵€侊紝鏀寔KIE銆丷eplicate銆丗AL鍜孉PIYI
 * - 瀵逛簬Replicate鍜孎AL鐨勫悓姝ョ粨鏋滐紝鐩存帴杩斿洖鎴愬姛鐘舵€? * - 瀵逛簬APIYI鐨勫悓姝ョ粨鏋滐紝浠庣紦瀛樹腑璇诲彇鍥剧墖鏁版嵁
 * - 鉁?2026-02-13 淇锛欿IE 浠诲姟鎴愬姛鍚庡悓姝ヤ笂浼犲埌 R2锛岃繑鍥炴案涔呴摼鎺? */
export async function queryKieTaskWithFallbackAction(
  taskId: string,
  provider?: string
) {
  // 濡傛灉鏄疪eplicate鎴朏AL鐨勪换鍔★紙鍚屾API锛夛紝鐩存帴杩斿洖鎴愬姛
  if (
    provider === 'Replicate' ||
    taskId.startsWith('replicate-') ||
    provider === 'FAL' ||
    taskId.startsWith('fal-')
  ) {
    return {
      data: {
        status: 'SUCCESS',
        results: [], // 鍥剧墖URL宸插湪鍒涘缓鏃惰繑鍥?      },
    };
  }

  // 濡傛灉鏄疉PIYI鐨勪换鍔★紙鍚屾API锛夛紝浠庣紦瀛樹腑璇诲彇缁撴灉
  if (provider === 'APIYI' || taskId.startsWith('apiyi-sync-')) {
    return await queryApiyiTaskAction(taskId);
  }

  // 鍚﹀垯浣跨敤鍘熸潵鐨凨IE鏌ヨ閫昏緫
  const result = await queryKieTaskAction(taskId);

  // 馃幆 2026-02-13 淇锛氬鏋滀换鍔℃垚鍔熶笖鏈夌粨鏋滐紝鍚屾涓婁紶鍒?R2 骞惰繑鍥炴案涔呴摼鎺?  if (
    result?.data?.status === 'SUCCESS' &&
    result.data.results &&
    result.data.results.length > 0
  ) {
    const originalResults = [...result.data.results];
    const r2Results: string[] = [];

    try {
      const { getStorageServiceWithConfigs } = await import(
        '@/shared/services/storage'
      );
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log(
          `[KIE] 寮€濮嬪悓姝ヤ繚瀛?${originalResults.length} 寮犲浘鐗囧埌 R2`
        );
        const storageService = getStorageServiceWithConfigs(configs);

        for (let index = 0; index < originalResults.length; index++) {
          const imageUrl = originalResults[index];
          try {
            const timestamp = Date.now();
            const randomId = nanoid(8);
            const fileExtension =
              imageUrl.includes('.jpg') || imageUrl.includes('.jpeg')
                ? 'jpg'
                : 'png';
            const fileName = `${timestamp}_${randomId}_${index}.${fileExtension}`;
            const storageKey = `slides/${user.id}/${fileName}`;

            const uploadResult = await storageService.downloadAndUpload({
              url: imageUrl,
              key: storageKey,
              contentType: `image/${fileExtension}`,
              disposition: 'inline',
            });

            if (uploadResult.success && uploadResult.url) {
              r2Results.push(uploadResult.url);
              console.log(`[KIE] 鉁?鍥剧墖 ${index + 1} 宸蹭繚瀛樺埌 R2`);
            } else {
              r2Results.push(imageUrl); // 澶辫触鏃朵娇鐢ㄥ師濮嬮摼鎺?              console.warn(`[KIE] 鈿狅笍 鍥剧墖 ${index + 1} R2 涓婁紶澶辫触锛屼娇鐢ㄤ复鏃堕摼鎺);
            }
          } catch (e) {
            r2Results.push(imageUrl); // 寮傚父鏃朵娇鐢ㄥ師濮嬮摼鎺?            console.error(`[KIE] 淇濆瓨绗?${index + 1} 寮犲け璐, e);
          }
        }
        console.log(`[KIE] 鉁?鍥剧墖淇濆瓨瀹屾垚`);
      } else {
        // 娌℃湁 R2 閰嶇疆锛屼娇鐢ㄥ師濮嬮摼鎺?        r2Results.push(...originalResults);
      }
    } catch (error) {
      console.error('[KIE] R2 淇濆瓨寮傚父锛屼娇鐢ㄤ复鏃堕摼鎺?, error);
      r2Results.push(...originalResults);
    }

    // 杩斿洖 R2 姘镐箙閾炬帴
    return {
      data: {
        status: 'SUCCESS',
        results: r2Results,
      },
    };
  }

  return result;
}

/**
 * 鐪熸鐨?Inpainting 灞€閮ㄧ紪杈?- 浣跨敤 APIYI (Gemini 3 Pro Image)
 *
 * 鏍稿績浼樺娍锛? * - 浣跨敤 APIYI 鐨?gemini-3-pro-image-preview 妯″瀷
 * - 閫氳繃鍘熷浘 + mask 鍥剧墖绮剧‘鎸囧畾闇€瑕佷慨鏀圭殑鍖哄煙锛堢櫧鑹?淇敼锛岄粦鑹?淇濇寔锛? * - 闈炵紪杈戝尯鍩熷儚绱犵骇淇濇寔涓嶅彉锛屼笉浼氬嚭鐜版ā绯婃垨鍙樺舰
 *
 * 宸ヤ綔娴佺▼锛? * 1. 鍓嶇鏍规嵁鐢ㄦ埛妗嗛€夊尯鍩熺敓鎴?mask 鍥剧墖锛堢櫧鑹茬煩褰?閫変腑鍖哄煙锛? * 2. 鍓嶇灏?mask 涓婁紶鍒?R2 鑾峰彇 URL
 * 3. 璋冪敤姝ゅ嚱鏁帮紝浼犲叆鍘熷浘 URL + mask URL + 淇敼鎻忚堪
 * 4. Gemini 妯″瀷鏍规嵁 mask 鍙噸鏂扮敓鎴愮櫧鑹插尯鍩燂紝鍏朵粬鍖哄煙瀹屽叏淇濇寔鍘熸牱
 *
 * @param params 缂栬緫鍙傛暟
 * @returns 缂栬緫鍚庣殑鍥剧墖 URL
 */
export async function editImageWithInpaintingAction(params: {
  /** 寰呯紪杈戠殑鍘熷浘 URL */
  imageUrl: string;
  /** mask 鍥剧墖 URL锛堢櫧鑹?闇€瑕佷慨鏀圭殑鍖哄煙锛岄粦鑹?淇濇寔涓嶅彉锛?*/
  maskUrl: string;
  /** 淇敼鎻忚堪锛堟弿杩拌鍦ㄩ€変腑鍖哄煙鐢熸垚浠€涔堝唴瀹癸級 */
  prompt: string;
  /** 鍒嗚鲸鐜?*/
  resolution?: string;
  /** 瀹介珮姣?*/
  aspectRatio?: string;
}) {
  'use server';

  if (!APIYI_API_KEY) {
    throw new Error('APIYI API Key 鏈厤缃?);
  }

  console.log('\n========== Inpainting 灞€閮ㄧ紪杈?(APIYI Gemini) ==========');
  console.log('[Inpaint] 鍘熷浘:', params.imageUrl);
  console.log('[Inpaint] Mask:', params.maskUrl);
  console.log('[Inpaint] 鎻愮ず璇?', params.prompt);

  try {
    // 澶勭悊鍥剧墖 URL锛岀‘淇濆叕缃戝彲璁块棶
    const imageUrl = resolveImageUrl(params.imageUrl);
    const maskUrl = resolveImageUrl(params.maskUrl);

    console.log('[Inpaint] 澶勭悊鍚庣殑鍘熷浘 URL:', imageUrl);
    console.log('[Inpaint] 澶勭悊鍚庣殑 Mask URL:', maskUrl);

    // 馃幆 涓嬭浇鍘熷浘鍜?mask 鍥剧墖杞负 base64锛圙emini 鍘熺敓鏍煎紡闇€瑕侊級
    console.log('[Inpaint] 寮€濮嬩笅杞藉師鍥惧拰 mask...');
    const [originalImageData, maskImageData] = await Promise.all([
      downloadImageAsBase64ForApiyi(imageUrl),
      downloadImageAsBase64ForApiyi(maskUrl),
    ]);

    if (!originalImageData) {
      throw new Error('鏃犳硶涓嬭浇鍘熷浘');
    }
    if (!maskImageData) {
      throw new Error('鏃犳硶涓嬭浇 mask 鍥剧墖');
    }

    console.log(`[Inpaint] 鍘熷浘澶у皬: ${(originalImageData.base64.length / 1024).toFixed(1)} KB`);
    console.log(`[Inpaint] Mask澶у皬: ${(maskImageData.base64.length / 1024).toFixed(1)} KB`);

    // 馃幆 鏋勫缓 Gemini 鍘熺敓鏍煎紡鐨?inpainting 璇锋眰
    // 鎻愮ず璇嶉渶瑕佹槑纭鏄庤繖鏄眬閮ㄧ紪杈戜换鍔?    const inpaintPrompt = `銆愬浘鐗囧眬閮ㄧ紪杈戜换鍔°€?
浣犻渶瑕佸杩欏紶鍥剧墖杩涜绮剧‘鐨勫眬閮ㄤ慨鏀广€?
銆愰噸瑕佽鍒欍€?1. 鎴戞彁渚涗簡涓ゅ紶鍥剧墖锛氱涓€寮犳槸鍘熷浘锛岀浜屽紶鏄?mask锛堥伄缃╋級
2. mask 涓櫧鑹插尯鍩熸槸闇€瑕佷慨鏀圭殑閮ㄥ垎锛岄粦鑹插尯鍩熷繀椤讳繚鎸佸畬鍏ㄤ笉鍙?3. 鍙慨鏀圭櫧鑹插尯鍩熺殑鍐呭锛屽叾浠栨墍鏈夊尯鍩熷繀椤诲儚绱犵骇淇濇寔鍘熸牱
4. 淇敼鍚庣殑鍐呭瑕佷笌鍛ㄥ洿鐜鑷劧铻嶅悎

銆愪慨鏀硅姹傘€?${params.prompt}

銆愭墽琛岃姹傘€?- 涓ユ牸鎸夌収 mask 鐧借壊鍖哄煙淇敼锛屼笉瑕佽秴鍑鸿寖鍥?- 榛戣壊鍖哄煙鐨勪换浣曞厓绱狅紙鏂囧瓧銆佸浘褰€佽儗鏅級閮戒笉鑳芥敼鍙?- 杈撳嚭瀹屾暣鐨勪慨鏀瑰悗鍥剧墖`;

    // 鏋勫缓璇锋眰浣擄紙Gemini 鍘熺敓鏍煎紡锛?    const parts: any[] = [
      { text: inpaintPrompt },
      // 鍘熷浘
      {
        inline_data: {
          mime_type: originalImageData.mimeType,
          data: originalImageData.base64,
        },
      },
      // Mask 鍥剧墖
      {
        inline_data: {
          mime_type: maskImageData.mimeType,
          data: maskImageData.base64,
        },
      },
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: params.aspectRatio || '16:9',
          imageSize: params.resolution || '2K',
        },
      },
    };

    console.log('[Inpaint] APIYI 璇锋眰鍙傛暟:', {
      model: 'gemini-3-pro-image-preview',
      promptLength: inpaintPrompt.length,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
      partsCount: parts.length,
    });

    // 鍙戦€佽姹?    const startTime = Date.now();
    const timeout = 300000; // 5 鍒嗛挓瓒呮椂

    console.log('[Inpaint] 寮€濮嬭皟鐢?APIYI API...');
    const response = await fetch(APIYI_TEXT2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[Inpaint] APIYI 璇锋眰鑰楁椂: ${elapsed.toFixed(1)} 绉抈);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Inpaint] APIYI 璇锋眰澶辫触:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 瑙ｆ瀽 Gemini 鍘熺敓鏍煎紡鐨勫搷搴?    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[Inpaint] 鍐呭琚嫆缁?', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[Inpaint] 鍝嶅簲鏍煎紡寮傚父:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`[Inpaint] 鉁?APIYI 鐢熸垚鎴愬姛锛佸浘鐗囧ぇ灏? ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 馃幆 灏嗙紪杈戝悗鐨勫浘鐗囦笂浼犲埌 R2锛岃繑鍥炴案涔呴摼鎺?    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Inpaint] 寮€濮嬩笂浼犲浘鐗囧埌 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `infographic-edits/${user.id}/${fileName}`;

        // 灏?base64 杞崲涓?Buffer 骞朵笂浼?        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[Inpaint] 鉁?鍥剧墖宸蹭繚瀛樺埌 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Inpaint] 鈿狅笍 R2 涓婁紶澶辫触锛屼娇鐢?data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        console.warn('[Inpaint] 鈿狅笍 R2 鏈厤缃紝浣跨敤 data URL');
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      console.error('[Inpaint] 鈿狅笍 R2 涓婁紶寮傚父:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    return {
      imageUrl: finalImageUrl,
      success: true,
      provider: 'APIYI-Gemini' as const,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error('[Inpaint] 鉂?APIYI 璇锋眰瓒呮椂');
      throw new Error('APIYI request timeout');
    }
    console.error('[Inpaint] 鉂?editImageWithInpaintingAction 閿欒:', error.message);
    throw error;
  }
}

/**
 * 灞€閮ㄧ紪杈?- 鏁村浘閲嶇敓鎴愭柟妗? *
 * 宸ヤ綔娴佺▼锛? * 1. 灏嗗師鍥惧拰鍧愭爣淇℃伅涓€璧峰彂缁?AI
 * 2. AI 鏍规嵁鍧愭爣鎻愮ず璇嶄慨鏀规寚瀹氬尯鍩? * 3. 杩斿洖瀹屾暣鐨勪慨鏀瑰悗鍥剧墖
 *
 * 娉ㄦ剰锛氭鏂规鍙兘瀵艰嚧闈炵紪杈戝尯鍩熸湁缁嗗井鍙樺寲锛屼絾涓嶄細鏈夋嫾鎺ユ劅
 *
 * @param params 缂栬緫鍙傛暟
 * @returns 缂栬緫鍚庣殑鍥剧墖 URL
 */
export async function editImageRegionAction(params: {
  /** 寰呯紪杈戠殑鍘熷浘 URL */
  imageUrl: string;
  /** 閫夊尯鍒楄〃锛堟敮鎸佸閫夋锛?*/
  regions: Array<{
    /** 閫夊尯鏍囩锛堝 A, B, C锛?*/
    label: string;
    /** 褰掍竴鍖栧潗鏍?0-1 */
    x: number;
    y: number;
    width: number;
    height: number;
    /** 璇ラ€夊尯鐨勪慨鏀规弿杩?*/
    note: string;
  }>;
  /** 鍥剧墖瀹藉害锛堝儚绱狅級 */
  imageWidth: number;
  /** 鍥剧墖楂樺害锛堝儚绱狅級 */
  imageHeight: number;
  /** 鍒嗚鲸鐜?*/
  resolution?: string;
  /** 馃幆 瀹介珮姣旓紙蹇呴』浼犻€掞紝纭繚缂栬緫鍚庝繚鎸佸師姣斾緥锛?*/
  aspectRatio: string;
}) {
  'use server';

  if (!APIYI_API_KEY) {
    throw new Error('APIYI API Key 鏈厤缃?);
  }

  console.log('\n========== 灞€閮ㄧ紪杈?(APIYI Gemini) ==========');
  console.log('[Edit] 鍘熷浘:', params.imageUrl);
  console.log('[Edit] 閫夊尯鏁伴噺:', params.regions.length);
  console.log('[Edit] 鍥剧墖灏哄:', params.imageWidth, 'x', params.imageHeight);
  console.log('[Edit] 瀹介珮姣?', params.aspectRatio);

  try {
    // 馃幆 鏋勫缓鍧愭爣淇℃伅鎻愮ず璇?    const regionPrompts = params.regions.map((region) => {
      const pixelX = Math.round(region.x * params.imageWidth);
      const pixelY = Math.round(region.y * params.imageHeight);
      const pixelWidth = Math.round(region.width * params.imageWidth);
      const pixelHeight = Math.round(region.height * params.imageHeight);
      const pixelX2 = pixelX + pixelWidth;
      const pixelY2 = pixelY + pixelHeight;

      const percentX = Math.round(region.x * 100);
      const percentY = Math.round(region.y * 100);
      const percentWidth = Math.round(region.width * 100);
      const percentHeight = Math.round(region.height * 100);

      return `銆愬尯鍩?${region.label}銆?浣嶇疆锛氫粠宸︿笂瑙?(${percentX}%, ${percentY}%) 鍒?(${percentX + percentWidth}%, ${percentY + percentHeight}%)
鍍忕礌鍧愭爣锛氬乏涓?(${pixelX}, ${pixelY}) 鍙充笅 (${pixelX2}, ${pixelY2})
灏哄锛?{pixelWidth}脳${pixelHeight} 鍍忕礌
淇敼瑕佹眰锛?{region.note || '淇濇寔涓嶅彉'}`;
    }).join('\n\n');

    const finalPrompt = `銆愬浘鐗囧眬閮ㄧ紪杈戜换鍔°€?
浣犻渶瑕佸杩欏紶鍥剧墖杩涜绮剧‘鐨勫眬閮ㄤ慨鏀广€?
銆愰噸瑕佽鍒欍€?1. 鍙慨鏀逛笅闈㈡寚瀹氱殑鍖哄煙锛屽叾浠栨墍鏈夊尯鍩熷繀椤讳繚鎸佸畬鍏ㄤ笉鍙?2. 淇濇寔鍥剧墖鐨勬暣浣撻鏍笺€侀厤鑹层€佽川鎰熶竴鑷?3. 淇敼鍚庣殑鍐呭瑕佷笌鍛ㄥ洿鐜鑷劧铻嶅悎

銆愰渶瑕佷慨鏀圭殑鍖哄煙銆?${regionPrompts}

銆愭墽琛岃姹傘€?- 涓ユ牸鎸夌収鍧愭爣鑼冨洿淇敼锛屼笉瑕佽秴鍑烘寚瀹氬尯鍩?- 鍖哄煙澶栫殑浠讳綍鍏冪礌锛堟枃瀛椼€佸浘褰€佽儗鏅級閮戒笉鑳芥敼鍙?- 杈撳嚭瀹屾暣鐨勪慨鏀瑰悗鍥剧墖`;

    console.log('[Edit] 鏈€缁堟彁绀鸿瘝:\n', finalPrompt);

    // 馃幆 澶勭悊鍥剧墖 URL 骞朵笅杞戒负 base64
    const imageUrl = resolveImageUrl(params.imageUrl);
    console.log('[Edit] 澶勭悊鍚庣殑鍥剧墖 URL:', imageUrl);

    console.log('[Edit] 寮€濮嬩笅杞藉師鍥?..');
    const imageData = await downloadImageAsBase64ForApiyi(imageUrl);
    if (!imageData) {
      throw new Error('鏃犳硶涓嬭浇鍘熷浘');
    }
    console.log(`[Edit] 鍘熷浘澶у皬: ${(imageData.base64.length / 1024).toFixed(1)} KB`);

    // 馃幆 鏋勫缓 Gemini 鍘熺敓鏍煎紡璇锋眰
    const parts: any[] = [
      { text: finalPrompt },
      {
        inline_data: {
          mime_type: imageData.mimeType,
          data: imageData.base64,
        },
      },
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: params.aspectRatio || '16:9',
          imageSize: params.resolution || '2K',
        },
      },
    };

    console.log('[Edit] APIYI 璇锋眰鍙傛暟:', {
      model: 'gemini-3-pro-image-preview',
      promptLength: finalPrompt.length,
      aspectRatio: params.aspectRatio,
      resolution: params.resolution,
    });

    const startTime = Date.now();
    const timeout = 300000;

    console.log('[Edit] 寮€濮嬭皟鐢?APIYI API...');
    const response = await fetch(APIYI_TEXT2IMG_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${APIYI_API_KEY}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });

    const elapsed = (Date.now() - startTime) / 1000;
    console.log(`[Edit] APIYI 璇锋眰鑰楁椂: ${elapsed.toFixed(1)} 绉抈);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Edit] APIYI 璇锋眰澶辫触:', response.status, errorText);
      throw new Error(`APIYI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const finishReason = data.candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.error('[Edit] 鍐呭琚嫆缁?', finishReason);
        throw new Error(`Content rejected: ${finishReason}`);
      }
      console.error('[Edit] 鍝嶅簲鏍煎紡寮傚父:', JSON.stringify(data).substring(0, 500));
      throw new Error('Invalid response format from APIYI');
    }

    const base64Data = data.candidates[0].content.parts[0].inlineData.data;
    const mimeType = data.candidates[0].content.parts[0].inlineData.mimeType || 'image/png';

    console.log(`[Edit] 鉁?APIYI 鐢熸垚鎴愬姛锛佸浘鐗囧ぇ灏? ${(base64Data.length / 1024).toFixed(1)} KB`);

    // 馃幆 灏嗙紪杈戝悗鐨勫浘鐗囦笂浼犲埌 R2
    let finalImageUrl: string;

    try {
      const { getStorageServiceWithConfigs } = await import('@/shared/services/storage');
      const { getAllConfigs } = await import('@/shared/models/config');
      const { getUserInfo } = await import('@/shared/models/user');
      const { nanoid } = await import('nanoid');

      const user = await getUserInfo();
      const configs = await getAllConfigs();

      if (user && configs.r2_bucket_name && configs.r2_access_key) {
        console.log('[Edit] 寮€濮嬩笂浼犲浘鐗囧埌 R2...');
        const storageService = getStorageServiceWithConfigs(configs);
        const timestamp = Date.now();
        const randomId = nanoid(8);
        const fileExtension = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
        const fileName = `${timestamp}_${randomId}.${fileExtension}`;
        const storageKey = `infographic-edits/${user.id}/${fileName}`;

        const buffer = Buffer.from(base64Data, 'base64');
        const uploadResult = await storageService.uploadFile({
          body: buffer,
          key: storageKey,
          contentType: mimeType,
          disposition: 'inline',
        });

        if (uploadResult.success && uploadResult.url) {
          finalImageUrl = uploadResult.url;
          console.log(`[Edit] 鉁?鍥剧墖宸蹭繚瀛樺埌 R2: ${finalImageUrl.substring(0, 60)}...`);
        } else {
          console.warn('[Edit] 鈿狅笍 R2 涓婁紶澶辫触锛屼娇鐢?data URL');
          finalImageUrl = `data:${mimeType};base64,${base64Data}`;
        }
      } else {
        console.warn('[Edit] 鈿狅笍 R2 鏈厤缃紝浣跨敤 data URL');
        finalImageUrl = `data:${mimeType};base64,${base64Data}`;
      }
    } catch (uploadError: any) {
      console.error('[Edit] 鈿狅笍 R2 涓婁紶寮傚父:', uploadError.message);
      finalImageUrl = `data:${mimeType};base64,${base64Data}`;
    }

    return {
      imageUrl: finalImageUrl,
      success: true,
      provider: 'APIYI-Gemini' as const,
    };
  } catch (error: any) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      console.error('[Edit] 鉂?APIYI 璇锋眰瓒呮椂');
      throw new Error('APIYI request timeout');
    }
    console.error('[Edit] 鉂?editImageRegionAction 閿欒:', error.message);
    throw error;
  }
}
