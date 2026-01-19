// Middleware de autenticación básico
// Por ahora solo verifica que exista un token en los headers
// En producción deberías implementar verificación JWT real

const authMiddleware = (req, res, next) => {
    // Para desarrollo, permitir peticiones sin token
    // En producción, descomenta las líneas de abajo
    
    // Verificar si existe un token de autorización
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        // En desarrollo, permitir sin token
        console.log('⚠️  Petición sin token - permitiendo en desarrollo');
        return next();
        
        // En producción, descomenta esta línea:
        // return res.status(401).json({ error: 'Token de autorización requerido' });
    }
    
    // Por ahora solo verificamos que exista el header
    // En producción deberías verificar el JWT
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        
        if (token && token.length > 0) {
            // Token válido, continuar
            next();
        } else {
            return res.status(401).json({ error: 'Token inválido' });
        }
    } else {
        return res.status(401).json({ error: 'Formato de token inválido' });
    }
};

module.exports = authMiddleware;
