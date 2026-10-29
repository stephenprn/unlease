/**
 * The core's English: its own sentences and the server's messages the apps show. Each package above
 * brings its own part (the design system's, each app's), added by the programs that use it
 * (`addEnglish`); `tools/i18n/check.mjs` lists what is missing, package by package.
 */
import { EN_CORE } from './core';
import { EN_SERVER } from './server';

export const CORE_ENGLISH = { ...EN_SERVER, ...EN_CORE };
