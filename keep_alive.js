// Script para mantener vivo el backend en Replit
const http = require('http');
const express = require('express');

const app = express();

// Endpoint básico para health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'alive', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Endpoint principal
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Backend BMRX is running!' });
});

// Servidor HTTP adicional para keep-alive
const keepAliveServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Backend is alive!\n');
});

// Iniciar servidor keep-alive en puerto diferente
keepAliveServer.listen(8080, () => {
  console.log('🔄 Keep-alive server running on port 8080');
});

// Ping cada 4 minutos para mantener activo
setInterval(() => {
  console.log(`🔄 Keep-alive ping: ${new Date().toISOString()}`);
  
  // Hacer petición a sí mismo
  http.get('http://localhost:8080', (res) => {
    console.log('✅ Self-ping successful');
  }).on('error', (err) => {
    console.log('❌ Self-ping failed:', err.message);
  });
}, 240000); // 4 minutos

console.log('🚀 Keep-alive script initialized');
