const { PrismaClient } = require('../../generated/prisma');
const axios = require('axios');
const prisma = new PrismaClient();

const getBearerToken = (req) => {
    const auth = req.headers.authorization || req.headers.Authorization;
    if (!auth) return null;
    const parts = auth.split(' ');
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) return parts[1];
    return null;
};

const isExpired = (fechaExp) => {
    if (!fechaExp) return false;
    return new Date(fechaExp).getTime() < Date.now();
};

const commandAllowed = async (tokenId, cmdName) => {
    // Si no hay configuración explícita, se permiten todos
    const count = await prisma.apiTokenComando.count({ where: { apiTokenId: tokenId } });
    if (count === 0) return true;
    const exists = await prisma.apiTokenComando.findFirst({
        where: {
            apiTokenId: tokenId,
            comando: { nombre: cmdName },
            permitido: true
        }
    });
    return !!exists;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sendToBot = async ({ consulta, userId }) => {
    const base = process.env.INTERNAL_API_URL || 'http://localhost:5000';
    const telethonKey = process.env.TELETHON_KEY || '';
    const headers = telethonKey ? { 'x-telethon-key': telethonKey } : {};
    await axios.post(
        `${base}/api/telethon/enviar`,
        { consulta, user_id: userId, chat_id: userId },
        { timeout: 2000, headers }
    );
};

const pollResponses = async ({ userId, sinceMs, prefer }) => {
    const base = process.env.INTERNAL_API_URL || 'http://localhost:5000';
    const telethonKey = process.env.TELETHON_KEY || '';
    const headers = telethonKey ? { 'x-telethon-key': telethonKey } : {};
    const resp = await axios.get(`${base}/api/telethon/mensajes`, {
        params: { user_id: userId, sinceMs, prefer },
        timeout: 2000,
        headers
    });
    return resp.data || [];
};

// Sanitiza textos para API pública (remueve branding y líneas sensibles)
const sanitizeApiText = (txt = '') => {
    const lines = String(txt || '').split(/\r?\n/);
    const filtered = lines.filter(l => {
        const ll = l.toLowerCase();
        return !ll.includes('ghostset') && !ll.includes('coins:') && !ll.includes('🪙');
    });
    return filtered.join('\n').trim();
};

exports.handle = async (req, res) => {
    try {
        const cmd = `/${req.params.cmd || ''}`.toLowerCase();
        const tokenString = getBearerToken(req);
        if (!tokenString) return res.status(401).json({ error: 'Falta Authorization Bearer' });

        const token = await prisma.apiToken.findFirst({
            where: { token: tokenString },
            include: {
                comandos: { include: { comando: true } },
                usuario: true
            }
        });
        if (!token) return res.status(401).json({ error: 'Token no válido' });
        if (token.estado !== 'activo') return res.status(403).json({ error: 'Token inactivo' });
        if (isExpired(token.fechaExp)) return res.status(403).json({ error: 'Token vencido' });

        // Límite diario
        if (token.limiteDiario && token.usosHoy >= token.limiteDiario) {
            return res.status(429).json({ error: 'Límite diario alcanzado' });
        }

        // Comando permitido
        const allowed = await commandAllowed(token.id, cmd);
        if (!allowed) return res.status(403).json({ error: 'Comando no permitido para este token' });

        // Incrementar usosHoy
        await prisma.apiToken.update({
            where: { id: token.id },
            data: {
                usosHoy: token.usosHoy + 1,
                ultimoUso: new Date()
            }
        });

        // Construir consulta para el bot objetivo
        const buildConsulta = (cmdName, q) => {
            const parts = [cmdName];
            const unico = q.numero || q.documento || q.param;
            if (unico) parts.push(unico);
            return parts.join(' ').trim();
        };
        const consultaBot = buildConsulta(cmd, req.query);
        // Permitir override via query ?user_id= (por ejemplo para usar el user_id de Telegram del bot)
        const userIdOverride = req.query.user_id ? String(req.query.user_id) : null;
        const userIdBot =
            userIdOverride ||
            (token.usuario?.user_id ? String(token.usuario.user_id) : null) ||
            (token.usuarioId ? String(token.usuarioId) : null) ||
            `API-${token.id}`;

        // Enviar al bot (cola telethon)
        await sendToBot({ consulta: consultaBot, userId: userIdBot });

        // Poll de respuestas en archivos (telethon/mensajes)
        const sinceMs = Date.now() - 1000;
        let respuestas = [];
        // Primer intento: poll acotado por tiempo reciente
        for (let i = 0; i < 8; i++) { // ~8s
            await delay(1000);
            respuestas = await pollResponses({ userId: userIdBot, sinceMs });
            if (respuestas && respuestas.length > 0) break;
        }
        // Fallback: buscar sin filtro de tiempo (prefer=multi)
        if (!respuestas || respuestas.length === 0) {
            respuestas = await pollResponses({ userId: userIdBot, sinceMs: 0, prefer: 'multi' });
        }
        if (!respuestas || respuestas.length === 0) {
            return res.status(202).json({ ok: false, mensaje: 'Sin respuesta del bot (timeout)' });
        }

        // Mapear respuestas
        const urls = [];
        const texts = [];
        respuestas.forEach((r) => {
            if (r.type === 'text') {
                const t = sanitizeApiText(r.text);
                if (t) texts.push(t);
            }
            if (r.type === 'file' || r.type === 'image') {
                const u = r.url || r.relUrl || r.file;
                if (u) urls.push(u);
            }
        });

        // Formato minimalista: si hay un solo resultado, devolverlo directo en data (string)
        if (urls.length === 1 && texts.length === 0) {
            return res.json({ ok: true, data: urls[0] });
        }
        if (texts.length === 1 && urls.length === 0) {
            return res.json({ ok: true, data: texts[0] });
        }
        return res.json({ ok: true, data: { urls, texts } });
    } catch (e) {
        console.error('[api-public] error', e);
        res.status(500).json({ error: 'Error interno en la API pública' });
    }
};

