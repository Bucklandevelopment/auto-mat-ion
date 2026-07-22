#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  IDMMORTALITY — Claude Code LSP Setup Script
# ═══════════════════════════════════════════════════════════════
#  Scans project folders, detects languages, installs language
#  servers and Claude Code plugins, and configures settings.
#
#  Usage:
#    ./setup-lsp.sh                  # Interactive: pick folders
#    ./setup-lsp.sh --all            # Scan all project folders
#    ./setup-lsp.sh --detect         # Detect only, don't install
#    ./setup-lsp.sh --uninstall      # Remove LSP setup
#    ./setup-lsp.sh --status         # Show current LSP status
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ─── CONFIG ──────────────────────────────────────────────────
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
CLAUDE_DIR="$HOME/.claude"
PROJECTS_DIR="${PROJECTS_DIR:-$HOME/Codex/github/UTOP.IA/SECos/projects}"
MARKETPLACE="claude-plugins-official"

# ─── COLORS ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; PURPLE='\033[0;35m'; BOLD='\033[1m'
DIM='\033[2m'; NC='\033[0m'

# ─── LANGUAGE DEFINITIONS ────────────────────────────────────
# Each language: display name, file extensions, binary check,
# install command, plugin name
declare -A LANG_DISPLAY=(
  [python]="Python"
  [typescript]="TypeScript/JS"
  [go]="Go"
  [rust]="Rust"
  [java]="Java"
  [c]="C/C++"
  [csharp]="C#"
  [php]="PHP"
  [kotlin]="Kotlin"
  [swift]="Swift"
  [lua]="Lua"
)

declare -A LANG_BINARY=(
  [python]="pyright-langserver"
  [typescript]="typescript-language-server"
  [go]="gopls"
  [rust]="rust-analyzer"
  [java]="jdtls"
  [c]="clangd"
  [csharp]="csharp-ls"
  [php]="intelephense"
  [kotlin]="kotlin-language-server"
  [swift]="sourcekit-lsp"
  [lua]="lua-language-server"
)

declare -A LANG_INSTALL=(
  [python]="npm i -g pyright"
  [typescript]="npm i -g typescript-language-server typescript"
  [go]="go install golang.org/x/tools/gopls@latest"
  [rust]="rustup component add rust-analyzer"
  [java]="brew install jdtls"
  [c]="brew install llvm"
  [csharp]="dotnet tool install -g csharp-ls"
  [php]="npm i -g intelephense"
  [kotlin]="echo 'Install from GitHub releases: https://github.com/fwcd/kotlin-language-server'"
  [swift]="echo 'Included with Xcode — install Xcode Command Line Tools'"
  [lua]="brew install lua-language-server"
)

declare -A LANG_PLUGIN=(
  [python]="pyright-lsp"
  [typescript]="typescript-lsp"
  [go]="gopls-lsp"
  [rust]="rust-analyzer-lsp"
  [java]="jdtls-lsp"
  [c]="clangd-lsp"
  [csharp]="csharp-lsp"
  [php]="php-lsp"
  [kotlin]="kotlin-lsp"
  [swift]="swift-lsp"
  [lua]="lua-lsp"
)

# ─── HELPERS ─────────────────────────────────────────────────
log_info()    { echo -e "${CYAN}[LSP]${NC} $1"; }
log_ok()      { echo -e "${GREEN}[LSP]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[LSP]${NC} $1"; }
log_error()   { echo -e "${RED}[LSP]${NC} $1"; }
log_section() { echo -e "\n${BOLD}${PURPLE}── $1 ──${NC}\n"; }

header() {
  echo ""
  echo -e "${BOLD}${CYAN}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}${CYAN}║   Claude Code LSP Setup.                       ║${NC}"
  echo -e "${BOLD}${CYAN}╚════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ─── LANGUAGE DETECTION ──────────────────────────────────────
detect_language() {
  local dir="$1"
  local lang="$2"

  case "$lang" in
    python)
      [ -f "$dir/pyproject.toml" ] || [ -f "$dir/setup.py" ] || [ -f "$dir/requirements.txt" ] && return 0
      find "$dir" -maxdepth 3 -name "*.py" \
        -not -path "*/node_modules/*" \
        -not -path "*/.venv/*" \
        -not -path "*/__pycache__/*" \
        2>/dev/null | head -1 | grep -q . && return 0
      ;;
    typescript)
      [ -f "$dir/tsconfig.json" ] || [ -f "$dir/package.json" ] && return 0
      find "$dir" -maxdepth 3 \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
        -not -path "*/node_modules/*" -not -path "*/.next/*" \
        2>/dev/null | head -1 | grep -q . && return 0
      ;;
    go)
      [ -f "$dir/go.mod" ] && return 0
      find "$dir" -maxdepth 3 -name "*.go" 2>/dev/null | head -1 | grep -q . && return 0
      ;;
    rust)
      [ -f "$dir/Cargo.toml" ] && return 0
      find "$dir" -maxdepth 3 -name "*.rs" 2>/dev/null | head -1 | grep -q . && return 0
      ;;
    java)
      find "$dir" -maxdepth 3 -name "*.java" -not -path "*/node_modules/*" \
        2>/dev/null | head -1 | grep -q . && return 0
      ;;
    c)
      find "$dir" -maxdepth 3 \( -name "*.c" -o -name "*.cpp" -o -name "*.cc" -o -name "*.h" -o -name "*.hpp" \) \
        -not -path "*/node_modules/*" \
        2>/dev/null | head -1 | grep -q . && return 0
      ;;
    csharp)
      find "$dir" -maxdepth 3 -name "*.cs" 2>/dev/null | head -1 | grep -q . && return 0
      [ -f "$dir/*.csproj" ] && return 0
      ;;
    php)
      find "$dir" -maxdepth 3 -name "*.php" -not -path "*/vendor/*" \
        2>/dev/null | head -1 | grep -q . && return 0
      ;;
    kotlin)
      find "$dir" -maxdepth 3 -name "*.kt" 2>/dev/null | head -1 | grep -q . && return 0
      ;;
    swift)
      find "$dir" -maxdepth 3 -name "*.swift" 2>/dev/null | head -1 | grep -q . && return 0
      [ -f "$dir/Package.swift" ] && return 0
      ;;
    lua)
      find "$dir" -maxdepth 3 -name "*.lua" 2>/dev/null | head -1 | grep -q . && return 0
      ;;
  esac
  return 1
}

# ─── SCAN PROJECTS ───────────────────────────────────────────
scan_projects() {
  local projects_dir="$1"
  shift
  local -a selected_dirs=("$@")

  # Collect all detected languages
  declare -gA DETECTED_LANGS   # lang -> "project1, project2, ..."
  declare -ga ALL_LANGS=()     # unique list of detected langs

  for dir in "${selected_dirs[@]}"; do
    local name
    name=$(basename "$dir")

    for lang in python typescript go rust java c csharp php kotlin swift lua; do
      if detect_language "$dir" "$lang"; then
        if [ -z "${DETECTED_LANGS[$lang]:-}" ]; then
          DETECTED_LANGS[$lang]="$name"
          ALL_LANGS+=("$lang")
        else
          DETECTED_LANGS[$lang]="${DETECTED_LANGS[$lang]}, $name"
        fi
      fi
    done
  done
}

# ─── INTERACTIVE FOLDER PICKER ───────────────────────────────
pick_folders() {
  local projects_dir="$1"
  local -a all_dirs=()
  local -a selected=()

  # Find all project directories
  for dir in "$projects_dir"/*/; do
    [ -d "$dir" ] || continue
    local name
    name=$(basename "$dir")
    [[ "$name" == *.zip ]] && continue
    [[ "$name" == "settings.json" ]] && continue
    all_dirs+=("$dir")
  done

  echo -e "${BOLD}Available project folders:${NC}\n"

  local i=1
  for dir in "${all_dirs[@]}"; do
    local name
    name=$(basename "$dir")
    printf "  ${CYAN}%2d${NC}) %s\n" "$i" "$name"
    ((i++))
  done

  echo ""
  echo -e "  ${GREEN} a${NC}) ALL folders"
  echo -e "  ${RED} q${NC}) Quit"
  echo ""
  echo -ne "${BOLD}Select folders (comma-separated, e.g. 1,3,5-8 or 'a' for all): ${NC}"
  read -r selection

  if [ "$selection" = "q" ]; then
    exit 0
  fi

  if [ "$selection" = "a" ] || [ "$selection" = "A" ]; then
    SELECTED_DIRS=("${all_dirs[@]}")
    return
  fi

  # Parse selection (supports: 1,3,5-8,12)
  SELECTED_DIRS=()
  IFS=',' read -ra parts <<< "$selection"
  for part in "${parts[@]}"; do
    part=$(echo "$part" | tr -d ' ')
    if [[ "$part" == *-* ]]; then
      local start end
      start=$(echo "$part" | cut -d- -f1)
      end=$(echo "$part" | cut -d- -f2)
      for ((j=start; j<=end; j++)); do
        if [ "$j" -ge 1 ] && [ "$j" -le "${#all_dirs[@]}" ]; then
          SELECTED_DIRS+=("${all_dirs[$((j-1))]}")
        fi
      done
    else
      if [ "$part" -ge 1 ] 2>/dev/null && [ "$part" -le "${#all_dirs[@]}" ]; then
        SELECTED_DIRS+=("${all_dirs[$((part-1))]}")
      fi
    fi
  done
}

# ─── SETTINGS.JSON MANAGEMENT ────────────────────────────────
ensure_settings_json() {
  mkdir -p "$CLAUDE_DIR"

  if [ ! -f "$CLAUDE_SETTINGS" ]; then
    echo '{}' > "$CLAUDE_SETTINGS"
    log_info "Created $CLAUDE_SETTINGS"
  fi
}

update_settings_json() {
  local -a enabled_langs=("$@")

  ensure_settings_json

  # Build the enabledPlugins object
  local plugins_json="{"
  local first=true
  for lang in "${enabled_langs[@]}"; do
    local plugin="${LANG_PLUGIN[$lang]}"
    if [ "$first" = true ]; then
      first=false
    else
      plugins_json+=","
    fi
    plugins_json+="\"${plugin}@${MARKETPLACE}\": true"
  done
  plugins_json+="}"

  # Use python3 to safely merge into existing settings.json
  python3 << PYEOF
import json, sys

settings_path = "$CLAUDE_SETTINGS"
plugins = json.loads('$plugins_json')

try:
    with open(settings_path, 'r') as f:
        settings = json.load(f)
except (json.JSONDecodeError, FileNotFoundError):
    settings = {}

# Ensure env.ENABLE_LSP_TOOL
if 'env' not in settings:
    settings['env'] = {}
settings['env']['ENABLE_LSP_TOOL'] = '1'

# Merge enabledPlugins (keep existing, add new, disable removed)
if 'enabledPlugins' not in settings:
    settings['enabledPlugins'] = {}

# Disable all LSP plugins first
for key in list(settings['enabledPlugins'].keys()):
    if key.endswith('@$MARKETPLACE') and any(
        key.startswith(p) for p in [
            'pyright-lsp', 'typescript-lsp', 'gopls-lsp',
            'rust-analyzer-lsp', 'jdtls-lsp', 'clangd-lsp',
            'csharp-lsp', 'php-lsp', 'kotlin-lsp', 'swift-lsp', 'lua-lsp'
        ]
    ):
        settings['enabledPlugins'][key] = False

# Enable only the detected ones
for plugin_key, enabled in plugins.items():
    settings['enabledPlugins'][plugin_key] = enabled

with open(settings_path, 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

# Print summary
enabled = [k for k, v in settings['enabledPlugins'].items() if v is True and k.endswith('@$MARKETPLACE')]
disabled = [k for k, v in settings['enabledPlugins'].items() if v is False and k.endswith('@$MARKETPLACE')]

if enabled:
    print(f"  Enabled:  {', '.join(k.split('@')[0] for k in enabled)}")
if disabled:
    print(f"  Disabled: {', '.join(k.split('@')[0] for k in disabled)}")
PYEOF
}

# ─── SHELL PROFILE ───────────────────────────────────────────
ensure_shell_env() {
  local shell_rc=""
  if [ -f "$HOME/.zshrc" ]; then
    shell_rc="$HOME/.zshrc"
  elif [ -f "$HOME/.bashrc" ]; then
    shell_rc="$HOME/.bashrc"
  fi

  if [ -n "$shell_rc" ]; then
    if ! grep -q "ENABLE_LSP_TOOL" "$shell_rc" 2>/dev/null; then
      echo "" >> "$shell_rc"
      echo "# Claude Code LSP Tool (added by setup-lsp.sh)" >> "$shell_rc"
      echo 'export ENABLE_LSP_TOOL=1' >> "$shell_rc"
      log_ok "Added ENABLE_LSP_TOOL=1 to $(basename "$shell_rc")"
    else
      log_dim "  ENABLE_LSP_TOOL already in $(basename "$shell_rc")"
    fi
  fi
}

# ─── INSTALL LANGUAGE SERVERS ────────────────────────────────
install_language_server() {
  local lang="$1"
  local binary="${LANG_BINARY[$lang]}"
  local install_cmd="${LANG_INSTALL[$lang]}"
  local display="${LANG_DISPLAY[$lang]}"

  if command -v "$binary" &>/dev/null; then
    local version
    version=$("$binary" --version 2>/dev/null | head -1 || echo "installed")
    log_ok "  ${BOLD}$display${NC}: $binary found ($version)"
    return 0
  fi

  log_warn "  ${BOLD}$display${NC}: $binary not found"
  echo -ne "    Install with: ${DIM}$install_cmd${NC} ? [Y/n] "
  read -r answer
  answer="${answer:-y}"

  if [[ "$answer" =~ ^[Yy] ]]; then
    log_info "    Installing..."
    if eval "$install_cmd" 2>&1 | tail -3; then
      log_ok "    Installed $binary"
      return 0
    else
      log_error "    Failed to install $binary"
      log_info "    Try manually: $install_cmd"
      return 1
    fi
  else
    log_warn "    Skipped $display"
    return 1
  fi
}

# ─── INSTALL CLAUDE PLUGINS ─────────────────────────────────
install_claude_plugin() {
  local lang="$1"
  local plugin="${LANG_PLUGIN[$lang]}"
  local display="${LANG_DISPLAY[$lang]}"

  # Check if plugin is already installed
  if claude plugin list 2>/dev/null | grep -q "$plugin"; then
    log_ok "  Plugin ${BOLD}$plugin${NC} already installed"

    # Ensure it's enabled
    if claude plugin list 2>/dev/null | grep "$plugin" | grep -q "disabled"; then
      log_warn "  Plugin $plugin is disabled, enabling..."
      claude plugin enable "$plugin" 2>/dev/null || true
    fi
    return 0
  fi

  log_info "  Installing plugin ${BOLD}$plugin${NC}..."
  if claude plugin install "$plugin" 2>/dev/null; then
    claude plugin enable "$plugin" 2>/dev/null || true
    log_ok "  Plugin $plugin installed and enabled"
    return 0
  else
    log_warn "  Could not install $plugin (may need marketplace update)"
    return 1
  fi
}

# ─── STATUS COMMAND ──────────────────────────────────────────
show_status() {
  header
  log_section "Claude Code"

  # Version
  local version
  version=$(claude --version 2>/dev/null || echo "not found")
  log_info "Version: $version"

  # Settings.json
  if [ -f "$CLAUDE_SETTINGS" ]; then
    local lsp_enabled
    lsp_enabled=$(python3 -c "
import json
with open('$CLAUDE_SETTINGS') as f:
    s = json.load(f)
print(s.get('env', {}).get('ENABLE_LSP_TOOL', 'not set'))
" 2>/dev/null || echo "error")
    log_info "ENABLE_LSP_TOOL: $lsp_enabled"
  else
    log_warn "No settings.json found"
  fi

  # Shell env
  if env | grep -q "ENABLE_LSP_TOOL=1" 2>/dev/null; then
    log_ok "ENABLE_LSP_TOOL in shell env: yes"
  else
    log_warn "ENABLE_LSP_TOOL in shell env: no"
  fi

  log_section "Language Servers"

  for lang in python typescript go rust java c csharp php kotlin swift lua; do
    local binary="${LANG_BINARY[$lang]}"
    local display="${LANG_DISPLAY[$lang]}"
    if command -v "$binary" &>/dev/null; then
      echo -e "  ${GREEN}●${NC} $display ($binary)"
    else
      echo -e "  ${DIM}○ $display ($binary — not installed)${NC}"
    fi
  done

  log_section "Claude Plugins"

  if command -v claude &>/dev/null; then
    claude plugin list 2>/dev/null | grep -E "lsp|LSP" || log_warn "No LSP plugins found"
  else
    log_warn "claude command not available"
  fi

  log_section "Enabled Plugins (settings.json)"

  if [ -f "$CLAUDE_SETTINGS" ]; then
    python3 -c "
import json
with open('$CLAUDE_SETTINGS') as f:
    s = json.load(f)
plugins = s.get('enabledPlugins', {})
for k, v in sorted(plugins.items()):
    if 'lsp' in k.lower():
        status = '●' if v else '○'
        color = '\033[0;32m' if v else '\033[2m'
        print(f'  {color}{status}\033[0m {k}: {v}')
" 2>/dev/null || log_warn "Could not parse settings.json"
  fi

  echo ""
}

# ─── DETECT ONLY ─────────────────────────────────────────────
detect_only() {
  header
  log_section "Scanning Projects"

  local -a all_dirs=()
  for dir in "$PROJECTS_DIR"/*/; do
    [ -d "$dir" ] || continue
    local name=$(basename "$dir")
    [[ "$name" == *.zip ]] && continue
    [[ "$name" == "settings.json" ]] && continue
    all_dirs+=("$dir")
  done

  scan_projects "$PROJECTS_DIR" "${all_dirs[@]}"

  log_section "Detected Languages"

  if [ ${#ALL_LANGS[@]} -eq 0 ]; then
    log_warn "No languages detected"
    return
  fi

  for lang in "${ALL_LANGS[@]}"; do
    local display="${LANG_DISPLAY[$lang]}"
    local binary="${LANG_BINARY[$lang]}"
    local projects="${DETECTED_LANGS[$lang]}"
    local installed=""

    if command -v "$binary" &>/dev/null; then
      installed="${GREEN}installed${NC}"
    else
      installed="${YELLOW}not installed${NC}"
    fi

    echo -e "  ${BOLD}$display${NC} ($installed)"
    echo -e "    ${DIM}Projects: $projects${NC}"
  done

  echo ""
  log_section "Recommendation"

  local -a to_install=()
  local -a to_skip=()

  for lang in "${ALL_LANGS[@]}"; do
    local binary="${LANG_BINARY[$lang]}"
    if ! command -v "$binary" &>/dev/null; then
      to_install+=("${LANG_DISPLAY[$lang]}")
    fi
  done

  # Languages not detected
  for lang in python typescript go rust java c csharp php kotlin swift lua; do
    if [ -z "${DETECTED_LANGS[$lang]:-}" ]; then
      to_skip+=("${LANG_DISPLAY[$lang]}")
    fi
  done

  if [ ${#to_install[@]} -gt 0 ]; then
    log_info "Install servers for: ${to_install[*]}"
  fi

  if [ ${#to_skip[@]} -gt 0 ]; then
    log_dim "Skip (not used): ${to_skip[*]}"
  fi

  echo ""
}

# ─── UNINSTALL ───────────────────────────────────────────────
uninstall_lsp() {
  header
  log_section "Removing LSP Configuration"

  # Remove from settings.json
  if [ -f "$CLAUDE_SETTINGS" ]; then
    python3 << PYEOF
import json

with open("$CLAUDE_SETTINGS") as f:
    settings = json.load(f)

# Remove ENABLE_LSP_TOOL
if 'env' in settings:
    settings['env'].pop('ENABLE_LSP_TOOL', None)
    if not settings['env']:
        del settings['env']

# Remove LSP plugins
if 'enabledPlugins' in settings:
    to_remove = [k for k in settings['enabledPlugins'] if 'lsp' in k.lower()]
    for k in to_remove:
        del settings['enabledPlugins'][k]
    if not settings['enabledPlugins']:
        del settings['enabledPlugins']

with open("$CLAUDE_SETTINGS", 'w') as f:
    json.dump(settings, f, indent=2)
    f.write('\n')

print(f"  Removed {len(to_remove)} plugins from settings.json")
PYEOF
    log_ok "Cleaned settings.json"
  fi

  # Remove from shell
  for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
    if [ -f "$rc" ] && grep -q "ENABLE_LSP_TOOL" "$rc"; then
      sed -i.bak '/ENABLE_LSP_TOOL/d' "$rc"
      sed -i.bak '/Claude Code LSP Tool/d' "$rc"
      log_ok "Removed from $(basename "$rc")"
    fi
  done

  log_info "Language server binaries were NOT removed (they may be used by your IDE)"
  log_warn "Restart Claude Code to apply changes"
  echo ""
}

# ─── MAIN INSTALL FLOW ──────────────────────────────────────
main_install() {
  local mode="${1:-interactive}"

  header

  # Check prerequisites
  log_section "Prerequisites"

  local claude_version
  claude_version=$(claude --version 2>/dev/null || echo "")
  if [ -z "$claude_version" ]; then
    log_error "Claude Code not found in PATH"
    log_info "Install: https://docs.anthropic.com/en/docs/claude-code"
    exit 1
  fi
  log_ok "Claude Code: $claude_version"

  # Select folders
  log_section "Project Selection"

  local -a selected_dirs=()

  if [ "$mode" = "all" ]; then
    for dir in "$PROJECTS_DIR"/*/; do
      [ -d "$dir" ] || continue
      local name=$(basename "$dir")
      [[ "$name" == *.zip ]] && continue
      [[ "$name" == "settings.json" ]] && continue
      selected_dirs+=("$dir")
    done
    log_info "Scanning all ${#selected_dirs[@]} project folders"
  else
    pick_folders "$PROJECTS_DIR"
    selected_dirs=("${SELECTED_DIRS[@]}")
    log_info "Selected ${#selected_dirs[@]} folders"
  fi

  # Scan for languages
  log_section "Language Detection"
  scan_projects "$PROJECTS_DIR" "${selected_dirs[@]}"

  if [ ${#ALL_LANGS[@]} -eq 0 ]; then
    log_warn "No languages detected in selected folders"
    exit 0
  fi

  for lang in "${ALL_LANGS[@]}"; do
    local display="${LANG_DISPLAY[$lang]}"
    local projects="${DETECTED_LANGS[$lang]}"
    echo -e "  ${GREEN}●${NC} ${BOLD}$display${NC}: $projects"
  done

  # Languages NOT detected — will be disabled
  local -a unused_langs=()
  for lang in python typescript go rust java c csharp php kotlin swift lua; do
    if [ -z "${DETECTED_LANGS[$lang]:-}" ]; then
      unused_langs+=("$lang")
    fi
  done

  if [ ${#unused_langs[@]} -gt 0 ]; then
    echo ""
    for lang in "${unused_langs[@]}"; do
      echo -e "  ${DIM}○ ${LANG_DISPLAY[$lang]} — not detected, will be disabled${NC}"
    done
  fi

  # Confirm
  echo ""
  echo -ne "${BOLD}Proceed with setup for ${#ALL_LANGS[@]} languages? [Y/n] ${NC}"
  read -r confirm
  confirm="${confirm:-y}"
  [[ "$confirm" =~ ^[Yy] ]] || exit 0

  # Step 1: Enable LSP Tool
  log_section "Step 1: Enable ENABLE_LSP_TOOL"
  ensure_settings_json
  ensure_shell_env

  # Step 2: Install Language Servers
  log_section "Step 2: Install Language Servers"
  local -a successful_langs=()

  for lang in "${ALL_LANGS[@]}"; do
    if install_language_server "$lang"; then
      successful_langs+=("$lang")
    fi
  done

  # Step 3: Update marketplace and install plugins
  log_section "Step 3: Claude Plugins"

  log_info "Updating marketplace catalog..."
  claude plugin marketplace update "$MARKETPLACE" 2>/dev/null || log_warn "Could not update marketplace (may need internet)"

  for lang in "${successful_langs[@]}"; do
    install_claude_plugin "$lang"
  done

  # Step 4: Update settings.json
  log_section "Step 4: Configure settings.json"
  update_settings_json "${successful_langs[@]}"

  # Summary
  log_section "Setup Complete"

  echo -e "  ${GREEN}Languages configured:${NC} ${#successful_langs[@]}"
  for lang in "${successful_langs[@]}"; do
    echo -e "    ${GREEN}●${NC} ${LANG_DISPLAY[$lang]}"
  done

  if [ ${#unused_langs[@]} -gt 0 ]; then
    echo -e "\n  ${DIM}Disabled (not in your projects):${NC}"
    for lang in "${unused_langs[@]}"; do
      echo -e "    ${DIM}○ ${LANG_DISPLAY[$lang]}${NC}"
    done
  fi

  echo ""
  echo -e "  ${YELLOW}${BOLD}IMPORTANT:${NC} Restart Claude Code for changes to take effect."
  echo -e "  ${DIM}LSP servers initialize at startup and need a fresh session.${NC}"
  echo ""
  echo -e "  Verify with: ${CYAN}./setup-lsp.sh --status${NC}"
  echo ""
}

# ─── ENTRY POINT ─────────────────────────────────────────────
case "${1:-}" in
  --all|-a)
    main_install "all"
    ;;
  --detect|-d)
    detect_only
    ;;
  --status|-s)
    show_status
    ;;
  --uninstall|-u)
    uninstall_lsp
    ;;
  --help|-h)
    header
    echo "Usage:"
    echo "  ./setup-lsp.sh              Interactive: pick project folders"
    echo "  ./setup-lsp.sh --all        Scan all project folders"
    echo "  ./setup-lsp.sh --detect     Detect languages only (dry run)"
    echo "  ./setup-lsp.sh --status     Show current LSP configuration"
    echo "  ./setup-lsp.sh --uninstall  Remove LSP setup"
    echo "  ./setup-lsp.sh --help       Show this help"
    echo ""
    echo "Environment:"
    echo "  PROJECTS_DIR    Override default projects directory"
    echo "                  Default: ~/Codex/github/UTOP.IA/SECos/projects"
    echo ""
    ;;
  "")
    main_install "interactive"
    ;;
  *)
    log_error "Unknown option: $1"
    echo "Run ./setup-lsp.sh --help for usage"
    exit 1
    ;;
esac