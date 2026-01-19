const { PrismaClient } = require('../../generated/prisma');
const crypto = require('crypto');
const prisma = new PrismaClient();

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const normalizeLimit = (limiteDiario) => {
  if (limiteDiario === null || limiteDiario === undefined) return null;
  const num = Number(limiteDiario);
  if (Number.isNaN(num) || num <= 0) return null;
  return num;
};

const resolveUsuarioId = async (usuarioId) => {
  if (!usuarioId) return null;
  const asNumber = Number(usuarioId);
  const user = await prisma.usuario.findFirst({
    where: {
      OR: [
        { id: Number.isNaN(asNumber) ? -1 : asNumber },
        { user_id: usuarioId?.toString() },
        { username: usuarioId?.toString() }
      ]
    }
  });
  return user ? user.id : null;
};

exports.list = async (_req, res) => {
  try {
    const tokens = await prisma.apiToken.findMany({
      include: {
        comandos: {
          include: { comando: true }
        },
        usuario: true
      },
      orderBy: { id: 'desc' }
    });
    res.json(tokens);
  } catch (e) {
    console.error('[api-tokens] list error', e);
    res.status(500).json({ error: 'Error al obtener tokens' });
  }
};

exports.create = async (req, res) => {
  try {
    const {
      usuarioId,
      grupoId,
      modo = 'plan',
      estado = 'activo',
      limiteDiario,
      fechaExp,
      creditos = 0,
      notas,
      comandoIds
    } = req.body;

    let usuarioIdFinal = null;
    if (usuarioId) {
      usuarioIdFinal = await resolveUsuarioId(usuarioId);
      if (!usuarioIdFinal) {
        return res.status(400).json({ error: 'Usuario no encontrado' });
      }
    }

    if (!usuarioIdFinal && !grupoId) {
      return res.status(400).json({ error: 'usuarioId o grupoId es requerido' });
    }

    const fechaInicio = new Date();
    const fechaExpFinal =
      fechaExp ? new Date(fechaExp) : (modo === 'plan' ? addDays(fechaInicio, 30) : null);

    const limiteFinal = normalizeLimit(limiteDiario);
    const token = crypto.randomBytes(24).toString('hex');

    // Si no envían comandoIds, tomar todos los comandos actuales
    let comandosParaAsignar = comandoIds;
    if (!Array.isArray(comandoIds) || comandoIds.length === 0) {
      const all = await prisma.comando.findMany({ select: { id: true }, where: { activo: true } });
      comandosParaAsignar = all.map(c => c.id);
    }

    const nuevo = await prisma.apiToken.create({
      data: {
        usuarioId: usuarioIdFinal ? Number(usuarioIdFinal) : null,
        grupoId: grupoId ? Number(grupoId) : null,
        token,
        modo,
        estado,
        limiteDiario: limiteFinal,
        fechaInicio,
        fechaExp: fechaExpFinal,
        creditos: Number(creditos) || 0,
        notas
      },
      include: { usuario: true }
    });

    if (comandosParaAsignar && comandosParaAsignar.length > 0) {
      await prisma.apiTokenComando.createMany({
        data: comandosParaAsignar.map(id => ({
          apiTokenId: nuevo.id,
          comandoId: Number(id),
          permitido: true
        }))
      });
    }

    const completo = await prisma.apiToken.findUnique({
      where: { id: nuevo.id },
      include: { comandos: { include: { comando: true } }, usuario: true }
    });

    res.status(201).json(completo);
  } catch (e) {
    console.error('[api-tokens] create error', e);
    res.status(500).json({ error: 'Error al crear token' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      usuarioId,
      grupoId,
      modo,
      estado,
      limiteDiario,
      fechaExp,
      creditos,
      notas,
      comandoIds
    } = req.body;

    const tokenExist = await prisma.apiToken.findUnique({ where: { id: Number(id) } });
    if (!tokenExist) {
      return res.status(404).json({ error: 'Token no encontrado' });
    }

    const limiteFinal = normalizeLimit(limiteDiario);
    let usuarioIdFinal = tokenExist.usuarioId;
    if (usuarioId !== undefined) {
      usuarioIdFinal = await resolveUsuarioId(usuarioId);
      if (usuarioId && !usuarioIdFinal) {
        return res.status(400).json({ error: 'Usuario no encontrado' });
      }
    }

    await prisma.apiToken.update({
      where: { id: Number(id) },
      data: {
        usuarioId: usuarioId !== undefined ? usuarioIdFinal : tokenExist.usuarioId,
        grupoId: grupoId !== undefined ? Number(grupoId) : tokenExist.grupoId,
        modo: modo || tokenExist.modo,
        estado: estado || tokenExist.estado,
        limiteDiario: limiteFinal !== undefined ? limiteFinal : tokenExist.limiteDiario,
        fechaExp: fechaExp ? new Date(fechaExp) : tokenExist.fechaExp,
        creditos: creditos !== undefined ? Number(creditos) : tokenExist.creditos,
        notas: notas !== undefined ? notas : tokenExist.notas
      }
    });

    if (Array.isArray(comandoIds)) {
      await prisma.apiTokenComando.deleteMany({ where: { apiTokenId: Number(id) } });
      if (comandoIds.length > 0) {
        await prisma.apiTokenComando.createMany({
          data: comandoIds.map(cid => ({
            apiTokenId: Number(id),
            comandoId: Number(cid),
            permitido: true
          }))
        });
      }
    }

    const completo = await prisma.apiToken.findUnique({
      where: { id: Number(id) },
      include: { comandos: { include: { comando: true } }, usuario: true }
    });

    res.json(completo);
  } catch (e) {
    console.error('[api-tokens] update error', e);
    res.status(500).json({ error: 'Error al actualizar token' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.apiTokenComando.deleteMany({ where: { apiTokenId: Number(id) } });
    await prisma.apiToken.delete({ where: { id: Number(id) } });
    res.json({ ok: true });
  } catch (e) {
    console.error('[api-tokens] delete error', e);
    res.status(500).json({ error: 'Error al eliminar token' });
  }
};

