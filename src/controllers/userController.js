const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

exports.getAll = async (req, res) => {
    try {
        const usuarios = await prisma.usuario.findMany({
            include: {
                nivelAcceso: true
            }
        });
        res.json(usuarios);
    } catch (e) {
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
};

exports.getById = async (req, res) => {
    const { id } = req.params;
    try {
        const usuario = await prisma.usuario.findFirst({
            where: {
                OR: [
                    { id: parseInt(id) },
                    { user_id: id }
                ]
            },
            include: {
                nivelAcceso: true
            }
        });
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json(usuario);
    } catch (e) {
        res.status(500).json({ error: 'Error al obtener usuario' });
    }
};

exports.registrar = async (req, res) => {
    const { user_id, username, nombre, fecha_registro } = req.body;
    if (!user_id || !username) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    try {
        // Verificar si ya existe por user_id o username
        let usuario = await prisma.usuario.findFirst({
            where: {
                OR: [
                    { user_id: user_id.toString() },
                    { username: username }
                ]
            }
        });

        if (!usuario) {
            // Crear nuevo usuario
            usuario = await prisma.usuario.create({
                data: {
                    nombre: nombre || username,
                    username,
                    user_id: user_id.toString(),
                    password: '', // Campo requerido pero no usado para bots
                    creditos: 0,
                    montoPagado: 0,
                    activo: false, // Por defecto INACTIVO - requiere activación del admin
                    nivelAccesoId: 1, // Por defecto, nivel básico
                    fechaAlta: fecha_registro ? new Date(fecha_registro) : new Date(),
                    creditos_disponibles: 0, // Campo requerido para sistema de créditos
                    consultas_usadas: 0, // Contador para planes por tiempo
                    tipo: 'telegram_bot' // Tipo por defecto para bots
                },
                include: {
                    nivelAcceso: true
                }
            });
            console.log(`✅ Usuario registrado (INACTIVO): ${username} (ID: ${user_id}) - Requiere activación del admin`);
        } else {
            console.log(`ℹ️ Usuario ya existe: ${username} (ID: ${user_id})`);
        }

        res.json({ ok: true, usuario });
    } catch (e) {
        console.error('Error en registro:', e);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
};

exports.updateById = async (req, res) => {
    const { id } = req.params;
    const updateData = req.body;
    
    try {
        console.log(`🔧 [DEBUG] Actualizando usuario ID: ${id}`);
        console.log(`🔧 [DEBUG] Datos de actualización:`, updateData);
        console.log(`🔧 [DEBUG] Tipo de updateData:`, typeof updateData);
        console.log(`🔧 [DEBUG] req.body completo:`, req.body);
        console.log(`🔧 [DEBUG] req.headers:`, req.headers);
        
        // Verificar si el usuario existe
        const usuarioExistente = await prisma.usuario.findFirst({
            where: {
                OR: [
                    { id: parseInt(id) },
                    { user_id: id }
                ]
            }
        });

        if (!usuarioExistente) {
            console.log(`❌ [DEBUG] Usuario no encontrado para ID: ${id}`);
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        console.log(`🔍 [DEBUG] Usuario encontrado:`, {
            id: usuarioExistente.id,
            username: usuarioExistente.username,
            user_id: usuarioExistente.user_id
        });

        // CONFIGURACIÓN AUTOMÁTICA DE PLAN Y NIVEL
        let configuracionPlan = {};
        let notificacionBot = null;
        
        if (updateData.plan_activo && updateData.plan_activo !== usuarioExistente.plan_activo) {
            console.log(`🎯 [DEBUG] Configurando plan: ${updateData.plan_activo}`);
            
            // Configurar nivel de acceso y límites según el plan
            switch (updateData.plan_activo.toLowerCase()) {
                case 'basico':
                    configuracionPlan = {
                        nivelAccesoId: 2, // USUARIO básico
                        consultas_usadas: 0, // Resetear contador
                        tipo_activacion: 'plan',
                        activo: true
                    };
                    notificacionBot = {
                        plan: 'BÁSICO',
                        limite: 10,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida'],
                        mensaje: `🎉 **¡PLAN BÁSICO ACTIVADO!** 🎉\n\n📅 **Plan:** BÁSICO\n🔢 **Límite:** 10 comandos/mes\n💰 **Precio:** S/. 25.00\n\n✅ **Comandos permitidos:**\n• /dni - Consulta DNI básica\n• /dnif - Consulta DNI completa\n• /dnid - Consulta DNI database\n• /dnifd - Consulta DNI database completa\n• /dnivir - DNI virtual (anverso + reverso)\n• /nm - Búsqueda por nombres\n• /c4 - Ficha RENIEC/C4\n• /c4w - Ficha RENIEC/C4 blanca\n• /c4t - Certificado inscripción C4\n• /certvida - Certificado de vida\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan BÁSICO configurado: 10 comandos/mes, nivel USUARIO`);
                    break;
                    
                case 'vip':
                    configuracionPlan = {
                        nivelAccesoId: 2, // USUARIO básico
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        activo: true
                    };
                    notificacionBot = {
                        plan: 'VIP',
                        limite: 20,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida', '/tel', '/antpenal', '/antpol', '/antjud', '/seeker'],
                        mensaje: `🎉 **¡PLAN VIP ACTIVADO!** 🎉\n\n📅 **Plan:** VIP\n🔢 **Límite:** 20 comandos/mes\n💰 **Precio:** S/. 50.00\n\n✅ **Comandos permitidos:**\n• Todos los del plan BÁSICO\n• /tel - Consulta telefónica\n• /antpenal - Antecedentes penales\n• /antpol - Antecedentes policiales\n• /antjud - Antecedentes judiciales\n• /seeker - Búsqueda financiera\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan VIP configurado: 20 comandos/mes, nivel USUARIO`);
                    break;
                    
                case 'doxer':
                    configuracionPlan = {
                        nivelAccesoId: 2, // USUARIO básico
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        activo: true
                    };
                    notificacionBot = {
                        plan: 'DOXER',
                        limite: 30,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida', '/tel', '/antpenal', '/antpol', '/antjud', '/seeker', '/sunarp', '/migratorios', '/delitos'],
                        mensaje: `🎉 **¡PLAN DOXER ACTIVADO!** 🎉\n\n📅 **Plan:** DOXER\n🔢 **Límite:** 30 comandos/mes\n💰 **Precio:** S/. 75.00\n\n✅ **Comandos permitidos:**\n• Todos los del plan VIP\n• /sunarp - Consultas SUNARP\n• /migratorios - Consultas migratorias\n• /delitos - Consultas de delitos\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan DOXER configurado: 30 comandos/mes, nivel USUARIO`);
                    break;
                    
                case 'hacker':
                    configuracionPlan = {
                        nivelAccesoId: 2, // USUARIO básico
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        activo: true
                    };
                    notificacionBot = {
                        plan: 'HACKER',
                        limite: 999999,
                        comandos_permitidos: ['*'], // Todos los comandos
                        mensaje: `🎉 **¡PLAN HACKER ACTIVADO!** 🎉\n\n📅 **Plan:** HACKER\n🔢 **Límite:** SIN LÍMITE\n💰 **Precio:** S/. 100.00\n\n✅ **Comandos permitidos:**\n• **TODOS LOS COMANDOS DISPONIBLES**\n• Acceso completo a todas las funciones\n• Sin restricciones de uso\n\n🚀 **¡Acceso completo activado!**\n\n⚠️ **Restricción:** Puedes usar cualquier comando`
                    };
                    console.log(`✅ [DEBUG] Plan HACKER configurado: Sin límite, nivel USUARIO`);
                    break;
                    
                default:
                    console.log(`⚠️ [DEBUG] Plan no reconocido: ${updateData.plan_activo}`);
            }
        }

        // Combinar datos de actualización con configuración del plan
        const datosFinales = { ...updateData, ...configuracionPlan };
        
        // Corregir nombres de campos para Prisma
        if (datosFinales.fecha_activacion) {
            // fecha_activacion se mapea a fecha_registro en el esquema
            datosFinales.fecha_registro = datosFinales.fecha_activacion;
            delete datosFinales.fecha_activacion;
        }
        if (datosFinales.fecha_expiracion) {
            // fecha_expiracion se mapea a fechaExpiracion en Prisma
            datosFinales.fechaExpiracion = datosFinales.fecha_expiracion;
            delete datosFinales.fecha_expiracion;
        }
        
        // Asegurar que los campos requeridos estén presentes
        if (!datosFinales.creditos_disponibles && datosFinales.creditos_disponibles !== 0) {
            datosFinales.creditos_disponibles = 0;
        }
        if (!datosFinales.consultas_usadas && datosFinales.consultas_usadas !== 0) {
            datosFinales.consultas_usadas = 0;
        }
        if (!datosFinales.tipo) {
            datosFinales.tipo = 'telegram_bot';
        }
        
        // LIMPIAR CAMPOS NO VÁLIDOS PARA PRISMA
        const camposValidos = [
            'activo', 'tipo_activacion', 'plan_activo', 'creditos_disponibles',
            'consultas_usadas', 'fecha_registro', 'fechaExpiracion', 'tipo'
        ];
        
        Object.keys(datosFinales).forEach(campo => {
            if (!camposValidos.includes(campo)) {
                console.log(`🗑️ [DEBUG] Eliminando campo no válido: ${campo}`);
                delete datosFinales[campo];
            }
        });
        
        console.log(`🔧 [DEBUG] Datos finales de actualización:`, datosFinales);

        // Actualizar usuario
        const usuarioActualizado = await prisma.usuario.update({
            where: { id: usuarioExistente.id },
            data: datosFinales,
            include: {
                nivelAcceso: true
            }
        });

        // ENVIAR NOTIFICACIÓN AL BOT DE TELEGRAM SI SE ACTIVÓ UN PLAN
        if (notificacionBot && usuarioActualizado.user_id) {
            try {
                console.log(`📱 [DEBUG] Enviando notificación al bot para usuario ${usuarioActualizado.user_id}`);
                
                // Enviar notificación al bot de Telegram
                const botResponse = await enviarNotificacionBot(usuarioActualizado.user_id, notificacionBot);
                
                if (botResponse.success) {
                    console.log(`✅ [DEBUG] Notificación enviada exitosamente al bot`);
                } else {
                    console.log(`⚠️ [DEBUG] Error enviando notificación al bot: ${botResponse.error}`);
                }
            } catch (error) {
                console.log(`❌ [DEBUG] Error en notificación al bot: ${error.message}`);
            }
        }

        console.log(`✅ [DEBUG] Usuario actualizado exitosamente:`, {
            id: usuarioActualizado.id,
            username: usuarioActualizado.username,
            activo: usuarioActualizado.activo,
            tipo_activacion: usuarioActualizado.tipo_activacion,
            plan_activo: usuarioActualizado.plan_activo,
            creditos_disponibles: usuarioActualizado.creditos_disponibles,
            consultas_usadas: usuarioActualizado.consultas_usadas,
            nivelAccesoId: usuarioActualizado.nivelAccesoId
        });
        
        res.json({ ok: true, usuario: usuarioActualizado });
    } catch (e) {
        console.error('❌ [DEBUG] Error al actualizar usuario:', e);
        console.error('❌ [DEBUG] Stack trace:', e.stack);
        res.status(500).json({ error: `Error al actualizar usuario: ${e.message}` });
    }
};

// FUNCIÓN PARA ENVIAR NOTIFICACIONES AL BOT DE TELEGRAM
async function enviarNotificacionBot(user_id, notificacion) {
    try {
        // Configuración del bot de Telegram
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8117816401:AAGb59XFTbyFyPicFHTgP8TltaS72VZwIuw';
        const BOT_API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
        
        console.log(`📱 [DEBUG] Enviando notificación a usuario ${user_id} del plan ${notificacion.plan}`);
        
        // Enviar mensaje al usuario a través del bot
        const response = await fetch(`${BOT_API_URL}/sendMessage`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: user_id,
                text: notificacion.mensaje,
                parse_mode: 'Markdown'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log(`✅ [DEBUG] Mensaje enviado exitosamente:`, result);
            return { success: true, message_id: result.result.message_id };
        } else {
            const error = await response.text();
            console.log(`❌ [DEBUG] Error enviando mensaje:`, error);
            return { success: false, error: error };
        }
        
    } catch (error) {
        console.log(`❌ [DEBUG] Error en enviarNotificacionBot:`, error.message);
        return { success: false, error: error.message };
    }
}

exports.deleteById = async (req, res) => {
    const { id } = req.params;
    
    try {
        // Verificar si el usuario existe
        const usuarioExistente = await prisma.usuario.findFirst({
            where: {
                OR: [
                    { id: parseInt(id) },
                    { user_id: id }
                ]
            }
        });

        if (!usuarioExistente) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        // Eliminar usuario
        await prisma.usuario.delete({
            where: { id: usuarioExistente.id }
        });

        console.log(`✅ Usuario eliminado: ${usuarioExistente.username} (ID: ${usuarioExistente.id})`);
        res.json({ ok: true, message: 'Usuario eliminado exitosamente' });
    } catch (e) {
        console.error('Error al eliminar usuario:', e);
        res.status(500).json({ error: 'Error al eliminar usuario' });
    }
};

exports.verificarActivo = async (req, res) => {
    const { user_id } = req.params;
    
    try {
        console.log(`🔍 [DEBUG] Verificando usuario con user_id: ${user_id}`);
        console.log(`🔍 [DEBUG] Tipo de user_id: ${typeof user_id}`);
        
        // Intentar primero con user_id exacto
        let usuario = await prisma.usuario.findFirst({
            where: {
                user_id: user_id.toString()
            },
            select: {
                id: true,
                user_id: true,
                username: true,
                nombre: true,
                activo: true,
                nivelAccesoId: true,
                tipo_activacion: true,
                plan_activo: true,
                creditos_disponibles: true,
                consultas_usadas: true,
                fecha_registro: true,
                fechaExpiracion: true
            }
        });

        // Si no se encuentra, intentar con ID numérico
        if (!usuario && !isNaN(parseInt(user_id))) {
            console.log(`🔍 [DEBUG] Intentando búsqueda por ID numérico: ${parseInt(user_id)}`);
            usuario = await prisma.usuario.findFirst({
                where: {
                    id: parseInt(user_id)
                },
                select: {
                    id: true,
                    user_id: true,
                    username: true,
                    nombre: true,
                    activo: true,
                    nivelAccesoId: true,
                    tipo_activacion: true,
                    plan_activo: true,
                    creditos_disponibles: true,
                    consultas_usadas: true,
                    fecha_activacion: true,
                    fecha_expiracion: true,
                    fecha_registro: true
                }
            });
        }

        console.log(`🔍 [DEBUG] Resultado de la consulta:`, usuario);

        if (!usuario) {
            console.log(`❌ [DEBUG] Usuario no encontrado`);
            return res.status(404).json({ 
                error: 'Usuario no encontrado',
                registrado: false,
                activo: false
            });
        }

        console.log(`✅ [DEBUG] Usuario encontrado:`, {
            id: usuario.id,
            user_id: usuario.user_id,
            username: usuario.username,
            activo: usuario.activo,
            nivelAccesoId: usuario.nivelAccesoId,
            tipo_activacion: usuario.tipo_activacion,
            plan_activo: usuario.plan_activo,
            creditos_disponibles: usuario.creditos_disponibles,
            consultas_usadas: usuario.consultas_usadas
        });

        res.json({
            registrado: true,
            activo: usuario.activo,
            usuario: {
                id: usuario.id,
                user_id: usuario.user_id,
                username: usuario.username,
                nombre: usuario.nombre,
                nivelAccesoId: usuario.nivelAccesoId,
                tipo_activacion: usuario.tipo_activacion,
                plan_activo: usuario.plan_activo,
                creditos_disponibles: usuario.creditos_disponibles,
                consultas_usadas: usuario.consultas_usadas,
                // Usar fecha_registro como fecha_activacion si no hay fecha_activacion explícita
                fecha_activacion: usuario.fecha_activacion || usuario.fecha_registro,
                // fechaExpiracion viene del schema como PascalCase, mapear a snake_case
                fecha_expiracion: usuario.fecha_expiracion || usuario.fechaExpiracion,
                fecha_registro: usuario.fecha_registro
            }
        });
    } catch (e) {
        console.error('❌ [DEBUG] Error al verificar usuario:', e);
        console.error('❌ [DEBUG] Stack trace:', e.stack);
        res.status(500).json({ error: 'Error al verificar usuario' });
    }
};
