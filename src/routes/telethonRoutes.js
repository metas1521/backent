const express = require('express');
const fs = require('fs');
const path = require('path');

// Asegurar que tome el .env desde la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const router = express.Router();
const TELETHON_KEY = process.env.TELETHON_KEY || '';

// Ruta absoluta al archivo de comandos compartido con Telethon
// Importante: Telethon usa ROOT_DIR en la RAÍZ del proyecto (DOX),
// aquí subimos 2 niveles desde panel-backend/src/routes → DOX/
// Subimos 3 niveles desde panel-backend/src/routes → panel-backend/ → dox/
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
// Ajuste: usar los mismos archivos que el bot en dox/bot
const BOT_DIR = path.join(ROOT_DIR, 'bot');
const COMANDOS_FILE = path.join(BOT_DIR, 'comandos_pendientes_bot.json');
// Directorios de respuestas a limpiar (algunas instalaciones usan bot/respuestas_bot y otras bot/bot/respuestas_bot)
const RESPUESTAS_DIRS = [
  path.join(BOT_DIR, 'respuestas_bot'),
  path.join(BOT_DIR, 'bot', 'respuestas_bot')
];

const getRespDir = () => {
  for (const d of RESPUESTAS_DIRS) {
    if (fs.existsSync(d)) return d;
  }
  return RESPUESTAS_DIRS[0];
};

// Limpia archivos de respuestas más antiguos que ttlMs (por defecto 120s) en todos los directorios conocidos
const pruneOldResponses = (ttlMs = 120_000) => {
  const now = Date.now();
  for (const dir of RESPUESTAS_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of files) {
        if (f.isDirectory()) continue;
        const full = path.join(dir, f.name);
        try {
          const st = fs.statSync(full);
          if ((now - st.mtimeMs) > ttlMs) {
            fs.unlinkSync(full);
            const cap = `${full}.caption`;
            if (fs.existsSync(cap)) fs.unlinkSync(cap);
            console.log(`[telethon/mensajes] purgado por TTL: ${full}`);
          }
        } catch (err) {
          console.log(`[telethon/mensajes] no se pudo purgar ${full}:`, err.message);
        }
      }
    } catch (err) {
      console.log('[telethon/mensajes] error al purgar TTL:', err.message);
    }
  }
};

// Middleware para medir tiempo de respuesta
const measureResponseTime = (req, res, next) => {
  req.startTime = Date.now();
  next();
};

// Aplicar middleware a todas las rutas de telethon
router.use(measureResponseTime);

// Protege rutas de telethon con llave opcional
router.use((req, res, next) => {
  if (!TELETHON_KEY) return next(); // si no está configurada, no se fuerza
  const key = req.headers['x-telethon-key'] || req.headers['x-api-key'] || '';
  if (key !== TELETHON_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Limpieza inmediata al iniciar y cada 30s en segundo plano
pruneOldResponses();
setInterval(() => {
  pruneOldResponses();
}, 30_000);

router.post('/enviar', async (req, res) => {
  try {
    const { consulta, user_id, chat_id } = req.body || {};
    console.log(`[telethon/enviar] consulta='${consulta}' user_id='${user_id}' chat_id='${chat_id}'`);
    if (!consulta || typeof consulta !== 'string') {
      return res.status(400).json({ error: 'consulta requerida' });
    }

    // Cargar lista existente
    let comandos = [];
    try {
      if (fs.existsSync(COMANDOS_FILE)) {
        const raw = fs.readFileSync(COMANDOS_FILE, 'utf-8');
        comandos = JSON.parse(raw || '[]');
      }
    } catch {
      comandos = [];
    }

    // Agregar nuevo comando
    comandos.push({
      consulta: String(consulta),
      user_id: String(user_id || 'WEB-UI'),
      chat_id: String(chat_id || 'WEB-UI'),
      timestamp: new Date().toISOString()
    });

    // Asegurar carpeta y escribir archivo
    fs.mkdirSync(path.dirname(COMANDOS_FILE), { recursive: true });
    fs.writeFileSync(COMANDOS_FILE, JSON.stringify(comandos, null, 2), 'utf-8');
    console.log(`[telethon/enviar] agregado en ${COMANDOS_FILE}. total=${comandos.length}`);

    // Simulador opcional de respuesta (para demo/desarrollo)
    if (String(process.env.DEV_TELETHON_SIM || '').toLowerCase() === 'true') {
      try {
        const RESPUESTAS_DIR = getRespDir();
        fs.mkdirSync(RESPUESTAS_DIR, { recursive: true });
        const ts = Date.now();
        const simulated = `Respuesta demo (simulada) para: ${String(consulta)}\n\nEstado: OK`;
        const outFile = path.join(RESPUESTAS_DIR, `${String(user_id || 'WEB-UI')}_${ts}.txt`);
        fs.writeFileSync(outFile, simulated, 'utf-8');
      } catch {}
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo encolar el comando' });
  }
});

// Obtener mensajes de respuesta para un user_id (solo texto/captions)
router.get('/mensajes', async (req, res) => {
  try {
    const userId = String(req.query.user_id || '').trim();
    const sinceMs = Number(req.query.sinceMs || 0);
    const prefer = String(req.query.prefer || '').trim().toLowerCase();
    const purge = String(req.query.purge || 'true').toLowerCase() === 'true';
    pruneOldResponses(); // TTL de 60s
    console.log(`[telethon/mensajes] user_id='${userId}' sinceMs=${sinceMs}`);
    if (!userId) return res.status(400).json({ error: 'user_id requerido' });
    const RESPUESTAS_DIR = getRespDir();
    if (!RESPUESTAS_DIR || !fs.existsSync(RESPUESTAS_DIR)) return res.json([]);

    // Recolectar archivos del usuario tanto en raíz como en subcarpetas de grupo
    const collected = [];
    const pushEntry = (relPath) => {
      try {
        const full = path.join(RESPUESTAS_DIR, relPath);
        const st = fs.statSync(full);
        collected.push({ file: relPath, at: st.mtimeMs, full });
      } catch {}
    };

    // Archivos en raíz - optimizado para búsqueda rápida
    try {
      const files = fs.readdirSync(RESPUESTAS_DIR);
      console.log(`[telethon/mensajes] Archivos en directorio:`, files);
      
      for (const f of files) {
        // Buscar archivos del usuario con diferentes prefijos posibles
        const isUserFile = f.startsWith(`${userId}_`) || 
                          f.startsWith(`WEB-${userId}_`) || 
                          f.startsWith(`WEB-${userId.padStart(2, '0')}_`) ||
                          f.startsWith(`WEB-${userId.padStart(1, '0')}_`);
        
        if (!isUserFile) continue;
        if (!/\.(txt|caption|jpg|jpeg|png|webp|pdf)$/i.test(f)) continue;
        
        console.log(`[telethon/mensajes] Archivo del usuario encontrado:`, f);
        pushEntry(f);
      }
    } catch (error) {
      console.log(`[telethon/mensajes] Error leyendo directorio raíz:`, error.message);
    }

    // Subcarpetas de grupos del usuario - optimizado
    try {
      const dirs = fs.readdirSync(RESPUESTAS_DIR, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        
        // Buscar directorios del usuario con diferentes prefijos
        const isUserDir = d.name.startsWith(`${userId}_group_`) || 
                         d.name.startsWith(`WEB-${userId}_group_`) || 
                         d.name.startsWith(`WEB-${userId.padStart(2, '0')}_group_`) ||
                         d.name.startsWith(`WEB-${userId.padStart(1, '0')}_group_`);
        
        if (!isUserDir) continue;
        
        const dir = path.join(RESPUESTAS_DIR, d.name);
        try {
          const groupFiles = fs.readdirSync(dir);
          for (const f of groupFiles) {
            if (!/\.(txt|caption|jpg|jpeg|png|webp|pdf)$/i.test(f)) continue;
            pushEntry(path.join(d.name, f));
          }
        } catch (error) {
          console.log(`[telethon/mensajes] Error leyendo subdirectorio ${d.name}:`, error.message);
        }
      }
    } catch (error) {
      console.log(`[telethon/mensajes] Error leyendo subdirectorios:`, error.message);
    }

    console.log(`[telethon/mensajes] Archivos recolectados:`, collected.length);
    console.log(`[telethon/mensajes] Detalles de archivos:`, collected.map(c => ({ file: c.file, at: c.at })));

    let entries = collected
      .filter(e => !sinceMs || e.at > sinceMs)
      .sort((a, b) => a.at - b.at);

    console.log(`[telethon/mensajes] Entries después del filtro de tiempo:`, entries.length);
    console.log(`[telethon/mensajes] sinceMs:`, sinceMs);
    console.log(`[telethon/mensajes] Entries:`, entries.map(e => ({ file: e.file, at: e.at })));

    // Para comandos multi como /dnivir, ser más permisivo con el tiempo
    if (prefer === 'multi' && entries.length === 0) {
      console.log(`[telethon/mensajes] Comando MULTI sin items recientes, buscando en los últimos 5 minutos...`);
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      const recentEntries = collected
        .filter(e => e.at > fiveMinutesAgo)
        .sort((a, b) => a.at - b.at);
      
      console.log(`[telethon/mensajes] Entries recientes encontrados:`, recentEntries.length);
      if (recentEntries.length > 0) {
        entries = recentEntries;
        console.log(`[telethon/mensajes] Usando entries recientes en lugar de filtro estricto`);
      }
    }

    // Para comandos multi, ignorar completamente el filtro de tiempo
    if (prefer === 'multi') {
      console.log(`[telethon/mensajes] Comando MULTI detectado - ignorando filtro de tiempo`);
      entries = collected.sort((a, b) => a.at - b.at);
      console.log(`[telethon/mensajes] Entries para MULTI (sin filtro de tiempo):`, entries.length);
      console.log(`[telethon/mensajes] Entries detallados:`, entries.map(e => ({ file: e.file, at: e.at, full: e.full })));
      
      // Para comandos multi, también ignorar el filtro de sinceMs en el procesamiento
      console.log(`[telethon/mensajes] Comando MULTI: Procesando TODOS los archivos sin filtros de tiempo`);
    } else {
      // Solo para comandos no-multi, aplicar filtro de tiempo
      entries = collected
        .filter(e => !sinceMs || e.at > sinceMs)
        .sort((a, b) => a.at - b.at);
      console.log(`[telethon/mensajes] Comando NO-MULTI: Aplicando filtro de tiempo, entries:`, entries.length);
    }

    // Construir salida: agrupar captions con sus medios y omitir emitir .caption por separado
    let out = entries.map(e => {
      const rel = e.file.replace(/\\/g, '/');
      const lower = rel.toLowerCase();
      const relUrl = `/files/respuestas/${rel.split('/').map(encodeURIComponent).join('/')}`;
      
      console.log(`[telethon/mensajes] Procesando archivo:`, { file: rel, lower: lower, type: 'unknown' });
      
      if (lower.endsWith('.txt')) {
        try {
          const result = { file: rel, at: e.at, type: 'text', text: fs.readFileSync(e.full, 'utf-8') };
          console.log(`[telethon/mensajes] Archivo de texto procesado:`, result.file);
          return result;
        } catch (error) {
          console.log(`[telethon/mensajes] Error leyendo archivo de texto ${e.full}:`, error.message);
          return { file: rel, at: e.at, type: 'text', text: 'Error leyendo archivo' };
        }
      }
      
      if (/(\.jpg|\.jpeg|\.png|\.webp)$/i.test(lower)) {
        let captionText = '';
        try {
          const capFull = `${e.full}.caption`;
          if (fs.existsSync(capFull)) captionText = fs.readFileSync(capFull, 'utf-8');
        } catch (error) {
          console.log(`[telethon/mensajes] Error leyendo caption de imagen ${e.full}:`, error.message);
        }
        const result = { file: rel, at: e.at, type: 'image', url: relUrl, caption: captionText };
        console.log(`[telethon/mensajes] Imagen procesada:`, result.file, result.type, 'URL:', result.url);
        return result;
      }
      
      if (lower.endsWith('.pdf')) {
        let captionText = '';
        try {
          const capFull = `${e.full}.caption`;
          if (fs.existsSync(capFull)) captionText = fs.readFileSync(capFull, 'utf-8');
        } catch (error) {
          console.log(`[telethon/mensajes] Error leyendo caption de PDF ${e.full}:`, error.message);
        }
        const result = { file: rel, at: e.at, type: 'pdf', url: relUrl, caption: captionText };
        console.log(`[telethon/mensajes] PDF procesado:`, result.file, result.type);
        return result;
      }
      
      // Omitir .caption aislados para evitar duplicados
      if (lower.endsWith('.caption')) {
        console.log(`[telethon/mensajes] Omitiendo archivo .caption:`, rel);
        return null;
      }
      
      console.log(`[telethon/mensajes] Archivo de tipo desconocido:`, rel);
      return { file: rel, at: e.at, type: 'unknown' };
    }).filter(Boolean);

    console.log(`[telethon/mensajes] Out después del mapeo:`, out.length);
    console.log(`[telethon/mensajes] Out detallado:`, out.map(item => ({ file: item.file, type: item.type, at: item.at, url: item.url })));

    // Purga opcional (por defecto true) para que las respuestas usadas por la API se borren
    if (purge && entries.length) {
      for (const e of entries) {
        try {
          fs.unlinkSync(e.full);
          const cap = `${e.full}.caption`;
          if (fs.existsSync(cap)) fs.unlinkSync(cap);
          console.log(`[telethon/mensajes] Archivo purgado: ${e.full}`);
        } catch (err) {
          console.log(`[telethon/mensajes] No se pudo borrar ${e.full}:`, err.message);
        }
      }
    }

    // Preferencias de formato (p. ej., para /seeker devolver solo PDF)
    if (prefer === 'pdf') {
      const onlyPdf = out.filter((x) => x && x.type === 'pdf');
      if (onlyPdf.length > 0) {
        // devolver solo el más reciente para evitar duplicados
        const last = onlyPdf.sort((a,b)=>a.at - b.at)[onlyPdf.length - 1];
        out = [last];
      }
    }
    
    // Para comandos que retornan múltiples archivos (como /dnivir), agrupar por tipo
    if (prefer === 'multi') {
      console.log(`[telethon/mensajes] Procesando comando MULTI con ${out.length} items`);
      
      // Para comandos multi, mantener TODAS las imágenes y textos
      const images = out.filter((x) => x && x.type === 'image');
      const texts = out.filter((x) => x && x.type === 'text');
      const pdfs = out.filter((x) => x && x.type === 'pdf');
      
      console.log(`[telethon/mensajes] MULTI - Imágenes: ${images.length}, Textos: ${texts.length}, PDFs: ${pdfs.length}`);
      
      // Mantener todos los elementos, ordenados por tiempo
      out = [...images, ...texts, ...pdfs].sort((a,b)=>a.at - b.at);
      
      console.log(`[telethon/mensajes] MULTI - Resultado final: ${out.length} items`);
    }

    // Colapsar duplicados: si hay imagen con caption, remover textos idénticos o cercanos
    if (prefer !== 'pdf' && out.length) {
      const toRemove = new Set();
      const norm = (s) => String(s||'').replace(/\s+/g,' ').trim();
      // Remover textos duplicados del caption de imágenes
      out.forEach((itemI, i) => {
        if (itemI && itemI.type === 'image' && itemI.caption) {
          const cap = norm(itemI.caption);
          out.forEach((itemJ, j) => {
            if (i===j || !itemJ || itemJ.type !== 'text') return;
            const txt = norm(itemJ.text);
            const closeInTime = Math.abs((itemI.at||0) - (itemJ.at||0)) <= 5000; // ±5s
            if (txt && cap && (txt === cap || closeInTime)) {
              toRemove.add(j);
            }
          });
        }
      });
      if (toRemove.size) {
        out = out.filter((_, idx) => !toRemove.has(idx));
      }

      // Unificar múltiples imágenes del mismo archivo: conservar la más reciente
      const bestByFile = new Map();
      out.forEach((it) => {
        if (!it || it.type !== 'image') return;
        const key = it.file.toLowerCase();
        const prev = bestByFile.get(key);
        if (!prev || (it.at||0) > (prev.at||0)) bestByFile.set(key, it);
      });
      if (bestByFile.size) {
        out = out.filter((it) => it.type !== 'image')
          .concat(Array.from(bestByFile.values()))
          .sort((a,b)=>a.at-b.at);
      }
    }
    
    console.log(`[telethon/mensajes] retornando ${out.length} mensajes en ${Date.now() - req.startTime || 0}ms`);
    return res.json(out);
  } catch (e) {
    console.error('[telethon/mensajes] Error:', e);
    return res.status(500).json({ error: 'No se pudo leer mensajes' });
  }
});

router.get('/health', (req, res) => {
  res.json({ ok: true, COMANDOS_FILE, RESPUESTAS_DIR });
});

module.exports = router;


