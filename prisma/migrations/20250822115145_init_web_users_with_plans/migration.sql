-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WebUser" (
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
    "updatedAt" DATETIME NOT NULL,
    "tipo_activacion" TEXT,
    "consultas_usadas" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_WebUser" ("bot_activado", "createdAt", "creditos_disponibles", "email", "estado", "fecha_registro", "id", "password", "plan_tipo", "sesiones_activas", "ultimo_acceso", "updatedAt", "username") SELECT "bot_activado", "createdAt", "creditos_disponibles", "email", "estado", "fecha_registro", "id", "password", "plan_tipo", "sesiones_activas", "ultimo_acceso", "updatedAt", "username" FROM "WebUser";
DROP TABLE "WebUser";
ALTER TABLE "new_WebUser" RENAME TO "WebUser";
CREATE UNIQUE INDEX "WebUser_username_key" ON "WebUser"("username");
CREATE UNIQUE INDEX "WebUser_email_key" ON "WebUser"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
