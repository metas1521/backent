const express = require('express');
const cors = require('cors');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const app = express();

const normalizeOrigin = (origin) => {
  if (origin == null) return origin;
  const raw = String(origin).trim();
  if (!raw) return raw;
  try {
    const u = new URL(raw);
    const protocol = u.protocol.toLowerCase();
    const hostname = u.hostname.toLowerCase();
    const port = u.port;
    const isDefaultPort =
      (protocol === 'https:' && (port === '' || port === '443')) ||
      (protocol === 'http:' && (port === '' || port === '80'));
    const host = isDefaultPort ? hostname : `${hostname}:${port}`;
    return `${protocol}//${host}`;
  } catch (e) {
    return raw.replace(/\/+$/, '');
  }
};

const parseOrigins = (val) => (val || '')
  .split(',')
  .map(o => normalizeOrigin(o))
  .filter(Boolean);
const allowedOrigins = parseOrigins(process.env.ALLOWED_ORIGINS) || [];
const defaultOrigins = ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5175'].map(normalizeOrigin);
const mandatoryOrigins = ['https://workspace.metalogo703.replit.dev'].map(normalizeOrigin);
const origins = Array.from(new Set([...mandatoryOrigins, ...defaultOrigins, ...allowedOrigins])).filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    const normalized = normalizeOrigin(origin);
    if (!normalized) return callback(null, true);
    if (origins.includes(normalized)) return callback(null, true);
    console.error('[CORS] blocked origin', { origin, normalized, origins });
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json());

const { checkBlacklist, detectMaliciousPatterns, loginRateLimit } = require('./middleware/securityMiddleware');
app.use(checkBlacklist);
app.use('/api/auth/login', loginRateLimit);
app.use(detectMaliciousPatterns);

const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '120', 10);
app.use((req, res, next) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const bucket = rateBuckets.get(ip) || { count: 0, ts: now };
    if (now - bucket.ts > RATE_LIMIT_WINDOW_MS) { bucket.count = 0; bucket.ts = now; }
    bucket.count += 1;
    rateBuckets.set(ip, bucket);
    if (bucket.count > RATE_LIMIT_MAX) return res.status(429).json({ error: 'Too many requests' });
  } catch (e) { }
  next();
});

const securityRoutes = require('./routes/securityRoutes');
app.use('/api/security', securityRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const userRoutes = require('./routes/userRoutes');
app.use('/api/usuarios', userRoutes);

const webUserRoutes = require('./routes/webUserRoutes');
app.use('/api/usuarios-web', webUserRoutes);

const comandoRoutes = require('./routes/comandoRoutes');
app.use('/api/comandos', comandoRoutes);

const pagoRoutes = require('./routes/pagoRoutes');
app.use('/api/pagos', pagoRoutes);

const consultasRoutes = require('./routes/consultasRoutes');
app.use('/api/consultas', consultasRoutes);

const notificacionesRoutes = require('./routes/notificacionesRoutes');
app.use('/api/notificaciones', notificacionesRoutes);

const telethonRoutes = require('./routes/telethonRoutes');
app.use('/api/telethon', telethonRoutes);

const apiTokenRoutes = require('./routes/apiTokenRoutes');
app.use('/api/api-tokens', apiTokenRoutes);

const apiPublicRoutes = require('./routes/apiPublicRoutes');
app.use('/v1', apiPublicRoutes);

const panelRoutes = require('./routes/panelRoutes');
app.use('/api/panel', panelRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const configRoutes = require('./routes/configRoutes');
app.use('/', configRoutes);

const ROOT_DIR = path.resolve(__dirname, '..');
const RESPUESTAS_DIR = path.join(ROOT_DIR, 'data', 'respuestas');
const ASSETS_DIR = path.join(ROOT_DIR, 'assets');

app.get('/files/respuestas/:filename', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(RESPUESTAS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) return res.sendFile(filePath);
  return res.status(404).send('Archivo no encontrado');
});

app.get('/files/assets/:filename', (req, res) => {
  const fs = require('fs');
  const filePath = path.join(ASSETS_DIR, req.params.filename);
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const ext = path.extname(req.params.filename).toLowerCase();
    const contentTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    const contentType = contentTypes[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', stats.size);
    return res.sendFile(filePath);
  }
  return res.status(404).send('Asset no encontrado');
});

const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();
const CLEAN_INTERVAL_MS = 5 * 60 * 1000;
async function cleanupOldData() {
  try {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    await prisma.ledger.updateMany({ where: { cq: { not: null }, creadaEn: { lt: cutoff } }, data: { cq: null } });
    await prisma.consulta.deleteMany({ where: { creadaEn: { lt: cutoff } } });
    await prisma.ledger.deleteMany({ where: { creadaEn: { lt: cutoff } } });
  } catch (e) { }
}
setInterval(cleanupOldData, CLEAN_INTERVAL_MS);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor backend escuchando en el puerto ${PORT}`);
});
