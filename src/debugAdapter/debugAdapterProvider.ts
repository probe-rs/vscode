import * as childProcess from 'child_process';
import {existsSync} from 'fs';
import getPort from 'get-port';
import * as vscode from 'vscode';
import {Logger, LogLevel} from '../logging/logger';
import {ConfigurationManager} from '../configuration/configurationManager';

export enum DebuggerStatus {
    starting,
    running,
    failed,
}

export interface DebugServer {
    host: string;
    port: number;
}

export class DebugAdapterProvider implements vscode.DebugAdapterDescriptorFactory {
    private rttTerminals: [
        channelNumber: number,
        dataFormat: string,
        rttTerminal: vscode.Terminal,
        channelWriteEmitter: vscode.EventEmitter<string>,
    ][] = [];

    async createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined,
    ): Promise<vscode.DebugAdapterDescriptor | null | undefined> {
        // Update console log level based on session configuration
        if (session.configuration.hasOwnProperty('consoleLogLevel')) {
            const logLevel = session.configuration.consoleLogLevel.toLowerCase();
            Logger.setConsoleLogLevel(logLevel);
        }

        // Default debug server configuration
        let debugServer: DebugServer = {host: '127.0.0.1', port: 50000};

        // Validate that the `cwd` folder exists.
        if (!existsSync(session.configuration.cwd)) {
            Logger.error(
                `The 'cwd' folder does not exist: ${JSON.stringify(session.configuration.cwd, null, 2)}`,
            );
            vscode.window.showErrorMessage(
                `The 'cwd' folder does not exist: ${JSON.stringify(session.configuration.cwd, null, 2)}`,
            );
            return undefined;
        }

        let debuggerStatus: DebuggerStatus = DebuggerStatus.starting;

        if (session.configuration.hasOwnProperty('server')) {
            const serverParts = new String(session.configuration.server).split(':', 2);
            debugServer = {host: serverParts[0], port: parseInt(serverParts[1])};
            Logger.log(
                `${LogLevel.console}: Debug using existing server "${debugServer.host}" on port ${debugServer.port}`,
            );
            debuggerStatus = DebuggerStatus.running; // If this is not true as expected, then the user will be notified later.
        } else {
            // Find and use the first available port and spawn a new probe-rs dap-server process
            try {
                const port: number = await getPort();
                debugServer = {host: '127.0.0.1', port};
            } catch (err: any) {
                Logger.error(JSON.stringify(err.message, null, 2));
                vscode.window.showErrorMessage(
                    `Searching for available port failed with: ${JSON.stringify(
                        err.message,
                        null,
                        2,
                    )}`,
                );
                return undefined;
            }

            let args: string[];
            if (session.configuration.hasOwnProperty('runtimeArgs')) {
                args = session.configuration.runtimeArgs;
            } else {
                args = ['dap-server'];
            }
            args.push('--port');
            args.push(debugServer.port.toString());
            if (session.configuration.hasOwnProperty('logFile')) {
                args.push('--log-file');
                args.push(session.configuration.logFile);
            } else if (session.configuration.hasOwnProperty('logToFolder')) {
                args.push('--log-to-folder');
            }

            const env = {...process.env, ...session.configuration.env};
            // Force the debugger to generate colored output
            env.CLICOLOR_FORCE = '1';

            const options: childProcess.SpawnOptionsWithoutStdio = {
                cwd: session.configuration.cwd,
                env,
                windowsHide: true,
            };

            let command = '';
            if (!executable) {
                if (session.configuration.hasOwnProperty('runtimeExecutable')) {
                    command = session.configuration.runtimeExecutable;
                } else {
                    command = ConfigurationManager.getDebuggerExecutable();
                }
            } else {
                command = executable.command;
            }

            // The debug adapter process was launched by VSCode, and should terminate itself at the end of every debug session (when receiving `Disconnect` or `Terminate` Request from VSCode). The \"false\"(default) state of this option implies that the process was launched (and will be managed) by the user.
            args.push('--vscode');

            // Launch the debugger ...
            Logger.log(`${LogLevel.console}: Launching new server ${JSON.stringify(command)}`);
            Logger.debug(
                `Launch environment variables: ${JSON.stringify(args)} ${JSON.stringify(options)}`,
            );

            let launchedDebugAdapter: childProcess.ChildProcessWithoutNullStreams;
            try {
                launchedDebugAdapter = await this.startDebugServer(command, args, options);
            } catch (error: any) {
                Logger.error(`Failed to launch debug adapter: ${JSON.stringify(error)}`);

                let errorMessage = error;

                // Nicer error message when the executable could not be found.
                if ('code' in error && error.code === 'ENOENT') {
                    errorMessage = `Executable '${command}' was not found.`;
                }

                return Promise.reject(`Failed to launch probe-rs debug adapter: ${errorMessage}`);
            }

            // Capture stderr to ensure OS and RUST_LOG error messages can be brought to the user's attention.
            launchedDebugAdapter.stderr?.on('data', (data: string) => {
                if (
                    debuggerStatus === DebuggerStatus.running ||
                    data.toString().startsWith(LogLevel.console)
                ) {
                    Logger.log(data.toString(), LogLevel.console, true);
                } else {
                    // Any STDERR messages during startup, or on process error, that
                    // are not LogLevel.console types, need special consideration,
                    // otherwise they will be lost.
                    debuggerStatus = DebuggerStatus.failed;
                    vscode.window.showErrorMessage(data.toString());
                    Logger.log(data.toString(), LogLevel.console, true);
                    launchedDebugAdapter.kill();
                }
            });
            launchedDebugAdapter.on('close', (code: number | null, signal: string | null) => {
                this.handleExit(code, signal);
            });
            launchedDebugAdapter.on('error', (err: Error) => {
                if (debuggerStatus !== DebuggerStatus.failed) {
                    debuggerStatus = DebuggerStatus.failed;
                    Logger.error(
                        `probe-rs dap-server process encountered an error: ${JSON.stringify(err)}`,
                    );
                    launchedDebugAdapter.kill();
                }
            });

            // Wait to make sure probe-rs dap-server startup completed, and is ready to accept connections.
            const msRetrySleep = 250;
            let numRetries = 5000 / msRetrySleep;
            while (debuggerStatus !== DebuggerStatus.running && numRetries > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, msRetrySleep));
                if (debuggerStatus === DebuggerStatus.starting) {
                    // Test to confirm probe-rs dap-server is ready to accept requests on the specified port.
                    try {
                        const testPort: number = await getPort({
                            port: debugServer.port,
                        });
                        if (testPort === debugServer.port) {
                            // Port is available, so probe-rs dap-server is not yet initialized.
                            numRetries--;
                        } else {
                            // Port is not available, so probe-rs dap-server is initialized.
                            debuggerStatus = DebuggerStatus.running;
                        }
                    } catch (err: any) {
                        Logger.error(JSON.stringify(err.message, null, 2));
                        vscode.window.showErrorMessage(
                            `Testing probe-rs dap-server port availability failed with: ${JSON.stringify(
                                err.message,
                                null,
                                2,
                            )}`,
                        );
                        return undefined;
                    }
                } else if (debuggerStatus === DebuggerStatus.failed) {
                    // We would have already reported this, so just get out of the loop.
                    break;
                } else {
                    debuggerStatus = DebuggerStatus.failed;
                    Logger.error('Timeout waiting for probe-rs dap-server to launch');
                    vscode.window.showErrorMessage(
                        'Timeout waiting for probe-rs dap-server to launch',
                    );
                    break;
                }
            }

            if (debuggerStatus === DebuggerStatus.running) {
                await new Promise<void>((resolve) => setTimeout(resolve, 500)); // Wait for a fraction of a second more, to allow TCP/IP port to initialize in probe-rs dap-server
            }
        }

        // make VS Code connect to debug server.
        if (debuggerStatus === DebuggerStatus.running) {
            return new vscode.DebugAdapterServer(debugServer.port, debugServer.host);
        }
        // If we reach here, VSCode will report the failure to start the debug adapter.
        return undefined;
    }

    receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {
        switch (customEvent.event) {
            case 'probe-rs-rtt-channel-config':
                this.createRttTerminal(
                    +customEvent.body?.channelNumber,
                    customEvent.body?.dataFormat,
                    customEvent.body?.channelName,
                );
                break;
            case 'probe-rs-rtt-data':
                const incomingChannelNumber: number = +customEvent.body?.channelNumber;
                for (const [channelNumber, dataFormat, , channelWriteEmitter] of this
                    .rttTerminals) {
                    if (channelNumber === incomingChannelNumber) {
                        switch (dataFormat) {
                            case 'BinaryLE': //Don't mess with or filter this data
                                channelWriteEmitter.fire(customEvent.body?.data);
                                break;
                            default: //Replace newline characters with platform appropriate newline/carriage-return combinations
                                channelWriteEmitter.fire(this.formatText(customEvent.body?.data));
                        }
                        break;
                    }
                }
                break;
            case 'probe-rs-show-message':
                Logger.showMessage(customEvent.body?.severity, customEvent.body?.message);
                break;
            case 'exited':
                this.dispose();
                break;
            default:
                Logger.error(
                    `Received unknown custom event:\n${JSON.stringify(customEvent, null, 2)}`,
                );
                break;
        }
    }

    private createRttTerminal(channelNumber: number, dataFormat: string, channelName: string) {
        // Make sure we have a terminal window per channel, for RTT Logging
        if (vscode.debug.activeDebugSession) {
            const session = vscode.debug.activeDebugSession;
            const channelWriteEmitter = new vscode.EventEmitter<string>();
            const channelPty: vscode.Pseudoterminal = {
                onDidWrite: channelWriteEmitter.event,
                open: () => {
                    const windowIsOpen = true;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then(() => {
                            Logger.log(
                                `${LogLevel.console}: RTT Window opened, and ready to receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                },
                close: () => {
                    const windowIsOpen = false;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then(() => {
                            Logger.log(
                                `${LogLevel.console}: RTT Window closed, and can no longer receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                },
            };
            let channelTerminal: vscode.Terminal | undefined;
            for (const reuseTerminal of vscode.window.terminals) {
                if (reuseTerminal.name === channelName) {
                    channelTerminal = reuseTerminal;
                    const windowIsOpen = true;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then(() => {
                            Logger.log(
                                `${LogLevel.console}: RTT Window reused, and ready to receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                    break;
                }
            }
            if (channelTerminal === undefined) {
                const channelTerminalConfig: vscode.ExtensionTerminalOptions = {
                    name: channelName,
                    pty: channelPty,
                };
                for (let index = 0; index < this.rttTerminals.length; index++) {
                    const [formerChannelNumber] = this.rttTerminals[index];
                    if (formerChannelNumber === channelNumber) {
                        this.rttTerminals.splice(+index, 1);
                        break;
                    }
                }
                channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
                Logger.log(
                    `${LogLevel.console}: Opened a new RTT Terminal window named: ${channelName}`,
                );
                this.rttTerminals.push([
                    +channelNumber,
                    dataFormat,
                    channelTerminal,
                    channelWriteEmitter,
                ]);
            }
            if (channelNumber === 0) {
                channelTerminal.show(false);
            }
        }
    }

    private formatText(text: string): string {
        return `\r${text.split(/(\r?\n)/g).join('\r')}\r`;
    }

    private async startDebugServer(
        command: string,
        args: readonly string[],
        options: childProcess.SpawnOptionsWithoutStdio,
    ): Promise<childProcess.ChildProcessWithoutNullStreams> {
        const launchedDebugAdapter = childProcess.spawn(command, args, options);

        return new Promise<childProcess.ChildProcessWithoutNullStreams>((resolve, reject) => {
            function errorListener(error: any) {
                reject(error);
            }

            launchedDebugAdapter.on('spawn', () => {
                // The error listener here is only used for failed spawn,
                // so has to be removed afterwards.
                launchedDebugAdapter.removeListener('error', errorListener);
                resolve(launchedDebugAdapter);
            });
            launchedDebugAdapter.on('error', errorListener);
        });
    }

    private handleExit(code: number | null, signal: string | null) {
        let actionHint: string =
            '\tPlease review all the error messages, including those in the "Debug Console" window.';
        if (code) {
            Logger.error(`probe-rs-debug exited with an unexpected code: ${code} ${actionHint}`);
        } else if (signal) {
            Logger.error(`probe-rs-debug exited with signal: ${signal} ${actionHint}`);
        }
    }

    dispose() {
        // Attempting to write to the console here will loose messages, as the debug session has already been terminated.
        // Instead we use the `onWillEndSession` event of the `DebugAdapterTracker` to handle this.
    }
}
