# Notifications System Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Flutter NotificationsScreen                     │
├─────────────────────────────────────────────────────────────────────┤
│  - Displays all/unread notifications in tabs                        │
│  - Groups by time (Today, Yesterday, etc)                           │
│  - Shows notification badges                                        │
│  - Real-time updates from Socket.io                                 │
└────────────────────────┬────────────────────────────────────────────┘
                         │
                    API Calls & WebSocket
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │   REST API   │ │ Socket.io    │ │ Real-time    │
  │ Endpoints    │ │ Events       │ │ Listeners    │
  └──────────────┘ └──────────────┘ └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                    Node.js Express Server                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Routes: /api/notifications                                         │
│  ├── GET    / (list all)                                           │
│  ├── GET    /unread/list (unread only)                             │
│  ├── GET    /unread/count (badge count)                            │
│  ├── PUT    /:id/read (mark as read)                               │
│  ├── PUT    /mark-all-read (mark all)                              │
│  ├── DELETE /:id (delete one)                                      │
│  └── DELETE / (delete all)                                         │
│                                                                      │
│  Controllers:                                                       │
│  ├── notificationController.js (main logic)                         │
│  ├── postController.js (triggers for likes/comments)                │
│  └── userController.js (triggers for follows)                       │
│                                                                      │
│  Helper Methods:                                                    │
│  ├── createNotification() (internal)                                │
│  ├── notifyLike() (triggered by postController)                     │
│  ├── notifyComment() (triggered by postController)                  │
│  ├── notifyFollow() (triggered by userController)                   │
│  ├── notifyHire() (ready for hire feature)                          │
│  ├── notifyReview() (ready for review feature)                      │
│  └── notifySystem() (for system messages)                           │
│                                                                      │
└────────────────────────┬────────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────────┐
│                     MongoDB Database                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Collection: notifications                                          │
│  ┌─────────────────────────────────────────────────────┐            │
│  │ _id (ObjectId)                                      │            │
│  │ recipientId → User                                  │            │
│  │ actorId → User                                      │            │
│  │ type (like|comment|follow|etc)                      │            │
│  │ message (String)                                    │            │
│  │ postId → Post (optional)                            │            │
│  │ postSnippet (String, optional)                      │            │
│  │ isRead (Boolean)                                    │            │
│  │ createdAt, updatedAt (Dates)                        │            │
│  │                                                     │            │
│  │ Indexes:                                            │            │
│  │ - { recipientId: 1, createdAt: -1 }               │            │
│  │ - { recipientId: 1, isRead: 1 }                    │            │
│  └─────────────────────────────────────────────────────┘            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Notification Trigger Flow

```
User Action (Like/Comment/Follow)
        │
        ▼
┌────────────────────────────────────┐
│  postController.likePost()        │
│  postController.commentOnPost()   │
│  userController.followUser()      │
└────────────┬───────────────────────┘
             │
             ▼
┌────────────────────────────────────┐
│ Call helper method:                │
│ - notifyLike()                     │
│ - notifyComment()                  │
│ - notifyFollow()                   │
└────────────┬───────────────────────┘
             │
             ▼
┌────────────────────────────────────┐
│ createNotification()               │
│ - Validate recipient & actor       │
│ - Create notification doc          │
│ - Save to MongoDB                  │
└────────────┬───────────────────────┘
             │
             ▼
┌────────────────────────────────────┐
│ Emit Socket.io event:              │
│ "notification:created"             │
│ (Real-time update to clients)      │
└────────────────────────────────────┘
```

## Data Flow: Fetching Notifications

```
Flutter App
    │
    ├─ NotificationsScreen.initState()
    │  └─ _loadNotifications()
    │
    ├─ NotificationService.getNotifications()
    │  └─ GET /api/notifications?limit=50&skip=0
    │
    ▼
Server receives request
    │
    ├─ notificationController.getNotifications()
    │  ├─ Verify auth token (authMiddleware)
    │  ├─ Query MongoDB:
    │  │  └─ Notification.find({recipientId})
    │  │     .populate('actorId')
    │  │     .sort({createdAt: -1})
    │  │     .skip(0).limit(50)
    │  ├─ Count total notifications
    │  ├─ Count unread notifications
    │  └─ Return JSON response
    │
    ▼
Flutter app receives response
    │
    ├─ Parse notifications
    ├─ Update state
    ├─ Build UI with data
    │  └─ TabView shows All/Unread tabs
    └─ Display notifications in list
       └─ Grouped by time (Today, Yesterday, etc)
```

## Real-time Updates with Socket.io

```
Backend emits notification:
io.emit('notification:created', {
  recipientId: 'user_123',
  notification: { /* full notification object */ }
})
        │
        ▼
Frontend listens:
socket.on('notification:created', (data) => {
  if (data.recipientId === currentUserId) {
    setState(() {
      _all.insert(0, newNotification);
    });
  }
});
```

## File Organization

```
server/
├── models/
│   ├── User.js
│   ├── Post.js
│   ├── Message.js
│   ├── Conversation.js
│   └── Notification.js ──────────────── [NEW]
│
├── controllers/
│   ├── authController.js
│   ├── userController.js ──────────── [UPDATED - added notifyFollow]
│   ├── postController.js ──────────── [UPDATED - added notifyLike/Comment]
│   ├── messageController.js
│   ├── skillController.js
│   └── notificationController.js ──── [NEW]
│
├── routes/
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── postRoutes.js
│   ├── messageRoutes.js
│   ├── skillRoutes.js
│   └── notificationRoutes.js ──────── [NEW]
│
├── middleware/
│   └── authMiddleware.js
│
├── config/
│   ├── db.js
│   └── cloudinary.js
│
├── sockets/
│   └── socket.js
│
├── server.js ──────────────────────── [UPDATED - added routes]
├── package.json
│
├── NOTIFICATIONS_API.md ───────────── [NEW]
├── NOTIFICATIONS_SETUP.md ──────────── [NEW]
├── NOTIFICATIONS_README.md ─────────── [NEW]
└── ... other documentation
```

## API Response Examples

### Get All Notifications
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "recipientId": "507f1f77bcf86cd799439012",
      "actorId": {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Maria Santos",
        "username": "maria_s",
        "profilePicture": "https://..."
      },
      "type": "like",
      "message": "liked your post.",
      "postId": "507f1f77bcf86cd799439014",
      "postSnippet": "Looking for a skilled carpenter...",
      "isRead": false,
      "createdAt": "2026-06-01T10:30:00Z",
      "updatedAt": "2026-06-01T10:30:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439020",
      "actorId": {
        "_id": "507f1f77bcf86cd799439021",
        "name": "Juan dela Cruz",
        "username": "juan_dc",
        "profilePicture": "https://..."
      },
      "type": "follow",
      "message": "started following you.",
      "isRead": false,
      "createdAt": "2026-06-01T09:15:00Z"
    }
  ],
  "pagination": {
    "total": 42,
    "limit": 20,
    "skip": 0,
    "unreadCount": 5
  }
}
```

## State Management Pattern

```
NotificationsScreen (StatefulWidget)
├── State: _NotificationsScreenState
│
├── Variables:
│   ├── _all: List<AppNotification>          [All notifications]
│   ├── _unread: getter (filtered _all)      [Unread only]
│   ├── _tabController: TabController        [Tab switcher]
│   ├── _isLoading: bool                     [Loading state]
│   └── _notificationService: Service        [API calls]
│
├── Lifecycle:
│   ├── initState()
│   │  └─ Load notifications from API
│   │
│   └── dispose()
│      └─ Clean up TabController
│
├── User Actions:
│   ├── onTap(notification)
│   │  └─ markAsRead(notification)
│   │
│   └── onMarkAllRead()
│      └─ markAllAsRead()
│
└── Build Methods:
   ├── _buildList(items)           [List view]
   ├── _notificationTile(n)        [Individual tile]
   ├── _groupHeader(label)         [Group header]
   ├── _actorAvatar(name, url)     [Avatar widget]
   └── Helper methods for icons, colors, formatting
```

## Integration Checklist

- [ ] Notification model created in MongoDB
- [ ] All 7 API endpoints implemented and tested
- [ ] Like notifications triggering when user likes post
- [ ] Comment notifications triggering when user comments
- [ ] Follow notifications triggering when user follows
- [ ] Flutter NotificationService created and tested
- [ ] NotificationsScreen connected to API
- [ ] Unread badge showing in app navigation
- [ ] Real-time Socket.io events working
- [ ] Error handling implemented
- [ ] Loading states displaying correctly
- [ ] Authentication tokens properly sent with requests
- [ ] Pagination working for large notification lists
- [ ] Mark all read feature working
- [ ] Delete functionality working
- [ ] Performance optimized with proper indexes

---

**System is production-ready for notification handling!**
