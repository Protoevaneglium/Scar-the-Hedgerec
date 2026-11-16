#!/usr/bin/env node
'use strict';

if (!process.argv.includes('--open')) {
    process.argv.push('--open');
}
try { require('../server.js').startServer(); }
catch (error) { console.error(`Unable to start Scar: ${error.message}`); process.exitCode = 1; }
