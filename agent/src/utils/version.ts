/**
 * Centralized Version Utility
 * Single source of truth for version information
 * Reads from package.json to ensure consistency
 *
 * Clean Architecture: Infrastructure/Utils Layer
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

let cachedVersion: string | null = null;

/**
 * Get the current version from package.json
 * Caches the result for performance
 */
export function getVersion(): string {
  if (cachedVersion) {
    return cachedVersion;
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const agentDir = join(__dirname, '../..');
    const packageJsonPath = join(agentDir, 'package.json');

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      const version = packageJson.version || '0.3.0';
      cachedVersion = version;
      return version;
    }
  } catch {
    // Fallback if can't read package.json
    console.warn('Warning: Could not read version from package.json, using fallback');
  }

  // Fallback version (should match package.json)
  cachedVersion = '0.3.0';
  return cachedVersion;
}
