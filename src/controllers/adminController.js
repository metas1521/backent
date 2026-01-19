const { PrismaClient } = require('../../generated/prisma');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const prisma = new PrismaClient();

exports.login = async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Faltan credenciales' });
    }
    const user = await prisma.usuario.findFirst({
        where: {
            username: {
                equals: username,
                mode: 'insensitive'
            }
        }
    });
    if (!user) {
        return res.status(401).json({ error: 'Usuario no encontrado' });
    }
    const valid = await bcrypt.compare(password, user.password || '');
    if (!valid) {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }
    // Solo permitir acceso a administradores (nivelAccesoId === 1)
    if (user.nivelAccesoId !== 1) {
        return res.status(403).json({ error: 'No autorizado' });
    }
    const token = jwt.sign({ id: user.id, username: user.username, nivelAccesoId: user.nivelAccesoId }, process.env.JWT_SECRET || 'secret', { expiresIn: '8h' });
    res.json({ token });
}; 