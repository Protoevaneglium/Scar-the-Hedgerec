#!/usr/bin/env node
'use strict';

if (!process.argv.includes('--open')) {
    process.argv.push('--open');
}
require('../server.js');
