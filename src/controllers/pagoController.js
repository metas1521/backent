const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
};

const planPrices = {
    basico: 25,
    vip: 50,
    doxer: 75,
    hacker: 100
};

const creditPackages = {
    20: { creditos: 480 },
    40: { creditos: 960 },
    60: { creditos: 1440 },
    80: { creditos: 1920 },
    100: { creditos: 2400 }
};

const inferMontoFromCreditos = (creditos) => {
    if (!creditos || creditos <= 0) return 0;
    const entries = Object.entries(creditPackages)
        .map(([monto, data]) => ({ monto: Number(monto), creditos: data.creditos }))
        .sort((a, b) => a.creditos - b.creditos);
    for (const e of entries) {
        if (creditos <= e.creditos) return e.monto;
    }
    // Si excede el máximo, aproximar proporcional al último paquete
    const last = entries[entries.length - 1];
    return Math.ceil((creditos / last.creditos) * last.monto);
};

const normalizarPlan = (plan) => (plan || '').toString().toLowerCase();

const calcularMontoYExpiracion = ({ plan, meses = 1, fechaInicio }) => {
    const planKey = normalizarPlan(plan);
    const precioBase = planPrices[planKey];
    if (!precioBase) return { monto: null, fechaExpiracion: null };
    const monto = precioBase * meses;
    const fechaExpiracion = addDays(fechaInicio, 30 * meses);
    return { monto, fechaExpiracion };
};

const mapPagoConDias = (pago) => {
    const hoy = new Date();
    let diasRestantes = null;
    const fechaExp = pago.fechaExpiracion || (pago.usuario && pago.usuario.fechaExpiracion);
    if (fechaExp) {
        const diffMs = new Date(fechaExp) - hoy;
        diasRestantes = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    }
    return { ...pago, diasRestantes, fechaExpiracion: fechaExp || pago.fechaExpiracion };
};

exports.getAll = async (req, res) => {
    try {
        const { usuarioId, estado, tipo, desde, hasta, userTipo } = req.query;
        const where = {};

        if (usuarioId) where.usuarioId = Number(usuarioId);
        if (estado) where.estado = estado;
        if (tipo) where.tipo = tipo;
        if (userTipo) {
            const tipoMap = {
                bot: 'telegram_bot',
                web: 'web_panel'
            };
            const mapped = tipoMap[userTipo] || userTipo;
            where.usuario = { tipo: mapped };
        }
        if (desde || hasta) {
            where.fechaPago = {};
            if (desde) where.fechaPago.gte = new Date(desde);
            if (hasta) where.fechaPago.lte = new Date(hasta);
        }

        const pagos = await prisma.pago.findMany({
            where,
            include: { usuario: true },
            orderBy: { fechaPago: 'desc' }
        });
        const pagosAjustados = pagos.map(p => {
            // Ajuste para pagos antiguos de créditos sin creditosOtorgados
            if (p.tipo === 'creditos' && (!p.creditosOtorgados || p.creditosOtorgados === 0)) {
                const creditos = p.usuario?.creditos_disponibles || 0;
                return { ...p, creditosOtorgados: creditos, monto: p.monto || inferMontoFromCreditos(creditos) };
            }
            return p;
        });

        // Añadir usuarios activos sin pagos para que aparezcan en la lista
        const filtroUsuario = where.usuario || {};
        const usuariosActivos = await prisma.usuario.findMany({
            where: {
                activo: true,
                ...filtroUsuario
            }
        });
        const usuariosConPago = new Set(pagosAjustados.map(p => p.usuarioId));
        const usuariosSinPago = usuariosActivos.filter(u => !usuariosConPago.has(u.id));
        const pseudoPagos = usuariosSinPago.map(u => {
            const plan = normalizarPlan(u.plan_activo);
            const esCreditos = plan === 'credits' || plan === 'creditos';
            const precioPlan = esCreditos ? 0 : (planPrices[plan] || 0);

            // Estimar monto para créditos si hay saldo (opcional, aproximado)
            let montoCreditos = 0;
            let creditosOtorgados = 0;
            if (esCreditos) {
                creditosOtorgados = u.creditos_disponibles || 0;
                montoCreditos = inferMontoFromCreditos(creditosOtorgados);
            }

            return {
                id: -u.id, // id negativo para diferenciar
                usuarioId: u.id,
                monto: esCreditos ? montoCreditos : precioPlan,
                tipo: esCreditos ? 'creditos' : (plan || 'sin_pago'),
                estado: 'pagado',
                fechaPago: u.fechaAlta || new Date(),
                fechaInicio: u.fechaAlta || new Date(),
                fechaExpiracion: esCreditos ? null : (u.fechaExpiracion || null),
                nota: esCreditos
                    ? (creditosOtorgados > 0 ? 'Créditos activos (auto)' : 'Usuario con créditos (sin registro de pago)')
                    : (plan ? `Plan ${plan} pagado (auto)` : 'Usuario activo sin registro de pago'),
                creditosOtorgados: esCreditos ? creditosOtorgados : 0,
                usuario: u
            };
        });

        res.json([...pagosAjustados, ...pseudoPagos].map(mapPagoConDias));
    } catch (e) {
        console.error('[pagos] getAll error', e);
        res.status(500).json({ error: 'Error al obtener pagos' });
    }
};

exports.getStats = async (_req, res) => {
    try {
        const pagos = await prisma.pago.findMany({ where: {}, orderBy: { fechaPago: 'desc' } });
        const ahora = new Date();
        const hace30 = addDays(ahora, -30);

        const totalIngresos = pagos
            .filter(p => p.estado === 'pagado')
            .reduce((acc, p) => acc + (p.monto || 0), 0);

        const totalIngresos30d = pagos
            .filter(p => p.estado === 'pagado' && new Date(p.fechaPago) >= hace30)
            .reduce((acc, p) => acc + (p.monto || 0), 0);

        const pendientes = pagos.filter(p => p.estado === 'pendiente').length;
        const vencen7d = pagos.filter(p => p.estado === 'pagado' && p.fechaExpiracion && new Date(p.fechaExpiracion) <= addDays(ahora, 7)).length;

        res.json({
            totalPagos: pagos.length,
            totalIngresos,
            totalIngresos30d,
            pendientes,
            vencen7d
        });
    } catch (e) {
        console.error('[pagos] getStats error', e);
        res.status(500).json({ error: 'Error al obtener estadísticas de pagos' });
    }
};

exports.getByUsuario = async (req, res) => {
    try {
        const usuarioId = Number(req.params.usuarioId);
        const pagos = await prisma.pago.findMany({
            where: { usuarioId },
            include: { usuario: true },
            orderBy: { fechaPago: 'desc' }
        });
        res.json(pagos.map(mapPagoConDias));
    } catch (e) {
        console.error('[pagos] getByUsuario error', e);
        res.status(500).json({ error: 'Error al obtener pagos del usuario' });
    }
};

exports.create = async (req, res) => {
    try {
        const {
            usuarioId,
            monto,
            tipo,
            estado = 'pagado',
            fechaPago,
            fechaInicio,
            fechaExpiracion,
            nota,
            duracionDias = 30,
            plan_tipo,
            meses = 1,
            modo,
            paquete_monto,
            creditosOtorgados
        } = req.body;

        if (!usuarioId) {
            return res.status(400).json({ error: 'usuarioId es requerido' });
        }

        // Validar usuario existe
        const usuario = await prisma.usuario.findUnique({ where: { id: Number(usuarioId) } });
        if (!usuario) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const fechaPagoFinal = fechaPago ? new Date(fechaPago) : new Date();
        const fechaInicioFinal = fechaInicio ? new Date(fechaInicio) : fechaPagoFinal;
        // --- MODO CRÉDITOS ---
        if (modo === 'creditos' || tipo === 'creditos' || plan_tipo === 'creditos') {
            const montoSeleccionado = monto !== undefined ? Number(monto) : Number(paquete_monto);
            const pack = creditPackages[montoSeleccionado];
            const creditos = creditosOtorgados !== undefined ? Number(creditosOtorgados) : (pack ? pack.creditos : null);

            if (!montoSeleccionado || !creditos) {
                return res.status(400).json({ error: 'Monto o paquete de créditos inválido' });
            }

            const nuevoPago = await prisma.pago.create({
                data: {
                    usuarioId: Number(usuarioId),
                    monto: montoSeleccionado,
                    tipo: 'creditos',
                    estado,
                    fechaPago: fechaPagoFinal,
                    fechaInicio: fechaInicioFinal,
                    fechaExpiracion: null,
                    nota: nota || 'Compra de créditos',
                    creditosOtorgados: creditos
                },
                include: { usuario: true }
            });

            if (estado === 'pagado') {
                await prisma.usuario.update({
                    where: { id: Number(usuarioId) },
                    data: {
                        creditos_disponibles: (usuario.creditos_disponibles || 0) + creditos,
                        activo: true,
                        plan_activo: usuario.plan_activo || 'credits'
                    }
                });
            }

            return res.status(201).json(mapPagoConDias(nuevoPago));
        }

        // --- MODO PLAN ---
        let fechaExpiracionFinal = fechaExpiracion ? new Date(fechaExpiracion) : null;

        let montoFinal = monto !== undefined ? Number(monto) : null;
        let planFinal = plan_tipo || tipo;
        if (!montoFinal || !fechaExpiracionFinal) {
            const { monto: montoCalc, fechaExpiracion: expCalc } = calcularMontoYExpiracion({
                plan: planFinal,
                meses: Number(meses) || 1,
                fechaInicio: fechaInicioFinal
            });
            if (!montoFinal && montoCalc) montoFinal = montoCalc;
            if (!fechaExpiracionFinal && expCalc) fechaExpiracionFinal = expCalc;
        }

        if (!montoFinal) {
            return res.status(400).json({ error: 'No se pudo calcular el monto: especifique plan_tipo o monto' });
        }
        if (!fechaExpiracionFinal) {
            fechaExpiracionFinal = addDays(fechaInicioFinal, Number(duracionDias) || 30);
        }

        const nuevoPago = await prisma.pago.create({
            data: {
                usuarioId: Number(usuarioId),
                monto: Number(montoFinal),
                tipo: planFinal || tipo || 'manual',
                estado,
                fechaPago: fechaPagoFinal,
                fechaInicio: fechaInicioFinal,
                fechaExpiracion: fechaExpiracionFinal,
                nota,
                creditosOtorgados: 0
            },
            include: { usuario: true }
        });

        // Si está pagado, actualizar fechas del usuario
        if (estado === 'pagado') {
            await prisma.usuario.update({
                where: { id: Number(usuarioId) },
                data: {
                    fechaExpiracion: fechaExpiracionFinal,
                    activo: true,
                    montoPagado: (usuario.montoPagado || 0) + Number(montoFinal),
                    plan_activo: planFinal || usuario.plan_activo
                }
            });
        }

        res.status(201).json(mapPagoConDias(nuevoPago));
    } catch (e) {
        console.error('[pagos] create error', e);
        res.status(500).json({ error: 'Error al crear pago' });
    }
};

exports.update = async (req, res) => {
    try {
        const { id } = req.params;
        const data = req.body;

        const pago = await prisma.pago.findUnique({ where: { id: Number(id) } });
        if (!pago) {
            return res.status(404).json({ error: 'Pago no encontrado' });
        }

        const fechaInicioFinal = data.fechaInicio ? new Date(data.fechaInicio) : pago.fechaInicio || new Date();
        let fechaExpiracionFinal = data.fechaExpiracion ? new Date(data.fechaExpiracion) : pago.fechaExpiracion;
        const fechaPagoFinal = data.fechaPago ? new Date(data.fechaPago) : pago.fechaPago || new Date();

        let montoFinal = data.monto !== undefined ? Number(data.monto) : pago.monto;
        const planFinal = data.plan_tipo || data.tipo || pago.tipo;

        if (!data.monto || !data.fechaExpiracion) {
            const { monto: montoCalc, fechaExpiracion: expCalc } = calcularMontoYExpiracion({
                plan: planFinal,
                meses: Number(data.meses || 1),
                fechaInicio: fechaInicioFinal
            });
            if (data.monto === undefined && montoCalc) montoFinal = montoCalc;
            if (!data.fechaExpiracion && expCalc) fechaExpiracionFinal = expCalc;
        }

        const pagoActualizado = await prisma.pago.update({
            where: { id: Number(id) },
            data: {
                usuarioId: data.usuarioId ? Number(data.usuarioId) : pago.usuarioId,
                monto: montoFinal,
                tipo: planFinal,
                estado: data.estado || pago.estado,
                fechaPago: fechaPagoFinal,
                fechaInicio: fechaInicioFinal,
                fechaExpiracion: fechaExpiracionFinal,
                nota: data.nota !== undefined ? data.nota : pago.nota,
                creditosOtorgados: data.creditosOtorgados !== undefined ? Number(data.creditosOtorgados) : pago.creditosOtorgados
            },
            include: { usuario: true }
        });

        // Si pasa a pagado, refrescar usuario
        if ((data.estado && data.estado === 'pagado') || pagoActualizado.estado === 'pagado') {
            if (planFinal === 'creditos' || pago.tipo === 'creditos') {
                const creditos = data.creditosOtorgados !== undefined ? Number(data.creditosOtorgados) : pagoActualizado.creditosOtorgados;
                if (creditos) {
                    await prisma.usuario.update({
                        where: { id: pagoActualizado.usuarioId },
                        data: {
                            creditos_disponibles: (pago.usuario?.creditos_disponibles || 0) + creditos,
                            activo: true,
                            plan_activo: pago.usuario?.plan_activo || 'credits'
                        }
                    });
                }
            } else {
                await prisma.usuario.update({
                    where: { id: pagoActualizado.usuarioId },
                    data: {
                        fechaExpiracion: pagoActualizado.fechaExpiracion,
                        activo: true
                    }
                });
            }
        }

        res.json(mapPagoConDias(pagoActualizado));
    } catch (e) {
        console.error('[pagos] update error', e);
        res.status(500).json({ error: 'Error al actualizar pago' });
    }
};

exports.remove = async (req, res) => {
    try {
        const { id } = req.params;
        const pago = await prisma.pago.findUnique({ where: { id: Number(id) } });
        if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

        await prisma.pago.delete({ where: { id: Number(id) } });
        res.json({ ok: true });
    } catch (e) {
        console.error('[pagos] remove error', e);
        res.status(500).json({ error: 'Error al eliminar pago' });
    }
};