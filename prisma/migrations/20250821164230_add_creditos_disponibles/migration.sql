-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Usuario" (
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
    "creditos_disponibles" INTEGER NOT NULL DEFAULT 0,
    "consultas_usadas" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Usuario_nivelAccesoId_fkey" FOREIGN KEY ("nivelAccesoId") REFERENCES "NivelAcceso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Usuario" ("activo", "consultas_usadas", "creditos", "creditos_disponibles", "fechaAlta", "fechaExpiracion", "fecha_registro", "id", "montoPagado", "nivelAccesoId", "nombre", "password", "plan_activo", "tipo", "tipo_activacion", "user_id", "username") SELECT "activo", coalesce("consultas_usadas", 0) AS "consultas_usadas", "creditos", coalesce("creditos_disponibles", 0) AS "creditos_disponibles", "fechaAlta", "fechaExpiracion", "fecha_registro", "id", "montoPagado", "nivelAccesoId", "nombre", "password", "plan_activo", "tipo", "tipo_activacion", "user_id", "username" FROM "Usuario";
DROP TABLE "Usuario";
ALTER TABLE "new_Usuario" RENAME TO "Usuario";
CREATE UNIQUE INDEX "Usuario_username_key" ON "Usuario"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
