/*
  Warnings:

  - Added the required column `updatedAt` to the `Comando` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Comando" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "categoria" TEXT DEFAULT 'General',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "nivelMinimoId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comando_nivelMinimoId_fkey" FOREIGN KEY ("nivelMinimoId") REFERENCES "NivelAcceso" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Comando" ("descripcion", "id", "nivelMinimoId", "nombre") SELECT "descripcion", "id", "nivelMinimoId", "nombre" FROM "Comando";
DROP TABLE "Comando";
ALTER TABLE "new_Comando" RENAME TO "Comando";
CREATE UNIQUE INDEX "Comando_nombre_key" ON "Comando"("nombre");
CREATE TABLE "new_Pago" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER NOT NULL,
    "monto" REAL NOT NULL,
    "fechaPago" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'pendiente',
    "fechaInicio" DATETIME,
    "fechaExpiracion" DATETIME,
    "nota" TEXT,
    "creditosOtorgados" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Pago_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pago" ("fechaPago", "id", "monto", "tipo", "usuarioId") SELECT "fechaPago", "id", "monto", "tipo", "usuarioId" FROM "Pago";
DROP TABLE "Pago";
ALTER TABLE "new_Pago" RENAME TO "Pago";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
