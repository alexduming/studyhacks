import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const KIE_BASE_URL = 'https://api.kie.ai/api/v1';
// 只从环境变量读取密钥，绝不在代码中硬编码真实 key
const KIE_API_KEY = process.env.KIE_NANO_BANANA_PRO_KEY || '';

/**
 * 查询 nano-banana-pro 任务状态，并尝试解析出 resultUrls
 *
 * 说明：
 * - 这里假设 Kie 的 Query Task API 路径为 /jobs/queryTask?taskId=...
 * - 回调示例中的 resultJson 字段会包含我们需要的 resultUrls 数组
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const taskId = searchParams.get('taskId');

    if (!taskId) {
      return NextResponse.json(
        { success: false, error: '缺少 taskId 参数' },
        { status: 400 }
      );
    }

    if (!KIE_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error:
            '服务器未配置 Kie API 密钥，请在环境变量 KIE_NANO_BANANA_PRO_KEY 中设置',
        },
        { status: 500 }
      );
    }

    // 查询 nano-banana-pro 任务状态
    // 根据 Kie 官方文档，使用 /jobs/recordInfo 端点（注意是 recordInfo 不是 record-info）
    // 文档: https://api.kie.ai/api/v1/jobs/recordInfo?taskId=...
    const resp = await fetch(
      `${KIE_BASE_URL}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${KIE_API_KEY}`,
        },
      }
    );

    if (!resp.ok) {
      const text = await resp.text();
      // 打印出 Kie 返回的原始内容，便于在服务端控制台排查问题
      console.error('❌ Kie recordInfo 请求失败:');
      console.error('  - 状态码:', resp.status, resp.statusText);
      console.error('  - taskId:', taskId);
      console.error('  - 响应内容:', text);
      console.error('  - API URL:', `${KIE_BASE_URL}/jobs/recordInfo`);
      console.error('  - 请检查: 1) API Key 是否正确 2) taskId 是否有效');

      return NextResponse.json(
        {
          success: false,
          error: `查询任务失败：HTTP ${resp.status} ${text || resp.statusText}`,
          details: {
            status: resp.status,
            statusText: resp.statusText,
            response: text,
          },
        },
        { status: resp.status }
      );
    }

    const data = await resp.json();

    // 记录成功的响应便于调试
    console.log('✅ Kie recordInfo 响应:', JSON.stringify(data, null, 2));

    if (data.code !== 200) {
      console.error('❌ Kie recordInfo 返回错误代码:');
      console.error('  - code:', data.code);
      console.error('  - message:', data.msg || data.message);
      console.error('  - 完整响应:', JSON.stringify(data, null, 2));

      return NextResponse.json(
        {
          success: false,
          error: data.msg || data.message || '查询任务失败：未知错误',
          raw: data,
        },
        { status: 500 }
      );
    }

    // 如果 data 为 null，说明任务还在处理中或刚创建
    if (!data.data) {
      console.log('⏳ 任务数据为 null，可能还在处理中');
      return NextResponse.json({
        success: true,
        state: 'pending', // 返回 pending 状态让前端继续轮询
        resultUrls: [],
        raw: data,
      });
    }

    const state: string = data.data.state || data.data.status || '';

    let resultUrls: string[] = [];
    if (data.data.resultJson) {
      try {
        const parsed = JSON.parse(data.data.resultJson);
        if (Array.isArray(parsed.resultUrls)) {
          resultUrls = parsed.resultUrls;
        }
      } catch {
        // ignore JSON parse error, resultUrls 维持为空
      }
    }

    return NextResponse.json({
      success: true,
      state,
      resultUrls,
      raw: data,
    });
  } catch (error) {
    console.error('Infographic query error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          process.env.NODE_ENV === 'development'
            ? (error as Error).message
            : '查询信息图任务状态时出现错误，请稍后重试。',
      },
      { status: 500 }
    );
  }
}
