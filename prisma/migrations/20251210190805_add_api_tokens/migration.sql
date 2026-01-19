-- CreateTable
CREATE TABLE "ApiToken" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "usuarioId" INTEGER,
    "grupoId" INTEGER,
    "token" TEXT NOT NULL,
    "modo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'activo',
    "limiteDiario" INTEGER,
    "fechaInicio" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaExp" DATETIME,
    "creditos" INTEGER DEFAULT 0,
    "notas" TEXT,
    "usosHoy" INTEGER NOT NULL DEFAULT 0,
    "ultimoUso" DATETIME,
    CONSTRAINT "ApiToken_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiTokenComando" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "apiTokenId" INTEGER NOT NULL,
    "comandoId" INTEGER NOT NULL,
    "permitido" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "ApiTokenComando_apiTokenId_fkey" FOREIGN KEY ("apiTokenId") REFERENCES "ApiToken" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ApiTokenComando_comandoId_fkey" FOREIGN KEY ("comandoId") REFERENCES "Comando" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiTokenComando_apiTokenId_comandoId_key" ON "ApiTokenComando"("apiTokenId", "comandoId");
