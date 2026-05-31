# Notifications Feature - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Verify Backend Files Exist
```bash
# Navigate to server directory
cd server

# Check that these files exist:
ls models/Notification.js
ls controllers/notificationController.js
ls routes/notificationRoutes.js
```

### Step 2: Restart Server
```bash
npm start
```

**The notification API is now live on:**
```
http://localhost:5000/api/notifications
```

### Step 3: Test an Endpoint
```bash
# Get your auth token first (from login response)
TOKEN="your_bearer_token_here"

# Test getting unread count
curl -X GET http://localhost:5000/api/notifications/unread/count \
  -H "Authorization: Bearer $TOKEN"

# Expected response:
# { "success": true, "count": 0 }
```

---

## 🎯 Next: Connect Flutter

### Create NotificationService
Create file: `lib/services/notification_service.dart`

```dart
import 'package:dio/dio.dart';

class NotificationService {
  final Dio _dio = Dio(
    BaseOptions(
      baseUrl: 'http://YOUR_SERVER_URL/api',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
    ),
  );

  Future<List> getNotifications(String token) async {
    _dio.options.headers['Authorization'] = 'Bearer $token';
    final response = await _dio.get('/notifications');
    return response.data['data'] ?? [];
  }

  Future<int> getUnreadCount(String token) async {
    _dio.options.headers['Authorization'] = 'Bearer $token';
    final response = await _dio.get('/notifications/unread/count');
    return response.data['count'] ?? 0;
  }

  Future<void> markAsRead(String token, String notificationId) async {
    _dio.options.headers['Authorization'] = 'Bearer $token';
    await _dio.put('/notifications/$notificationId/read');
  }

  Future<void> markAllAsRead(String token) async {
    _dio.options.headers['Authorization'] = 'Bearer $token';
    await _dio.put('/notifications/mark-all-read');
  }
}
```

### Update NotificationsScreen
Replace mock data with API calls:

```dart
class _NotificationsScreenState extends State<NotificationsScreen> {
  final NotificationService _service = NotificationService();
  List<AppNotification> _all = [];
  String? _userToken; // Get from your auth provider

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadNotifications();
  }

  void _loadNotifications() async {
    try {
      final data = await _service.getNotifications(_userToken!);
      setState(() {
        _all = data.map((n) => _parseNotification(n)).toList();
      });
    } catch (e) {
      print('Error loading notifications: $e');
    }
  }

  void _markRead(AppNotification n) async {
    if (!n.isRead) {
      await _service.markAsRead(_userToken!, n.id);
      setState(() => n.isRead = true);
    }
  }

  void _markAllRead() async {
    await _service.markAllAsRead(_userToken!);
    setState(() {
      for (final n in _all) n.isRead = true;
    });
  }

  AppNotification _parseNotification(Map json) {
    return AppNotification(
      id: json['_id'],
      type: _typeFromString(json['type']),
      actorName: json['actorId']['name'],
      actorAvatar: json['actorId']['profilePicture'],
      message: json['message'],
      postSnippet: json['postSnippet'],
      createdAt: DateTime.parse(json['createdAt']),
      isRead: json['isRead'],
    );
  }

  NotificationType _typeFromString(String type) {
    return NotificationType.values.firstWhere(
      (t) => t.name == type,
      orElse: () => NotificationType.system,
    );
  }
}
```

### Test the Connection
1. Run the Flutter app
2. Open the Notifications screen
3. Verify it shows any existing notifications from the API
4. Create a test notification by having another user like your post
5. The notification should appear in real-time (if Socket.io is connected)

---

## 🧪 Manual Testing

### Simulate Different Notifications

#### Like Notification
```bash
# Using Postman or curl:
POST http://localhost:5000/api/posts/{postId}/like
Authorization: Bearer {token}

# This triggers notifyLike() → creates notification
```

#### Comment Notification
```bash
POST http://localhost:5000/api/posts/{postId}/comment
Authorization: Bearer {token}
Content-Type: application/json

{
  "text": "This is a test comment"
}

# This triggers notifyComment() → creates notification
```

#### Follow Notification
```bash
POST http://localhost:5000/api/users/{userId}/follow
Authorization: Bearer {token}

# This triggers notifyFollow() → creates notification
```

### Verify Notification Created
```bash
GET http://localhost:5000/api/notifications/unread/count
Authorization: Bearer {token}

# Should show increased count
```

---

## 📊 API Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/notifications` | GET | Get all notifications |
| `/api/notifications/unread/list` | GET | Get unread only |
| `/api/notifications/unread/count` | GET | Get badge count |
| `/api/notifications/:id/read` | PUT | Mark as read |
| `/api/notifications/mark-all-read` | PUT | Mark all read |
| `/api/notifications/:id` | DELETE | Delete one |
| `/api/notifications` | DELETE | Delete all |

---

## 🐛 Troubleshooting

### Notifications Not Appearing
```
1. Check server is running: npm start
2. Verify auth token is valid
3. Check notification recipient ID matches current user
4. Look at server console for errors
5. Try manual POST to like/comment endpoint
```

### 401 Unauthorized Error
```
1. Verify Bearer token is included in header
2. Check token hasn't expired
3. Confirm auth middleware is working
4. Test with: curl -H "Authorization: Bearer TOKEN" ...
```

### No Badge Count Showing
```
1. Ensure /api/notifications/unread/count endpoint is called
2. Check response for unreadCount in pagination object
3. Verify notifications.isRead is being set correctly
4. Check MongoDB has notifications in collection
```

### Notifications Not Triggering on Actions
```
1. Check notificationController was imported in postController
2. Verify helper methods are being called (like notifyLike)
3. Check MongoDB connection is working
4. Look for errors in server console logs
5. Verify post owner ID doesn't match actor ID (avoid self-notification)
```

---

## 📁 Important Files

**Backend:**
- `server/models/Notification.js` - Database schema
- `server/controllers/notificationController.js` - Main logic
- `server/routes/notificationRoutes.js` - API endpoints
- `server/NOTIFICATIONS_API.md` - Full API docs

**Frontend:**
- `skilllink/lib/screens/notifications/notifications_screen.dart` - UI
- `skilllink/NOTIFICATIONS_INTEGRATION.md` - Integration guide

**Documentation:**
- `server/NOTIFICATIONS_README.md` - Overview
- `server/NOTIFICATIONS_ARCHITECTURE.md` - System design
- `server/NOTIFICATIONS_SETUP.md` - Setup checklist

---

## ✅ Completion Checklist

- [ ] Server running with notification routes
- [ ] Test endpoint responds with 200
- [ ] AuthToken included in requests
- [ ] NotificationService created in Flutter
- [ ] NotificationsScreen using service instead of mock data
- [ ] Notifications appear when other user likes post
- [ ] Mark as read working
- [ ] Unread count badge showing
- [ ] No console errors
- [ ] Performance acceptable

---

## 🚀 Next Level Features

Once basic notifications working:

1. **Real-time Updates:**
   - Add Socket.io listeners for instant notifications
   - Push updates to screen without polling

2. **Push Notifications:**
   - Integrate Firebase Cloud Messaging
   - Send alerts when app is backgrounded

3. **Notification Preferences:**
   - Let users control which types they receive
   - Mute/unmute for specific users

4. **Notification History:**
   - Archive older notifications
   - Full search functionality

5. **Notification Grouping:**
   - "Maria and 12 others liked your post"
   - Instead of 13 separate notifications

---

## 📞 Need Help?

1. Check `server/NOTIFICATIONS_API.md` for endpoint details
2. Review `skilllink/NOTIFICATIONS_INTEGRATION.md` for code examples
3. Look at controller comments for implementation details
4. Check server logs: `npm start` shows all requests/errors
5. Test endpoints with Postman before integrating in Flutter

---

**You're all set! Start building with notifications! 🎉**
