import { NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import {
  createApplication,
  getApplicationByUserId,
  ApplicationStatus,
} from '@/shared/models/affiliate-application';

/**
 * 提交分销员申请
 * POST /api/affiliate/apply
 */
export async function POST(request: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 检查是否已有申请
    const existingApplication = await getApplicationByUserId(user.id);
    if (existingApplication) {
      // 如果已批准，不能重复申请
      if (existingApplication.status === ApplicationStatus.APPROVED) {
        return NextResponse.json(
          { success: false, error: '您已是分销员' },
          { status: 400 }
        );
      }
      // 如果待审核，不能重复申请
      if (existingApplication.status === ApplicationStatus.PENDING) {
        return NextResponse.json(
          { success: false, error: '您已有待审核的申请' },
          { status: 400 }
        );
      }
      // 如果被拒绝，可以重新申请（继续执行）
    }

    const body = await request.json();
    const { reason, socialMedia } = body;

    const application = await createApplication({
      userId: user.id,
      reason,
      socialMedia,
    });

    return NextResponse.json({
      success: true,
      data: application,
    });
  } catch (error: any) {
    console.error('Failed to create application:', error);
    // 返回更详细的错误信息
    const errorMessage = error?.message || error?.toString() || '申请提交失败，请稍后重试';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
