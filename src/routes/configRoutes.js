const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Archivo donde se guarda la URL del backend (actualizado por el script de systemd)
const BACKEND_URL_FILE = path.join(__dirname, '..', '..', 'cloudflare_backend_url.txt');

// Endpoint para obtener la URL del backend desde Cloudflare
router.get('/api/config/backend-url', async (req, res) => {
    try {
        let backendUrl = null;
        
        // Intentar leer desde archivo (actualizado por script de systemd)
        try {
            if (fs.existsSync(BACKEND_URL_FILE)) {
                const url = fs.readFileSync(BACKEND_URL_FILE, 'utf-8').trim();
                if (url && url.startsWith('https://')) {
                    backendUrl = url;
                }
            }
        } catch (e) {
            console.log('⚠️ No se pudo leer archivo de URL:', e.message);
        }
        
        // Si no se encontró, intentar desde variable de entorno
        if (!backendUrl && process.env.BACKEND_CLOUDFLARE_URL) {
            backendUrl = process.env.BACKEND_CLOUDFLARE_URL;
        }
        
        if (backendUrl) {
            res.json({ 
                backendUrl,
                timestamp: new Date().toISOString()
            });
        } else {
            // Fallback a localhost si no se encuentra
            res.json({ 
                backendUrl: 'http://localhost:4000',
                timestamp: new Date().toISOString(),
                warning: 'No se encontró URL de Cloudflare, usando localhost'
            });
        }
    } catch (error) {
        console.error('❌ Error obteniendo URL del backend:', error);
        res.status(500).json({ 
            error: 'Error obteniendo URL del backend',
            backendUrl: 'http://localhost:4000'
        });
    }
});

module.exports = router;

