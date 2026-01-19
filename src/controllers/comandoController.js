const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

// Obtener todos los niveles de acceso
exports.getNiveles = async (req, res) => {
    try {
        const niveles = await prisma.nivelAcceso.findMany();
        res.json(niveles);
    } catch (e) {
        res.status(500).json({ error: 'Error al obtener niveles de acceso' });
    }
};

// Obtener todos los comandos (agrupados por categoría)
exports.getComandos = async (req, res) => {
    try {
        const comandos = await prisma.comando.findMany({
            include: {
                nivelMinimo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            },
            orderBy: [
                { categoria: 'asc' },
                { nombre: 'asc' }
            ]
        });
        res.json(comandos);
    } catch (e) {
        console.error('Error obteniendo comandos:', e);
        res.status(500).json({ error: 'Error al obtener comandos' });
    }
};

// Obtener un comando por ID
exports.getComando = async (req, res) => {
    try {
        const { id } = req.params;
        const comando = await prisma.comando.findUnique({
            where: { id: parseInt(id) },
            include: {
                nivelMinimo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });
        if (!comando) {
            return res.status(404).json({ error: 'Comando no encontrado' });
        }
        res.json(comando);
    } catch (e) {
        console.error('Error obteniendo comando:', e);
        res.status(500).json({ error: 'Error al obtener comando' });
    }
};

// Crear un nuevo comando
exports.createComando = async (req, res) => {
    try {
        let { nombre, descripcion, categoria, activo, nivelMinimoId, canonico, aliases } = req.body;
        
        if (!nombre || !nivelMinimoId) {
            return res.status(400).json({ error: 'Nombre y nivel mínimo son requeridos' });
        }

        // Normalizar nombre: asegurar que empiece con / y sin espacios
        nombre = nombre.trim();
        if (!nombre.startsWith('/')) {
            nombre = '/' + nombre;
        }
        nombre = nombre.toLowerCase(); // Normalizar a minúsculas para consistencia

        // Normalizar categoría: usar las categorías exactas del bot
        // Lista de categorías válidas (EXACTAMENTE como aparecen en el bot)
        const categoriasValidas = [
            'RENIEC', 'ACTAS', 'CERTIFICADOS', 'SUNARP', 'MIGRATORIOS', 
            'DELITOS', 'TELEFONIA', 'FAMILIARES', 'FINANCIERO', 
            'VEHICULOS', 'EXTRAS', 'EXTRAS V2', 'EXTRAS V3'
        ];
        
        let categoriaNormalizada = (categoria || 'RENIEC').trim().toUpperCase();
        
        // Mapear categorías antiguas a las nuevas si es necesario
        const mapeoCategorias = {
            'VEHICULARES': 'VEHICULOS',
            'TELEFONICOS': 'TELEFONIA',
            'ANTECEDENTES': 'DELITOS',
            'FINANCIEROS': 'FINANCIERO',
            'INFORMACION': 'EXTRAS V2',
            'INFORMACIÓN': 'EXTRAS V2',
            'ESPECIALES': 'EXTRAS',
            'INTERNACIONALES': 'MIGRATORIOS',
            'SISTEMA': 'EXTRAS V3'
        };
        
        if (mapeoCategorias[categoriaNormalizada]) {
            categoriaNormalizada = mapeoCategorias[categoriaNormalizada];
        }
        
        // Si la categoría no está en la lista válida, usar RENIEC por defecto
        if (!categoriasValidas.includes(categoriaNormalizada)) {
            categoriaNormalizada = 'RENIEC';
        }

        // Resolver canónico: si no viene, usar nombre normalizado
        const comandoCanonico = (canonico && canonico.trim()) ? canonico.trim().toLowerCase().startsWith('/') ? canonico.trim().toLowerCase() : '/' + canonico.trim().toLowerCase() : nombre;
        // Resolver aliases: si viene como string separado por comas, dividir; si es array, usar; si vacío, usar canónico
        let aliasesList = [];
        if (Array.isArray(aliases)) {
            aliasesList = aliases.filter(Boolean).map(a => a.trim().toLowerCase().startsWith('/') ? a.trim().toLowerCase() : '/' + a.trim().toLowerCase());
        } else if (typeof aliases === 'string') {
            aliasesList = aliases.split(',').map(a => a.trim()).filter(Boolean).map(a => a.startsWith('/') ? a.toLowerCase() : '/' + a.toLowerCase());
        }
        if (aliasesList.length === 0) {
            aliasesList = [comandoCanonico];
        }

        const comando = await prisma.comando.create({
            data: {
                nombre: nombre,
                canonico: comandoCanonico,
                aliases: aliasesList,
                descripcion: (descripcion || '').trim() || null,
                categoria: categoriaNormalizada, // Usar categoría normalizada
                activo: activo !== undefined ? activo : true,
                nivelMinimoId: parseInt(nivelMinimoId)
            },
            include: {
                nivelMinimo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });
        
        res.status(201).json(comando);
    } catch (e) {
        console.error('Error creando comando:', e);
        if (e.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe un comando con ese nombre' });
        }
        res.status(500).json({ error: 'Error al crear comando' });
    }
};

// Actualizar un comando
exports.updateComando = async (req, res) => {
    try {
        const { id } = req.params;
        let { nombre, descripcion, categoria, activo, nivelMinimoId, canonico, aliases } = req.body;
        
        // Normalizar categoría si se proporciona (misma lógica que en createComando)
        let categoriaNormalizada = null;
        if (categoria !== undefined) {
            const categoriasValidas = [
                'RENIEC', 'ACTAS', 'CERTIFICADOS', 'SUNARP', 'MIGRATORIOS', 
                'DELITOS', 'TELEFONIA', 'FAMILIARES', 'FINANCIERO', 
                'VEHICULOS', 'EXTRAS', 'EXTRAS V2', 'EXTRAS V3'
            ];
            
            categoriaNormalizada = categoria.trim().toUpperCase();
            
            const mapeoCategorias = {
                'VEHICULARES': 'VEHICULOS',
                'TELEFONICOS': 'TELEFONIA',
                'ANTECEDENTES': 'DELITOS',
                'FINANCIEROS': 'FINANCIERO',
                'INFORMACION': 'EXTRAS V2',
                'INFORMACIÓN': 'EXTRAS V2',
                'ESPECIALES': 'EXTRAS',
                'INTERNACIONALES': 'MIGRATORIOS',
                'SISTEMA': 'EXTRAS V3'
            };
            
            if (mapeoCategorias[categoriaNormalizada]) {
                categoriaNormalizada = mapeoCategorias[categoriaNormalizada];
            }
            
            if (!categoriasValidas.includes(categoriaNormalizada)) {
                categoriaNormalizada = 'RENIEC';
            }
        }
        
        // Construir objeto de actualización
        const updateData = {};
        
        if (nombre !== undefined) {
            // Normalizar nombre: asegurar que empiece con / y sin espacios
            nombre = nombre.trim();
            if (!nombre.startsWith('/')) {
                nombre = '/' + nombre;
            }
            nombre = nombre.toLowerCase(); // Normalizar a minúsculas
            updateData.nombre = nombre;
        }
        // Canonico
        if (canonico !== undefined) {
            const canonNorm = canonico && canonico.trim()
                ? (canonico.trim().toLowerCase().startsWith('/') ? canonico.trim().toLowerCase() : '/' + canonico.trim().toLowerCase())
                : (nombre || '').trim();
            if (canonNorm) {
                updateData.canonico = canonNorm;
            }
        }
        // Aliases
        if (aliases !== undefined) {
            let aliasesList = [];
            if (Array.isArray(aliases)) {
                aliasesList = aliases.filter(Boolean).map(a => a.trim().toLowerCase().startsWith('/') ? a.trim().toLowerCase() : '/' + a.trim().toLowerCase());
            } else if (typeof aliases === 'string') {
                aliasesList = aliases.split(',').map(a => a.trim()).filter(Boolean).map(a => a.startsWith('/') ? a.toLowerCase() : '/' + a.toLowerCase());
            }
            if (aliasesList.length === 0 && (updateData.canonico || nombre)) {
                aliasesList = [updateData.canonico || nombre];
            }
            if (aliasesList.length > 0) {
                updateData.aliases = aliasesList;
            }
        }
        
        if (descripcion !== undefined) {
            updateData.descripcion = descripcion.trim() || null;
        }
        
        if (categoriaNormalizada !== null) {
            updateData.categoria = categoriaNormalizada;
        }
        
        if (activo !== undefined) {
            updateData.activo = activo;
        }
        
        if (nivelMinimoId !== undefined) {
            updateData.nivelMinimoId = parseInt(nivelMinimoId);
        }
        
        const comando = await prisma.comando.update({
            where: { id: parseInt(id) },
            data: updateData,
            include: {
                nivelMinimo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });
        
        res.json(comando);
    } catch (e) {
        console.error('Error actualizando comando:', e);
        if (e.code === 'P2025') {
            return res.status(404).json({ error: 'Comando no encontrado' });
        }
        if (e.code === 'P2002') {
            return res.status(400).json({ error: 'Ya existe un comando con ese nombre' });
        }
        res.status(500).json({ error: 'Error al actualizar comando' });
    }
};

// Eliminar un comando
exports.deleteComando = async (req, res) => {
    try {
        const { id } = req.params;
        
        await prisma.comando.delete({
            where: { id: parseInt(id) }
        });
        
        res.json({ message: 'Comando eliminado correctamente' });
    } catch (e) {
        console.error('Error eliminando comando:', e);
        if (e.code === 'P2025') {
            return res.status(404).json({ error: 'Comando no encontrado' });
        }
        res.status(500).json({ error: 'Error al eliminar comando' });
    }
};

// Activar/Desactivar un comando
exports.toggleComando = async (req, res) => {
    try {
        const { id } = req.params;
        
        const comando = await prisma.comando.findUnique({
            where: { id: parseInt(id) }
        });
        
        if (!comando) {
            return res.status(404).json({ error: 'Comando no encontrado' });
        }
        
        const comandoActualizado = await prisma.comando.update({
            where: { id: parseInt(id) },
            data: {
                activo: !comando.activo
            },
            include: {
                nivelMinimo: {
                    select: {
                        id: true,
                        nombre: true
                    }
                }
            }
        });
        
        res.json(comandoActualizado);
    } catch (e) {
        console.error('Error cambiando estado del comando:', e);
        res.status(500).json({ error: 'Error al cambiar estado del comando' });
    }
}; 