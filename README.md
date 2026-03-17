# 🐱 Kitten Tennis

A cute multiplayer browser tennis game built with HTML5 Canvas + Node.js WebSockets.

![Kitten Tennis](https://img.shields.io/badge/Game-Kitten%20Tennis-FF6B9D?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-16+-green?style=flat-square)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-4ECDC4?style=flat-square)

---

## 🚀 Quick Start

```bash
# 1. Clone / download the project
cd kitten-tennis

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open http://localhost:3000 in your browser
```

---

## 🎮 How to Play

1. **Player 1** opens the game → clicks **Create Room** → gets a code like `KITTENABC`
2. **Player 2** opens the same URL → clicks **Join Room** → enters the code
3. Game starts automatically!

### Controls

| Player | Move Left | Move Right | Jump / Hit |
|--------|-----------|------------|------------|
| P1 (Gray Cat)  | `A` | `D` | `Space` |
| P2 (Black Cat) | `←` | `→` | `↑` |

**First to 7 points wins!**

---

## 📁 Project Structure

```
kitten-tennis/
├── package.json
├── README.md
│
├── server/
│   └── server.js          # WebSocket + HTTP server (authoritative physics)
│
└── client/
    ├── index.html         # Game UI + screens
    ├── style.css          # Cute bright styling
    ├── socket.js          # WebSocket client wrapper
    ├── game.js            # Game engine (Player, Ball, Game, UIManager)
    │
    └── assets/            # (Optional) custom sprites
        ├── cat_gray.png   # Gray kitten sprite (P1) — your uploaded sprite!
        ├── cat_black.png  # Black cat sprite (P2) — your uploaded sprite!
        ├── ball.png       # Tennis ball sprite
        └── bg.png         # Background image
```

---

## 🖼️ Custom Sprites

Copy your sprite images into `client/` (root, next to index.html):

| File | Used for |
|------|----------|
| `cat_gray.png` | Player 1 (gray kitten) |
| `cat_black.png` | Player 2 (black cat) |
| `ball.png` | Tennis ball |
| `bg.png` | Background |

If files are not found, the game uses beautifully drawn fallback shapes automatically.

**Recommended sprite size:** 64×72px for cats, 28×28px for ball.

---

## 🌐 Deploying Online

### Backend (Render / Railway)

1. Push your project to GitHub
2. On [Render.com](https://render.com):
   - New → Web Service
   - Connect repo
   - Build command: `npm install`
   - Start command: `npm start`
   - Port: `3000`
3. Copy your Render URL (e.g. `https://kitten-tennis.onrender.com`)

### Frontend (GitHub Pages)

1. Edit `client/socket.js` → update `PROD_SERVER` to your Render URL:
   ```js
   const PROD_SERVER = 'wss://your-app.onrender.com';
   ```
2. Push `client/` folder to `gh-pages` branch
3. Enable GitHub Pages in repo Settings → Pages

Or add a `<meta name="ws-url" content="wss://your-app.onrender.com">` tag to `index.html`.

---

## 🏗️ Architecture

### Server (Authoritative)
- `Room` class: manages 2 players, ball physics, scoring
- Ball physics runs at **60 ticks/second** server-side
- Players send position updates; server relays to opponent
- Server detects all scoring events

### Client (Interpolated)
- `Player` class: local input + remote interpolation (lerp)
- `Ball` class: smooth interpolation toward server-authoritative state
- `ParticleSystem`: dust on jump, sparkles on hit
- `SoundManager`: Web Audio API generated sounds
- `Game` class: main loop (capped at 60 FPS)
- `SocketManager`: connection, reconnect, message routing

### Network Messages

| Direction | Type | Payload |
|-----------|------|---------|
| C→S | `createRoom` | — |
| S→C | `roomCreated` | `{ code, playerIndex }` |
| C→S | `joinRoom` | `{ code }` |
| S→C | `gameStart` | `{ scores }` |
| S→C | `ballUpdate` | `{ x, y, vx, vy, t }` |
| S→C | `score` | `{ scores, scorer }` |
| S→C | `hit` | `{ player, x, y }` |
| S→C | `bounce` | `{ kind, x, y }` |
| S→C | `respawn` | `{ x, y, vx, vy }` |
| C→S | `playerMove` | `{ x, y, state, facing }` |
| S→C | `opponentMove` | `{ x, y, state, facing }` |
| S→C | `gameOver` | `{ winner, scores }` |

---

## ⚙️ Configuration

Edit constants at the top of `server/server.js` and `client/game.js`:

```js
const GAME_W    = 800;   // canvas width
const GAME_H    = 450;   // canvas height
const GRAVITY   = 980;   // ball gravity
const BALL_BOUNCE = 0.72; // ground bounce energy
const TICK_RATE = 60;    // server ticks/sec
```

---

## 🐾 Have fun playing!
