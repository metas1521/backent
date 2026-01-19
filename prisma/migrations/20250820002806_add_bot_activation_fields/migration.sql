-- CreateTable
CREATE TABLE "Usuario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "user_id" TEXT,
    "password" TEXT NOT NULL,
    "fechaAlta" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaExpiracion" DATETIME,
    "creditos" INTEGER NOT NULL DEFAULT 0,
    "montoPagado" REAL NOT NULL DEFAULT 0,
    "nivelAccesoId" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "tipo" TEXT NOT NULL DEFAULT 'web_panel',
    "fecha_registro" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo_activacion" TEXT,
    "plan_activo" TEXT,
    "creditos_disponibles" INTEGER DEFAULT 0,
    "consultas_usadas" INTEGER DEFAULT 0,
    CONSTRAINT "Usuario_nivelAccesoId_fkey" FOREIGN KEY ("nivelAccesoId") REFERENCES "NivelAcceso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "fechaPago" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comando" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "nivelMinimoId" INTEGER NOT NULL,
    CONSTRAINT "Comando_nivelMinimoId_fkey" FOREIGN KEY ("nivelMinimoId") REFERENCES "NivelAcceso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsuarioComando" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "comandoId" INTEGER NOT NULL,
    CONSTRAINT "UsuarioComando_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UsuarioComando_comandoId_fkey" FOREIGN KEY ("comandoId") REFERENCES "Comando" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NivelAcceso" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "precio" REAL NOT NULL,
    "duracion" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "UsuarioWeb" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "cuw" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsuarioTelegram" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "cut" TEXT NOT NULL,
    "creadoEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Consulta" (
    "cq" TEXT NOT NULL PRIMARY KEY,
    "canal" TEXT NOT NULL,
    "userWebId" INTEGER,
    "userTGId" INTEGER,
    "sc" TEXT,
    "botObjetivo" TEXT,
    "messageIdEnviado" TEXT,
    "payload" TEXT NOT NULL,
    "resultText" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "costo" INTEGER NOT NULL DEFAULT 1,
    "latenciaMs" INTEGER,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadaEn" DATETIME NOT NULL,
    CONSTRAINT "Consulta_userWebId_fkey" FOREIGN KEY ("userWebId") REFERENCES "UsuarioWeb" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Consulta_userTGId_fkey" FOREIGN KEY ("userTGId") REFERENCES "UsuarioTelegram" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Ledger" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "canal" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "concepto" TEXT NOT NULL,
    "creadaEn" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userWebId" INTEGER,
    "userTGId" INTEGER,
    "cq" TEXT,
    CONSTRAINT "Ledger_userWebId_fkey" FOREIGN KEY ("userWebId") REFERENCES "UsuarioWeb" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ledger_userTGId_fkey" FOREIGN KEY ("userTGId") REFERENCES "UsuarioTelegram" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Ledger_cq_fkey" FOREIGN KEY ("cq") REFERENCES "Consulta" ("cq") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Comando_nombre_key" ON "Comando"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "NivelAcceso_nombre_key" ON "NivelAcceso"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_nombre_key" ON "Plan"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioWeb_email_key" ON "UsuarioWeb"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioWeb_cuw_key" ON "UsuarioWeb"("cuw");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioTelegram_telegramId_key" ON "UsuarioTelegram"("telegramId");

-- CreateIndex
CREATE UNIQUE INDEX "UsuarioTelegram_cut_key" ON "UsuarioTelegram"("cut");
