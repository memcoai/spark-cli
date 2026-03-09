#!/usr/bin/env node

/**
 * Post-install welcome message for @memco/spark
 * Uses the same banner as the main product (printBanner in banner.js).
 */

import { printBanner, colorize } from '../src/banner.js';

const green = (text) => colorize('\x1b[32m', text);
const cyan = (text) => colorize('\x1b[36m', text);
const dim = (text) => colorize('\x1b[2m', text);

printBanner();
console.log();
console.log(`   ${green('Get started:')}`);
console.log(`     ${cyan('spark login')}       Sign in to Spark`);
console.log(`     ${cyan('spark init')}        Set up your IDE integration`);
console.log(`     ${cyan('spark enable')}      Enable Spark in the current project`);
console.log(`     ${cyan('spark disable')}     Disable Spark in the current project`);
console.log(`     ${cyan('spark status')}      Check your setup`);
console.log();
console.log(`   ${dim('Learn more: https://spark.memco.ai')}`);
console.log();
