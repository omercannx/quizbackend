const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const { sequelize, ensureDatabase } = require('./database/config');
require('./models');
const { seedDatabase } = require('./database/seed');
const { ensureDefaultCredentials } = require('./data/admin-credentials');

const { setupGameSocket } = require('./sockets/gameHandler');
const { setupChatSocket } = require('./sockets/chatHandler');
const path = require('path');
const adminRoutes = require('./routes/admin');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');

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
      body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#06060F; color:#fff; text-align:center; padding:40px; }
      p { margin:8px 0; }
      .muted { color:#888; font-size:12px; }
      .err { color:#f44336; font-size:14px; margin-top:20px; }
      .btn { display:inline-block; margin-top:20px; padding:12px 24px; background:#208AEF; color:#fff; border-radius:8px; text-decoration:none; font-weight:600; }
      .btn:hover { background:#1a7ad4; }
    </style>
  </head>
  <body>
    <div id="msg">
      <p>Giriş tamamlanıyor...</p>
      <p class="muted">Uygulamaya yönlendiriliyorsunuz.</p>
    </div>
    <a id="openBtn" href="#" class="btn" style="display:none;">Uygulamayı Aç</a>
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
          var deepLink = "quiz-arena://login#id_token=" + encodeURIComponent(idToken);
          var isAndroid = /Android/i.test(navigator.userAgent);
          var intentUrl = "intent://login#id_token=" + encodeURIComponent(idToken) + "#Intent;scheme=quiz-arena;package=com.quizarena.app;end";
          var targetUrl = isAndroid ? intentUrl : deepLink;
          var btn = document.getElementById("openBtn");
          btn.href = targetUrl;
          var blob = new Blob([JSON.stringify({ success: true, hashLen: hash.length })], { type: "application/json" });
          if (navigator.sendBeacon) { navigator.sendBeacon("/api/auth/google-redirect-debug", blob); }
          else { fetch("/api/auth/google-redirect-debug", { method: "POST", body: blob, keepalive: true }); }
          setTimeout(function(){ window.location.href = targetUrl; }, 150);
          btn.style.display = "inline-block";
          setTimeout(function() {
            document.getElementById("msg").innerHTML = "<p class=\"muted\">Otomatik yönlendirme çalışmadıysa aşağıdaki butona dokunun.</p>";
          }, 1500);
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

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/profile', profileRoutes);

setupGameSocket(io);
setupChatSocket(io);

async function startServer() {
  try {
    await ensureDatabase();
    console.log('Veritabanı kontrol edildi / oluşturuldu.');

    await sequelize.authenticate();
    console.log('MySQL bağlantısı başarılı.');

    await sequelize.sync();
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
