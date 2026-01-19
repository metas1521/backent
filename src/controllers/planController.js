const { PrismaClient } = require('../../generated/prisma');

const prisma = new PrismaClient();

// Obtener todos los planes
exports.getAll = async (req, res) => {
  try {
    const planes = await prisma.plan.findMany({ 
      orderBy: { precio: 'asc' } 
    });
    
    // Si no hay planes, crear los planes por defecto
    if (planes.length === 0) {
      await crearPlanesPorDefecto();
      const planesCreados = await prisma.plan.findMany({ 
        orderBy: { precio: 'asc' } 
      });
      return res.json(planesCreados);
    }
    
    res.json(planes);
  } catch (e) {
    console.error('Error al listar planes:', e);
    res.status(500).json({ error: 'Error al listar planes' });
  }
};

// Crear un nuevo plan
exports.create = async (req, res) => {
  try {
    const { nombre, precio, duracion, tipo, descripcion, comandosPermitidos, creditosIncluidos } = req.body;
    
    if (!nombre || typeof precio !== 'number' || typeof duracion !== 'number' || !tipo) {
      return res.status(400).json({ error: 'Datos incompletos' });
    }
    
    const nuevo = await prisma.plan.create({ 
      data: { 
        nombre, 
        precio, 
        duracion, 
        tipo,
        descripcion: descripcion || '',
        comandosPermitidos: comandosPermitidos || '',
        creditosIncluidos: creditosIncluidos || 0
      } 
    });
    
    res.status(201).json(nuevo);
  } catch (e) {
    console.error('Error al crear plan:', e);
    res.status(500).json({ error: 'Error al crear plan' });
  }
};

// Actualizar un plan
exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { nombre, precio, duracion, tipo, descripcion, comandosPermitidos, creditosIncluidos } = req.body;
    
    const actualizado = await prisma.plan.update({ 
      where: { id }, 
      data: { 
        nombre, 
        precio, 
        duracion, 
        tipo,
        descripcion: descripcion || '',
        comandosPermitidos: comandosPermitidos || '',
        creditosIncluidos: creditosIncluidos || 0
      } 
    });
    
    res.json(actualizado);
  } catch (e) {
    console.error('Error al actualizar plan:', e);
    res.status(500).json({ error: 'Error al actualizar plan' });
  }
};

// Eliminar un plan
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.plan.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) {
    console.error('Error al eliminar plan:', e);
    res.status(500).json({ error: 'Error al eliminar plan' });
  }
};

// Obtener plan por ID
exports.getById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const plan = await prisma.plan.findUnique({ where: { id } });
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }
    
    res.json(plan);
  } catch (e) {
    console.error('Error al obtener plan:', e);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
};

// Obtener plan por tipo
exports.getByTipo = async (req, res) => {
  try {
    const { tipo } = req.params;
    const plan = await prisma.plan.findFirst({ where: { tipo: tipo.toLowerCase() } });
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }
    
    res.json(plan);
  } catch (e) {
    console.error('Error al obtener plan por tipo:', e);
    res.status(500).json({ error: 'Error al obtener plan' });
  }
};

// Activar plan para un usuario
exports.activarPlan = async (req, res) => {
  try {
    const { userId, planId, metodoPago, comprobante } = req.body;
    
    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId y planId son requeridos' });
    }
    
    // Verificar que el usuario existe
    const usuario = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Verificar que el plan existe
    const plan = await prisma.plan.findUnique({ where: { id: parseInt(planId) } });
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }
    
    // Calcular fecha de expiración
    const fechaActivacion = new Date();
    const fechaExpiracion = new Date(fechaActivacion.getTime() + (plan.duracion * 24 * 60 * 60 * 1000));
    
    // Actualizar usuario con el plan activo
    const usuarioActualizado = await prisma.usuario.update({
      where: { id: parseInt(userId) },
      data: {
        tipo_activacion: 'plan',
        plan_activo: plan.tipo,
        fecha_activacion: fechaActivacion,
        fecha_expiracion: fechaExpiracion,
        creditos_disponibles: plan.creditosIncluidos || 0,
        consultas_usadas: 0,
        activo: true
      }
    });
    
    // Crear registro de pago
    const pago = await prisma.pago.create({
      data: {
        usuarioId: parseInt(userId),
        monto: plan.precio,
        tipo: `Plan ${plan.tipo} - ${plan.duracion} días`,
        fechaPago: fechaActivacion
      }
    });
    
    // Crear entrada en el ledger
    await prisma.ledger.create({
      data: {
        canal: 'WEB',
        amount: plan.creditosIncluidos || 0,
        concepto: `ACTIVACIÓN PLAN ${plan.tipo.toUpperCase()}`,
        userWebId: parseInt(userId)
      }
    });
    
    console.log(`✅ Plan ${plan.tipo} activado para usuario ${userId}`);
    
    res.json({
      ok: true,
      mensaje: `Plan ${plan.tipo} activado exitosamente`,
      usuario: usuarioActualizado,
      plan: plan,
      pago: pago,
      fechaActivacion: fechaActivacion,
      fechaExpiracion: fechaExpiracion
    });
    
  } catch (e) {
    console.error('Error al activar plan:', e);
    res.status(500).json({ error: 'Error al activar plan' });
  }
};

// Verificar estado del plan de un usuario
exports.verificarEstadoPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }
    
    const usuario = await prisma.usuario.findUnique({ 
      where: { id: parseInt(userId) },
      include: { nivelAcceso: true }
    });
    
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    let estadoPlan = {
      tienePlan: false,
      planActivo: null,
      fechaActivacion: null,
      fechaExpiracion: null,
      diasRestantes: 0,
      consultasUsadas: 0,
      consultasDisponibles: 0,
      creditosDisponibles: usuario.creditos_disponibles || 0,
      tipoActivacion: usuario.tipo_activacion || 'credits',
      activo: usuario.activo || false
    };
    
    // Si el usuario tiene plan activo
    if (usuario.tipo_activacion === 'plan' && usuario.plan_activo) {
      const ahora = new Date();
      const fechaExpiracion = new Date(usuario.fecha_expiracion);
      const diasRestantes = Math.ceil((fechaExpiracion - ahora) / (1000 * 60 * 60 * 24));
      
      estadoPlan = {
        ...estadoPlan,
        tienePlan: true,
        planActivo: usuario.plan_activo,
        fechaActivacion: usuario.fecha_activacion,
        fechaExpiracion: usuario.fecha_expiracion,
        diasRestantes: Math.max(0, diasRestantes),
        consultasUsadas: usuario.consultas_usadas || 0,
        consultasDisponibles: diasRestantes > 0 ? 'ilimitado' : 0
      };
      
      // Si el plan ha expirado, desactivarlo
      if (diasRestantes <= 0) {
        await prisma.usuario.update({
          where: { id: parseInt(userId) },
          data: {
            tipo_activacion: 'credits',
            plan_activo: null,
            fecha_activacion: null,
            fecha_expiracion: null,
            activo: false
          }
        });
        
        estadoPlan.tienePlan = false;
        estadoPlan.planActivo = null;
        estadoPlan.activo = false;
      }
    }
    
    res.json({
      ok: true,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        username: usuario.username,
        nivelAcceso: usuario.nivelAcceso?.nombre
      },
      estadoPlan: estadoPlan
    });
    
  } catch (e) {
    console.error('Error al verificar estado del plan:', e);
    res.status(500).json({ error: 'Error al verificar estado del plan' });
  }
};

// Renovar plan de un usuario
exports.renovarPlan = async (req, res) => {
  try {
    const { userId, planId } = req.body;
    
    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId y planId son requeridos' });
    }
    
    // Verificar que el usuario existe
    const usuario = await prisma.usuario.findUnique({ where: { id: parseInt(userId) } });
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    // Verificar que el plan existe
    const plan = await prisma.plan.findUnique({ where: { id: parseInt(planId) } });
    if (!plan) {
      return res.status(404).json({ error: 'Plan no encontrado' });
    }
    
    // Calcular nueva fecha de expiración
    const ahora = new Date();
    let nuevaFechaExpiracion;
    
    if (usuario.fecha_expiracion && usuario.fecha_expiracion > ahora) {
      // Si el plan actual no ha expirado, extender desde la fecha actual
      nuevaFechaExpiracion = new Date(usuario.fecha_expiracion.getTime() + (plan.duracion * 24 * 60 * 60 * 1000));
    } else {
      // Si el plan ha expirado, empezar desde ahora
      nuevaFechaExpiracion = new Date(ahora.getTime() + (plan.duracion * 24 * 60 * 60 * 1000));
    }
    
    // Actualizar usuario
    const usuarioActualizado = await prisma.usuario.update({
      where: { id: parseInt(userId) },
      data: {
        tipo_activacion: 'plan',
        plan_activo: plan.tipo,
        fecha_activacion: ahora,
        fecha_expiracion: nuevaFechaExpiracion,
        creditos_disponibles: { increment: plan.creditosIncluidos || 0 },
        consultas_usadas: 0, // Resetear contador de consultas
        activo: true
      }
    });
    
    // Crear registro de pago
    const pago = await prisma.pago.create({
      data: {
        usuarioId: parseInt(userId),
        monto: plan.precio,
        tipo: `Renovación Plan ${plan.tipo} - ${plan.duracion} días`,
        fechaPago: ahora
      }
    });
    
    // Crear entrada en el ledger
    await prisma.ledger.create({
      data: {
        canal: 'WEB',
        amount: plan.creditosIncluidos || 0,
        concepto: `RENOVACIÓN PLAN ${plan.tipo.toUpperCase()}`,
        userWebId: parseInt(userId)
      }
    });
    
    console.log(`✅ Plan ${plan.tipo} renovado para usuario ${userId}`);
    
    res.json({
      ok: true,
      mensaje: `Plan ${plan.tipo} renovado exitosamente`,
      usuario: usuarioActualizado,
      plan: plan,
      pago: pago,
      fechaActivacion: ahora,
      fechaExpiracion: nuevaFechaExpiracion
    });
    
  } catch (e) {
    console.error('Error al renovar plan:', e);
    res.status(500).json({ error: 'Error al renovar plan' });
  }
};

// Función para crear planes por defecto
async function crearPlanesPorDefecto() {
  try {
    const planesPorDefecto = [
      {
        nombre: 'Plan Básico',
        precio: 29.90,
        duracion: 30,
        tipo: 'basico',
        descripcion: 'Acceso a 10 comandos básicos de RENIEC',
        comandosPermitidos: '/dni, /dnif, /dnid, /dnifd, /dnivir, /dnive, /nm, /c4, /c4w, /c4t',
        creditosIncluidos: 50
      },
      {
        nombre: 'Plan VIP',
        precio: 49.90,
        duracion: 30,
        tipo: 'vip',
        descripcion: 'Acceso a 20 comandos incluyendo SUNARP, telefonía y familiares',
        comandosPermitidos: 'Plan Básico + /licencia, /ag, /agv, /tel, /bitel, /claro, /sunarp, /pla, /placap, /tra, /sunedu',
        creditosIncluidos: 100
      },
      {
        nombre: 'Plan DOXER',
        precio: 79.90,
        duracion: 30,
        tipo: 'doxer',
        descripcion: 'Acceso a 30 comandos incluyendo antecedentes y extranjeros',
        comandosPermitidos: 'Plan VIP + /afp, /finan, /co, /dir, /sunat, /mtc, /antpenal, /antpol, /antjud, /seeker',
        creditosIncluidos: 200
      },
      {
        nombre: 'Plan HACKER',
        precio: 149.90,
        duracion: 30,
        tipo: 'hacker',
        descripcion: 'Acceso completo a todos los comandos sin restricciones',
        comandosPermitidos: 'Todos los comandos disponibles',
        creditosIncluidos: 500
      }
    ];
    
    for (const planData of planesPorDefecto) {
      await prisma.plan.create({ data: planData });
      console.log(`✅ Plan creado: ${planData.nombre}`);
    }
    
    console.log('✅ Todos los planes por defecto han sido creados');
    
  } catch (error) {
    console.error('❌ Error creando planes por defecto:', error);
  }
}

module.exports = exports;



