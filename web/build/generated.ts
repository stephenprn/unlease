/**
 * Everything the build derives from the shared core, in one module: the
 * plugin loads it through Vite's module runner (which reads core's TypeScript
 * as the app does), so the Vite config itself never imports core.
 */
export { faviconSvg, iconSvg, manifestJson, maskableIconSvg, webAppName, webAppTagline } from './brand';
export { themeColors, tokensCss } from './tokens';
