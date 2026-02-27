import { NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { getApplicationByUserId } from '@/shared/models/affiliate-application';

/**
 * 获取当前用户的分销员申请状态
 * GET /api/affiliate/application-status
 */
export async function GET() {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const application = await getApplicationByUserId(user.id);

    return NextResponse.json({
      success: true,
      data: {
        hasApplication: !!application,
        application: application || null,
      },
    });
  } catch (error: any) {
    console.error('Failed to get application status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
