# 🚀 Backend Setup - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Install Dependencies
```bash
cd server
npm install
```

### Step 2: Configure Environment
Create a `.env` file in the server folder:
```bash
# For Development
MONGO_URI=mongodb://localhost:27017/SkillLinkDB
JWT_SECRET=dev_secret_key_change_in_production
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Step 3: Start Server
```bash
npm start           # Production mode
# OR
npm run dev         # Development mode (with auto-reload)
```

### Step 4: Verify It's Running
```bash
curl http://localhost:5000/
# Response: { "ok": true, "message": "SkillLink API" }
```

---

## 📱 Frontend Configuration

Your Flutter app should use:
```dart
String baseUrl = 'http://10.0.0.34:5000/api';
```

Make sure to update `10.0.0.34` to your server's actual IP address!

---

## 🔐 Security Features Implemented

| Feature | Status | Details |
|---------|--------|---------|
| JWT Authentication | ✅ | Token validation on all protected routes |
| Authorization Checks | ✅ | User membership verification |
| Input Validation | ✅ | Message length, format, ObjectId checks |
| Rate Limiting | ✅ | 100 req/15min general, 5/15min auth |
| Helmet Security | ✅ | HTTP header protection |
| CORS Whitelist | ✅ | Only allow specified origin |
| NoSQL Injection Prevention | ✅ | Data sanitization |
| WebSocket JWT | ✅ | Authentication on connection |
| Error Handling | ✅ | Generic errors in production |

---

## 🧪 Test Each Feature

### 1. Test Authentication
```bash
# Should fail (no token)
curl -X GET "http://localhost:5000/api/messages/conversations"

# Should fail (invalid token)
curl -X GET "http://localhost:5000/api/messages/conversations" \
  -H "Authorization: Bearer invalid_token"

# Should succeed (with valid token)
curl -X GET "http://localhost:5000/api/messages/conversations" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2. Test User Search
```bash
curl -X GET "http://localhost:5000/api/messages/search?q=john" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 3. Test Create Conversation
```bash
curl -X POST "http://localhost:5000/api/messages/conversations" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "otherUserId": "USER_ID_HERE"
  }'
```

### 4. Test Send Message
```bash
curl -X POST "http://localhost:5000/api/messages/send" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "CONVERSATION_ID",
    "text": "Hello!"
  }'
```

### 5. Test WebSocket
```javascript
// In browser console or Node.js
const io = require('socket.io-client');

const socket = io('http://localhost:5000', {
  auth: {
    token: 'YOUR_JWT_TOKEN'
  }
});

socket.on('connect', () => {
  console.log('Connected!');
  
  // Join a conversation
  socket.emit('joinConversation', {
    conversationId: 'CONVERSATION_ID'
  });
  
  // Listen for messages
  socket.on('getMessage', (message) => {
    console.log('New message:', message);
  });
});
```

---

## 🔗 API Endpoints

### Messages API

#### Search Users
```
GET /api/messages/search?q=<query>
Headers: Authorization: Bearer <token>

Response:
[
  {
    "_id": "user_id",
    "name": "User Name",
    "username": "username",
    "profilePicture": "url"
  }
]
```

#### Get Conversations
```
GET /api/messages/conversations
Headers: Authorization: Bearer <token>

Response: Array of conversation objects
```

#### Get/Create Conversation
```
POST /api/messages/conversations
Headers: Authorization: Bearer <token>
Body: { "otherUserId": "user_id" }

Response: Conversation object
```

#### Get Messages
```
GET /api/messages/conversations/<conversationId>
Headers: Authorization: Bearer <token>

Response: Array of message objects
```

#### Send Message
```
POST /api/messages/send
Headers: Authorization: Bearer <token>
Body: { "conversationId": "id", "text": "message" }

Response: Message object
```

#### Mark as Seen
```
PUT /api/messages/seen
Headers: Authorization: Bearer <token>
Body: { "conversationId": "id" }

Response: { "message": "Messages marked as seen" }
```

---

## 🎯 WebSocket Events

### Client → Server

**joinConversation**
```javascript
socket.emit('joinConversation', { conversationId: 'id' });
```

**sendMessage**
```javascript
socket.emit('sendMessage', { conversationId: 'id', text: 'Hello' });
```

**typing**
```javascript
socket.emit('typing', { conversationId: 'id', isTyping: true });
```

**markAsRead**
```javascript
socket.emit('markAsRead', { conversationId: 'id' });
```

**leaveConversation**
```javascript
socket.emit('leaveConversation', { conversationId: 'id' });
```

### Server → Client

**onlineUsers**
```javascript
socket.on('onlineUsers', (userIds) => {
  console.log('Online users:', userIds);
});
```

**getMessage**
```javascript
socket.on('getMessage', (message) => {
  console.log('New message:', message);
});
```

**userTyping**
```javascript
socket.on('userTyping', (data) => {
  console.log(data.userId, 'is typing:', data.isTyping);
});
```

**messagesRead**
```javascript
socket.on('messagesRead', (data) => {
  console.log(data.userId, 'read messages in', data.conversationId);
});
```

**joinedConversation**
```javascript
socket.on('joinedConversation', (data) => {
  console.log('Joined:', data.conversationId);
});
```

**error**
```javascript
socket.on('error', (error) => {
  console.error('Socket error:', error.message);
});
```

---

## 🐛 Troubleshooting

### Server Won't Start
```bash
# Check if port 5000 is already in use
netstat -ano | findstr :5000

# If in use, either:
1. Stop the process using that port
2. Change PORT in .env
```

### "No token" Error
- Make sure you're including the Authorization header
- Token should be in format: `Bearer YOUR_TOKEN`

### CORS Error from Frontend
- Check that FRONTEND_URL in .env matches your app's URL
- Default is `http://localhost:3000`
- For Android emulator: use `http://10.0.0.34:5000`

### WebSocket Won't Connect
- Ensure token is passed in auth
- Check that Socket.IO port matches (usually same as HTTP port)
- Make sure firewall isn't blocking port 5000

### Messages Not Appearing
- Verify user is joined to conversation room
- Check browser console for errors
- Verify conversation includes both users

---

## 📊 Database Models

### User
```javascript
{
  name: String,
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  skills: [String],
  profilePicture: String (URL),
  bio: String,
  rating: Number,
  verified: Boolean,
  createdAt: Date
}
```

### Conversation
```javascript
{
  members: [ObjectId], // Reference to User
  lastMessage: ObjectId, // Reference to Message
  updatedAt: Date
}
```

### Message
```javascript
{
  conversationId: ObjectId, // Reference to Conversation
  senderId: ObjectId, // Reference to User
  text: String,
  attachments: [String],
  seen: Boolean,
  createdAt: Date
}
```

---

## ✅ Production Checklist

Before deploying to production:

- [ ] Change JWT_SECRET to a long random string (32+ chars)
- [ ] Set NODE_ENV=production
- [ ] Update FRONTEND_URL to your production frontend URL
- [ ] Use HTTPS instead of HTTP
- [ ] Setup MongoDB Atlas or managed MongoDB
- [ ] Configure rate limiting for production load
- [ ] Setup error logging (Sentry, etc.)
- [ ] Setup monitoring (UptimeRobot, etc.)
- [ ] Test all endpoints with production URLs
- [ ] Setup backup strategy for database
- [ ] Configure firewall rules
- [ ] Setup SSL certificates

---

## 📞 Getting Help

See `SECURITY_UPDATES.md` for detailed security information.

For issues:
1. Check the error message
2. Review troubleshooting section
3. Check server logs
4. Verify all environment variables are set

---

## 🎉 You're All Set!

Your backend is now:
- ✅ Secure with JWT authentication
- ✅ Protected with authorization checks
- ✅ Validated with input checks
- ✅ Rate limited
- ✅ Real-time with WebSocket
- ✅ Ready for production

Start the server and begin integrating with your Flutter app!
