/*---------------------------------------------------------
 * Transports for carrying the Debug Adapter Protocol between the extension and
 * `probe-rs dap-server`.
 *
 * Both transports move the same bytes: the DAP `Content-Length: <n>\r\n\r\n<json>`
 * envelope. They differ only in the stream that carries them, and which one is
 * used follows from the launch configuration rather than from a setting:
 *   - [`StdioDapTransport`] talks to the stdin/stdout of a dap-server process
 *     that this extension spawned, which is every session without a configured
 *     `server`. No port needs to be allocated, nothing is reachable from the
 *     network, and the server's lifetime is bound to the pipe.
 *   - [`TcpDapTransport`] connects to a dap-server listening on a socket, which
 *     is the only way to reach a server the user started themselves, whether on
 *     this machine or another one.
 *--------------------------------------------------------*/

'use strict';

import type * as childProcess from 'child_process';
import * as net from 'net';

/**
 * The events a transport reports back to its owner. Exactly one `onClose` is
 * delivered per transport, after which no further `onData` arrives.
 */
export interface DapTransportHandlers {
    onData(chunk: Buffer): void;
    onClose(): void;
    onError(error: Error): void;
}

/**
 * A byte-stream carrying DAP messages to and from a dap-server. Writes issued
 * before the underlying stream is ready must not be lost, so implementations
 * either buffer them or rely on the stream doing so.
 */
export interface DapTransport {
    /** Short description of the endpoint, for log messages. */
    readonly description: string;
    start(handlers: DapTransportHandlers): void;
    write(data: Buffer): void;
    dispose(): void;
}

export class TcpDapTransport implements DapTransport {
    readonly description: string;

    private socket: net.Socket | undefined;
    private connected: boolean = false;
    private outboundQueue: Buffer[] = [];

    constructor(
        private readonly host: string,
        private readonly port: number,
    ) {
        this.description = `TCP ${host}:${port}`;
    }

    start(handlers: DapTransportHandlers): void {
        var socket = new net.Socket();
        this.socket = socket;
        socket.setNoDelay(true);

        socket.on('connect', () => {
            this.connected = true;
            for (var data of this.outboundQueue) {
                socket.write(data);
            }
            this.outboundQueue = [];
        });
        socket.on('data', (chunk: Buffer) => handlers.onData(chunk));
        socket.on('close', () => {
            this.connected = false;
            handlers.onClose();
        });
        socket.on('error', (error: Error) => handlers.onError(error));

        socket.connect(this.port, this.host);
    }

    write(data: Buffer): void {
        // VSCode can hand us the `initialize` request before the socket has
        // finished connecting, so anything written early is held back.
        if (this.connected && this.socket) {
            this.socket.write(data);
        } else {
            this.outboundQueue.push(data);
        }
    }

    dispose(): void {
        this.outboundQueue = [];
        if (this.socket) {
            this.socket.destroy();
            this.socket = undefined;
        }
    }
}

/**
 * Carries DAP over the stdin/stdout pipes of a dap-server process that the
 * extension spawned. The process must have been spawned with both piped; its
 * stderr is handled by the caller, which routes `RUST_LOG` output to the Debug
 * Console.
 */
export class StdioDapTransport implements DapTransport {
    readonly description = 'stdio';

    private child: childProcess.ChildProcess | undefined;

    constructor(
        child: childProcess.ChildProcess,
        // How long the server is given to exit by itself after its input stream is
        // closed, before it is killed.
        private readonly shutdownGraceMs: number = 2000,
    ) {
        this.child = child;
    }

    start(handlers: DapTransportHandlers): void {
        var child = this.child;
        if (!child) {
            throw new Error('stdio transport was disposed before it was started');
        }
        if (!child.stdin || !child.stdout) {
            throw new Error('dap-server process was not spawned with piped stdin and stdout');
        }

        child.stdout.on('data', (chunk: Buffer | string) =>
            handlers.onData(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')),
        );
        child.stdout.on('error', (error: Error) => handlers.onError(error));
        child.stdin.on('error', (error: Error) => handlers.onError(error));
        child.on('exit', () => handlers.onClose());
    }

    write(data: Buffer): void {
        this.child?.stdin?.write(data);
    }

    dispose(): void {
        const child = this.child;
        this.child = undefined;
        if (!child) {
            return;
        }

        // In stdio mode the dap-server is single-session, so it normally exits on its
        // own after the DAP `disconnect`/`terminate` exchange. Ending stdin signals
        // shutdown for the cases where that exchange did not happen (an aborted
        // launch, say), but a server that is not currently reading stdin — because it
        // never got as far as a session, or is stuck attaching to a probe — would
        // otherwise linger and hold on to the probe, so it gets killed after a grace
        // period.
        child.stdin?.end();
        if (child.exitCode !== null || child.signalCode !== null) {
            return;
        }
        var killTimer = setTimeout(() => child.kill(), this.shutdownGraceMs);
        child.once('exit', () => clearTimeout(killTimer));
    }
}
