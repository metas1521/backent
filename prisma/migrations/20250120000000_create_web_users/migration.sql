-- CreateTable
CREATE TABLE "WebUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "creditos_disponibles" INTEGER NOT NULL DEFAULT 0,
    "bot_activado" BOOLEAN NOT NULL DEFAULT false,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "fecha_registro" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_acceso" DATETIME,
    "sesiones_activas" INTEGER NOT NULL DEFAULT 0,
    "plan_tipo" TEXT NOT NULL DEFAULT 'basico',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WebUser_username_key" ON "WebUser"("username");
CREATE UNIQUE INDEX "WebUser_email_key" ON "WebUser"("email");

