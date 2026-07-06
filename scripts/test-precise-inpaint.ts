import 'dotenv/config';
import fs from 'fs';
import path from 'path';

/**
 * 🎯 测试脚本：对比三种 Inpainting 模型的效果
 * 
 * 使用方法: npx ts-node scripts/test-precise-inpaint.ts <IMAGE_URL_OR_LOCAL_PATH> [model]
 * 
 * model 选项:
 *   - all (默认): 测试所有模型
 *   - lama: 只测试 LaMa-Fast
 *   - florence: 只测试 Florence-2 + SAM2
 *   - flux: 只测试 FLUX Inpainting
 *   - original: 只测试原有的 clean-background (SDXL)
 */

const input = process.argv[2];
const modelChoice = process.argv[3] || 'all';

// 🎯 自动检测服务器端口（从环境变量或默认值）
const PORT = process.env.PORT || '3000'; // 默认 3002，因为 3000 通常被占用
const BASE_URL = `http://localhost:${PORT}`;

const MODELS = [
  { name: 'LaMa (FAL AI) - 🚀 推荐', endpoint: '/api/image/inpaint-fal-lama', key: 'fal-lama' },
  { name: 'LaMa (Replicate) - 🐢 慢', endpoint: '/api/image/inpaint-lama-fast', key: 'lama' },
  { name: 'Object Removal (FAL)', endpoint: '/api/image/inpaint-florence-sam', key: 'florence' },
  { name: 'FLUX Fill (FAL) - 💰 贵', endpoint: '/api/image/inpaint-flux', key: 'flux' },
];

async function runTest() {
  if (!input) {
    console.log('❌ 请提供图片 URL 或本地路径');
    console.log('用法: npx ts-node scripts/test-precise-inpaint.ts "path/to/image.png" [model]');
    console.log('\nmodel 选项: all (默认) | lama | florence | flux | original');
    return;
  }

  console.log('🚀 开始精确移除对比测试...');
  console.log(`📋 测试模式: ${modelChoice === 'all' ? '全部模型' : modelChoice.toUpperCase()}`);
  console.log(`🌐 服务器地址: ${BASE_URL}`);
  
  let imageData: string;
  let isLocal = false;

  // 处理本地路径
  if (fs.existsSync(input)) {
    console.log('📂 检测到本地文件:', input);
    const buffer = fs.readFileSync(input);
    const ext = path.extname(input).toLowerCase().replace('.', '');
    imageData = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buffer.toString('base64')}`;
    isLocal = true;
  } else {
    console.log('🌐 检测到远程 URL:', input);
    imageData = input;
  }

  try {
    // ===== Step 1: OCR 识别 =====
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📝 Step 1: OCR 文字识别...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    const ocrResponse = await fetch(`${BASE_URL}/api/ai/ocr-tencent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isLocal ? { imageBase64: imageData } : { imageUrl: imageData })
    });

    const ocrData: any = await ocrResponse.json();
    if (!ocrData.success) {
      throw new Error('OCR 识别失败: ' + ocrData.error);
    }

    console.log(`✅ 识别完成，共发现 ${ocrData.blocks?.length} 个文本块`);
    console.log(`📏 图片尺寸: ${ocrData.imageSize.width}x${ocrData.imageSize.height}`);

    // ===== Step 2: 测试模型 =====
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 Step 2: 测试模型效果...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 筛选要测试的模型
    const modelsToTest = MODELS.filter(
      m => modelChoice === 'all' || m.key === modelChoice
    );

    if (modelsToTest.length === 0) {
      console.error('❌ 无效的模型选项:', modelChoice);
      return;
    }

    const results = [];

    for (const model of modelsToTest) {
      console.log(`\n🔄 正在测试: ${model.name}`);
      console.log('─────────────────────────────────────────');
      
      const modelStartTime = Date.now();
      
      try {
        const cleanResponse = await fetch(`${BASE_URL}${model.endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: isLocal ? imageData : input,
            textBoxes: ocrData.blocks.map((b: any) => b.bbox),
            imageSize: ocrData.imageSize || { width: 1920, height: 1080 }
          })
        });

        const cleanData: any = await cleanResponse.json();
        const duration = Date.now() - modelStartTime;

        if (!cleanData.success) {
          console.log(`❌ 失败: ${cleanData.error}`);
          results.push({
            model: model.name,
            success: false,
            error: cleanData.error,
            duration,
          });
        } else {
          console.log(`✅ 成功！耗时: ${(duration / 1000).toFixed(1)}s`);
          console.log(`🔗 结果 URL: ${cleanData.imageUrl}`);
          results.push({
            model: model.name,
            success: true,
            url: cleanData.imageUrl,
            duration,
          });
        }
      } catch (error) {
        const duration = Date.now() - modelStartTime;
        console.log(`❌ 错误: ${error}`);
        results.push({
          model: model.name,
          success: false,
          error: String(error),
          duration,
        });
      }
    }

    // ===== Step 3: 输出对比结果 =====
    console.log('\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 测试结果对比');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    if (isLocal) {
      console.log('📷 输入图: [本地文件]');
    } else {
      console.log('📷 原图 URL:', input);
    }
    console.log('');

    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.model}`);
      console.log(`   状态: ${result.success ? '✅ 成功' : '❌ 失败'}`);
      console.log(`   耗时: ${(result.duration / 1000).toFixed(2)}s`);
      if (result.success) {
        console.log(`   结果: ${result.url}`);
      } else {
        console.log(`   错误: ${result.error}`);
      }
      console.log('');
    });

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💡 请在浏览器中打开以上 URL 对比效果！');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  } catch (error) {
    console.error('\n❌ 测试出错:', error);
  }
}

runTest();
