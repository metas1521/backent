const { PrismaClient } = require('../../generated/prisma');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

// Obtener todos los usuarios web
const getAllWebUsers = async (req, res) => {
    try {
        const users = await prisma.webUser.findMany({
            orderBy: {
                createdAt: 'desc'
            }
        });
        
        res.json(users);
    } catch (error) {
        console.error('Error al obtener usuarios web:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener un usuario web por ID
const getWebUserById = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await prisma.webUser.findUnique({
            where: { id: parseInt(id) }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario web no encontrado' });
        }
        
        res.json(user);
    } catch (error) {
        console.error('Error al obtener usuario web:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Crear un nuevo usuario web
const createWebUser = async (req, res) => {
    try {
        const { username, email, password, plan_tipo = 'basico', creditos_disponibles = 0 } = req.body;
        
        // Validar campos requeridos
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Username, email y password son requeridos' });
        }
        
        // Verificar si el usuario ya existe
        const existingUser = await prisma.webUser.findFirst({
            where: {
                OR: [
                    { username },
                    { email }
                ]
            }
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'El username o email ya existe' });
        }
        
        // Hash de la contraseña
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Crear usuario
        const newUser = await prisma.webUser.create({
            data: {
                username,
                email,
                password: hashedPassword,
                plan_tipo,
                creditos_disponibles,
                estado: 'activo',
                bot_activado: false
            }
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = newUser;
        res.status(201).json(userWithoutPassword);
        
    } catch (error) {
        console.error('Error al crear usuario web:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Actualizar un usuario web
const updateWebUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;
        
        console.log(`🔧 [DEBUG] Actualizando usuario web ID: ${id}`);
        console.log(`🔧 [DEBUG] Datos de actualización:`, updateData);
        
        // Verificar si el usuario existe
        const usuarioExistente = await prisma.webUser.findUnique({
            where: { id: parseInt(id) }
        });

        if (!usuarioExistente) {
            console.log(`❌ [DEBUG] Usuario web no encontrado para ID: ${id}`);
            return res.status(404).json({ error: 'Usuario web no encontrado' });
        }

        console.log(`🔍 [DEBUG] Usuario web encontrado:`, {
            id: usuarioExistente.id,
            username: usuarioExistente.username,
            email: usuarioExistente.email
        });

        // CONFIGURACIÓN AUTOMÁTICA DE PLAN Y NIVEL
        let configuracionPlan = {};
        let notificacionWeb = null;
        
        if (updateData.plan_tipo && updateData.plan_tipo !== usuarioExistente.plan_tipo) {
            console.log(`🎯 [DEBUG] Configurando plan: ${updateData.plan_tipo}`);
            
            // Configurar límites según el plan
            switch (updateData.plan_tipo.toLowerCase()) {
                case 'basico':
                    configuracionPlan = {
                        creditos_disponibles: 10, // 10 consultas
                        consultas_usadas: 0, // Resetear contador
                        tipo_activacion: 'plan',
                        estado: 'activo'
                    };
                    notificacionWeb = {
                        plan: 'BÁSICO',
                        limite: 10,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida'],
                        mensaje: `🎉 **¡PLAN BÁSICO ACTIVADO!** 🎉\n\n📅 **Plan:** BÁSICO\n🔢 **Límite:** 10 comandos/mes\n💰 **Precio:** S/. 25.00\n\n✅ **Comandos permitidos:**\n• /dni - Consulta DNI básica\n• /dnif - Consulta DNI completa\n• /dnid - Consulta DNI database\n• /dnifd - Consulta DNI database completa\n• /dnivir - DNI virtual (anverso + reverso)\n• /nm - Búsqueda por nombres\n• /c4 - Ficha RENIEC/C4\n• /c4w - Ficha RENIEC/C4 blanca\n• /c4t - Certificado inscripción C4\n• /certvida - Certificado de vida\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan BÁSICO configurado: 10 comandos/mes`);
                    break;
                    
                case 'vip':
                    configuracionPlan = {
                        creditos_disponibles: 20, // 20 consultas
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        estado: 'activo'
                    };
                    notificacionWeb = {
                        plan: 'VIP',
                        limite: 20,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida', '/tel', '/antpenal', '/antpol', '/antjud', '/seeker'],
                        mensaje: `🎉 **¡PLAN VIP ACTIVADO!** 🎉\n\n📅 **Plan:** VIP\n🔢 **Límite:** 20 comandos/mes\n💰 **Precio:** S/. 50.00\n\n✅ **Comandos permitidos:**\n• Todos los del plan BÁSICO\n• /tel - Consulta telefónica\n• /antpenal - Antecedentes penales\n• /antpol - Antecedentes policiales\n• /antjud - Antecedentes judiciales\n• /seeker - Búsqueda financiera\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan VIP configurado: 20 comandos/mes`);
                    break;
                    
                case 'doxer':
                    configuracionPlan = {
                        creditos_disponibles: 30, // 30 consultas
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        estado: 'activo'
                    };
                    notificacionWeb = {
                        plan: 'DOXER',
                        limite: 30,
                        comandos_permitidos: ['/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/nm', '/c4', '/c4w', '/c4t', '/certvida', '/tel', '/antpenal', '/antpol', '/antjud', '/seeker', '/sunarp', '/migratorios', '/delitos'],
                        mensaje: `🎉 **¡PLAN DOXER ACTIVADO!** 🎉\n\n📅 **Plan:** DOXER\n🔢 **Límite:** 30 comandos/mes\n💰 **Precio:** S/. 75.00\n\n✅ **Comandos permitidos:**\n• Todos los del plan VIP\n• /sunarp - Consultas SUNARP\n• /migratorios - Consultas migratorias\n• /delitos - Consultas de delitos\n\n🚀 **¡Ya puedes usar estos comandos!**\n\n⚠️ **Restricción:** Solo puedes usar los comandos de tu plan`
                    };
                    console.log(`✅ [DEBUG] Plan DOXER configurado: 30 comandos/mes`);
                    break;
                    
                case 'hacker':
                    configuracionPlan = {
                        creditos_disponibles: 999999, // Sin límite
                        consultas_usadas: 0,
                        tipo_activacion: 'plan',
                        estado: 'activo'
                    };
                    notificacionWeb = {
                        plan: 'HACKER',
                        limite: 999999,
                        comandos_permitidos: ['*'], // Todos los comandos
                        mensaje: `🎉 **¡PLAN HACKER ACTIVADO!** 🎉\n\n📅 **Plan:** HACKER\n🔢 **Límite:** SIN LÍMITE\n💰 **Precio:** S/. 100.00\n\n✅ **Comandos permitidos:**\n• **TODOS LOS COMANDOS DISPONIBLES**\n• Acceso completo a todas las funciones\n• Sin restricciones de uso\n\n🚀 **¡Acceso completo activado!**\n\n⚠️ **Restricción:** Puedes usar cualquier comando`
                    };
                    console.log(`✅ [DEBUG] Plan HACKER configurado: Sin límite`);
                    break;
                    
                default:
                    console.log(`⚠️ [DEBUG] Plan no reconocido: ${updateData.plan_tipo}`);
            }
        }

        // Combinar datos de actualización con configuración del plan
        const datosFinales = { ...updateData, ...configuracionPlan };
        
        // Si se va a actualizar la contraseña, hashearla
        if (datosFinales.password) {
            datosFinales.password = await bcrypt.hash(datosFinales.password, 10);
        }
        
        // Agregar timestamp de actualización
        datosFinales.updatedAt = new Date();
        
        // LIMPIAR CAMPOS NO VÁLIDOS PARA WEBUSER
        const camposValidos = [
            'username', 'email', 'password', 'plan_tipo', 'creditos_disponibles',
            'consultas_usadas', 'estado', 'bot_activado', 'tipo_activacion', 'updatedAt'
        ];
        
        Object.keys(datosFinales).forEach(campo => {
            if (!camposValidos.includes(campo)) {
                console.log(`🗑️ [DEBUG] Eliminando campo no válido: ${campo}`);
                delete datosFinales[campo];
            }
        });
        
        console.log(`🔧 [DEBUG] Datos finales de actualización:`, datosFinales);

        // Actualizar usuario
        const usuarioActualizado = await prisma.webUser.update({
            where: { id: parseInt(id) },
            data: datosFinales
        });

        // ENVIAR NOTIFICACIÓN WEB SI SE ACTIVÓ UN PLAN
        if (notificacionWeb) {
            try {
                console.log(`📱 [DEBUG] Enviando notificación web para usuario ${usuarioActualizado.username}`);
                
                // Enviar notificación web (aquí podrías implementar notificaciones push, email, etc.)
                const webResponse = await enviarNotificacionWeb(usuarioActualizado.email, notificacionWeb);
                
                if (webResponse.success) {
                    console.log(`✅ [DEBUG] Notificación web enviada exitosamente`);
                } else {
                    console.log(`⚠️ [DEBUG] Error enviando notificación web: ${webResponse.error}`);
                }
            } catch (error) {
                console.log(`❌ [DEBUG] Error en notificación web: ${error.message}`);
            }
        }

        console.log(`✅ [DEBUG] Usuario web actualizado exitosamente:`, {
            id: usuarioActualizado.id,
            username: usuarioActualizado.username,
            estado: usuarioActualizado.estado,
            tipo_activacion: usuarioActualizado.tipo_activacion,
            plan_tipo: usuarioActualizado.plan_tipo,
            creditos_disponibles: usuarioActualizado.creditos_disponibles,
            consultas_usadas: usuarioActualizado.consultas_usadas
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = usuarioActualizado;
        res.json({ ok: true, usuario: userWithoutPassword });
        
    } catch (error) {
        console.error('❌ [DEBUG] Error al actualizar usuario web:', error);
        console.error('❌ [DEBUG] Stack trace:', error.stack);
        res.status(500).json({ error: `Error al actualizar usuario web: ${error.message}` });
    }
};

// Eliminar un usuario web
const deleteWebUser = async (req, res) => {
    try {
        const { id } = req.params;
        
        await prisma.webUser.delete({
            where: { id: parseInt(id) }
        });
        
        res.json({ message: 'Usuario web eliminado correctamente' });
    } catch (error) {
        console.error('Error al eliminar usuario web:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Agregar créditos a un usuario web
const addCreditsToWebUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { creditos } = req.body;
        
        if (!creditos || creditos <= 0) {
            return res.status(400).json({ error: 'La cantidad de créditos debe ser mayor a 0' });
        }
        
        const updatedUser = await prisma.webUser.update({
            where: { id: parseInt(id) },
            data: {
                creditos_disponibles: {
                    increment: creditos
                },
                updatedAt: new Date()
            }
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
        
    } catch (error) {
        console.error('Error al agregar créditos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Quitar créditos de un usuario web
const removeCreditsFromWebUser = async (req, res) => {
    try {
        const { id } = req.params;
        const { creditos } = req.body;
        
        if (!creditos || creditos <= 0) {
            return res.status(400).json({ error: 'La cantidad de créditos debe ser mayor a 0' });
        }
        
        const user = await prisma.webUser.findUnique({
            where: { id: parseInt(id) }
        });
        
        if (!user) {
            return res.status(404).json({ error: 'Usuario web no encontrado' });
        }
        
        if (user.creditos_disponibles < creditos) {
            return res.status(400).json({ error: 'No hay suficientes créditos disponibles' });
        }
        
        const updatedUser = await prisma.webUser.update({
            where: { id: parseInt(id) },
            data: {
                creditos_disponibles: {
                    decrement: creditos
                },
                updatedAt: new Date()
            }
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
        
    } catch (error) {
        console.error('Error al quitar créditos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Activar/desactivar bot para usuario web
const toggleBotActivation = async (req, res) => {
    try {
        const { id } = req.params;
        const { bot_activado } = req.body;
        
        if (typeof bot_activado !== 'boolean') {
            return res.status(400).json({ error: 'El campo bot_activado debe ser un booleano' });
        }
        
        const updatedUser = await prisma.webUser.update({
            where: { id: parseInt(id) },
            data: {
                bot_activado,
                updatedAt: new Date()
            }
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
        
    } catch (error) {
        console.error('Error al cambiar estado del bot:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Cambiar estado del usuario web
const changeWebUserStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        
        const estadosValidos = ['activo', 'inactivo', 'suspendido'];
        if (!estadosValidos.includes(estado)) {
            return res.status(400).json({ error: 'Estado no válido' });
        }
        
        const updatedUser = await prisma.webUser.update({
            where: { id: parseInt(id) },
            data: {
                estado,
                updatedAt: new Date()
            }
        });
        
        // Remover password de la respuesta
        const { password: _, ...userWithoutPassword } = updatedUser;
        res.json(userWithoutPassword);
        
    } catch (error) {
        console.error('Error al cambiar estado del usuario:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener estadísticas de usuarios web
const getWebUsersStats = async (req, res) => {
    try {
        const totalUsers = await prisma.webUser.count();
        const activeUsers = await prisma.webUser.count({
            where: { estado: 'activo' }
        });
        const botActivatedUsers = await prisma.webUser.count({
            where: { bot_activado: true }
        });
        
        const totalCredits = await prisma.webUser.aggregate({
            _sum: {
                creditos_disponibles: true
            }
        });
        
        res.json({
            totalUsers,
            activeUsers,
            botActivatedUsers,
            totalCredits: totalCredits._sum.creditos_disponibles || 0
        });
        
    } catch (error) {
        console.error('Error al obtener estadísticas:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// ==== NUEVAS FUNCIONES PARA SISTEMA DE PLANES ====

// Verificar si un usuario web está activo
const verificarWebUserActivo = async (req, res) => {
    const { email } = req.params;
    
    try {
        console.log(`🔍 [DEBUG] Verificando usuario web con email: ${email}`);
        
        const usuario = await prisma.webUser.findFirst({
            where: {
                email: email
            },
            select: {
                id: true,
                email: true,
                username: true,
                estado: true,
                bot_activado: true,
                tipo_activacion: true,
                plan_tipo: true,
                creditos_disponibles: true,
                consultas_usadas: true
            }
        });

        console.log(`🔍 [DEBUG] Resultado de la consulta:`, usuario);

        if (!usuario) {
            console.log(`❌ [DEBUG] Usuario web no encontrado`);
            return res.status(404).json({ 
                error: 'Usuario web no encontrado',
                registrado: false,
                activo: false
            });
        }

        console.log(`✅ [DEBUG] Usuario web encontrado:`, {
            id: usuario.id,
            email: usuario.email,
            username: usuario.username,
            estado: usuario.estado,
            bot_activado: usuario.bot_activado,
            tipo_activacion: usuario.tipo_activacion,
            plan_tipo: usuario.plan_tipo,
            creditos_disponibles: usuario.creditos_disponibles,
            consultas_usadas: usuario.consultas_usadas
        });

        res.json({
            registrado: true,
            activo: usuario.estado === 'activo',
            usuario: {
                id: usuario.id,
                email: usuario.email,
                username: usuario.username,
                estado: usuario.estado,
                bot_activado: usuario.bot_activado,
                tipo_activacion: usuario.tipo_activacion,
                plan_tipo: usuario.plan_tipo,
                creditos_disponibles: usuario.creditos_disponibles,
                consultas_usadas: usuario.consultas_usadas
            }
        });
    } catch (e) {
        console.error('❌ [DEBUG] Error al verificar usuario web:', e);
        console.error('❌ [DEBUG] Stack trace:', e.stack);
        res.status(500).json({ error: 'Error al verificar usuario web' });
    }
};

// Registrar nuevo usuario web desde el sistema
const registrarWebUser = async (req, res) => {
    const { email, username, plan_tipo = 'basico' } = req.body;
    if (!email || !username) {
        return res.status(400).json({ error: 'Faltan datos' });
    }
    try {
        // Verificar si ya existe por email o username
        let usuario = await prisma.webUser.findFirst({
            where: {
                OR: [
                    { email: email },
                    { username: username }
                ]
            }
        });

        if (!usuario) {
            // Crear nuevo usuario web
            usuario = await prisma.webUser.create({
                data: {
                    username,
                    email,
                    password: 'temp_password_' + Math.random().toString(36).substr(2, 9), // Contraseña temporal
                    plan_tipo,
                    creditos_disponibles: 0,
                    estado: 'inactivo', // Por defecto INACTIVO - requiere activación del admin
                    bot_activado: false,
                    tipo_activacion: null, // Se asignará cuando se active un plan
                    consultas_usadas: 0
                }
            });
            console.log(`✅ Usuario web registrado (INACTIVO): ${username} (Email: ${email}) - Requiere activación del admin`);
        } else {
            console.log(`ℹ️ Usuario web ya existe: ${username} (Email: ${email})`);
        }

        res.json({ ok: true, usuario });
    } catch (e) {
        console.error('Error en registro de usuario web:', e);
        res.status(500).json({ error: 'Error al registrar usuario web' });
    }
};

// FUNCIÓN PARA ENVIAR NOTIFICACIONES WEB
async function enviarNotificacionWeb(email, notificacion) {
    try {
        console.log(`📱 [DEBUG] Enviando notificación web a ${email} del plan ${notificacion.plan}`);
        
        // Aquí implementarías el envío de notificaciones web
        // Por ejemplo: notificaciones push, emails, webhooks, etc.
        
        // Por ahora, solo simulamos el envío
        console.log(`📧 [DEBUG] Notificación web simulada para ${email}:`, notificacion.mensaje);
        
        return { success: true, message: 'Notificación web enviada' };
        
    } catch (error) {
        console.log(`❌ [DEBUG] Error en enviarNotificacionWeb:`, error.message);
        return { success: false, error: error.message };
    }
}

module.exports = {
    getAllWebUsers,
    getWebUserById,
    createWebUser,
    updateWebUser,
    deleteWebUser,
    addCreditsToWebUser,
    removeCreditsFromWebUser,
    toggleBotActivation,
    changeWebUserStatus,
    getWebUsersStats,
    // Nuevas funciones para sistema de planes
    verificarWebUserActivo,
    registrarWebUser
};
