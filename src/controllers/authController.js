const { PrismaClient } = require('../../generated/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

exports.login = async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Faltan credenciales' });
  }
  
  try {
    console.log(`🔐 [LOGIN] Intentando login para usuario: ${username}`);
    
    // Buscar usuario por username
    const user = await prisma.usuario.findFirst({
      where: { 
        username: username,
        activo: true // Solo usuarios activos
      },
      include: {
        nivelAcceso: true // Incluir información del nivel de acceso
      }
    });

    if (!user) {
      console.log(`❌ [LOGIN] Usuario no encontrado: ${username}`);
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
    }

    // Verificar contraseña
    const passwordValid = await bcrypt.compare(password, user.password || '');
    if (!passwordValid) {
      console.log(`❌ [LOGIN] Contraseña incorrecta para: ${username}`);
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // Verificar que el usuario esté activo
    if (!user.activo) {
      console.log(`❌ [LOGIN] Usuario inactivo: ${username}`);
      return res.status(403).json({ error: 'Usuario inactivo' });
    }

    // Crear token JWT con información del usuario
    const tokenPayload = {
      id: user.id,
      username: user.username,
      nombre: user.nombre,
      nivelAccesoId: user.nivelAccesoId,
      nivelAcceso: user.nivelAcceso?.nombre,
      tipo: user.tipo || 'web_panel',
      activo: user.activo
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '8h' }
    );

    console.log(`✅ [LOGIN] Login exitoso para: ${username}`);
    console.log(`   🎯 Nivel de acceso: ${user.nivelAcceso?.nombre} (ID: ${user.nivelAccesoId})`);
    console.log(`   🏷️ Tipo: ${user.tipo || 'web_panel'}`);
    console.log(`   ✅ Estado: ${user.activo ? 'Activo' : 'Inactivo'}`);

    // Devolver token y información del usuario
    res.json({ 
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre: user.nombre,
        nivelAccesoId: user.nivelAccesoId,
        nivelAcceso: user.nivelAcceso?.nombre,
        tipo: user.tipo || 'web_panel',
        activo: user.activo
      }
    });

  } catch (error) {
    console.error('❌ [LOGIN] Error en autenticación:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Verificar token (middleware)
exports.verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded;
    next();
  } catch (error) {
    console.error('❌ [VERIFY] Error verificando token:', error);
    return res.status(401).json({ error: 'Token inválido' });
  }
};

// Verificar si es admin
exports.requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || req.user.nivelAccesoId !== 1) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere nivel de administrador.' });
    }
    next();
  } catch (error) {
    console.error('❌ [ADMIN] Error verificando admin:', error);
    return res.status(403).json({ error: 'Error verificando permisos de administrador' });
  }
};

// Verificar si es usuario normal
exports.requireUser = async (req, res, next) => {
  try {
    if (!req.user || req.user.nivelAccesoId !== 2) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere nivel de usuario.' });
    }
    next();
  } catch (error) {
    console.error('❌ [USER] Error verificando usuario:', error);
    return res.status(403).json({ error: 'Error verificando permisos de usuario' });
  }
};



