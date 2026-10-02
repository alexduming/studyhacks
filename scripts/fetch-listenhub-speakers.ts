import path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });

const API_KEY = process.env.LISTENHUB_API_KEY;
const BASE_URL = process.env.LISTENHUB_BASE_URL || 'https://api.marswave.ai';

if (!API_KEY) {
  console.error('❌ 请先在 .env.local 中配置 LISTENHUB_API_KEY');
  process.exit(1);
}

async function fetchSpeakers(language: string) {
  try {
    const url = `${BASE_URL}/openapi/v1/speakers/list?language=${language}`;
    console.log(`\n🔍 正在获取 ${language} 音色列表: ${url}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    if (data.code === 0) {
      console.log(`✅ 获取成功！共找到 ${data.data.length} 个音色：`);
      console.log(JSON.stringify(data.data, null, 2));
    } else {
      console.error('❌ API Error:', data.message);
    }
  } catch (error) {
    console.error('❌ 请求失败:', error);
  }
}

async function main() {
  await fetchSpeakers('zh');
  await fetchSpeakers('en');
  await fetchSpeakers('ja');
}

main();
