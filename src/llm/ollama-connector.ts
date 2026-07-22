/**
 * auto-mat-ion Ollama Connector
 *
 * "From Blink to Think" - Natural language interface to the ami CLI.
 *
 * This connector enables:
 * - Natural language command parsing via Ollama LLM
 * - Secure, restrictive system prompts (no arbitrary commands)
 * - Command validation before execution
 * - Streaming responses for real-time feedback
 *
 * Architecture:
 * User Input → Ollama LLM → Command Parser → ami CLI → Device
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Resolve CLI path relative to this module's location
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = join(__dirname, '..', 'cli.js');

// ============================================================================
// Types
// ============================================================================

export interface OllamaConfig {
  host: string;
  port: number;
  model: string;
  timeout: number;
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
}

export interface ParsedCommand {
  valid: boolean;
  command: string;
  args: string[];
  fullCommand: string;
  explanation: string;
  warning?: string;
}

export interface CommandResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an AI assistant for auto-mat-ion (ami), a distributed device testing framework.

Your ONLY job is to translate natural language requests into ami CLI commands.

AVAILABLE COMMANDS:

Basic Operations:
- ami demo serve [port] - Start demo server (default: 8891)
- ami demo open [port] - Open demo in browser
- ami demo list - List demo pages
- ami devices list - List connected devices
- ami devices setup <device-id> - Configure device
- ami devices caps <device-id> - Show device capabilities
- ami status - Show system status

Test Execution:
- ami run zepto - Quick connectivity test
- ami run quick [url] [device-id] - Quick browser test
- ami test <description> - Run test from natural language description

Test Description Examples (for "ami test"):
- "capture image with each camera" - Capture from all cameras
- "record 5 second video with max resolution" - Record video
- "capture and record with back camera" - Both actions, back camera only
- "analyze audio for 10 seconds" - Audio analysis test
- "capture from all cameras on all devices" - All cameras, all devices

Maintenance:
- ami clean all - Clean all data/logs/build
- ami clean data - Clean test data
- ami clean logs - Clean log files
- ami clean build - Clean build artifacts

Analysis:
- ami analysis setup - Install Python dependencies
- ami analysis jupyter - Open Jupyter notebook

RULES:
1. ONLY output ami commands from the list above
2. For sensor tests (camera, video, audio), use "ami test <description>"
3. Keep test descriptions simple and in natural language
4. If a request can't be fulfilled with these commands, explain why
5. Never execute shell commands, file operations, or anything not in the list
6. Be concise - output the command with brief explanation

OUTPUT FORMAT:
\`\`\`
COMMAND: ami <command> [args]
\`\`\`
EXPLANATION: Brief description of what this does.

If no valid command matches:
\`\`\`
COMMAND: NONE
\`\`\`
EXPLANATION: Why this request can't be fulfilled.`;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: OllamaConfig = {
  host: 'localhost',
  port: 11434,
  model: 'llama3.2', // Fast, good for command parsing
  timeout: 30000,
};

// ============================================================================
// Ollama Client
// ============================================================================

export class OllamaConnector {
  private config: OllamaConfig;
  private conversationHistory: OllamaMessage[] = [];

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.resetConversation();
  }

  /**
   * Get base URL for Ollama API
   */
  private get baseUrl(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }

  /**
   * Reset conversation history
   */
  resetConversation(): void {
    this.conversationHistory = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];
  }

  /**
   * Check if Ollama is running
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }

  /**
   * Send a message to Ollama and get a response
   */
  async chat(userMessage: string): Promise<string> {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.conversationHistory,
          stream: false,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama error: ${response.status} - ${errorText}`);
      }

      const data = await response.json() as OllamaResponse;
      const assistantMessage = data.message.content;

      // Add assistant response to history
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantMessage,
      });

      return assistantMessage;

    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Ollama request timed out');
      }
      throw error;
    }
  }

  /**
   * Stream a response from Ollama
   */
  async *chatStream(userMessage: string): AsyncGenerator<string, void, unknown> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: this.conversationHistory,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line) as { message?: { content: string }; done: boolean };
            if (data.message?.content) {
              fullResponse += data.message.content;
              yield data.message.content;
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Add complete response to history
    this.conversationHistory.push({
      role: 'assistant',
      content: fullResponse,
    });
  }
}

// ============================================================================
// Command Parser
// ============================================================================

/**
 * Valid ami command patterns
 */
const VALID_COMMANDS: RegExp[] = [
  /^ami\s+demo\s+(serve|open|list)(\s+\d+)?$/,
  /^ami\s+devices\s+(list|setup|caps)(\s+[\w-]+)?$/,
  /^ami\s+run\s+(zepto|quick|matrix)(\s+[\w:/.]+)?(\s+[\w-]+)?$/,
  /^ami\s+test\s+.+$/,  // Natural language test descriptions
  /^ami\s+clean\s+(all|data|logs|build)$/,
  /^ami\s+analysis\s+(setup|jupyter|lab)$/,
  /^ami\s+status$/,
];

/**
 * Parse LLM response to extract command
 */
export function parseCommand(llmResponse: string): ParsedCommand {
  // Extract command from code block
  const commandMatch = llmResponse.match(/COMMAND:\s*(.+?)(?:\n|```|$)/i);
  const explanationMatch = llmResponse.match(/EXPLANATION:\s*(.+?)(?:\n\n|$)/is);

  const rawCommand = commandMatch?.[1]?.trim() || '';
  const explanation = explanationMatch?.[1]?.trim() || 'No explanation provided';

  // Check for "NONE" response
  if (rawCommand.toUpperCase() === 'NONE' || !rawCommand) {
    return {
      valid: false,
      command: '',
      args: [],
      fullCommand: '',
      explanation,
    };
  }

  // Validate against allowed patterns
  const isValid = VALID_COMMANDS.some(pattern => pattern.test(rawCommand));

  if (!isValid) {
    return {
      valid: false,
      command: '',
      args: [],
      fullCommand: rawCommand,
      explanation,
      warning: 'Command does not match allowed patterns',
    };
  }

  // Parse command parts
  const parts = rawCommand.split(/\s+/);
  const command = parts.slice(0, 3).join(' '); // ami <group> <subcommand>
  const args = parts.slice(3);

  return {
    valid: true,
    command,
    args,
    fullCommand: rawCommand,
    explanation,
  };
}

/**
 * Execute a validated command
 */
export async function executeCommand(command: ParsedCommand): Promise<CommandResult> {
  if (!command.valid) {
    return {
      success: false,
      output: '',
      error: 'Invalid command',
      executionTime: 0,
    };
  }

  const startTime = Date.now();

  try {
    // Convert ami command to node <cli-path>
    const fullCommand = command.fullCommand.replace(/^ami\s+/, `node "${CLI_PATH}" `);

    const { stdout, stderr } = await execAsync(fullCommand, {
      timeout: 60000,
      maxBuffer: 1024 * 1024,
    });

    return {
      success: true,
      output: stdout || stderr,
      executionTime: Date.now() - startTime,
    };

  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      executionTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Natural language to command execution
 */
export class NaturalLanguageInterface {
  private ollama: OllamaConnector;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.ollama = new OllamaConnector(config);
  }

  /**
   * Check if the interface is available
   */
  async isReady(): Promise<boolean> {
    return this.ollama.isAvailable();
  }

  /**
   * Process a natural language request
   */
  async process(input: string): Promise<{
    llmResponse: string;
    command: ParsedCommand;
    result?: CommandResult;
  }> {
    // Get LLM response
    const llmResponse = await this.ollama.chat(input);

    // Parse command
    const command = parseCommand(llmResponse);

    // Return without executing (for safety)
    return { llmResponse, command };
  }

  /**
   * Process and execute a natural language request
   */
  async processAndExecute(input: string): Promise<{
    llmResponse: string;
    command: ParsedCommand;
    result: CommandResult;
  }> {
    const { llmResponse, command } = await this.process(input);

    // Execute if valid
    const result = await executeCommand(command);

    return { llmResponse, command, result };
  }

  /**
   * Reset conversation context
   */
  reset(): void {
    this.ollama.resetConversation();
  }
}

// ============================================================================
// CLI Integration
// ============================================================================

/**
 * Interactive chat mode for CLI
 */
export async function startInteractiveChat(config: Partial<OllamaConfig> = {}): Promise<void> {
  const readline = await import('readline');
  const nli = new NaturalLanguageInterface(config);

  console.log('\n🤖 auto-mat-ion AI Assistant');
  console.log('Type your request in natural language. Type "exit" to quit.\n');

  // Check Ollama availability
  if (!(await nli.isReady())) {
    console.log('❌ Ollama is not running. Start it with: ollama serve');
    console.log('   Install from: https://ollama.ai\n');
    return;
  }

  console.log('✓ Connected to Ollama\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log('\nGoodbye! 👋\n');
        rl.close();
        return;
      }

      if (!trimmed) {
        prompt();
        return;
      }

      try {
        console.log('\n🔄 Processing...\n');

        const { llmResponse, command } = await nli.process(trimmed);

        console.log('AI:', llmResponse);
        console.log();

        if (command.valid) {
          rl.question(`Execute "${command.fullCommand}"? (y/n): `, async (answer) => {
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              console.log('\n⚡ Executing...\n');
              const result = await executeCommand(command);

              if (result.success) {
                console.log(result.output);
                console.log(`\n✓ Completed in ${result.executionTime}ms\n`);
              } else {
                console.log(`❌ Error: ${result.error}\n`);
              }
            } else {
              console.log('Cancelled.\n');
            }
            prompt();
          });
        } else {
          prompt();
        }

      } catch (error) {
        console.log(`❌ Error: ${error instanceof Error ? error.message : error}\n`);
        prompt();
      }
    });
  };

  prompt();
}

// ============================================================================
// Exports
// ============================================================================

export default OllamaConnector;
