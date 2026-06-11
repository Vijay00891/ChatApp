# 💬 NexChat — Real-Time Encrypted Chat App

A production-grade, full-stack real-time chat application built with the MERN stack. Features end-to-end encryption, offline-first architecture, MQTT messaging, and a Google Material Design 3 inspired UI.

---

## ✨ Features

### 💬 Messaging
- Real-time one-on-one and group messaging via Socket.io + MQTT
- Message delivery status — Sent → Delivered → Read (double tick)
- Typing indicators with animated 3-dot bounce
- Emoji reactions on messages (real-time, no reload needed)
- Message timestamps and date separators
- Optimistic UI — messages appear instantly before server confirmation

### 🔐 Security
- **End-to-End Encryption (E2EE)** — ECDH P-256 key exchange + AES-256-GCM
- Private keys stored exclusively in IndexedDB — never sent to server
- Server only ever stores and forwards ciphertext — zero plaintext visibility
- Encrypted message integrity indicator (🔒 lock icon per message)
- Passwords hashed with bcrypt

### 📡 Real-Time Infrastructure
- **Socket.io** — authentication, signaling, room management
- **MQTT (EMQX broker)** — high-performance message delivery
  - QoS 0 for typing indicators
  - QoS 1 for messages, reactions, read receipts
  - Retained messages for online/offline status
  - Last Will Testament for automatic offline detection

### 🌐 Offline-First (PWA)
- Full offline access — browse all chats and messages without internet
- IndexedDB local database — messages, rooms, contacts cached on device
- Outbox queue — messages typed offline are sent automatically on reconnect
- Service Worker via Workbox — caches assets, API responses, and images
- Installable as a PWA on mobile and desktop
- Sync banner — shows "Syncing..." when back online and flushes outbox

### 👤 Presence
- Real-time online/offline status via MQTT retained messages + LWT
- Last seen display — "Active now", "Active recently", "Last seen today at 3:42 PM"
- Status updates without page reload

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS |
| Real-time (Web) | Socket.io |
| Real-time (Messaging) | MQTT via EMQX broker |
| Backend | Node.js + Express |
| Database | MongoDB + Mongoose |
| Local Database | IndexedDB (via `idb`) |
| Encryption | Web Crypto API (ECDH + AES-256-GCM) |
| Auth | JWT + bcrypt |
| Service Worker | Workbox via `vite-plugin-pwa` |
| Broker | EMQX (Docker) |

---

## 📁 Project Structure

```
nexchat/
├── client/                         # React frontend (Vite)
│   ├── public/
│   │   └── icons/                  # PWA icons (192px, 512px)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatWindow.jsx      # Main chat panel
│   │   │   ├── MessageBubble.jsx   # Individual message with E2EE decrypt
│   │   │   ├── InputBar.jsx        # Message input with offline queue
│   │   │   ├── Sidebar.jsx         # Contacts and rooms list
│   │   │   ├── OfflineBar.jsx      # Offline/syncing status banner
│   │   │   ├── EncryptionBadge.jsx # 🔒 E2EE status indicator
│   │   │   └── SyncStatusIcon.jsx  # WiFi/sync icon in sidebar
│   │   ├── context/
│   │   │   ├── AuthContext.jsx     # Auth state + key initialization
│   │   │   ├── SocketContext.jsx   # Socket.io instance
│   │   │   ├── MQTTContext.jsx     # MQTT client + message routing
│   │   │   └── OfflineContext.jsx  # Online/offline state
│   │   ├── hooks/
│   │   │   ├── useE2EE.js          # Encryption/decryption per conversation
│   │   │   ├── useMessages.js      # Messages with IndexedDB + server sync
│   │   │   ├── useSync.js          # Outbox flush + missed message sync
│   │   │   └── useTyping.js        # Typing indicator logic
│   │   ├── utils/
│   │   │   ├── crypto.js           # Web Crypto API — ECDH + AES-256-GCM
│   │   │   ├── db.js               # IndexedDB operations (idb)
│   │   │   ├── mqttClient.js       # MQTT browser client setup
│   │   │   └── formatLastSeen.js   # Last seen timestamp formatting
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   └── Chat.jsx
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── vite.config.js              # Vite + VitePWA config
│   └── package.json
│
├── server/                         # Node.js + Express backend
│   ├── models/
│   │   ├── User.js                 # User schema (publicKey field)
│   │   ├── Message.js              # Message schema (ciphertext + iv)
│   │   └── Room.js                 # Room/conversation schema
│   ├── routes/
│   │   ├── auth.js                 # /api/auth — register, login
│   │   ├── users.js                # /api/users — profile, public keys
│   │   ├── rooms.js                # /api/rooms
│   │   └── messages.js             # /api/messages + /sync endpoint
│   ├── middleware/
│   │   └── authMiddleware.js       # JWT verification
│   ├── socket/
│   │   └── socketHandler.js        # Socket.io — auth + MQTT bridge
│   ├── mqtt/
│   │   ├── mqttClient.js           # Server-side MQTT connection
│   │   └── mqttHandler.js          # Topic routing + DB persistence
│   ├── server.js
│   └── package.json
│
├── docker-compose.yml              # EMQX broker
└── README.md
```

---

## ⚙️ Prerequisites

- Node.js v18+
- MongoDB (local or Atlas)
- Docker + Docker Compose (for EMQX broker)
- npm or yarn

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/nexchat.git
cd nexchat
```

### 2. Start EMQX Broker

```bash
docker-compose up -d
```

EMQX dashboard will be available at `http://localhost:18083`
Default credentials: `admin` / `public`

### 3. Configure Environment Variables

**Server** — create `server/.env`:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017/nexchat
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173

MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=server
MQTT_PASSWORD=your_mqtt_password
```

**Client** — create `client/.env`:

```env
VITE_SERVER_URL=http://localhost:5000
VITE_MQTT_URL=ws://localhost:8083/mqtt
```

### 4. Install Dependencies

```bash
# Server
cd server
npm install

# Client
cd ../client
npm install
```

### 5. Run the App

```bash
# Terminal 1 — start server
cd server
npm run dev

# Terminal 2 — start client
cd client
npm run dev
```

App runs at `http://localhost:5173`

---

## 🔐 Encryption Architecture

```
Key Generation (on first login):
  Each user generates an ECDH P-256 key pair in the browser
  Private key → stored in IndexedDB only (never leaves device)
  Public key  → uploaded to MongoDB (safe to store publicly)

Per-Conversation Key Derivation:
  Alice: ECDH(Alice_privateKey + Bob_publicKey)  → SharedKey_AB
  Bob:   ECDH(Bob_privateKey + Alice_publicKey)  → SharedKey_AB
  Both sides independently derive the IDENTICAL key
  Server never sees this key

Message Flow:
  Alice types "Hello"
    → encrypt with SharedKey_AB + random IV (AES-256-GCM)
    → emit { ciphertext, iv } via MQTT
    → server stores ciphertext (cannot decrypt)
    → Bob receives { ciphertext, iv }
    → decrypt with SharedKey_AB → "Hello"
```

---

## 📡 MQTT Topic Structure

```
chat/{roomId}/messages          QoS 1   Messages
chat/{roomId}/typing            QoS 0   Typing indicators
chat/{roomId}/reactions         QoS 1   Emoji reactions
chat/{roomId}/read              QoS 1   Read receipts

users/{userId}/status           QoS 1   Online/offline (retained)
users/{userId}/notifications    QoS 1   Personal alerts
```

---

## 🌐 Offline-First Architecture

```
App opens (offline):
  Service Worker serves cached JS/CSS/HTML
  IndexedDB provides all messages, rooms, contacts
  UI loads instantly — no network needed

User sends message (offline):
  Message saved to IndexedDB outbox
  Optimistic UI — message appears immediately
  Toast: "Will send when back online"

Back online:
  Outbox flushed — queued messages sent in order
  Sync endpoint called — missed messages fetched
  IndexedDB updated with server data
```

---

## 🔌 API Endpoints

```
POST   /api/auth/register            Register new user
POST   /api/auth/login               Login, returns JWT

GET    /api/users/me                 Get current user profile
PUT    /api/users/public-key         Upload ECDH public key
GET    /api/users/:id/public-key     Get contact's public key
GET    /api/users/contacts           Get all contacts

GET    /api/rooms                    Get all rooms for user
POST   /api/rooms                    Create new room/conversation

GET    /api/messages/:roomId         Get messages for a room
GET    /api/messages/sync?since=ts   Sync missed messages (offline recovery)
```

---

## 🔌 Socket.io Events

```
Client → Server:
  join_room       { roomId }
  send_message    { tempId, roomId, content(cipher), iv }
  typing          { roomId, userId }
  stop_typing     { roomId, userId }
  message_read    { messageId, roomId }

Server → Client:
  receive_message   { message }
  message_confirmed { tempId, realMessage }
  reaction_update   { messageId, reactions }
  user_online       { userId }
  user_offline      { userId, lastSeen }
```

---

## 🐳 Docker Compose (EMQX)

```yaml
version: '3.8'
services:
  emqx:
    image: emqx/emqx:latest
    container_name: nexchat_emqx
    ports:
      - "1883:1883"     # MQTT TCP
      - "8083:8083"     # MQTT WebSocket (browser)
      - "8084:8084"     # MQTT WebSocket SSL
      - "18083:18083"   # Dashboard
    environment:
      EMQX_ALLOW_ANONYMOUS: "false"
    volumes:
      - emqx_data:/opt/emqx/data

volumes:
  emqx_data:
```

---

## 🛠️ Available Scripts

```bash
# Server
npm run dev          # Development with nodemon
npm start            # Production

# Client
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview production build
```

---

## 🚧 Known Issues / Troubleshooting

**MQTT connection error loop**
- Verify EMQX is running: `docker ps | grep emqx`
- Check WebSocket port: `curl http://localhost:8083`
- Ensure `clientId` is unique per connection — use `user_${userId}_${Date.now()}`
- Confirm credentials match EMQX dashboard auth settings

**E2EE "Unable to decrypt" on messages**
- Happens when private key is missing from IndexedDB (e.g. private/incognito mode)
- Keys are regenerated on next login — old messages from previous keys cannot be decrypted (by design)

**Messages not syncing offline**
- Check if Service Worker is registered: DevTools → Application → Service Workers
- Verify IndexedDB stores exist: DevTools → Application → IndexedDB → chatapp_db

---

## 🗺️ Roadmap

- [ ] Push Notifications (Web Push API)
- [ ] Signal Protocol (Double Ratchet for forward secrecy)
- [ ] Voice/Video calls (WebRTC)
- [ ] File and image sharing
- [ ] Message search
- [ ] Multi-device key sync
- [ ] Group E2EE (per-member encrypted group key)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👨‍💻 Author

**Vijay Suryawanshi**
Full-Stack MERN Developer & AI Integration Engineer

[![GitHub](https://img.shields.io/badge/GitHub-vijaysuryawanshi18-black?style=flat&logo=github)](https://github.com/vijaysuryawanshi18)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-blue?style=flat&logo=linkedin)](https://linkedin.com/in/yourprofile)

---

> Built with ❤️ using React, Node.js, Socket.io, MQTT, and Web Crypto API
