/** The shared packages at the repository root, under the names the code imports them by (tsconfig.app.json has the same paths). */
import { fileURLToPath } from 'node:url';

export const PACKAGES = fileURLToPath(new URL('../../../packages', import.meta.url));

export const packageAliases = ['core', 'design', 'notes'].map(name => ({ find: `@unlease/${name}`, replacement: `${PACKAGES}/${name}/src` }));
