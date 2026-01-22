# Backend BMRX - Dockerfile para evitar que se duerma en Replit
FROM node:18-alpine

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar código fuente
COPY . .

# Generar Prisma client
RUN npx prisma generate

# Exponer puerto
EXPOSE 5000

# Mantener vivo el contenedor y ejecutar la app
CMD ["sh", "-c", "while true; do echo 'Keeping backend alive...'; sleep 300; done & npm start"]
