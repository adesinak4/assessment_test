FROM node:20-slim

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Copy local dependency directories (needed because package.json references them via 'file:')
COPY core/ ./core/
COPY messages/ ./messages/
COPY mock-models/ ./mock-models/
COPY models/ ./models/
COPY repository/ ./repository/
COPY services/ ./services/
COPY api/ ./api/
COPY endpoints/ ./endpoints/

# Install dependencies (ignoring lifecycle scripts like husky prep)
RUN npm ci --only=production --ignore-scripts

# Copy the rest of the application files
COPY app.js bootstrap.js ./

# Set environment defaults (Using the port from .env)
ENV PORT=8811
ENV NODE_ENV=development

# Expose the port
EXPOSE 8811

# Start the application
CMD ["node", "bootstrap.js"]
