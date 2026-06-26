FROM node:18-alpine

WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy all source files
COPY . .

# Expose the port that the app runs on.
# Hugging Face Spaces map the container's 7860 port by default, but it respects the PORT env var if configured.
EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

# Start the application
CMD ["npm", "start"]
