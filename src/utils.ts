import * as path from 'path';
import {promises as fs} from 'fs';

/**
 * @param {string} executableName executable name (without extension if on Windows)
 * @return {Promise<string|null>} executable path if found
 * */
export async function findExecutable(executableName: string): Promise<string | null> {
    const envPath = process.env.PATH || '';
    const envExt = process.env.PATHEXT || '';
    const pathDirs = envPath.replace(/["]+/g, '').split(path.delimiter).filter(Boolean);
    const extensions = envExt.split(';');
    const candidates = pathDirs.flatMap((d) =>
        extensions.map((ext) => path.join(d, executableName + ext)),
    );
    try {
        const results = await Promise.all(candidates.map(checkFileExists));
        return results.find((result) => result !== null) || null;
    } catch (e) {
        return null;
    }
}

async function checkFileExists(filePath: string): Promise<string | null> {
    try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
            return filePath;
        }
    } catch {
        // File doesn't exist
    }
    return null;
}
