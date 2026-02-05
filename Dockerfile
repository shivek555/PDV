# Use official Node LTS image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy rest of the code
COPY . .

# Environment defaults (override with .env at runtime)
ENV NODE_ENV=production
ENV PORT=3000

# Expose app port
EXPOSE 3000

# Start app (change if entry file app.js hai)
CMD ["node", "server.js"]
