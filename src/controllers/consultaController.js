const { PrismaClient } = require('../../generated/prisma');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

// Ruta absoluta al archivo de comandos compartido con Telethon
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const COMANDOS_FILE = path.join(ROOT_DIR, 'data', 'comandos_pendientes.json');
const RESPUESTAS_DIR = path.join(ROOT_DIR, 'data', 'respuestas');

// Función para generar código único
function generateCode(prefix) {
    return prefix + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Función para obtener el conteo activo
async function getActiveCount({ canal, userWebId, userTGId }) {
	const where = { estado: 'PENDIENTE' };
	if (canal === 'WEB') where.userWebId = userWebId;
	if (canal === 'TG') where.userTGId = userTGId;
	return prisma.consulta.count({ where });
}

// Función para calcular saldo
async function computeBalance({ canal, userWebId, userTGId }) {
	const where = {};
	if (canal === 'WEB') where.userWebId = userWebId;
	if (canal === 'TG') where.userTGId = userTGId;
	const result = await prisma.ledger.aggregate({
		where,
		_sum: { amount: true }
	});
	return result._sum.amount || 0;
}

// Validar comando según el plan del usuario
async function validarComandoSegunPlan(comando, userId) {
    try {
        // Obtener información del usuario
        const usuario = await prisma.usuario.findFirst({
            where: { id: parseInt(userId) },
            include: { nivelAcceso: true }
        });

        if (!usuario) {
            return { valido: false, error: 'Usuario no encontrado' };
        }

        // Verificar si el usuario está activo
        if (!usuario.activo) {
            return { valido: false, error: 'Usuario inactivo - requiere activación' };
        }

        // Obtener el comando base (sin parámetros)
        const comandoBase = comando.split(' ')[0].toLowerCase();

        // Definir comandos permitidos por plan
        const comandosPorPlan = {
            'basico': [
                // PLAN BÁSICO: Solo 10 comandos más básicos
                '/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/dnive', '/nm',
                '/c4', '/c4w', '/c4t'
            ],
            'vip': [
                // PLAN VIP: Solo 20 comandos (10 básicos + 10 VIP)
                '/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/dnive', '/nm',
                '/c4', '/c4w', '/c4t', '/licencia', '/ag', '/agv', '/tel', '/bitel',
                '/claro', '/sunarp', '/pla', '/placap', '/tra', '/sunedu'
            ],
            'doxer': [
                // PLAN DOXER: Solo 30 comandos (20 VIP + 10 DOXER)
                '/dni', '/dnif', '/dnid', '/dnifd', '/dnivir', '/dnive', '/nm',
                '/c4', '/c4w', '/c4t', '/licencia', '/ag', '/agv', '/tel', '/bitel',
                '/claro', '/sunarp', '/pla', '/placap', '/tra', '/sunedu',
                '/afp', '/finan', '/co', '/dir', '/sunat', '/mtc', '/antpenal',
                '/antpol', '/antjud', '/seeker', '/consumos', '/consumop'
            ],
            'hacker': ['*']  // Todos los comandos (incluye /sentinel, /casfis, /rcf)
        };

        // Obtener plan activo del usuario
        const planActivo = usuario.plan_activo || 'basico';
        const comandosPermitidos = comandosPorPlan[planActivo.toLowerCase()] || [];

        // Si es plan HACKER, permitir todos los comandos
        if (comandosPermitidos.includes('*')) {
            return { valido: true, plan: planActivo, comandosPermitidos: 'todos' };
        }

        // Verificar si el comando está en la lista permitida
        const comandoPermitido = comandosPermitidos.includes(comandoBase);

        return {
            valido: comandoPermitido,
            plan: planActivo,
            comandosPermitidos: comandosPermitidos,
            error: comandoPermitido ? null : `Comando '${comandoBase}' no permitido para plan ${planActivo}`
        };

    } catch (error) {
        console.error('Error validando comando según plan:', error);
        return { valido: false, error: 'Error validando comando' };
    }
}

// Verificar créditos disponibles
async function verificarCreditos(userId) {
    try {
        const usuario = await prisma.usuario.findFirst({
            where: { id: parseInt(userId) }
        });

        if (!usuario) {
            return { creditosDisponibles: 0, error: 'Usuario no encontrado' };
        }

        // Si el usuario tiene plan activo, no verificar créditos
        if (usuario.tipo_activacion === 'plan' && usuario.plan_activo) {
            return { 
                creditosDisponibles: 999999, 
                tipoActivacion: 'plan',
                planActivo: usuario.plan_activo,
                consultasUsadas: usuario.consultas_usadas || 0
            };
        }

        // Verificar créditos disponibles
        return { 
            creditosDisponibles: usuario.creditos_disponibles || 0,
            tipoActivacion: 'credits'
        };

    } catch (error) {
        console.error('Error verificando créditos:', error);
        return { creditosDisponibles: 0, error: 'Error verificando créditos' };
    }
}

exports.registroWeb = async (req, res) => {
	try {
		const { email, password } = req.body;
		if (!email || !password) return res.status(400).json({ error: 'Datos incompletos' });
		const cuw = generateCode('W');
		const usuario = await prisma.usuarioWeb.create({ data: { email, password, cuw } });
		return res.status(201).json({ id: usuario.id, email: usuario.email, cuw: usuario.cuw });
	} catch (error) {
		return res.status(500).json({ error: 'Error registrando usuario web' });
	}
};

exports.registroTG = async (req, res) => {
	try {
		const { telegramId, username } = req.body;
		if (!telegramId) return res.status(400).json({ error: 'telegramId requerido' });
		let usuario = await prisma.usuarioTelegram.findUnique({ where: { telegramId: String(telegramId) } });
		if (!usuario) {
			const cut = generateCode('T');
			usuario = await prisma.usuarioTelegram.create({ data: { telegramId: String(telegramId), username: username || null, cut } });
		}
		return res.status(201).json({ id: usuario.id, telegramId: usuario.telegramId, cut: usuario.cut });
	} catch (error) {
		return res.status(500).json({ error: 'Error registrando usuario TG' });
	}
};

// Nueva función para crear consultas del Móvil Pro
exports.crearConsultaMovilPro = async (req, res) => {
    try {
        const { comando, userId, tipoConsulta } = req.body;
        
        if (!comando || !userId) {
            return res.status(400).json({ error: 'Comando y userId son requeridos' });
        }

        // Validar comando según el plan del usuario
        const validacion = await validarComandoSegunPlan(comando, userId);
        if (!validacion.valido) {
            return res.status(403).json({ 
                error: 'Comando no permitido', 
                detalles: validacion.error,
                plan: validacion.plan,
                comandosPermitidos: validacion.comandosPermitidos
            });
        }

        // Verificar créditos/plan del usuario
        const creditos = await verificarCreditos(userId);
        if (creditos.error) {
            return res.status(400).json({ error: creditos.error });
        }

        // Si es plan por créditos, verificar que tenga suficientes
        if (creditos.tipoActivacion === 'credits' && creditos.creditosDisponibles < 1) {
            return res.status(402).json({ error: 'Créditos insuficientes' });
        }

        // Crear la consulta en la base de datos
        const consulta = await prisma.consulta.create({
            data: {
                canal: 'WEB',
                userWebId: parseInt(userId),
                sc: null,
                botObjetivo: 'MISTRAL_BOT',
                costo: 1,
                payload: comando,
                estado: 'PENDIENTE'
            }
        });

        // Enviar comando al bot objetivo
        try {
            // Cargar lista existente de comandos
            let comandos = [];
            if (fs.existsSync(COMANDOS_FILE)) {
                const raw = fs.readFileSync(COMANDOS_FILE, 'utf-8');
                comandos = JSON.parse(raw || '[]');
            }

            // Agregar nuevo comando
            comandos.push({
                consulta: String(comando),
                user_id: `WEB-${userId}`,
                chat_id: `WEB-${userId}`,
                timestamp: new Date().toISOString(),
                tipo: 'movil_pro',
                userId: parseInt(userId)
            });

            // Escribir archivo de comandos
            fs.mkdirSync(path.dirname(COMANDOS_FILE), { recursive: true });
            fs.writeFileSync(COMANDOS_FILE, JSON.stringify(comandos, null, 2), 'utf-8');

            // Si es plan por créditos, descontar crédito
            if (creditos.tipoActivacion === 'credits') {
                await prisma.usuario.update({
                    where: { id: parseInt(userId) },
                    data: { 
                        creditos_disponibles: { decrement: 1 }
                    }
                });
            }

            // Si es plan por tiempo, incrementar contador de consultas
            if (creditos.tipoActivacion === 'plan') {
                await prisma.usuario.update({
                    where: { id: parseInt(userId) },
                    data: { 
                        consultas_usadas: { increment: 1 }
                    }
                });
            }

            // Crear entrada en el ledger
            await prisma.ledger.create({
                data: {
                    canal: 'WEB',
                    amount: -1,
                    concepto: `CONSULTA MÓVIL PRO: ${comando}`,
                    userWebId: parseInt(userId),
                    cq: consulta.cq
                }
            });

            console.log(`✅ Consulta Móvil Pro creada: ${comando} para usuario ${userId}`);

            return res.status(201).json({
                ok: true,
                consulta: consulta,
                mensaje: 'Consulta enviada exitosamente al bot objetivo',
                plan: validacion.plan,
                creditosRestantes: creditos.tipoActivacion === 'credits' ? creditos.creditosDisponibles - 1 : 'ilimitado',
                consultasUsadas: creditos.tipoActivacion === 'plan' ? (creditos.consultasUsadas || 0) + 1 : 0
            });

        } catch (error) {
            console.error('Error enviando comando al bot objetivo:', error);
            return res.status(500).json({ error: 'Error enviando comando al bot objetivo' });
        }

    } catch (error) {
        console.error('Error creando consulta Móvil Pro:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener consultas del usuario
exports.obtenerConsultasUsuario = async (req, res) => {
    try {
        const { userId } = req.params;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId es requerido' });
        }

        const consultas = await prisma.consulta.findMany({
            where: { userWebId: parseInt(userId) },
            orderBy: { creadaEn: 'desc' },
            take: 50 // Últimas 50 consultas
        });

        return res.status(200).json({
            ok: true,
            consultas: consultas,
            total: consultas.length
        });

    } catch (error) {
        console.error('Error obteniendo consultas del usuario:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener respuestas de una consulta específica
exports.obtenerRespuestasConsulta = async (req, res) => {
    try {
        const { cq } = req.params;
        
        if (!cq) {
            return res.status(400).json({ error: 'cq es requerido' });
        }

        // Buscar archivos de respuesta para esta consulta
        const respuestas = [];
        
        if (fs.existsSync(RESPUESTAS_DIR)) {
            const archivos = fs.readdirSync(RESPUESTAS_DIR);
            
            for (const archivo of archivos) {
                if (archivo.includes(`WEB-${cq}_`) || archivo.includes(`CQ-${cq}_`)) {
                    const rutaCompleta = path.join(RESPUESTAS_DIR, archivo);
                    const stats = fs.statSync(rutaCompleta);
                    
                    if (archivo.endsWith('.txt')) {
                        const contenido = fs.readFileSync(rutaCompleta, 'utf-8');
                        respuestas.push({
                            tipo: 'texto',
                            archivo: archivo,
                            contenido: contenido,
                            timestamp: stats.mtime
                        });
                    } else if (/\.(jpg|jpeg|png|webp)$/i.test(archivo)) {
                        // Buscar caption asociado
                        let caption = '';
                        const captionFile = `${rutaCompleta}.caption`;
                        if (fs.existsSync(captionFile)) {
                            caption = fs.readFileSync(captionFile, 'utf-8');
                        }
                        
                        respuestas.push({
                            tipo: 'imagen',
                            archivo: archivo,
                            url: `/files/respuestas/${archivo}`,
                            caption: caption,
                            timestamp: stats.mtime
                        });
                    } else if (archivo.endsWith('.pdf')) {
                        let caption = '';
                        const captionFile = `${rutaCompleta}.caption`;
                        if (fs.existsSync(captionFile)) {
                            caption = fs.readFileSync(captionFile, 'utf-8');
                        }
                        
                        respuestas.push({
                            tipo: 'pdf',
                            archivo: archivo,
                            url: `/files/respuestas/${archivo}`,
                            caption: caption,
                            timestamp: stats.mtime
                        });
                    }
                }
            }
        }

        return res.status(200).json({
            ok: true,
            consulta: cq,
            respuestas: respuestas,
            total: respuestas.length
        });

    } catch (error) {
        console.error('Error obteniendo respuestas de la consulta:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

// Obtener estado de la consulta
exports.obtenerEstadoConsulta = async (req, res) => {
    try {
        const { cq } = req.params;
        
        if (!cq) {
            return res.status(400).json({ error: 'cq es requerido' });
        }

        const consulta = await prisma.consulta.findUnique({
            where: { cq: cq }
        });

        if (!consulta) {
            return res.status(404).json({ error: 'Consulta no encontrada' });
        }

        // Verificar si hay respuestas
        let tieneRespuestas = false;
        if (fs.existsSync(RESPUESTAS_DIR)) {
            const archivos = fs.readdirSync(RESPUESTAS_DIR);
            tieneRespuestas = archivos.some(archivo => 
                archivo.includes(`WEB-${consulta.userWebId}_`) || 
                archivo.includes(`CQ-${cq}_`)
            );
        }

        return res.status(200).json({
            ok: true,
            consulta: consulta,
            tieneRespuestas: tieneRespuestas,
            estado: consulta.estado
        });

    } catch (error) {
        console.error('Error obteniendo estado de la consulta:', error);
        return res.status(500).json({ error: 'Error interno del servidor' });
    }
};

exports.crearConsultaWeb = async (req, res) => {
	try {
		const { email, sc, botObjetivo, costo = 1, payload } = req.body;
		if (!email || !payload) return res.status(400).json({ error: 'Datos incompletos' });
		let usuario = await prisma.usuarioWeb.findFirst({ where: { email } });
		if (!usuario) {
			const cuw = generateCode('W');
			usuario = await prisma.usuarioWeb.create({ data: { email, password: '', cuw } });
		}
		const maxActivas = Number(process.env.MAX_CQ_PER_USER || 3);
		const activas = await getActiveCount({ canal: 'WEB', userWebId: usuario.id });
		if (activas >= maxActivas) return res.status(429).json({ error: 'Límite de consultas activas alcanzado' });
		const saldo = await computeBalance({ canal: 'WEB', userWebId: usuario.id });
		if (saldo < Number(costo)) return res.status(402).json({ error: 'Sin créditos' });
		const consulta = await prisma.consulta.create({
			data: {
				canal: 'WEB',
				userWebId: usuario.id,
				sc: sc || null,
				botObjetivo: botObjetivo || null,
				costo: Number(costo),
				payload: String(payload),
			}
		});
		await prisma.ledger.create({
			data: {
				canal: 'WEB', amount: -Number(costo), concepto: `RESERVA CQ ${consulta.cq}`,
				userWebId: usuario.id, cq: consulta.cq,
			}
		});
		return res.status(201).json({ cq: consulta.cq });
	} catch (error) {
		return res.status(500).json({ error: 'Error creando consulta WEB' });
	}
};

exports.crearConsultaTG = async (req, res) => {
	try {
		const { telegramId, sc, botObjetivo, costo = 1, payload, username } = req.body;
		if (!telegramId || !payload) return res.status(400).json({ error: 'Datos incompletos' });
		let usuario = await prisma.usuarioTelegram.findUnique({ where: { telegramId: String(telegramId) } });
		if (!usuario) {
			const cut = generateCode('T');
			usuario = await prisma.usuarioTelegram.create({ data: { telegramId: String(telegramId), username: username || null, cut } });
		}
		const maxActivas = Number(process.env.MAX_CQ_PER_USER || 3);
		const activas = await getActiveCount({ canal: 'TG', userTGId: usuario.id });
		if (activas >= maxActivas) return res.status(429).json({ error: 'Límite de consultas activas alcanzado' });
		const saldo = await computeBalance({ canal: 'TG', userTGId: usuario.id });
		if (saldo < Number(costo)) return res.status(402).json({ error: 'Sin créditos' });
		const consulta = await prisma.consulta.create({
			data: {
				canal: 'TG',
				userTGId: usuario.id,
				sc: sc || null,
				botObjetivo: botObjetivo || null,
				costo: Number(costo),
				payload: String(payload),
			}
		});
		await prisma.ledger.create({
			data: {
				canal: 'TG', amount: -Number(costo), concepto: `RESERVA CQ ${consulta.cq}`,
				userTGId: usuario.id, cq: consulta.cq,
			}
		});
		return res.status(201).json({ cq: consulta.cq });
	} catch (error) {
		return res.status(500).json({ error: 'Error creando consulta TG' });
	}
};

// Endpoints de crédito para pruebas/operación (acreditar saldo en billeteras)
exports.acreditarSaldo = async (req, res) => {
	try {
		const { canal, userId, monto, concepto } = req.body;
		if (!canal || !userId || !monto) return res.status(400).json({ error: 'Datos incompletos' });
		
		const where = {};
		if (canal === 'WEB') where.userWebId = userId;
		if (canal === 'TG') where.userTGId = userId;
		
		await prisma.ledger.create({
			data: {
				canal: canal.toUpperCase(),
				amount: Number(monto),
				concepto: concepto || 'ACREDITACIÓN MANUAL',
				...where
			}
		});
		
		return res.json({ ok: true, mensaje: `Saldo acreditado: ${monto}` });
	} catch (error) {
		return res.status(500).json({ error: 'Error acreditando saldo' });
	}
};

exports.obtenerSaldo = async (req, res) => {
	try {
		const { canal, userId } = req.params;
		if (!canal || !userId) return res.status(400).json({ error: 'Parámetros incompletos' });
		
		const saldo = await computeBalance({ 
			canal: canal.toUpperCase(), 
			userWebId: canal === 'WEB' ? userId : null,
			userTGId: canal === 'TG' ? userId : null
		});
		
		return res.json({ ok: true, saldo });
	} catch (error) {
		return res.status(500).json({ error: 'Error obteniendo saldo' });
	}
};


