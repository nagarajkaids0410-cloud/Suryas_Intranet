import { NextRequest, NextResponse } from 'next/server';
import { 
  getNotificationsByTargetDB, 
  markAsReadDB, 
  markAllAsReadDB,
  addNotificationDB,
  readNotificationsDB 
} from '@/lib/notification-db';
import { requireRole } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  try {
    const auth = requireRole(request, [
      'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
    ]);
    if (auth instanceof NextResponse) return auth;
    const targetUsers = auth.role === 'admin' || auth.role === 'founder'
      ? [auth.username, auth.role]
      : [auth.username];
    const notifications = getNotificationsByTargetDB(targetUsers);

    return NextResponse.json({ 
      success: true,
      notifications 
    });
  } catch (error) {
    console.error('Notification fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications', details: String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireRole(request, ['admin', 'founder']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { type, title, message, targetUser, relatedId } = body;

    if (!type || !title) {
      return NextResponse.json(
        { error: 'Type and title are required' },
        { status: 400 }
      );
    }

    const notification = addNotificationDB({
      type,
      title,
      message: message || '',
      targetUser: targetUser || 'all',
      relatedId,
      read: false,
    });

    console.log('[NOTIFICATION] Created:', notification.type, 'for', notification.targetUser);

    return NextResponse.json({ 
      success: true, 
      notification 
    });
  } catch (error) {
    console.error('Notification create error:', error);
    return NextResponse.json(
      { error: 'Failed to create notification', details: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireRole(request, [
      'founder', 'managing-partner', 'admin', 'employee', 'freelancer', 'senior-freelancer', 'intern', 'project-intern', 'user',
    ]);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { notificationId, markAllAsRead } = body;
    const targetUsers = auth.role === 'admin' || auth.role === 'founder'
      ? [auth.username, auth.role]
      : [auth.username];

    if (markAllAsRead) {
      markAllAsReadDB(targetUsers);
      return NextResponse.json({ success: true, message: 'All notifications marked as read' });
    }

    if (notificationId) {
      const notification = readNotificationsDB().find((item) => item.id === notificationId);
      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }
      if (notification.targetUser !== 'all' && !targetUsers.includes(notification.targetUser)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const success = markAsReadDB(notificationId);
      if (!success) {
        return NextResponse.json(
          { error: 'Notification not found' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    return NextResponse.json(
      { error: 'Either notificationId or markAllAsRead is required' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Notification update error:', error);
    return NextResponse.json(
      { error: 'Failed to update notification', details: String(error) },
      { status: 500 }
    );
  }
}
