/**
 * The core’s French: its own sentences and the server's messages the apps show. Each package above
 * brings its own part (the design system's, each app's), added by the programs that use it
 * (`addFrench`); `tools/i18n/check.mjs` lists what is missing, package by package.
 */
import { FR_CORE } from './core';
import { FR_SERVER } from './server';
import { FR_SUITE } from './suite';
import { FR_SHELL } from './shell';
import { FR_SETTINGS_SEARCH } from './settingsSearch';
import { FR_IMMICH } from './immich';

export const CORE_FRENCH = { ...FR_SERVER, ...FR_CORE, ...FR_SUITE, ...FR_SHELL, ...FR_SETTINGS_SEARCH, ...FR_IMMICH };
