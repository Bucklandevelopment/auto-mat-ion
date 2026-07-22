/**
 * auto-mat-ion LLM Module
 *
 * "From Blink to Think" - Natural language interface
 */

export {
  OllamaConnector,
  NaturalLanguageInterface,
  parseCommand,
  executeCommand,
  startInteractiveChat,
  type OllamaConfig,
  type OllamaMessage,
  type OllamaResponse,
  type ParsedCommand,
  type CommandResult,
} from './ollama-connector.js';

export {
  TestOrchestrator,
  runTestFromDescription,
  TEST_COMMANDS_FOR_PROMPT,
  type TestDefinition,
  type TestResult,
  type TestSession,
  type CameraTestParams,
  type AudioTestParams,
  type MotionTestParams,
  type Device,
} from './test-orchestrator.js';
