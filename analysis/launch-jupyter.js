#!/usr/bin/env node
/**
 * auto-mat-ion Analysis - Cross-platform Jupyter Launcher
 *
 * Launches Jupyter Notebook from the virtual environment.
 * Works on Windows, macOS, and Linux.
 *
 * Usage:
 *   node launch-jupyter.js
 *   node launch-jupyter.js --lab  # Launch JupyterLab instead
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const SCRIPT_DIR = __dirname;
const VENV_DIR = path.join(SCRIPT_DIR, '.venv');
const IS_WINDOWS = os.platform() === 'win32';

const VENV_BIN_DIR = IS_WINDOWS ? 'Scripts' : 'bin';
const VENV_JUPYTER = path.join(VENV_DIR, VENV_BIN_DIR, IS_WINDOWS ? 'jupyter.exe' : 'jupyter');
const NOTEBOOK_PATH = path.join(SCRIPT_DIR, 'sensor_analysis.ipynb');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

function log(emoji, message, color = 'reset') {
    console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

// ============================================================================
// Main
// ============================================================================

function main() {
    const args = process.argv.slice(2);
    const useLab = args.includes('--lab') || args.includes('-l');

    // Check if virtual environment exists
    if (!fs.existsSync(VENV_JUPYTER)) {
        console.error('');
        log('❌', 'Virtual environment not found or Jupyter not installed.', 'red');
        console.error('');
        console.error('   Please run setup first:');
        console.error('     npm run analysis:setup');
        console.error('');
        process.exit(1);
    }

    // Check if notebook exists
    if (!fs.existsSync(NOTEBOOK_PATH)) {
        log('⚠️', 'Notebook file not found. Jupyter will open to the directory.', 'yellow');
    }

    console.log('');
    console.log('╔' + '═'.repeat(52) + '╗');
    console.log('║   🤖 auto-mat-ion Sensor Analysis                 ║');
    console.log('╚' + '═'.repeat(52) + '╝');
    console.log('');
    log('📊', `Platform: ${os.platform()} (${os.arch()})`, 'cyan');
    log('🐍', `Jupyter:  ${path.basename(VENV_JUPYTER)}`, 'cyan');
    log('📓', `Notebook: ${path.basename(NOTEBOOK_PATH)}`, 'cyan');
    console.log('');
    log('⌨️', 'Press Ctrl+C to stop the server.', 'yellow');
    console.log('');

    // Spawn Jupyter
    const jupyterApp = useLab ? 'lab' : 'notebook';
    const targetPath = fs.existsSync(NOTEBOOK_PATH) ? NOTEBOOK_PATH : SCRIPT_DIR;
    const jupyterArgs = [jupyterApp, targetPath];

    const jupyter = spawn(VENV_JUPYTER, jupyterArgs, {
        stdio: 'inherit',
        shell: IS_WINDOWS,
        cwd: SCRIPT_DIR
    });

    jupyter.on('error', (err) => {
        console.error('');
        log('❌', `Failed to start Jupyter: ${err.message}`, 'red');
        console.error('');
        process.exit(1);
    });

    jupyter.on('close', (code) => {
        if (code !== 0 && code !== null) {
            console.log('');
            console.log(`Jupyter exited with code ${code}`);
        }
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
        console.log('');
        log('🛑', 'Shutting down Jupyter...', 'yellow');
        jupyter.kill('SIGINT');
    });
}

main();
