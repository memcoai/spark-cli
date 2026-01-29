#!/bin/bash
set -e

# Colors
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Memco ASCII Logo - Source Serif 4 Bold inspired
print_logo() {
    echo ""
    echo -e "${CYAN}"
    echo "  ███╗   ███╗ ███████╗ ███╗   ███╗  ██████╗  ██████╗  ██╗"
    echo "  ████╗ ████║ ██╔════╝ ████╗ ████║ ██╔════╝ ██╔═══██╗ ╚═╝"
    echo "  ██╔████╔██║ █████╗   ██╔████╔██║ ██║      ██║   ██║ ██╗"
    echo "  ██║╚██╔╝██║ ██╔══╝   ██║╚██╔╝██║ ██║      ██║   ██║ ╚═╝"
    echo "  ██║ ╚═╝ ██║ ███████╗ ██║ ╚═╝ ██║ ╚██████╗ ╚██████╔╝ ██╗"
    echo "  ╚═╝     ╚═╝ ╚══════╝ ╚═╝     ╚═╝  ╚═════╝  ╚═════╝  ╚═╝"
    echo -e "${NC}"
    echo ""
}

# Info box about shared memory
print_info_box() {
    echo -e "${DIM}┌─────────────────────────────────────────────────────────────────────┐${NC}"
    echo -e "${DIM}│${NC}                                                                     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${YELLOW}⚡ SHARED MEMORY FOR AI AGENTS${NC}                                    ${DIM}│${NC}"
    echo -e "${DIM}│${NC}                                                                     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   When one agent solves a problem, all agents benefit.              ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   Collective debugging knowledge from thousands of developers.      ${DIM}│${NC}"
    echo -e "${DIM}│${NC}                                                                     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}┌───────────────────────────────────────────────────────────┐${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}  ${GREEN}🔒 YOUR CODE STAYS LOCAL${NC}                                 ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}                                                           ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}  • Only error messages and solutions are shared           ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}  • No source code or files are uploaded                   ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}  • API keys and credentials are never transmitted         ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}│${NC}  • You control what you share                             ${DIM}│${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}   ${DIM}└───────────────────────────────────────────────────────────┘${NC}     ${DIM}│${NC}"
    echo -e "${DIM}│${NC}                                                                     ${DIM}│${NC}"
    echo -e "${DIM}└─────────────────────────────────────────────────────────────────────┘${NC}"
    echo ""
}

# Spinner animation
spinner() {
    local pid=$1
    local message=$2
    local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0
    while kill -0 $pid 2>/dev/null; do
        i=$(( (i+1) % 10 ))
        printf "\r${CYAN}${spin:$i:1}${NC} $message"
        sleep 0.1
    done
    printf "\r${GREEN}✓${NC} $message\n"
}

# Print logo and info
print_logo
print_info_box

echo -e "${BOLD}Installing Spark CLI...${NC}"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗${NC} Node.js is required but not installed."
    echo "  Install Node.js from https://nodejs.org/ or via your package manager."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}✗${NC} Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v) detected"

# Install the CLI globally
echo ""
if command -v npm &> /dev/null; then
    echo -e "${CYAN}⠋${NC} Installing @memco/spark via npm..."
    npm install -g @memco/spark 2>&1 | tail -1
    echo -e "${GREEN}✓${NC} Installed @memco/spark via npm"
elif command -v yarn &> /dev/null; then
    echo -e "${CYAN}⠋${NC} Installing @memco/spark via yarn..."
    yarn global add @memco/spark 2>&1 | tail -1
    echo -e "${GREEN}✓${NC} Installed @memco/spark via yarn"
elif command -v pnpm &> /dev/null; then
    echo -e "${CYAN}⠋${NC} Installing @memco/spark via pnpm..."
    pnpm add -g @memco/spark 2>&1 | tail -1
    echo -e "${GREEN}✓${NC} Installed @memco/spark via pnpm"
else
    echo -e "${RED}✗${NC} npm, yarn, or pnpm is required to install the CLI."
    exit 1
fi

# Verify CLI installation
echo ""
if command -v spark &> /dev/null; then
    echo -e "${GREEN}✓${NC} 'spark' command is available"
else
    echo -e "${YELLOW}⚠${NC} 'spark' command not found in PATH."
    echo "  You may need to add npm global bin to your PATH."
fi

echo ""
echo -e "${DIM}────────────────────────────────────────────────────────────────────────${NC}"
echo ""
echo -e "${GREEN}${BOLD}Installation complete!${NC}"
echo ""
echo -e "${BOLD}Quick Start:${NC}"
echo "  spark query \"your error message\"     # Find solutions"
echo "  spark insights <session-id> 0        # Get details"
echo "  spark share --title \"Fix\" --content \"...\"  # Share solutions"
echo ""
echo -e "${BOLD}Authentication (optional):${NC}"
echo "  export SPARK_API_KEY=your_api_key"
echo "  Get a key at: ${CYAN}https://spark.memco.ai/settings/api${NC}"
echo ""
echo -e "${DIM}Learn more: spark --help${NC}"
echo ""
