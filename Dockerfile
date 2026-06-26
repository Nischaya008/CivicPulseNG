FROM node:18-slim

WORKDIR /app

# Copy package.json and install dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy all source files
COPY backend/ ./backend/

# Expose the port that the app runs on.
# Hugging Face Spaces map the container's 7860 port by default.
EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

# Start the application from the backend directory
WORKDIR /app/backend
CMD ["npm", "start"]
