/**
 * ASCII art banner and messaging for Memco Spark
 * Font style: Source Serif 4 Bold inspired
 */

// Memco logo in ASCII art - Source Serif 4 Bold style
const MEMCO_LOGO = `

  ███╗   ███╗ ███████╗ ███╗   ███╗  ██████╗  ██████╗
  ████╗ ████║ ██╔════╝ ████╗ ████║ ██╔════╝ ██╔═══██╗
  ██╔████╔██║ █████╗   ██╔████╔██║ ██║      ██║   ██║
  ██║╚██╔╝██║ ██╔══╝   ██║╚██╔╝██║ ██║      ██║   ██║
  ██║ ╚═╝ ██║ ███████╗ ██║ ╚═╝ ██║ ╚██████╗ ╚██████╔╝ ██╗
  ╚═╝     ╚═╝ ╚══════╝ ╚═╝     ╚═╝  ╚═════╝  ╚═════╝  ╚═╝

`;

// Spark branding
const SPARK_LOGO = `
   ███████╗ ██████╗   █████╗  ██████╗  ██╗  ██╗
   ██╔════╝ ██╔══██╗ ██╔══██╗ ██╔══██╗ ██║ ██╔╝
   ███████╗ ██████╔╝ ███████║ ██████╔╝ █████╔╝
   ╚════██║ ██╔═══╝  ██╔══██║ ██╔══██╗ ██╔═██╗
   ███████║ ██║      ██║  ██║ ██║  ██║ ██║  ██╗
   ╚══════╝ ╚═╝      ╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝  ╚═╝
`;

// Privacy and feature info box
const INFO_BOX = `
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   ⚡ SHARED MEMORY FOR AI AGENTS                                    │
│                                                                     │
│   When one agent solves a problem, all agents benefit.              │
│   Collective debugging knowledge from thousands of developers.      │
│                                                                     │
│   ┌───────────────────────────────────────────────────────────┐     │
│   │  🔒 YOUR CODE STAYS LOCAL                                 │     │
│   │                                                           │     │
│   │  • Only error messages and solutions are shared           │     │
│   │  • No source code or files are uploaded                   │     │
│   │  • API keys and credentials are never transmitted         │     │
│   │  • You control what you share                             │     │
│   └───────────────────────────────────────────────────────────┘     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
`;

// Simple animated spinner frames
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Wrap text in ANSI color codes, respecting NO_COLOR env var.
 * See https://no-color.org
 */
export function colorize(code, text) {
  if (process.env.NO_COLOR) return text;
  return `${code}${text}\x1b[0m`;
}

/**
 * Print the Memco logo with colors
 */
export function printMemcoLogo() {
  console.log(colorize('\x1b[32m', MEMCO_LOGO));
}

/**
 * Print the Spark logo
 */
export function printSparkLogo() {
  console.log(colorize('\x1b[33m', SPARK_LOGO));
}

/**
 * Print the full banner with logo and info
 */
export function printBanner() {
  console.log(colorize('\x1b[32m', MEMCO_LOGO));
  console.log(colorize('\x1b[2m', INFO_BOX));
}

/**
 * Print a success message with styling
 */
export function printSuccess(message) {
  console.log(colorize('\x1b[32m', '✓') + ' ' + message);
}

/**
 * Print an error message with styling
 */
export function printError(message) {
  console.log(colorize('\x1b[31m', '✗') + ' ' + message);
}

/**
 * Print an info message with styling
 */
export function printInfo(message) {
  console.log(colorize('\x1b[34m', 'ℹ') + ' ' + message);
}

/**
 * Print a warning message with styling
 */
export function printWarning(message) {
  console.log(colorize('\x1b[33m', '⚠') + ' ' + message);
}

/**
 * Create a simple progress indicator
 */
export function createSpinner(message) {
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${colorize('\x1b[36m', SPINNER_FRAMES[i])} ${message}`);
    i = (i + 1) % SPINNER_FRAMES.length;
  }, 80);

  return {
    stop: (finalMessage) => {
      clearInterval(interval);
      process.stdout.write(`\r${colorize('\x1b[32m', '✓')} ${finalMessage || message}\n`);
    },
    fail: (errorMessage) => {
      clearInterval(interval);
      process.stdout.write(`\r${colorize('\x1b[31m', '✗')} ${errorMessage || message}\n`);
    },
  };
}

/**
 * Print a styled box with content
 */
export function printBox(title, content) {
  const lines = content.split('\n');
  const maxLen = Math.max(title.length, ...lines.map((l) => l.length));
  const width = maxLen + 4;

  console.log('┌' + '─'.repeat(width) + '┐');
  console.log('│ ' + colorize('\x1b[1m', title.padEnd(width - 2)) + ' │');
  console.log('├' + '─'.repeat(width) + '┤');
  for (const line of lines) {
    console.log('│ ' + line.padEnd(width - 2) + ' │');
  }
  console.log('└' + '─'.repeat(width) + '┘');
}

export { MEMCO_LOGO, SPARK_LOGO, INFO_BOX, SPINNER_FRAMES };
