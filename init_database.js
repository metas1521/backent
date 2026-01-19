const { PrismaClient } = require('./generated/prisma');
const bcrypt = require('bcrypt');
const path = require('path');

// Cargar .env desde la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

async function initDatabase() {
    try {
        console.log('🔧 Inicializando base de datos...');

        // Crear niveles de acceso
        const niveles = [
            { id: 1, nombre: 'BÁSICO', descripcion: 'Acceso básico a comandos' },
            { id: 2, nombre: 'VIP', descripcion: 'Acceso VIP a comandos avanzados' },
            { id: 3, nombre: 'DOXER', descripcion: 'Acceso DOXER a comandos especializados' },
            { id: 4, nombre: 'HACKER', descripcion: 'Acceso HACKER a todos los comandos' }
        ];

        for (const nivel of niveles) {
            await prisma.nivelAcceso.upsert({
                where: { id: nivel.id },
                update: nivel,
                create: nivel
            });
            console.log(`✅ Nivel de acceso creado: ${nivel.nombre}`);
        }

        // Crear usuario administrador
        const adminPassword = await bcrypt.hash('admin123', 10);
        await prisma.usuario.upsert({
            where: { username: 'admin' },
            update: {
                password: adminPassword,
                nivelAccesoId: 1,
                activo: true
            },
            create: {
                nombre: 'Administrador',
                username: 'admin',
                password: adminPassword,
                creditos: 999999,
                montoPagado: 0,
                activo: true,
                nivelAccesoId: 1
            }
        });
        console.log('✅ Usuario administrador creado');

        // Crear algunos comandos de ejemplo
        const comandos = [
            { nombre: '/tel', descripcion: 'Consulta telefónica', nivelMinimoId: 1 },
            { nombre: '/dnivir', descripcion: 'Consulta DNI', nivelMinimoId: 1 },
            { nombre: '/reniec', descripcion: 'Consulta RENIEC', nivelMinimoId: 1 },
            { nombre: '/sunarp', descripcion: 'Consulta SUNARP', nivelMinimoId: 2 },
            { nombre: '/actas', descripcion: 'Consulta de actas', nivelMinimoId: 2 },
            { nombre: '/delitos', descripcion: 'Consulta de delitos', nivelMinimoId: 3 },
            { nombre: '/familiares', descripcion: 'Consulta de familiares', nivelMinimoId: 3 },
            { nombre: '/financiero', descripcion: 'Consulta financiera', nivelMinimoId: 4 }
        ];

        for (const comando of comandos) {
            await prisma.comando.upsert({
                where: { nombre: comando.nombre },
                update: comando,
                create: comando
            });
            console.log(`✅ Comando creado: ${comando.nombre}`);
        }

        // Crear planes de ejemplo
        const planes = [
            { nombre: 'Plan Básico', precio: 10.00, duracion: 30, tipo: 'BÁSICO' },
            { nombre: 'Plan VIP', precio: 25.00, duracion: 30, tipo: 'VIP' },
            { nombre: 'Plan DOXER', precio: 50.00, duracion: 30, tipo: 'DOXER' },
            { nombre: 'Plan HACKER', precio: 100.00, duracion: 30, tipo: 'HACKER' }
        ];

        for (const plan of planes) {
            try {
                await prisma.plan.create({
                    data: plan
                });
                console.log(`✅ Plan creado: ${plan.nombre}`);
            } catch (error) {
                if (error.code === 'P2002') {
                    console.log(`ℹ️ Plan ya existe: ${plan.nombre}`);
                } else {
                    console.error(`❌ Error creando plan ${plan.nombre}:`, error);
                }
            }
        }

        console.log('🎉 Base de datos inicializada correctamente');
        console.log('📋 Credenciales de administrador:');
        console.log('   Usuario: admin');
        console.log('   Contraseña: [CONFIGURADA - NO MOSTRAR]');

    } catch (error) {
        console.error('❌ Error inicializando base de datos:', error);
    } finally {
        await prisma.$disconnect();
    }
}

initDatabase(); 