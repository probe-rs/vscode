const path = require('path');
import {promises as fs} from 'fs';

/**
 * @param {string} exe executable name (without extension if on Windows)
 * @return {Promise<string|null>} executable path if found
 * */
async function findExecutable(executableName: string): Promise<string | null> {
    const envPath = process.env.PATH || '';
    const envExt = process.env.PATHEXT || '';
    const pathDirs = envPath.replace(/["]+/g, '').split(path.delimiter).filter(Boolean);
    const extensions = envExt.split(';');
    const candidates = pathDirs.flatMap((d) =>
        extensions.map((ext) => path.join(d, executableName + ext)),
    );
    try {
        return await Promise.any(candidates.map(checkFileExists));
    } catch (e) {
        return null;
    }
}

async function checkFileExists(filePath): Promise<string | null> {
    if ((await fs.stat(filePath)).isFile()) {
        return filePath;
    }
    return null;
}

export async function probeRsInstalled() {
    return await findExecutable('probe-rs');
}
