import { NextRequest, NextResponse } from 'next/server';

import { getUserInfo } from '@/shared/models/user';
import { getInvitations } from '@/shared/models/invitation';

export async function GET(request: NextRequest) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Get invitations with user details
    const invitations = await getInvitations({
      inviterId: user.id,
      getUser: true, // Need user details (name, email)
      page,
      limit,
    });

    return NextResponse.json({
      success: true,
      data: {
        invitations,
        page,
        limit,
      },
    });
  } catch (error: any) {
    console.error('Failed to get invitations:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}





