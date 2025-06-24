#!/bin/bash

# Ollama setup script for LLM Service
# This script sets up Ollama and downloads required models

set -e

echo "Setting up Ollama for LLM Service..."

# Check if Ollama is available
if ! command -v ollama &> /dev/null; then
    echo "Ollama not found. Installing Ollama..."
    
    # Install Ollama
    curl -fsSL https://ollama.ai/install.sh | sh
    
    echo "Ollama installed successfully"
else
    echo "Ollama is already installed"
fi

# Start Ollama service in background
echo "Starting Ollama service..."
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
sleep 10

# Function to check if Ollama is ready
check_ollama_ready() {
    curl -s http://localhost:11434/api/tags > /dev/null 2>&1
}

# Wait up to 60 seconds for Ollama to be ready
TIMEOUT=60
ELAPSED=0
while ! check_ollama_ready && [ $ELAPSED -lt $TIMEOUT ]; do
    echo "Waiting for Ollama to start... ($ELAPSED/$TIMEOUT seconds)"
    sleep 5
    ELAPSED=$((ELAPSED + 5))
done

if ! check_ollama_ready; then
    echo "Error: Ollama failed to start within $TIMEOUT seconds"
    exit 1
fi

echo "Ollama is ready!"

# Download default models
DEFAULT_MODELS=${OLLAMA_MODELS:-"llama2:7b"}

echo "Downloading Ollama models: $DEFAULT_MODELS"

IFS=',' read -ra MODELS <<< "$DEFAULT_MODELS"
for model in "${MODELS[@]}"; do
    model=$(echo "$model" | xargs) # Trim whitespace
    echo "Downloading model: $model"
    
    if ollama pull "$model"; then
        echo "Successfully downloaded model: $model"
    else
        echo "Warning: Failed to download model: $model"
    fi
done

echo "Ollama setup completed!"

# List available models
echo "Available models:"
ollama list

# Keep Ollama running
echo "Ollama is running on http://localhost:11434"
wait $OLLAMA_PID
