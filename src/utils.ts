import * as os from 'os';

/**
 * Replace references to the home directory in a path (either `~` or `$HOME`).
 *
 * This will only match paths at the start of the string, followed by a path
 * separator or by the end of the string.
 */
export function replaceHome(path: string): string {
    const homeDir = os.homedir();
    return homeDir ? path.replace(/^(~|\$HOME)(?=$|\/|\\)/, homeDir) : path;
}
