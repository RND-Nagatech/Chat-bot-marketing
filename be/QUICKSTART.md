# Quick Start Guide

## Prerequisites

Before starting, make sure you have:
- ✅ Node.js (v16+) installed
- ✅ MongoDB running (locally or MongoDB Atlas)
- ✅ WhatsApp mobile app

## Setup in 5 Minutes

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Create `.env` from `.env.example`, then adjust the values:

```env
PORT=3000
FRONTEND_URL=http://localhost:8080
MONGODB_URI=mongodb://localhost:27017/whatsapp-chatbot
JWT_SECRET=change-this-secret
JWT_EXPIRES_IN=7d
AUTO_CONNECT_WHATSAPP=false
LOG_LEVEL=info
```

For MongoDB Atlas, use:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/whatsapp-chatbot
```

### 3. Start the Server

```bash
npm run dev
```

You should see:
```
Server is running on port 3000
MongoDB Connected: localhost
```

### 4. Create Your First User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

Save the token from the response!

### 5. Connect WhatsApp

**Get your auth token first:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}'
```

**Start WhatsApp connection:**
```bash
curl -X POST http://localhost:3000/api/wa/connect \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Check connection status until QR is ready:**
```bash
curl http://localhost:3000/api/wa/status \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

If `status` becomes `qr_ready`, then fetch the QR code:
```bash
curl http://localhost:3000/api/wa/qr \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

The response will contain a base64 QR code. Open the data URL in your browser and scan it from WhatsApp on your phone.

**Scan with WhatsApp:**
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Tap "Link a Device"
4. Scan the QR code

### 6. Create Your First Rule

```bash
curl -X POST http://localhost:3000/api/rules \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "hello",
    "match_type": "contains",
    "response": "Hi! How can I help you today?",
    "is_active": true
  }'
```

### 7. Test It!

Send `hello` to your WhatsApp number from another phone. You should get an automatic reply.

If you send a message that does not match any rule:
- the bot will not auto-reply
- the message will still be saved in Riwayat Chat
- the message status will show that it needs admin follow up

## Common Commands

### View All Rules
```bash
curl http://localhost:3000/api/rules \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### View All Messages
```bash
curl http://localhost:3000/api/messages \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Check WhatsApp Status
```bash
curl http://localhost:3000/api/wa/status \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Health Check
```bash
curl http://localhost:3000/health
```

## Example Rules

### Exact Match
```json
{
  "keyword": "help",
  "match_type": "exact",
  "response": "Please contact support at support@example.com",
  "is_active": true
}
```

### Contains Match
```json
{
  "keyword": "price",
  "match_type": "contains",
  "response": "Our pricing starts at $10/month. Visit our website for details.",
  "is_active": true
}
```

### Business Hours
```json
{
  "keyword": "hours",
  "match_type": "contains",
  "response": "We're open Monday-Friday 9AM-5PM EST",
  "is_active": true
}
```

## Troubleshooting

### MongoDB Connection Error
- Make sure MongoDB is running: `mongod --version`
- Check your MONGODB_URI in `.env`
- For local: `mongodb://localhost:27017/whatsapp-chatbot`
- For Atlas: Get connection string from MongoDB Atlas dashboard

### WhatsApp Won't Connect
- Check internet connection
- Make sure MongoDB is connected
- Check logs in `logs/combined.log`
- Try disconnecting and reconnecting:
  ```bash
  curl -X POST http://localhost:3000/api/wa/disconnect -H "Authorization: Bearer TOKEN"
  curl -X POST http://localhost:3000/api/wa/connect -H "Authorization: Bearer TOKEN"
  ```

### Token Errors
- Make sure you're using the format: `Authorization: Bearer YOUR_TOKEN`
- Token expires in 7 days by default
- Re-login to get a new token

## Next Steps

1. Build a frontend dashboard
2. Add more sophisticated rules
3. Set up webhooks for external integrations
4. Deploy to production (see README.md)

## Need Help?

Check the full documentation in `README.md`
