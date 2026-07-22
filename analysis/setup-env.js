#!/usr/bin/env node
/**
 * auto-mat-ion Analysis - Cross-platform Environment Setup
 *
 * This script creates a Python virtual environment and installs dependencies
 * for Jupyter notebook analysis of sensor test results.
 *
 * Usage:
 *   node setup-env.js           # Setup environment
 *   node setup-env.js --jupyter # Setup and launch Jupyter
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================================
// Configuration
// ============================================================================

const SCRIPT_DIR = __dirname;
const VENV_DIR = path.join(SCRIPT_DIR, '.venv');
const IS_WINDOWS = os.platform() === 'win32';

// Platform-specific paths
const PYTHON_CMD = IS_WINDOWS ? 'python' : 'python3';
const VENV_BIN_DIR = IS_WINDOWS ? 'Scripts' : 'bin';
const VENV_ACTIVATE = path.join(VENV_DIR, VENV_BIN_DIR, IS_WINDOWS ? 'activate.bat' : 'activate');
const VENV_PIP = path.join(VENV_DIR, VENV_BIN_DIR, IS_WINDOWS ? 'pip.exe' : 'pip');
const VENV_PYTHON = path.join(VENV_DIR, VENV_BIN_DIR, IS_WINDOWS ? 'python.exe' : 'python');
const VENV_JUPYTER = path.join(VENV_DIR, VENV_BIN_DIR, IS_WINDOWS ? 'jupyter.exe' : 'jupyter');

// Colors
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
};

// ============================================================================
// Utility Functions
// ============================================================================

function log(emoji, message, color = 'reset') {
    console.log(`${colors[color]}${emoji} ${message}${colors.reset}`);
}

function logSection(title) {
    console.log('');
    console.log(`${colors.dim}${'─'.repeat(54)}${colors.reset}`);
    console.log(`  ${title}`);
    console.log(`${colors.dim}${'─'.repeat(54)}${colors.reset}`);
}

function run(cmd, options = {}) {
    const displayCmd = cmd.length > 80 ? cmd.substring(0, 77) + '...' : cmd;
    if (options.verbose !== false) {
        console.log(`${colors.dim}  > ${displayCmd}${colors.reset}`);
    }
    try {
        execSync(cmd, {
            stdio: options.silent ? 'pipe' : 'inherit',
            shell: true,
            cwd: options.cwd || SCRIPT_DIR,
            ...options
        });
        return true;
    } catch (error) {
        if (options.ignoreError) {
            return false;
        }
        log('✗', `Command failed: ${cmd}`, 'red');
        if (error.message) {
            console.error(`    ${error.message}`);
        }
        process.exit(1);
    }
}

function getPythonVersion() {
    try {
        const version = execSync(`${PYTHON_CMD} --version 2>&1`, { encoding: 'utf8' }).trim();
        return version.replace('Python ', '');
    } catch {
        return null;
    }
}

// ============================================================================
// Setup Functions
// ============================================================================

function checkPythonInstalled() {
    logSection('Checking Python');

    const version = getPythonVersion();
    if (!version) {
        log('✗', 'Python 3 is required but not found', 'red');
        console.log('');
        if (IS_WINDOWS) {
            console.log('  Install Python from: https://www.python.org/downloads/');
            console.log('  Or via winget: winget install Python.Python.3.11');
        } else if (os.platform() === 'darwin') {
            console.log('  Install Python via Homebrew: brew install python3');
        } else {
            console.log('  Install Python via apt: sudo apt install python3 python3-venv python3-pip');
        }
        process.exit(1);
    }

    const [major, minor] = version.split('.').map(Number);
    if (major < 3 || (major === 3 && minor < 9)) {
        log('⚠', `Python ${version} detected. Python 3.9+ is recommended.`, 'yellow');
    } else {
        log('✓', `Python ${version}`, 'green');
    }

    return version;
}

function createVirtualEnvironment() {
    logSection('Virtual Environment');

    if (fs.existsSync(VENV_DIR)) {
        if (fs.existsSync(VENV_PIP)) {
            log('✓', `Virtual environment exists at ${path.basename(VENV_DIR)}/`, 'green');
            return true;
        } else {
            log('⚠', 'Virtual environment exists but appears corrupted. Recreating...', 'yellow');
            fs.rmSync(VENV_DIR, { recursive: true, force: true });
        }
    }

    log('○', 'Creating virtual environment...', 'cyan');
    run(`${PYTHON_CMD} -m venv "${VENV_DIR}"`);
    log('✓', `Virtual environment created at ${path.basename(VENV_DIR)}/`, 'green');

    return true;
}

function installDependencies() {
    logSection('Installing Dependencies');

    // Upgrade pip first
    log('○', 'Upgrading pip...', 'cyan');
    run(`"${VENV_PIP}" install --upgrade pip`, { verbose: false, silent: true });
    log('✓', 'pip upgraded', 'green');

    // Install requirements
    const requirementsPath = path.join(SCRIPT_DIR, 'requirements.txt');
    if (!fs.existsSync(requirementsPath)) {
        log('✗', 'requirements.txt not found', 'red');
        process.exit(1);
    }

    log('○', 'Installing packages from requirements.txt...', 'cyan');
    console.log('');
    run(`"${VENV_PIP}" install -r "${requirementsPath}"`, { verbose: false });
    console.log('');
    log('✓', 'All packages installed', 'green');

    return true;
}

function registerJupyterKernel() {
    logSection('Jupyter Kernel');

    log('○', 'Registering Jupyter kernel...', 'cyan');
    run(`"${VENV_PYTHON}" -m ipykernel install --user --name=auto-mat-ion --display-name="auto-mat-ion Sensor Analysis"`, { verbose: false, silent: true });
    log('✓', 'Kernel "auto-mat-ion Sensor Analysis" registered', 'green');

    return true;
}

function printSuccessMessage() {
    console.log('');
    console.log('╔' + '═'.repeat(52) + '╗');
    console.log('║   ✅ Setup Complete!                               ║');
    console.log('╚' + '═'.repeat(52) + '╝');
    console.log('');

    console.log('  Available notebooks:');
    console.log('');
    console.log('    📓 sensor_analysis.ipynb');
    console.log('       Complete sensor capability analysis');
    console.log('');

    if (IS_WINDOWS) {
        console.log('  To start Jupyter:');
        console.log('    npm run analysis:jupyter');
        console.log('');
        console.log('  Or directly:');
        console.log(`    "${VENV_JUPYTER}" notebook analysis\\sensor_analysis.ipynb`);
    } else {
        console.log('  To start Jupyter:');
        console.log('    npm run analysis:jupyter');
        console.log('');
        console.log('  Or directly:');
        console.log(`    ${VENV_JUPYTER} notebook analysis/sensor_analysis.ipynb`);
    }

    console.log('');
}

function launchJupyter() {
    logSection('Launching Jupyter Notebook');

    const notebookPath = path.join(SCRIPT_DIR, 'sensor_analysis.ipynb');
    if (!fs.existsSync(notebookPath)) {
        log('⚠', 'Notebook file not found, Jupyter will open without a specific notebook', 'yellow');
    }

    log('○', 'Starting Jupyter Notebook...', 'cyan');
    console.log('');

    const jupyter = spawn(VENV_JUPYTER, ['notebook', notebookPath], {
        stdio: 'inherit',
        shell: true,
        detached: false
    });

    jupyter.on('error', (err) => {
        log('✗', `Failed to start Jupyter: ${err.message}`, 'red');
        process.exit(1);
    });
}

// ============================================================================
// Main
// ============================================================================

function main() {
    const args = process.argv.slice(2);
    const launchJupyterAfter = args.includes('--jupyter') || args.includes('-j');

    console.log('');
    console.log('╔' + '═'.repeat(52) + '╗');
    console.log('║   🤖 auto-mat-ion Analysis - Environment Setup    ║');
    console.log('╚' + '═'.repeat(52) + '╝');
    console.log('');
    console.log(`  Platform: ${os.platform()} (${os.arch()})`);
    console.log(`  Node.js:  ${process.version}`);

    // Run setup steps
    checkPythonInstalled();
    createVirtualEnvironment();
    installDependencies();
    registerJupyterKernel();
    printSuccessMessage();

    // Optionally launch Jupyter
    if (launchJupyterAfter) {
        launchJupyter();
    }
}

main();
