const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const axios = require('axios');
const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

const cleanIP = (ip) => {
    if (!ip) return 'unknown';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();
    return ip.replace(/^::ffff:/, '');
};

// Geolocalización opcional (best-effort). Usa ipapi.co; configurable con GEOIP_URL.
const geoCache = new Map();
const GEO_TTL_MS = 10 * 60 * 1000; // 10 min
const fetchGeo = async (ip) => {
    const now = Date.now();
    const cached = geoCache.get(ip);
    if (cached && now - cached.ts < GEO_TTL_MS) return cached.data;
    const base = process.env.GEOIP_URL || `https://ipapi.co/${ip}/json/`;
    try {
        const resp = await axios.get(base, { timeout: 1500 });
        const d = resp.data || {};
        const data = {
            country: d.country_name || d.country || null,
            city: d.city || null,
            isp: d.org || d.asn || null,
            timezone: d.timezone || null
        };
        geoCache.set(ip, { ts: now, data });
        return data;
    } catch {
        return {};
    }
};

// Rate limiter para login (versión simplificada sin Redis)
const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // 5 intentos
    message: { error: 'Demasiados intentos de login. IP bloqueada temporalmente.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log('🚨 RATE LIMIT EXCEDIDO - IP:', req.ip);
        res.status(429).json({
            error: 'Demasiados intentos de login',
            blocked: true,
            reason: 'Rate limit exceeded',
            blockedUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString()
        });
    },
    keyGenerator: (req) => {
        // Usar el helper ipKeyGenerator para manejar correctamente IPv6
        const baseKey = ipKeyGenerator(req);
        
        // Verificar headers de proxy si están disponibles
        const proxyIP = req.get('X-Real-IP') || req.get('X-Forwarded-For');
        
        if (proxyIP) {
            // Si hay un IP de proxy, usar ese pero procesarlo correctamente
            // Tomar la primera IP si hay múltiples (X-Forwarded-For puede tener varias)
            const firstProxyIP = proxyIP.split(',')[0].trim();
            // Limpiar prefijos IPv6 comunes
            const cleanIP = firstProxyIP.replace(/^::ffff:/, '');
            return `proxy:${cleanIP}`;
        }
        
        // Si no hay proxy, usar la clave base del helper que maneja IPv6 correctamente
        return baseKey || 'unknown';
    }
});

// Middleware para detectar patrones maliciosos (versión mejorada)
const detectMaliciousPatterns = async (req, res, next) => {
    try {
        // EXCEPCIONES: Rutas que NO deben ser bloqueadas por patrones
        const excludedRoutes = [
            '/api/usuarios/registrar',   // Permitir registro de usuarios del bot
            '/api/usuarios/verificar',   // Permitir verificación de usuarios
            '/api/telethon',             // Permitir comandos del bot
            '/api/comandos',             // Permitir comandos del sistema
            '/api/notificaciones'        // Permitir notificaciones (panel)
        ];
        
        // Si la ruta está excluida, permitir acceso
        if (excludedRoutes.some(route => req.path.startsWith(route))) {
            console.log(`🔓 Ruta excluida de verificación de patrones: ${req.path}`);
            return next();
        }
        
        // Verificar que req.body y req.query existan antes de procesarlos
        const body = req.body ? JSON.stringify(req.body).toLowerCase() : '';
        const query = req.query ? JSON.stringify(req.query).toLowerCase() : '';
        
        // Patrones de SQL Injection (más específicos)
        const sqlPatterns = [
            'select * from', 'union select', 'drop table', 'delete from', 'insert into', 'update set',
            'or 1=1--', 'admin--', '/*', '*/', '--', ';--'
        ];
        
        // Patrones de XSS (más específicos)
        const xssPatterns = [
            '<script', 'javascript:', 'onload=', 'onerror=', 'onclick=',
            'alert(', 'prompt(', 'confirm(', 'eval(', 'document.cookie'
        ];
        
        // Patrones de comandos del sistema (más específicos y menos agresivos)
        const cmdPatterns = [
            'rm -rf', 'del /f', 'format c:', 'shutdown', 'reboot',
            'net user', 'whoami', 'dir /s', 'ls -la'
        ];
        
        // Patrones de inyección de comandos (más específicos)
        const injectionPatterns = [
            '|', '&&', '||', ';', '`', '$('
        ];
        
        const allPatterns = [...sqlPatterns, ...xssPatterns, ...cmdPatterns, ...injectionPatterns];
        
        for (const pattern of allPatterns) {
            if (body.includes(pattern) || query.includes(pattern)) {
                const ipClean = cleanIP(req.ip);
                console.log('🚨 PATRÓN MALICIOSO DETECTADO:', pattern, 'IP:', ipClean, 'Ruta:', req.path);
                let geo = {};
                try {
                    geo = await fetchGeo(ipClean);
                } catch {}
                try {
                    await prisma.securityLog.create({
                        data: {
                            ip: ipClean,
                            path: req.path,
                            method: req.method,
                            userAgent: req.get('user-agent') || '',
                            reason: pattern,
                            severity: 'high',
                            country: geo.country || null,
                            city: geo.city || null,
                            isp: geo.isp || null,
                            timezone: geo.timezone || null
                        }
                    });
                } catch (e) {
                    console.log('⚠️ No se pudo guardar log de seguridad:', e.message);
                }
                // Bloquear temporalmente la IP por 15 min
                try {
                    await prisma.blockedIP.upsert({
                        where: { ip: ipClean },
                        create: { ip: ipClean, reason: `pattern:${pattern}`, until: new Date(Date.now() + 15 * 60 * 1000) },
                        update: { reason: `pattern:${pattern}`, until: new Date(Date.now() + 15 * 60 * 1000) }
                    });
                } catch {}
                return res.status(403).json({
                    error: 'Acceso denegado',
                    blocked: true,
                    reason: 'Patrón malicioso detectado',
                    pattern: pattern
                });
            }
        }
        
        next();
    } catch (error) {
        console.error('Error en detección de patrones maliciosos:', error);
        next();
    }
};

// Middleware para verificar blacklist (versión simplificada)
const checkBlacklist = async (req, res, next) => {
    try {
        const ipClean = cleanIP(req.ip);
        // Rechazar si está bloqueada y no ha expirado
        const blocked = await prisma.blockedIP.findUnique({ where: { ip: ipClean } });
        if (blocked) {
            if (!blocked.until || blocked.until > new Date()) {
                return res.status(403).json({ error: 'IP bloqueada', blocked: true });
            } else {
                // bloqueo expirado, eliminar
                await prisma.blockedIP.delete({ where: { ip: ipClean } });
            }
        }
        next();
    } catch (e) {
        console.error('Error en blacklist:', e);
        next();
    }
};

// API para gestión de seguridad (versión simplificada)
const securityAPI = {
    getAttackLogs: async (req, res) => {
        try {
            const logs = await prisma.securityLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 200
            });
            res.json({ logs, total: logs.length });
        } catch (e) {
            res.status(500).json({ error: 'No se pudo obtener logs' });
        }
    },
    
    blockIP: async (req, res) => {
        try {
            const { ip, reason, duration } = req.body || {};
            if (!ip) return res.status(400).json({ error: 'IP requerida' });
            const until = duration ? new Date(Date.now() + Number(duration) * 1000) : null;
            await prisma.blockedIP.upsert({
                where: { ip },
                create: { ip, reason: reason || 'manual', until },
                update: { reason: reason || 'manual', until }
            });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'No se pudo bloquear IP' });
        }
    },
    
    unblockIP: async (req, res) => {
        try {
            const ip = req.params.ip;
            if (!ip) return res.status(400).json({ error: 'IP requerida' });
            await prisma.blockedIP.deleteMany({ where: { ip } });
            res.json({ success: true });
        } catch (e) {
            res.status(500).json({ error: 'No se pudo desbloquear IP' });
        }
    },
    
    getSecurityStats: async (req, res) => {
        try {
            const logs = await prisma.securityLog.findMany({
                orderBy: { createdAt: 'desc' },
                take: 200
            });
            const totalAttacks = await prisma.securityLog.count();
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const last24Hours = await prisma.securityLog.count({ where: { createdAt: { gte: since24h } } });
            const countryStats = {};
            const attackTypeStats = {};
            logs.forEach(l => {
                const country = l.country || 'N/A';
                countryStats[country] = (countryStats[country] || 0) + 1;
                const attack = l.reason || 'desconocido';
                attackTypeStats[attack] = (attackTypeStats[attack] || 0) + 1;
            });
            res.json({
                totalAttacks,
                recentAttacks: logs,
                countryStats,
                attackTypeStats,
                last24Hours
            });
        } catch (e) {
            res.status(500).json({ error: 'No se pudo obtener estadísticas' });
        }
    }
};

module.exports = {
    loginRateLimit,
    checkBlacklist,
    detectMaliciousPatterns,
    securityAPI
};
