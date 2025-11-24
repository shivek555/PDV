# Use official Node.js runtime
FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files first and install to leverage caching
COPY package*.json ./

RUN npm install --production

# Now copy rest of your application files
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
