/*---------------------------------------------------------
 * Support for connecting the probe-rs VSCode extension to a `probe-rs dap-server`
 * that may be running on a different machine from the VSCode client, and for
 * applying language-agnostic client-side source-path rewrites.
 *
 * Three responsibilities live here:
 *   1) `resolveRemoteServerMode` — derive the boolean `remoteServerMode` flag from
 *      the launch configuration. The user can set it explicitly; otherwise it is
 *      inferred from whether the configured `server` host is loopback or not.
 *   2) `uploadClientFiles` — when `remoteServerMode` is in effect, read and
 *      base64-encode the three client-local files referenced in the launch
 *      configuration (`programBinary`, `svdFile`, `chipDescriptionPath`) and
 *      attach them to the configuration as `programBinaryData` / `svdFileData` /
 *      `chipDescriptionData` so the server can materialize them to a temp file.
 *   3) `ProbeRsRemoteDebugAdapter` — wrap the TCP connection to the dap-server
 *      with a `vscode.DebugAdapter` that forwards bytes verbatim except that any
 *      incoming `Source.path` is rewritten using the user's `sourceFileMap`
 *      (plus, for Rust users, an auto-detected entry that maps the synthetic
 *      `/rustc/<hash>/...` build prefix to the active toolchain's local sysroot).
 *      The DAP server itself no longer performs any source-path rewriting; that
 *      responsibility lives entirely on the client side, where the user's source
 *      tree and toolchains live.
 *--------------------------------------------------------*/

'use strict';

import * as childProcess from 'child_process';
import {promises as fs, existsSync} from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * One client-side source-path rewrite. A DAP `Source.path` value that starts
 * with `fromPrefix` has that prefix replaced by `toPrefix` before VSCode sees
 * the message. `fromPrefix` is matched against the path verbatim, so it should
 * be specified using the same path style the compiler recorded in DWARF —
 * typically forward-slash for paths produced by `rustc`, `gcc`, or `clang` on
 * Unix-like build hosts; backslash for Windows-built artifacts.
 */
export interface SourceFileMapEntry {
    fromPrefix: string;
    toPrefix: string;
}

/**
 * The full set of source-path rewrites that the client applies. Entries are
 * ordered with the longest `fromPrefix` first, so that a more specific mapping
 * (e.g. `/builds/myproject/vendor/`) is preferred over a more general one
 * (e.g. `/builds/`).
 */
export interface SourceFileMap {
    entries: SourceFileMapEntry[];
}

/**
 * Decide whether this debug session should run in `remoteServerMode`.
 *
 * Resolution order:
 *   1) An explicit `remoteServerMode: boolean` in the launch configuration wins.
 *   2) Otherwise, infer from `server`: a loopback host (e.g. `127.0.0.1`,
 *      `::1`, `localhost`) means local; anything else means remote.
 *   3) If neither `remoteServerMode` nor `server` is set, the extension is
 *      managing a locally-spawned dap-server, so the answer is `false`.
 *
 * The resolved boolean is written back onto the configuration so downstream
 * logic (and the dap-server itself) sees a definite value.
 */
export function resolveRemoteServerMode(config: vscode.DebugConfiguration): boolean {
    if (typeof config.remoteServerMode === 'boolean') {
        return config.remoteServerMode;
    }
    if (typeof config.server === 'string' && config.server.length > 0) {
        return !isLoopbackServer(config.server);
    }
    return false;
}

/**
 * Returns `true` if the `server` configuration string targets the local
 * machine (loopback). Accepts the conventional spellings (`localhost`,
 * `127.x.x.x`, `::1`, IPv6 mapped IPv4 loopback) with or without a port.
 *
 * A non-loopback host returns `false` even when it _resolves_ to a loopback
 * address at runtime — we intentionally do not perform DNS resolution here,
 * because the user can always override with an explicit `remoteServerMode`.
 */
export function isLoopbackServer(server: string): boolean {
    var host = stripPort(server.trim()).toLowerCase();
    if (host === 'localhost' || host === 'localhost.localdomain') {
        return true;
    }
    if (host === '::1' || host === '[::1]' || host === '0:0:0:0:0:0:0:1') {
        return true;
    }
    if (host === '::ffff:127.0.0.1' || host === '[::ffff:127.0.0.1]') {
        return true;
    }
    if (/^127(\.\d{1,3}){3}$/.test(host)) {
        return true;
    }
    return false;
}

function stripPort(server: string): string {
    // IPv6 wrapped in brackets, e.g. `[::1]:50001`.
    if (server.startsWith('[')) {
        var end = server.indexOf(']');
        return end >= 0 ? server.substring(1, end) : server;
    }
    // IPv4 / hostname with optional `:port`. Note that bare IPv6 addresses
    // (without brackets) cannot carry a port.
    var colonCount = (server.match(/:/g) || []).length;
    if (colonCount === 1) {
        return server.split(':', 1)[0];
    }
    return server;
}

/**
 * Read each of the client-local files that the server would otherwise need
 * filesystem access to, and stash their base64-encoded contents on the launch
 * configuration so that the server can decode them into its session-scoped
 * temp directory. Original path fields are left intact so they continue to
 * render in server log messages.
 *
 * No-op if `remoteServerMode` is not set on the configuration.
 */
export async function uploadClientFiles(
    config: vscode.DebugConfiguration,
    logToConsole: (message: string) => void,
): Promise<void> {
    if (!config.remoteServerMode) {
        return;
    }

    var cwd: string | undefined = config.cwd;

    if (typeof config.chipDescriptionPath === 'string' && config.chipDescriptionPath.length > 0) {
        config.chipDescriptionData = await readAsBase64(
            absolutize(config.chipDescriptionPath, cwd),
            'chipDescriptionPath',
            logToConsole,
        );
    }

    var coreConfigs: any[] = Array.isArray(config.coreConfigs) ? config.coreConfigs : [];
    for (var coreConfig of coreConfigs) {
        if (typeof coreConfig.programBinary === 'string' && coreConfig.programBinary.length > 0) {
            coreConfig.programBinaryData = await readAsBase64(
                absolutize(coreConfig.programBinary, cwd),
                `coreConfigs[${coreConfig.coreIndex ?? 0}].programBinary`,
                logToConsole,
            );
        }
        if (typeof coreConfig.svdFile === 'string' && coreConfig.svdFile.length > 0) {
            coreConfig.svdFileData = await readAsBase64(
                absolutize(coreConfig.svdFile, cwd),
                `coreConfigs[${coreConfig.coreIndex ?? 0}].svdFile`,
                logToConsole,
            );
        }
    }
}

async function readAsBase64(
    filePath: string,
    description: string,
    logToConsole: (message: string) => void,
): Promise<string> {
    if (!existsSync(filePath)) {
        throw new Error(
            `${description} '${filePath}' does not exist on the local machine. ` +
                `Cannot upload to remote dap-server.`,
        );
    }
    var bytes = await fs.readFile(filePath);
    logToConsole(
        `Uploading ${description} '${filePath}' (${bytes.length} bytes) to remote dap-server`,
    );
    return bytes.toString('base64');
}

function absolutize(filePath: string, cwd: string | undefined): string {
    if (path.isAbsolute(filePath)) {
        return filePath;
    }
    if (cwd && cwd.length > 0) {
        return path.join(cwd, filePath);
    }
    return path.resolve(filePath);
}

/**
 * Combine the user-supplied `sourceFileMap` from the launch configuration with
 * an auto-detected entry for the active Rust toolchain (if any), and return the
 * combined set sorted longest-`fromPrefix` first.
 *
 * The auto-detected rustlib entry is only added when the user has not already
 * supplied a mapping for the synthetic `/rustc/...` prefix, so the user can
 * always take control. If `rustc` cannot be found or its output cannot be
 * parsed, the rustlib auto-entry is silently omitted; non-Rust users are not
 * required to have `rustc` installed.
 */
export async function buildSourceFileMap(
    userMap: Record<string, string> | undefined,
    logToConsole: (message: string) => void,
): Promise<SourceFileMap> {
    var entries: SourceFileMapEntry[] = [];

    if (userMap) {
        for (var fromPrefix of Object.keys(userMap)) {
            var toPrefix = userMap[fromPrefix];
            if (typeof toPrefix === 'string' && fromPrefix.length > 0) {
                entries.push({fromPrefix, toPrefix});
            }
        }
    }

    var userMappedRustlib = entries.some((entry) => entry.fromPrefix.startsWith('/rustc/'));
    if (!userMappedRustlib) {
        var rustlib = await detectRustlibSourceFileMapEntry();
        if (rustlib) {
            entries.push(rustlib);
            logToConsole(
                `Auto-mapped rustlib sources: '${rustlib.fromPrefix}' -> '${rustlib.toPrefix}'`,
            );
        }
    }

    // Sort longest-prefix first so that more specific mappings shadow more
    // general ones (e.g. `/builds/myproject/vendor/` wins over `/builds/`).
    entries.sort((a, b) => b.fromPrefix.length - a.fromPrefix.length);

    return {entries};
}

/**
 * Detect the active rustc toolchain and produce a `SourceFileMapEntry` that
 * maps the synthetic build-time prefix (`/rustc/<commit-hash>/`) used by
 * precompiled rustlib sources to the active toolchain's local sysroot.
 *
 * Returns `undefined` if `rustc` is not on PATH, or its output cannot be
 * parsed. This is non-fatal: only Rust stack frames into precompiled rustlib
 * code go unmapped, and only for the current session.
 *
 * The procedure mirrors the one used by `rust-analyzer`:
 * https://github.com/rust-lang/rust-analyzer/blob/master/editors/code/src/toolchain.ts
 */
export async function detectRustlibSourceFileMapEntry(): Promise<SourceFileMapEntry | undefined> {
    var rustc = await findRustc();
    if (!rustc) {
        return undefined;
    }

    var verbose = await captureProcessOutput(rustc, ['--version', '--verbose']);
    if (!verbose) {
        return undefined;
    }
    var hashLine = verbose.split(/\r?\n/).find((line) => line.startsWith('commit-hash:'));
    if (!hashLine) {
        return undefined;
    }
    var hash = hashLine.substring('commit-hash:'.length).trim();
    if (hash.length === 0) {
        return undefined;
    }

    var sysroot = await captureProcessOutput(rustc, ['--print', 'sysroot']);
    if (!sysroot) {
        return undefined;
    }

    return {
        // The DAP server emits the DWARF path verbatim; rustc always records
        // this prefix using forward slashes regardless of the build host platform.
        fromPrefix: `/rustc/${hash}/`,
        toPrefix: path.join(sysroot.trim(), 'lib', 'rustlib', 'src', 'rust') + path.sep,
    };
}

async function findRustc(): Promise<string | null> {
    if (process.env.RUSTC && process.env.RUSTC.length > 0) {
        return process.env.RUSTC;
    }

    var executable = process.platform === 'win32' ? 'rustc.exe' : 'rustc';
    var pathDirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
    for (var dir of pathDirs) {
        var candidate = path.join(dir, executable);
        if (existsSync(candidate)) {
            return executable;
        }
    }

    var cargoHome =
        process.env.CARGO_HOME && process.env.CARGO_HOME.length > 0
            ? process.env.CARGO_HOME
            : path.join(os.homedir(), '.cargo');
    var cargoCandidate = path.join(cargoHome, 'bin', executable);
    if (existsSync(cargoCandidate)) {
        return cargoCandidate;
    }

    // Fall back to letting the OS resolve `rustc`; this matches the server-side
    // procedure that previously lived in the Rust code.
    return executable;
}

function captureProcessOutput(command: string, args: string[]): Promise<string | undefined> {
    return new Promise((resolve) => {
        var output = '';
        var child = childProcess.spawn(command, args, {windowsHide: true});
        child.stdout?.on('data', (chunk) => {
            output += chunk.toString('utf8');
        });
        child.on('error', () => resolve(undefined));
        child.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                resolve(undefined);
            }
        });
    });
}

/**
 * Bidirectional proxy between VSCode's DAP client and a TCP `probe-rs dap-server`,
 * used so the extension can transparently rewrite incoming `Source.path` values
 * using the configured `SourceFileMap`. When the map is empty, this adapter is a
 * verbatim byte forwarder.
 *
 * The DAP framing on the wire is the same `Content-Length: <n>\r\n\r\n<json>`
 * envelope used over stdio, so we parse that here in order to surface fully
 * decoded messages to the rewrite step.
 */
export class ProbeRsRemoteDebugAdapter implements vscode.DebugAdapter {
    private readonly _onDidSendMessage = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
    readonly onDidSendMessage: vscode.Event<vscode.DebugProtocolMessage> =
        this._onDidSendMessage.event;

    private socket: net.Socket | undefined;
    private connected: boolean = false;
    private outboundQueue: Buffer[] = [];
    private inboundBuffer: Buffer = Buffer.alloc(0);

    constructor(
        host: string,
        port: number,
        private readonly sourceFileMap: SourceFileMap,
    ) {
        this.socket = new net.Socket();
        this.socket.setNoDelay(true);

        this.socket.on('connect', () => {
            this.connected = true;
            for (var data of this.outboundQueue) {
                this.socket!.write(data);
            }
            this.outboundQueue = [];
        });
        this.socket.on('data', (chunk: Buffer) => {
            this.inboundBuffer = Buffer.concat([this.inboundBuffer, chunk]);
            this.parseInbound();
        });
        this.socket.on('close', () => {
            // The DAP session ends when the server closes; VSCode handles this via
            // the DebugAdapterTracker's `onExit` and via the lack of further events.
            this.connected = false;
        });
        this.socket.on('error', (error) => {
            console.error('probe-rs remote adapter TCP error: ', error);
        });

        this.socket.connect(port, host);
    }

    handleMessage(message: vscode.DebugProtocolMessage): void {
        var json = JSON.stringify(message);
        var encoded = Buffer.byteLength(json, 'utf8');
        var framed = Buffer.from(`Content-Length: ${encoded}\r\n\r\n${json}`, 'utf8');
        if (this.connected && this.socket) {
            this.socket.write(framed);
        } else {
            this.outboundQueue.push(framed);
        }
    }

    private parseInbound(): void {
        // The DAP framing is `Content-Length: <n>\r\n\r\n<n-bytes-of-utf8-json>`.
        // We loop until we either drain the buffer or run out of complete messages.
        for (;;) {
            var headerEnd = this.inboundBuffer.indexOf('\r\n\r\n');
            if (headerEnd < 0) {
                return;
            }
            var headerBlock = this.inboundBuffer.subarray(0, headerEnd).toString('utf8');
            var match = headerBlock.match(/Content-Length:\s*(\d+)/i);
            if (!match) {
                // Malformed framing; consume the bad header and try to resync.
                this.inboundBuffer = this.inboundBuffer.subarray(headerEnd + 4);
                continue;
            }
            var contentLength = parseInt(match[1], 10);
            var totalLength = headerEnd + 4 + contentLength;
            if (this.inboundBuffer.length < totalLength) {
                return;
            }
            var bodyBytes = this.inboundBuffer.subarray(headerEnd + 4, totalLength);
            this.inboundBuffer = this.inboundBuffer.subarray(totalLength);

            var body: any;
            try {
                body = JSON.parse(bodyBytes.toString('utf8'));
            } catch (error) {
                console.error(
                    'probe-rs remote adapter: failed to parse DAP message from server: ',
                    error,
                );
                continue;
            }

            if (this.sourceFileMap.entries.length > 0) {
                rewriteSourcePaths(body, this.sourceFileMap);
            }

            this._onDidSendMessage.fire(body);
        }
    }

    dispose(): any {
        if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
        }
        this._onDidSendMessage.dispose();
    }
}

/**
 * Walk a parsed DAP message and rewrite every `Source.path` value using the
 * supplied `SourceFileMap`. We identify a `Source` structurally rather than by
 * surrounding response shape, so the rewrite covers all DAP responses and
 * events that embed sources (`stackTrace`, `loadedSources`, `breakpoint`
 * events, etc.) without us having to enumerate them.
 *
 * Because `entries` is sorted longest-prefix-first by `buildSourceFileMap`, the
 * first matching entry is also the most specific match.
 */
function rewriteSourcePaths(value: any, sourceFileMap: SourceFileMap): void {
    if (!value || typeof value !== 'object') {
        return;
    }
    if (Array.isArray(value)) {
        for (var item of value) {
            rewriteSourcePaths(item, sourceFileMap);
        }
        return;
    }
    if (looksLikeSource(value) && typeof value.path === 'string') {
        for (var entry of sourceFileMap.entries) {
            if (value.path.startsWith(entry.fromPrefix)) {
                value.path = entry.toPrefix + value.path.slice(entry.fromPrefix.length);
                break;
            }
        }
    }
    for (var key of Object.keys(value)) {
        rewriteSourcePaths(value[key], sourceFileMap);
    }
}

/**
 * Loose structural check for a DAP `Source`. The full schema permits `name`,
 * `path`, `sourceReference`, `presentationHint`, `origin`, `sources`,
 * `adapterData`, and `checksums`; in practice every `Source` we receive carries
 * `path` (the case we want) plus a `name`. Anything else with a `path` field
 * could be a different structure, so we require `name` (or `sourceReference`)
 * too to avoid mangling unrelated path-bearing payloads.
 */
function looksLikeSource(value: any): boolean {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof value.path === 'string' &&
        ('name' in value || 'sourceReference' in value)
    );
}
