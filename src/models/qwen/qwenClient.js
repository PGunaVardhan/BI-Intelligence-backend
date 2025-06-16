// backend/src/models/qwen/qwenClient.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../../utils/logger');

class QwenClient {
  constructor(config) {
    this.config = config;
    this.modelPath = config.config.model_path;
    this.maxTokens = config.config.max_tokens || 4096;
    this.temperature = config.config.temperature || 0.7;
    this.topP = config.config.top_p || 0.9;
    this.isInitialized = false;
    this.pythonProcess = null;
  }

  async initialize() {
    try {
      // Check if model exists
      const modelExists = await this.checkModelExists();
      if (!modelExists) {
        throw new Error(`Qwen model not found at path: ${this.modelPath}`);
      }

      // Initialize the Python inference server
      await this.startInferenceServer();

      this.isInitialized = true;
      logger.info('Qwen client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Qwen client:', error);
      throw error;
    }
  }

  async checkModelExists() {
    try {
      // Check if model directory or file exists
      const stats = await fs.stat(this.modelPath);
      return stats.isDirectory() || stats.isFile();
    } catch (error) {
      logger.warn(`Model path ${this.modelPath} not found`);
      return false;
    }
  }

  async startInferenceServer() {
    return new Promise((resolve, reject) => {
      // Create a simple Python script for Qwen inference
      const pythonScript = this.createInferenceScript();
      
      // Start Python process
      this.pythonProcess = spawn('python', ['-c', pythonScript], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      this.pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('QWEN_READY')) {
          logger.info('Qwen inference server started');
          resolve();
        }
      });

      this.pythonProcess.stderr.on('data', (data) => {
        logger.error('Qwen process error:', data.toString());
      });

      this.pythonProcess.on('error', (error) => {
        logger.error('Failed to start Qwen process:', error);
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        reject(new Error('Qwen initialization timeout'));
      }, 30000);
    });
  }

  createInferenceScript() {
    return `
import sys
import json
import traceback
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

class QwenInference:
    def __init__(self):
        self.model_path = "${this.modelPath}"
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = None
        self.tokenizer = None
        
    def load_model(self):
        try:
            self.tokenizer = AutoTokenizer.from_pretrained(
                self.model_path, 
                trust_remote_code=True
            )
            self.model = AutoModelForCausalLM.from_pretrained(
                self.model_path,
                device_map="auto" if torch.cuda.is_available() else None,
                trust_remote_code=True
            )
            print("QWEN_READY", flush=True)
            return True
        except Exception as e:
            print(f"Error loading model: {e}", file=sys.stderr, flush=True)
            return False
    
    def generate_response(self, prompt, system_prompt="", max_tokens=${this.maxTokens}, temperature=${this.temperature}):
        try:
            if system_prompt:
                full_prompt = f"System: {system_prompt}\\n\\nUser: {prompt}\\n\\nAssistant:"
            else:
                full_prompt = f"User: {prompt}\\n\\nAssistant:"
            
            inputs = self.tokenizer(full_prompt, return_tensors="pt")
            
            with torch.no_grad():
                outputs = self.model.generate(
                    inputs.input_ids,
                    max_new_tokens=max_tokens,
                    temperature=temperature,
                    top_p=${this.topP},
                    do_sample=True,
                    pad_token_id=self.tokenizer.eos_token_id
                )
            
            response = self.tokenizer.decode(
                outputs[0][inputs.input_ids.shape[1]:], 
                skip_special_tokens=True
            )
            
            return response.strip()
            
        except Exception as e:
            error_msg = f"Error generating response: {str(e)}"
            print(error_msg, file=sys.stderr, flush=True)
            traceback.print_exc(file=sys.stderr)
            return "I apologize, but I encountered an error processing your request."

# Initialize inference
qwen = QwenInference()
if not qwen.load_model():
    sys.exit(1)

# Process requests
try:
    while True:
        line = input()
        if line.strip() == "QUIT":
            break
            
        try:
            request = json.loads(line)
            prompt = request.get("prompt", "")
            system_prompt = request.get("system_prompt", "")
            max_tokens = request.get("max_tokens", ${this.maxTokens})
            temperature = request.get("temperature", ${this.temperature})
            
            response = qwen.generate_response(prompt, system_prompt, max_tokens, temperature)
            
            result = {
                "success": True,
                "response": response
            }
            print(json.dumps(result), flush=True)
            
        except json.JSONDecodeError:
            error_result = {
                "success": False,
                "error": "Invalid JSON request"
            }
            print(json.dumps(error_result), flush=True)
        except Exception as e:
            error_result = {
                "success": False,
                "error": str(e)
            }
            print(json.dumps(error_result), flush=True)
            
except KeyboardInterrupt:
    print("Shutting down Qwen inference server", file=sys.stderr, flush=True)
except Exception as e:
    print(f"Unexpected error: {e}", file=sys.stderr, flush=True)
    traceback.print_exc(file=sys.stderr)
`;
  }

  async generateResponse(prompt, systemPrompt = '') {
    try {
      if (!this.isInitialized || !this.pythonProcess) {
        throw new Error('Qwen client not initialized');
      }

      return new Promise((resolve, reject) => {
        const request = {
          prompt,
          system_prompt: systemPrompt,
          max_tokens: this.maxTokens,
          temperature: this.temperature
        };

        // Set up response handler
        const responseHandler = (data) => {
          try {
            const lines = data.toString().split('\n').filter(line => line.trim());
            
            for (const line of lines) {
              if (line.includes('QWEN_READY')) continue;
              
              try {
                const result = JSON.parse(line);
                this.pythonProcess.stdout.removeListener('data', responseHandler);
                
                if (result.success) {
                  resolve(result.response);
                } else {
                  reject(new Error(result.error));
                }
                return;
              } catch (parseError) {
                // Continue processing other lines
              }
            }
          } catch (error) {
            this.pythonProcess.stdout.removeListener('data', responseHandler);
            reject(error);
          }
        };

        // Set up timeout
        const timeout = setTimeout(() => {
          this.pythonProcess.stdout.removeListener('data', responseHandler);
          reject(new Error('Qwen response timeout'));
        }, 60000); // 60 second timeout

        // Listen for response
        this.pythonProcess.stdout.on('data', responseHandler);

        // Send request
        this.pythonProcess.stdin.write(JSON.stringify(request) + '\n');

        // Clear timeout when done
        const originalResolve = resolve;
        const originalReject = reject;
        
        resolve = (value) => {
          clearTimeout(timeout);
          originalResolve(value);
        };
        
        reject = (error) => {
          clearTimeout(timeout);
          originalReject(error);
        };
      });

    } catch (error) {
      logger.error('Error generating Qwen response:', error);
      throw error;
    }
  }

  async healthCheck() {
    try {
      if (!this.isInitialized || !this.pythonProcess) {
        return false;
      }

      // Test with a simple prompt
      const testResponse = await this.generateResponse('Hello', 'Respond with "OK"');
      return testResponse.toLowerCase().includes('ok');
    } catch (error) {
      logger.error('Qwen health check failed:', error);
      return false;
    }
  }

  async shutdown() {
    try {
      if (this.pythonProcess) {
        this.pythonProcess.stdin.write('QUIT\n');
        this.pythonProcess.kill();
        this.pythonProcess = null;
      }
      this.isInitialized = false;
      logger.info('Qwen client shut down');
    } catch (error) {
      logger.error('Error shutting down Qwen client:', error);
    }
  }

  // API compatibility methods
  async validateApiKey(apiKey) {
    return true; // Local model doesn't need API key
  }

  async setApiKey(apiKey) {
    return true; // Local model doesn't need API key
  }
}

module.exports = QwenClient;