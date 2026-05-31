# Notifications API Documentation

## Overview
The Notifications API handles all notification operations for the SkillConnect application. Notifications are automatically triggered by user actions (likes, comments, follows, etc.) and can also be manually queried and managed.

## Models

### Notification Schema
```javascript
{
  _id: ObjectId,
  recipientId: ObjectId (ref: User),          // User receiving the notification
  actorId: ObjectId (ref: User),              // User triggering the notification
  type: String (enum),                        // Type of notification
  message: String,                            // Human-readable message
  postId: ObjectId (ref: Post, optional),     // Associated post
  postSnippet: String (optional),             // Preview of post content
  relatedData: Mixed (optional),              // Extra context (rating, jobTitle, etc)
  isRead: Boolean (default: false),
  createdAt: Date,
  updatedAt: Date
}
```

### Notification Types
- `like` - User liked a post
- `comment` - User commented on a post
- `share` - User shared a post
- `hire` - User sent a hire request
- `follow` - User followed the current user
- `jobDone` - System notification for completed job
- `review` - User left a review
- `mention` - User mentioned in a post
- `system` - System-generated notification

## Endpoints

### 1. Get All Notifications
```
GET /api/notifications
```

**Authentication:** Required (Bearer token)

**Query Parameters:**
- `limit` (optional, default: 20) - Number of notifications per page
- `skip` (optional, default: 0) - Number of notifications to skip

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "notification_id",
      "recipientId": "user_id",
      "actorId": "user_id",
      "actorName": "Actor Name",
      "actorAvatar": "avatar_url",
      "type": "like",
      "message": "liked your post.",
      "postId": "post_id",
      "postSnippet": "Looking for a skilled carpenter...",
      "isRead": false,
      "createdAt": "2026-06-01T10:30:00.000Z"
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

---

### 2. Get Unread Notifications
```
GET /api/notifications/unread/list
```

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "notification_id",
      "type": "comment",
      "message": "commented on your post:",
      "postSnippet": "Great work!",
      "isRead": false,
      "createdAt": "2026-06-01T10:30:00.000Z"
    }
  ],
  "count": 5
}
```

---

### 3. Get Unread Count
```
GET /api/notifications/unread/count
```

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "count": 5
}
```

---

### 4. Mark Notification as Read
```
PUT /api/notifications/:notificationId/read
```

**Authentication:** Required (Bearer token)

**Path Parameters:**
- `notificationId` - ID of the notification

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "notification_id",
    "isRead": true,
    "updatedAt": "2026-06-01T10:35:00.000Z"
  }
}
```

---

### 5. Mark All Notifications as Read
```
PUT /api/notifications/mark-all-read
```

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "msg": "15 notifications marked as read",
  "modifiedCount": 15
}
```

---

### 6. Delete Notification
```
DELETE /api/notifications/:notificationId
```

**Authentication:** Required (Bearer token)

**Path Parameters:**
- `notificationId` - ID of the notification

**Response:**
```json
{
  "success": true,
  "msg": "Notification deleted"
}
```

---

### 7. Delete All Notifications
```
DELETE /api/notifications
```

**Authentication:** Required (Bearer token)

**Response:**
```json
{
  "success": true,
  "msg": "42 notifications deleted",
  "deletedCount": 42
}
```

---

## Automatic Notification Triggers

### Like Notification
Triggered when a user likes a post.
- **Type:** `like`
- **Message:** `"{actorName} liked your post."`
- **Includes:** Post snippet preview
- **Location:** `postController.js` - `likePost()` method

### Comment Notification
Triggered when a user comments on a post.
- **Type:** `comment`
- **Message:** `"{actorName} commented on your post:"`
- **Includes:** Comment text preview
- **Location:** `postController.js` - `commentOnPost()` method

### Follow Notification
Triggered when a user follows another user.
- **Type:** `follow`
- **Message:** `"{actorName} started following you."`
- **No post associated**
- **Location:** `userController.js` - `followUser()` method

---

## Error Responses

### 404 Not Found
```json
{
  "success": false,
  "msg": "Notification not found"
}
```

### 401 Unauthorized
```json
{
  "msg": "Authorization failed"
}
```

### 500 Server Error
```json
{
  "success": false,
  "msg": "Failed to [operation]"
}
```

---

## Usage Examples

### Fetch unread notifications for user
```bash
curl -X GET http://localhost:5000/api/notifications/unread/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Mark all as read
```bash
curl -X PUT http://localhost:5000/api/notifications/mark-all-read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get notification count (for badge)
```bash
curl -X GET http://localhost:5000/api/notifications/unread/count \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Integration Points

### Frontend (Flutter)
The notification system integrates with the `NotificationsScreen` widget:
- **Fetches all notifications:** `GET /api/notifications`
- **Fetches unread only:** `GET /api/notifications/unread/list`
- **Marks as read on tap:** `PUT /api/notifications/:id/read`
- **Marks all read:** `PUT /api/notifications/mark-all-read`
- **Real-time updates:** Via Socket.io events

### Real-time Events (Socket.io)
When a notification is created, a Socket.io event is emitted:
```javascript
io.emit('notification:created', {
  recipientId: 'user_id',
  notification: { /* notification object */ }
});
```

---

## Database Indexes

For optimal performance, the following indexes are automatically created:
- `{ recipientId: 1, createdAt: -1 }` - For fetching notifications sorted by time
- `{ recipientId: 1, isRead: 1 }` - For filtering read/unread notifications

---

## Future Enhancements

- [ ] Push notifications (FCM for mobile)
- [ ] Email digest notifications
- [ ] Notification preferences/settings
- [ ] Notification grouping (e.g., "Maria and 12 others liked your post")
- [ ] Notification expiration/archival
- [ ] Notification filtering by type
