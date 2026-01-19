const express = require('express');
const router = express.Router();
const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');

// Archivo JSON para almacenar notificaciones pendientes (simple, sin BD)
const NOTIFICACIONES_FILE = path.join(__dirname, '..', '..', 'data', 'notificaciones_pendientes.json');

// Asegurar que el directorio existe
const dataDir = path.join(__dirname, '..', '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Función para leer notificaciones pendientes
function leerNotificacionesPendientes() {
  try {
    if (fs.existsSync(NOTIFICACIONES_FILE)) {
      const data = fs.readFileSync(NOTIFICACIONES_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error leyendo notificaciones:', e);
  }
  return [];
}

// Función para guardar notificaciones pendientes
function guardarNotificacionesPendientes(notificaciones) {
  try {
    fs.writeFileSync(NOTIFICACIONES_FILE, JSON.stringify(notificaciones, null, 2), 'utf8');
  } catch (e) {
    console.error('Error guardando notificaciones:', e);
  }
}

// Ruta para enviar/crear notificación
router.post('/enviar', async (req, res) => {
  try {
    const payload = req.body || {};
    console.log('📨 [NOTIFICACIONES] Payload recibido:', JSON.stringify(payload, null, 2));
    
    // Obtener usuarios según filtros
    const filtros = payload.filtros || {};
    
    // Construir where clause para Prisma según filtros
    let whereClause = {
      tipo: 'telegram_bot' // Solo usuarios del bot
    };
    
    // Aplicar filtros de audiencia
    if (filtros.audiencia === 'activos') {
      whereClause.activo = true;
    } else if (filtros.audiencia === 'inactivos') {
      whereClause.activo = false;
    } else if (filtros.audiencia === 'con_plan') {
      whereClause.tipo_activacion = 'plan';
      whereClause.plan_activo = true;
    } else if (filtros.audiencia === 'sin_plan') {
      // Usuarios sin plan: no tienen tipo_activacion='plan' O no tienen plan_activo=true
      whereClause.OR = [
        { tipo_activacion: { not: 'plan' } },
        { plan_activo: { not: true } },
        { tipo_activacion: null }
      ];
    }
    // Si audiencia === 'todos' o no hay filtro, NO aplicamos filtro de activo (incluye TODOS los usuarios registrados)
    
    // Aplicar filtro de nivel de acceso si existe
    if (filtros.nivelAcceso) {
      whereClause.nivelAccesoId = parseInt(filtros.nivelAcceso);
    }
    
    console.log(`📊 [NOTIFICACIONES] Filtro de audiencia: ${filtros.audiencia || 'todos (sin filtro)'}`);
    console.log(`📊 [NOTIFICACIONES] Where clause:`, JSON.stringify(whereClause, null, 2));
    
    // Obtener usuarios con los filtros aplicados
    let usuarios = await prisma.usuario.findMany({
      where: whereClause,
      select: {
        user_id: true,
        username: true,
        activo: true,
        nivelAccesoId: true,
        tipo_activacion: true,
        plan_activo: true
      }
    });
    
    console.log(`📊 [NOTIFICACIONES] Usuarios encontrados: ${usuarios.length}`);
    
    // Desglose completo por estado activo y plan
    const activos = usuarios.filter(u => u.activo === true).length;
    const inactivos = usuarios.filter(u => u.activo === false).length;
    const conPlan = usuarios.filter(u => u.tipo_activacion === 'plan' && u.plan_activo === true).length;
    const sinPlan = usuarios.filter(u => !u.tipo_activacion || u.tipo_activacion !== 'plan' || u.plan_activo !== true).length;
    
    console.log(`📊 [NOTIFICACIONES] Desglose completo:`, {
      activos: activos,
      inactivos: inactivos,
      conPlan: conPlan,
      sinPlan: sinPlan,
      total: usuarios.length
    });
    
    // Validación: Si el filtro es "todos", verificar que incluya todos los tipos
    if (filtros.audiencia === 'todos' || !filtros.audiencia) {
      console.log(`✅ [NOTIFICACIONES] Filtro "todos" aplicado:`);
      console.log(`   - Activos: ${activos}, Inactivos: ${inactivos}`);
      console.log(`   - Con plan: ${conPlan}, Sin plan: ${sinPlan}`);
      console.log(`   - Total: ${usuarios.length} usuarios`);
      
      // Advertencias si parece que falta algún grupo
      if (inactivos === 0 && usuarios.length > 0 && activos === usuarios.length) {
        console.log(`   ℹ️  Todos los usuarios encontrados están activos (puede ser normal si no hay inactivos)`);
      }
      if (sinPlan === 0 && usuarios.length > 0 && conPlan === usuarios.length) {
        console.log(`   ℹ️  Todos los usuarios encontrados tienen plan (puede ser normal si todos tienen plan)`);
      }
      if (conPlan === 0 && usuarios.length > 0 && sinPlan === usuarios.length) {
        console.log(`   ℹ️  Ningún usuario tiene plan (puede ser normal si nadie tiene plan)`);
      }
    }
    
    // Procesar destinatarios específicos (IDs o usernames)
    const destinatariosEspecificos = payload.destinatarios || '';
    const usuariosEspecificosIds = new Set(usuarios.map(u => u.user_id)); // IDs ya incluidos por filtros
    
    if (destinatariosEspecificos && destinatariosEspecificos.trim() !== '') {
      console.log(`📋 [NOTIFICACIONES] Procesando destinatarios específicos: ${destinatariosEspecificos}`);
      
      // Separar por comas, saltos de línea o espacios
      const destinatariosList = destinatariosEspecificos
        .split(/[,\n\r]+/)
        .map(d => d.trim())
        .filter(d => d !== '');
      
      console.log(`📋 [NOTIFICACIONES] Destinatarios parseados: ${destinatariosList.length} items`);
      
      for (const destinatario of destinatariosList) {
        try {
          let usuarioEncontrado = null;
          let user_id_directo = null;
          console.log(`🔍 [NOTIFICACIONES] Procesando destinatario: "${destinatario}"`);
          
          // Primero verificar si es un user_id numérico directo (usuario externo)
          if (!isNaN(parseInt(destinatario)) && destinatario.trim().match(/^\d+$/)) {
            user_id_directo = destinatario.trim();
            console.log(`📱 [NOTIFICACIONES] Detectado como user_id directo: ${user_id_directo} (usuario externo)`);
            
            // Verificar si existe en BD (opcional, para tener info adicional)
            usuarioEncontrado = await prisma.usuario.findFirst({
              where: {
                tipo: 'telegram_bot',
                user_id: user_id_directo
              },
              select: {
                user_id: true,
                username: true,
                activo: true,
                nivelAccesoId: true,
                tipo_activacion: true,
                plan_activo: true
              }
            });
            
            if (usuarioEncontrado) {
              console.log(`✅ [NOTIFICACIONES] Usuario encontrado en BD por user_id: ${user_id_directo} -> username: @${usuarioEncontrado.username || 'N/A'}`);
            } else {
              console.log(`🌐 [NOTIFICACIONES] Usuario externo (no en BD) con user_id: ${user_id_directo}`);
            }
          } else {
            // Intentar buscar por username (con o sin @)
            const usernameLimpio = destinatario.replace(/^@/, '').trim();
            if (usernameLimpio) {
              console.log(`🔍 [NOTIFICACIONES] Buscando por username: "${usernameLimpio}"`);
              
              // SQLite no soporta mode: 'insensitive', buscar todos y filtrar en JavaScript
              const todosUsuarios = await prisma.usuario.findMany({
                where: {
                  tipo: 'telegram_bot'
                },
                select: {
                  user_id: true,
                  username: true,
                  activo: true,
                  nivelAccesoId: true,
                  tipo_activacion: true,
                  plan_activo: true
                }
              });
              
              // Buscar coincidencia exacta (case insensitive)
              usuarioEncontrado = todosUsuarios.find(u => 
                u.username && u.username.toLowerCase() === usernameLimpio.toLowerCase()
              );
              
              // Si no se encontró exacto, buscar parcial
              if (!usuarioEncontrado) {
                console.log(`🔍 [NOTIFICACIONES] Búsqueda exacta falló, intentando búsqueda parcial...`);
                const usuariosParciales = todosUsuarios.filter(u => 
                  u.username && u.username.toLowerCase().includes(usernameLimpio.toLowerCase())
                );
                
                if (usuariosParciales.length > 0) {
                  console.log(`📋 [NOTIFICACIONES] Encontrados ${usuariosParciales.length} usuarios con username similar:`);
                  usuariosParciales.forEach(u => {
                    console.log(`   - @${u.username} (user_id: ${u.user_id})`);
                  });
                  // Usar el primero que coincida exactamente (case insensitive)
                  usuarioEncontrado = usuariosParciales.find(u => 
                    u.username.toLowerCase() === usernameLimpio.toLowerCase()
                  ) || usuariosParciales[0];
                }
              }
              
              if (usuarioEncontrado) {
                console.log(`✅ [NOTIFICACIONES] Usuario encontrado por username: @${usuarioEncontrado.username} -> user_id: ${usuarioEncontrado.user_id}`);
              } else {
                console.log(`⚠️ [NOTIFICACIONES] Usuario con username "@${usernameLimpio}" no encontrado en BD`);
                console.log(`   💡 Se agregará como username externo, el bot lo resolverá a user_id`);
              }
            }
          }
          
          // Agregar usuario a la lista
          let user_id_final = null;
          let username_externo = null;
          
          if (usuarioEncontrado && usuarioEncontrado.user_id) {
            // Usuario encontrado en BD
            user_id_final = usuarioEncontrado.user_id.toString();
            if (usuariosEspecificosIds.has(user_id_final)) {
              console.log(`ℹ️ [NOTIFICACIONES] Usuario ${user_id_final} (@${usuarioEncontrado.username || 'sin username'}) ya está en la lista por filtros`);
            } else {
              usuarios.push({
                user_id: user_id_final,
                username: usuarioEncontrado.username,
                activo: usuarioEncontrado.activo,
                nivelAccesoId: usuarioEncontrado.nivelAccesoId,
                tipo_activacion: usuarioEncontrado.tipo_activacion,
                plan_activo: usuarioEncontrado.plan_activo
              });
              usuariosEspecificosIds.add(user_id_final);
              console.log(`➕ [NOTIFICACIONES] Usuario de BD agregado: ${user_id_final} (@${usuarioEncontrado.username || 'sin username'})`);
            }
          } else if (user_id_directo) {
            // Usuario externo con user_id directo
            user_id_final = user_id_directo;
            if (usuariosEspecificosIds.has(user_id_final)) {
              console.log(`ℹ️ [NOTIFICACIONES] Usuario externo ${user_id_final} ya está en la lista`);
            } else {
              usuarios.push({
                user_id: user_id_final,
                username: null, // Usuario externo, no tenemos username
                activo: null,
                nivelAccesoId: null,
                tipo_activacion: null,
                plan_activo: null
              });
              usuariosEspecificosIds.add(user_id_final);
              console.log(`➕ [NOTIFICACIONES] Usuario externo agregado: ${user_id_final} (no en BD)`);
            }
          } else {
            // Username externo (no en BD) - el bot lo resolverá
            const usernameLimpio = destinatario.replace(/^@/, '').trim();
            if (usernameLimpio) {
              username_externo = usernameLimpio;
              // Agregar como username, el bot lo resolverá a user_id
              usuarios.push({
                user_id: `@${usernameLimpio}`, // Marcar como username con @
                username: usernameLimpio,
                activo: null,
                nivelAccesoId: null,
                tipo_activacion: null,
                plan_activo: null,
                es_username_externo: true // Flag para identificar
              });
              console.log(`➕ [NOTIFICACIONES] Username externo agregado: @${usernameLimpio} (el bot lo resolverá a user_id)`);
            } else {
              console.log(`❌ [NOTIFICACIONES] No se pudo procesar destinatario: "${destinatario}"`);
              console.log(`   💡 Usa user_id numérico o username (ej: 1234567890 o @Bmrx15)`);
            }
          }
        } catch (error) {
          console.error(`❌ [NOTIFICACIONES] Error procesando destinatario "${destinatario}":`, error);
          console.error(`   Stack:`, error.stack);
        }
      }
      
      console.log(`📊 [NOTIFICACIONES] Total usuarios después de agregar específicos: ${usuarios.length}`);
    }
    
    // Separar usuarios con user_id válido y usuarios con username externo
    const usuariosConId = usuarios.filter(u => u.user_id && u.user_id.toString().trim() !== '' && !u.user_id.toString().startsWith('@'));
    const usuariosConUsername = usuarios.filter(u => u.user_id && u.user_id.toString().startsWith('@'));
    const usuariosSinId = usuarios.filter(u => !u.user_id || (u.user_id.toString().trim() !== '' && !u.user_id.toString().startsWith('@') && u.user_id.toString().trim() === ''));
    
    if (usuariosSinId.length > 0) {
      console.warn(`⚠️ [NOTIFICACIONES] ${usuariosSinId.length} usuarios sin user_id válido, serán excluidos:`);
      usuariosSinId.forEach(u => {
        console.warn(`   - Username: @${u.username || 'N/A'}, user_id: ${u.user_id || 'VACÍO'}`);
      });
    }
    
    // Crear lista de usuarios destino (user_id numéricos + usernames externos)
    const usuariosDestino = [
      ...usuariosConId.map(u => u.user_id.toString()),
      ...usuariosConUsername.map(u => u.user_id.toString()) // Incluir usernames con @ para que el bot los resuelva
    ];
    
    // Crear notificación
    const notificacion = {
      id: Date.now().toString(),
      titulo: payload.titulo || 'Notificación',
      mensaje: payload.mensaje || '',
      imagenUrl: payload.imagenUrl || null,
      botones: payload.botones || [],
      canal: payload.canal || 'bot',
      destinatarios: payload.destinatarios || '',
      filtros: filtros,
      programacion: payload.programacion || { tipo: 'inmediata' },
      usuarios: usuariosDestino, // Incluir user_id y usernames
      totalUsuarios: usuariosDestino.length,
      creadaEn: new Date().toISOString(),
      enviada: false,
      enviadaEn: null
    };
    
    console.log(`📋 [NOTIFICACIONES] Lista final de usuarios destino (${usuariosDestino.length}):`);
    usuariosConId.forEach((u, idx) => {
      console.log(`   ${idx + 1}. user_id: ${u.user_id}, username: @${u.username || 'N/A'}`);
    });
    usuariosConUsername.forEach((u, idx) => {
      console.log(`   ${usuariosConId.length + idx + 1}. username: ${u.user_id} (será resuelto por el bot)`);
    });
    
    // Guardar en archivo de notificaciones pendientes
    const notificaciones = leerNotificacionesPendientes();
    notificaciones.push(notificacion);
    guardarNotificacionesPendientes(notificaciones);
    
    console.log(`✅ [NOTIFICACIONES] Notificación creada: ${notificacion.id} - ${notificacion.totalUsuarios} usuarios`);
    console.log(`📋 [NOTIFICACIONES] Detalles:`, {
      id: notificacion.id,
      titulo: notificacion.titulo,
      totalUsuarios: notificacion.totalUsuarios,
      tieneImagen: !!notificacion.imagenUrl,
      tieneBotones: notificacion.botones.length > 0,
      programacion: notificacion.programacion.tipo,
      enviada: notificacion.enviada
    });
    
    return res.json({ 
      status: 'ok', 
      queued: true,
      notificacionId: notificacion.id,
      totalUsuarios: notificacion.totalUsuarios
    });
  } catch (err) {
    console.error('❌ [NOTIFICACIONES] Error al procesar', err);
    return res.status(500).json({ error: 'Error procesando notificación' });
  }
});

// Ruta para que el bot obtenga notificaciones pendientes
router.get('/pendientes', async (req, res) => {
  try {
    const notificaciones = leerNotificacionesPendientes();
    const pendientes = notificaciones.filter(n => !n.enviada);
    console.log(`📋 [NOTIFICACIONES] Total notificaciones: ${notificaciones.length}, Pendientes: ${pendientes.length}`);
    if (pendientes.length > 0) {
      console.log(`📋 [NOTIFICACIONES] IDs pendientes:`, pendientes.map(n => n.id));
    }
    return res.json(pendientes);
  } catch (err) {
    console.error('❌ [NOTIFICACIONES] Error obteniendo pendientes', err);
    return res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
});

// Ruta para marcar notificación como enviada
router.post('/:id/enviada', async (req, res) => {
  try {
    const { id } = req.params;
    const notificaciones = leerNotificacionesPendientes();
    const index = notificaciones.findIndex(n => n.id === id);
    if (index !== -1) {
      notificaciones[index].enviada = true;
      notificaciones[index].enviadaEn = new Date().toISOString();
      guardarNotificacionesPendientes(notificaciones);
      console.log(`✅ [NOTIFICACIONES] Notificación ${id} marcada como enviada`);
      return res.json({ status: 'ok', notificationId: id });
    }
    console.log(`⚠️ [NOTIFICACIONES] Notificación ${id} no encontrada para marcar como enviada`);
    return res.status(404).json({ error: 'Notificación no encontrada' });
  } catch (err) {
    console.error('❌ [NOTIFICACIONES] Error marcando como enviada', err);
    return res.status(500).json({ error: 'Error actualizando notificación' });
  }
});

// Ruta para obtener todas las notificaciones (historial)
router.get('/', async (req, res) => {
  try {
    const notificaciones = leerNotificacionesPendientes();
    return res.json(notificaciones);
  } catch (err) {
    console.error('❌ [NOTIFICACIONES] Error obteniendo historial', err);
    return res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
});

// Ruta para eliminar una notificación
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const notificaciones = leerNotificacionesPendientes();
    const index = notificaciones.findIndex(n => n.id === id);
    
    if (index !== -1) {
      const notificacionEliminada = notificaciones[index];
      notificaciones.splice(index, 1);
      guardarNotificacionesPendientes(notificaciones);
      console.log(`✅ [NOTIFICACIONES] Notificación ${id} eliminada`);
      return res.json({ 
        status: 'ok', 
        notificationId: id,
        message: 'Notificación eliminada correctamente'
      });
    }
    
    console.log(`⚠️ [NOTIFICACIONES] Notificación ${id} no encontrada para eliminar`);
    return res.status(404).json({ error: 'Notificación no encontrada' });
  } catch (err) {
    console.error('❌ [NOTIFICACIONES] Error eliminando notificación', err);
    return res.status(500).json({ error: 'Error eliminando notificación' });
  }
});

module.exports = router;

