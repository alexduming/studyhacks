import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import {
  getPendingApplications,
  updateApplicationStatus,
  ApplicationStatus,
} from '@/shared/models/affiliate-application';

/**
 * 管理后台：获取分销员申请列表
 * GET /api/admin/affiliate-applications
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员权限检查

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const status = searchParams.get('status') || undefined;

    const result = await getPendingApplications({ page, limit, status });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('Failed to get applications:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * 管理后台：审批分销员申请
 * POST /api/admin/affiliate-applications
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getUserInfo();
    if (!currentUser) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: 添加管理员权限检查

    const body = await request.json();
    const { id, action, adminNote } = body;

    if (!id || !action) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { success: false, error: '无效的操作' },
        { status: 400 }
      );
    }

    const status =
      action === 'approve'
        ? ApplicationStatus.APPROVED
        : ApplicationStatus.REJECTED;

    const application = await updateApplicationStatus(id, status, adminNote);

    return NextResponse.json({
      success: true,
      data: application,
    });
  } catch (error: any) {
    console.error('Failed to update application:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
