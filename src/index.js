const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { sequelize, ensureDatabase } = require('./database/config');
const { flappySequelize, ensureFlappyDatabase } = require('./database/flappyConfig');
require('./models');
require('./models/flappy');
const { seedDatabase } = require('./database/seed');
const { ensureDefaultCredentials } = require('./data/admin-credentials');

const { setupGameSocket } = require('./sockets/gameHandler');
const { setupChatSocket } = require('./sockets/chatHandler');
const path = require('path');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const flappyRoutes = require('./routes/flappy');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send({ status: 'ok', message: 'Quiz Game Backend' });
});

app.get('/auth/google/redirect', (req, res) => {
  console.log('[Google Redirect] Sayfa istendi');
  res.send(`<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <title>Giriş Tamamlanıyor...</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      html, body { height: 100%; margin: 0; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#06060F; color:#fff; text-align:center; padding:24px; display:flex; flex-direction:column; justify-content:center; align-items:center; min-height:100vh; }
      #msg { margin-bottom: 24px; }
      p { margin:8px 0; }
      .muted { color:#888; font-size:14px; }
      .err { color:#f44336; font-size:14px; margin-top:20px; }
      .btn { display:inline-block; margin-top:16px; padding:18px 40px; min-height:56px; min-width:200px; background:#208AEF; color:#fff !important; border-radius:12px; text-decoration:none; font-weight:700; font-size:18px; line-height:1.2; -webkit-tap-highlight-color:rgba(32,138,239,0.3); }
      .btn:hover, .btn:active { background:#1a7ad4; }
    </style>
  </head>
  <body>
    <div id="msg">
      <p>Giriş tamamlandı!</p>
      <p class="muted">Uygulamaya geçmek için aşağıdaki butona dokunun.</p>
    </div>
    <a id="openBtn" href="quiz-arena://login" class="btn" onclick="var u=this.getAttribute('data-url')||this.href;window.location.href=u;return false;">Uygulamayı Aç</a>
    <script>
      (function () {
        try {
          var hash = window.location.hash ? window.location.hash.substring(1) : "";
          var query = window.location.search ? window.location.search.substring(1) : "";
          var params = new URLSearchParams(hash || query);
          var idToken = params.get("id_token");
          if (!idToken && hash) {
            var m = hash.match(/id_token=([^&]+)/);
            if (m) idToken = decodeURIComponent(m[1]);
          }
          if (!idToken) {
            new Image().src = "/api/auth/google-redirect-debug?error=token_not_found&hashLen=" + (hash ? hash.length : 0) + "&url=" + encodeURIComponent((window.location.href || "").slice(0, 200));
            document.getElementById("msg").innerHTML = "<p class=\"err\">Token alınamadı. Uygulamaya dönüp tekrar deneyin.</p>";
            return;
          }
          var tokenParam = "id_token=" + encodeURIComponent(idToken);
          var deepLink = "quiz-arena://login?" + tokenParam;
          var isAndroid = /Android/i.test(navigator.userAgent);
          var intentUrl = "intent://login?" + tokenParam + "#Intent;scheme=quiz-arena;package=com.quizarena.app;end";
          var btn = document.getElementById("openBtn");
          var targetUrl = isAndroid ? intentUrl : deepLink;
          btn.href = targetUrl;
          btn.setAttribute("data-url", targetUrl);
          try { navigator.sendBeacon("/api/auth/google-redirect-debug", new Blob([JSON.stringify({ success: true })], { type: "application/json" })); } catch(e){}
          try { window.location.href = targetUrl; } catch(e){}
        } catch (e) {
          var hash = window.location.hash ? window.location.hash.substring(1) : "";
          new Image().src = "/api/auth/google-redirect-debug?error=" + encodeURIComponent(String(e && e.message || "unknown")) + "&hashLen=" + (hash ? hash.length : 0);
          console.error("Google redirect parse error", e);
          document.getElementById("msg").innerHTML = "<p class=\"err\">Bir hata oluştu. Bu pencereyi kapatıp tekrar deneyin.</p>";
        }
      })();
    </script>
  </body>
</html>`);
});

app.all('/api/auth/google-redirect-debug', (req, res) => {
  const data = req.method === 'POST' ? (req.body || {}) : req.query;
  const { error, success, hashLen, url } = data;
  console.log('[Google Redirect]', { success: success === '1' || success === true, error, hashLen, url: (url || '').slice(0, 150) });
  res.json({ ok: true });
});

const fs = require('fs');
const VERSION_FILE = path.join(__dirname, '../data/app-version.json');

function getVersionConfig() {
  const defaults = {
    latestVersion: '1.0.0',
    minVersion: '1.0.0',
    updateMessage: 'Yeni özellikler ve hata düzeltmeleri mevcut!',
    storeUrl: {
      android: 'https://play.google.com/store/apps/details?id=com.quizarena.app',
      ios: 'https://apps.apple.com/app/idXXXXXXXXX',
    },
  };
  try {
    if (fs.existsSync(VERSION_FILE)) {
      return { ...defaults, ...JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8')) };
    }
  } catch {}
  return defaults;
}

function saveVersionConfig(config) {
  const dir = path.dirname(VERSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(VERSION_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

app.get('/api/version', (req, res) => {
  res.json(getVersionConfig());
});

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/flappy', flappyRoutes);

setupGameSocket(io);
setupChatSocket(io);

async function startServer() {
  try {
    await ensureDatabase();
    await ensureFlappyDatabase();
    console.log('Veritabanları kontrol edildi / oluşturuldu.');

    await sequelize.authenticate();
    console.log('MySQL (Quiz Arena) bağlantısı başarılı.');

    await flappySequelize.authenticate();
    console.log('MySQL (Flappy Bird) bağlantısı başarılı.');

    await sequelize.sync();
    await flappySequelize.sync({ alter: true });
    console.log('Tablolar senkronize edildi.');

    await seedDatabase();

    ensureDefaultCredentials();

    server.listen(PORT, () => {
      console.log(`Server ${PORT} portunda çalışıyor`);
    });
  } catch (error) {
    console.error('Sunucu başlatma hatası:', error.message);
    console.error('WampServer\'ın çalıştığından ve MySQL servisinin aktif olduğundan emin olun.');
    process.exit(1);
  }
}

startServer();
