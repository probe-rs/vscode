/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as childProcess from 'child_process';
import {existsSync} from 'fs';
import getPort from 'get-port';
import * as os from 'os';
import * as vscode from 'vscode';
import {DebugAdapterTracker, DebugAdapterTrackerFactory} from 'vscode';

export async function activate(context: vscode.ExtensionContext) {
    const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();

    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
        vscode.debug.onDidReceiveDebugSessionCustomEvent(
            descriptorFactory.receivedCustomEvent.bind(descriptorFactory),
        ),
        vscode.debug.onDidTerminateDebugSession(descriptorFactory.dispose.bind(descriptorFactory)),
    );

    // I cannot find a way to programmatically test for when VSCode is debugging the extension, versus when a user is using the extension to debug their own code, but the following code is useful in the former situation, so I will leave it here to be commented out by extension developers when needed.
    // const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();
    // context.subscriptions.push(
    // 	vscode.debug.registerDebugAdapterTrackerFactory('probe-rs-debug', trackerFactory),
    // );
}

export function deactivate(context: vscode.ExtensionContext) {
    return undefined;
}

// Cleanup inconsistent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join('\r')}\r`;

// Constant for handling/filtering  console log messages.
const enum ConsoleLogSources {
    console = 'probe-rs-debug', // Identifies messages from the extension or debug adapter that must be sent to the Debug Console.
    debug = 'DEBUG', // Identifies messages that contain detailed level debug information.
    info = 'INFO', // Identifies messages that contain summary level of debug information.
    error = 'ERROR', // Identifies messages that contain error information.
}

// This is just the default. It will be updated after the configuration has been resolved.
var consoleLogLevel = ConsoleLogSources.console;

// Common handler for error/exit codes
function handleExit(code: number | null, signal: string | null) {
    var actionHint: string =
        '\tPlease review all the error messages, including those in the "Debug Console" window.';
    if (code) {
        vscode.window.showErrorMessage(
            `${
                ConsoleLogSources.error
            }: ${ConsoleLogSources.console.toLowerCase()} exited with an unexpected code: ${code} ${actionHint}`,
        );
    } else if (signal) {
        vscode.window.showErrorMessage(
            `${
                ConsoleLogSources.error
            }: ${ConsoleLogSources.console.toLowerCase()} exited with signal: ${signal} ${actionHint}`,
        );
    }
}

// Adapted from https://stackoverflow.com/questions/2970525/converting-any-string-into-camel-case
function toCamelCase(str: string) {
    return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match: string, index: number) {
        if (+match === 0) {
            return '';
        } // or if (/\s+/.test(match)) for white spaces
        return index === 0 ? match.toLowerCase() : match.toUpperCase();
    });
}

// Messages to be sent to the debug session's console.
// Any local (generated directly by this extension) messages MUST start with ConsoleLogLevels.error, or ConsoleLogSources.console.toLowerCase(), or `DEBUG`.
// Any messages that start with ConsoleLogLevels.error or ConsoleLogSources.console.toLowerCase() will always be logged.
// Any messages that come from the ConsoleLogSources.console.toLowerCase() STDERR will always be logged.
function logToConsole(consoleMessage: string, fromDebugger: boolean = false) {
    console.log(consoleMessage); // During VSCode extension development, this will also log to the local debug console
    if (fromDebugger) {
        // STDERR messages of the `error` variant. These deserve to be shown as an error message in the UI also.
        // This filter might capture more than expected, but since RUST_LOG messages can take many formats, it seems that this is the safest/most inclusive.
        if (consoleMessage.includes(ConsoleLogSources.error)) {
            vscode.window.showErrorMessage(consoleMessage);
        } else {
            // Any other messages that come directly from the debugger, are assumed to be relevant and should be logged to the console.
            vscode.debug.activeDebugConsole.appendLine(consoleMessage);
        }
    } else if (consoleMessage.includes(ConsoleLogSources.console.toLowerCase())) {
        vscode.debug.activeDebugConsole.appendLine(consoleMessage);
    } else {
        switch (consoleLogLevel) {
            case ConsoleLogSources.debug: //  Log Info, Error AND Debug
                if (
                    consoleMessage.includes(ConsoleLogSources.console.toLowerCase()) ||
                    consoleMessage.includes(ConsoleLogSources.error) ||
                    consoleMessage.includes(ConsoleLogSources.debug)
                ) {
                    vscode.debug.activeDebugConsole.appendLine(consoleMessage);
                }
                break;
            default: // ONLY log console and error messages
                if (
                    consoleMessage.includes(ConsoleLogSources.console.toLowerCase()) ||
                    consoleMessage.includes(ConsoleLogSources.error)
                ) {
                    vscode.debug.activeDebugConsole.appendLine(consoleMessage);
                }
                break;
        }
    }
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
    rttTerminals: [
        channelNumber: number,
        dataFormat: String,
        rttTerminal: vscode.Terminal,
        channelWriteEmitter: vscode.EventEmitter<string>,
    ][] = [];

    createRttTerminal(channelNumber: number, dataFormat: string, channelName: string) {
        // Make sure we have a terminal window per channel, for RTT Logging
        if (vscode.debug.activeDebugSession) {
            let session = vscode.debug.activeDebugSession;
            let channelWriteEmitter = new vscode.EventEmitter<string>();
            let channelPty: vscode.Pseudoterminal = {
                onDidWrite: channelWriteEmitter.event,
                open: () => {
                    let windowIsOpen = true;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then((response) => {
                            logToConsole(
                                `${ConsoleLogSources.console.toLowerCase()}: RTT Window opened, and ready to receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                },
                close: () => {
                    let windowIsOpen = false;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then((response) => {
                            logToConsole(
                                `${ConsoleLogSources.console.toLowerCase()}: RTT Window closed, and can no longer receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                },
            };
            let channelTerminalConfig: vscode.ExtensionTerminalOptions | undefined;
            let channelTerminal: vscode.Terminal | undefined;
            for (let reuseTerminal of vscode.window.terminals) {
                if (reuseTerminal.name === channelName) {
                    channelTerminal = reuseTerminal;
                    channelTerminalConfig =
                        channelTerminal.creationOptions as vscode.ExtensionTerminalOptions;
                    let windowIsOpen = true;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then((response) => {
                            logToConsole(
                                `${ConsoleLogSources.console.toLowerCase()}: RTT Window reused, and ready to receive RTT data on channel ${JSON.stringify(
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
                channelTerminalConfig = {
                    name: channelName,
                    pty: channelPty,
                };
                for (let index in this.rttTerminals) {
                    var [formerChannelNumber, , ,] = this.rttTerminals[index];
                    if (formerChannelNumber === channelNumber) {
                        this.rttTerminals.splice(+index, 1);
                        break;
                    }
                }
                channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
                vscode.debug.activeDebugConsole.appendLine(
                    `${ConsoleLogSources.console.toLowerCase()}: Opened a new RTT Terminal window named: ${channelName}`,
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
                let incomingChannelNumber: number = +customEvent.body?.channelNumber;
                for (var [channelNumber, dataFormat, , channelWriteEmitter] of this.rttTerminals) {
                    if (channelNumber === incomingChannelNumber) {
                        switch (dataFormat) {
                            case 'BinaryLE': //Don't mess with or filter this data
                                channelWriteEmitter.fire(customEvent.body?.data);
                                break;
                            default: //Replace newline characters with platform appropriate newline/carriage-return combinations
                                channelWriteEmitter.fire(formatText(customEvent.body?.data));
                                console.log(customEvent.body?.data);
                        }
                        break;
                    }
                }
                break;
            case 'probe-rs-show-message':
                switch (customEvent.body?.severity) {
                    case 'information':
                        vscode.window.showInformationMessage(customEvent.body?.message);
                        break;
                    case 'warning':
                        vscode.debug.activeDebugConsole.appendLine(customEvent.body?.message);
                        vscode.window.showWarningMessage(customEvent.body?.message);
                        break;
                    case 'error':
                        vscode.debug.activeDebugConsole.appendLine(customEvent.body?.message);
                        vscode.window.showErrorMessage(customEvent.body?.message);
                        break;
                    default:
                        logToConsole(`${
                            ConsoleLogSources.error
                        }: ${ConsoleLogSources.console.toLowerCase()}: Received custom event with unknown message severity:
						${JSON.stringify(customEvent.body?.severity, null, 2)}`);
                }
                break;
            case `exited`:
                this.dispose();
                break;
            default:
                logToConsole(`${
                    ConsoleLogSources.error
                }: ${ConsoleLogSources.console.toLowerCase()}: Received unknown custom event:
				${JSON.stringify(customEvent, null, 2)}`);
                break;
        }
    }

    // Note. We do NOT use `DebugAdapterExecutable`, but instead use `DebugAdapterServer` in all cases.
    // - The decision was made during investigation of an [issue](https://github.com/probe-rs/probe-rs/issues/703) ... basically, after the probe-rs API was fixed, the code would work well for TCP connections (`DebugAdapterServer`), but would not work for STDIO connections (`DebugAdapterServer`). After some searches I found other extension developers that also found the TCP based connections to be more stable.
    //  - Since then, we have taken advantage of the access to stderr that `DebugAdapterServer` offers to route `RUST_LOG` output from the debugger to the user's VSCode Debug Console. This is a very useful capability, and cannot easily be implemented in `DebugAdapterExecutable`, because it does not allow access to `stderr` [See ongoing issue in VScode repo](https://github.com/microsoft/vscode/issues/108145).
    async createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined,
    ): Promise<vscode.DebugAdapterDescriptor | null | undefined> {
        if (session.configuration.hasOwnProperty('consoleLogLevel')) {
            consoleLogLevel = session.configuration.consoleLogLevel.toLowerCase();
        }

        // Initiate either the 'attach' or 'launch' request.
        logToConsole(
            `${ConsoleLogSources.console.toLowerCase()}: Session: ${JSON.stringify(
                session,
                null,
                2,
            )}`,
        );

        // When starting the debugger process, we have to wait for debuggerStatus to be set to `DebuggerStatus.running` before we continue
        enum DebuggerStatus {
            starting,
            running,
            failed,
        }
        var debuggerStatus: DebuggerStatus = DebuggerStatus.starting;

        var debugServer = new String('127.0.0.1:50000').split(':', 2); // ... provide default server host and port for "launch" configurations, where this is NOT a mandatory config
        if (session.configuration.hasOwnProperty('server')) {
            debugServer = new String(session.configuration.server).split(':', 2);
            logToConsole(
                `${ConsoleLogSources.console.toLowerCase()}: Debug using existing server" ${JSON.stringify(
                    debugServer[0],
                )} on port ${JSON.stringify(debugServer[1])}`,
            );
            logToConsole(
                `${ConsoleLogSources.console.toLowerCase()}: Please note that debug server error messages will only be reported by the existing server console.`,
            );
            debuggerStatus = DebuggerStatus.running; // If this is not true as expected, then the user will be notified later.
        } else {
            // Validate that the `cwd` folder exists.
            if (session.configuration.hasOwnProperty('cwd')) {
                if (!existsSync(session.configuration.cwd)) {
                    logToConsole(
                        `${
                            ConsoleLogSources.error
                        }: ${ConsoleLogSources.console.toLowerCase()}: The 'cwd' folder does not exist: ${JSON.stringify(
                            session.configuration.cwd,
                            null,
                            2,
                        )}`,
                    );
                    vscode.window.showErrorMessage(
                        `The 'cwd' folder does not exist: ${JSON.stringify(
                            session.configuration.cwd,
                            null,
                            2,
                        )}`,
                    );
                    return undefined;
                }
            }
            // Find and use the first available port and spawn a new probe-rs dap-server process
            try {
                var port: number = await getPort();
                debugServer = `127.0.0.1:${port}`.split(':', 2);
            } catch (err: any) {
                logToConsole(`${ConsoleLogSources.error}: ${JSON.stringify(err.message, null, 2)}`);
                vscode.window.showErrorMessage(
                    `Searching for available port failed with: ${JSON.stringify(
                        err.message,
                        null,
                        2,
                    )}`,
                );
                return undefined;
            }
            var args: string[];
            if (session.configuration.hasOwnProperty('runtimeArgs')) {
                args = session.configuration.runtimeArgs;
            } else {
                args = ['dap-server'];
            }
            args.push('--port');
            args.push(debugServer[1]);

            var options = {
                cwd: session.configuration.cwd,
                env: {...process.env, ...session.configuration.env},
                windowsHide: true,
            };

            // Force the debugger to generate
            options.env.CLICOLOR_FORCE = '1';

            var command = '';
            if (!executable) {
                if (session.configuration.hasOwnProperty('runtimeExecutable')) {
                    command = session.configuration.runtimeExecutable;
                } else {
                    command = debuggerExecutablePath();
                }
            } else {
                command = executable.command;
            }

            // The debug adapter process was launched by VSCode, and should terminate itself at the end of every debug session (when receiving `Disconnect` or `Terminate` Request from VSCode). The "false"(default) state of this option implies that the process was launched (and will be managed) by the user.
            args.push('--vscode');

            // Launch the debugger ... launch errors will be reported in `onClose event`
            logToConsole(
                `${ConsoleLogSources.console.toLowerCase()}: Launching new server ${JSON.stringify(
                    command,
                )} ${JSON.stringify(args)} ${JSON.stringify(options)}`,
            );

            try {
                var launchedDebugAdapter = await startDebugServer(command, args, options);
            } catch (error: any) {
                logToConsole(`Failed to launch debug adapter: ${JSON.stringify(error)}`);

                var errorMessage = error;

                // Nicer error message when the executable could not be found.
                if ('code' in error && error.code === 'ENOENT') {
                    errorMessage = `Executable '${command}' was not found.`;
                }

                return Promise.reject(`Failed to launch probe-rs debug adapter: ${errorMessage}`);
            }

            // Capture stderr to ensure OS and RUST_LOG error messages can be brought to the user's attention.
            launchedDebugAdapter.stderr?.on('data', (data: string) => {
                if (
                    debuggerStatus === (DebuggerStatus.running as DebuggerStatus) ||
                    data.toString().startsWith(ConsoleLogSources.console)
                ) {
                    logToConsole(data.toString(), true);
                } else {
                    // Any STDERR messages during startup, or on process error, that
                    // are not DebuggerStatus.console types, need special consideration,
                    // otherwise they will be lost.
                    debuggerStatus = DebuggerStatus.failed;
                    logToConsole(
                        `${JSON.stringify(ConsoleLogSources.error)}: ${JSON.stringify(
                            data.toString(),
                        )} `,
                        true,
                    );
                    launchedDebugAdapter.kill();
                }
            });
            launchedDebugAdapter.on('close', (code: number | null, signal: string | null) => {
                if (debuggerStatus !== (DebuggerStatus.failed as DebuggerStatus)) {
                    handleExit(code, signal);
                }
            });
            launchedDebugAdapter.on('error', (err: Error) => {
                if (debuggerStatus !== (DebuggerStatus.failed as DebuggerStatus)) {
                    debuggerStatus = DebuggerStatus.failed;
                    logToConsole(
                        `${JSON.stringify(
                            ConsoleLogSources.error,
                        )}: probe-rs dap-server process encountered an error: ${JSON.stringify(
                            err,
                        )} `,
                        true,
                    );
                    launchedDebugAdapter.kill();
                }
            });

            // Wait to make sure probe-rs dap-server startup completed, and is ready to accept connections.
            var msRetrySleep = 250;
            var numRetries = 5000 / msRetrySleep;
            while (debuggerStatus !== DebuggerStatus.running && numRetries > 0) {
                await new Promise<void>((resolve) => setTimeout(resolve, msRetrySleep));
                if (debuggerStatus === DebuggerStatus.starting) {
                    // Test to confirm probe-rs dap-server is ready to accept requests on the specified port.
                    try {
                        var testPort: number = await getPort({
                            port: +debugServer[1],
                        });
                        if (testPort === +debugServer[1]) {
                            // Port is available, so probe-rs dap-server is not yet initialized.
                            numRetries--;
                        } else {
                            // Port is not available, so probe-rs dap-server is initialized.
                            debuggerStatus = DebuggerStatus.running;
                        }
                    } catch (err: any) {
                        logToConsole(
                            `${ConsoleLogSources.error}: ${JSON.stringify(err.message, null, 2)}`,
                        );
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
                    logToConsole(
                        `${ConsoleLogSources.error}: Timeout waiting for probe-rs dap-server to launch`,
                    );
                    vscode.window.showErrorMessage(
                        'Timeout waiting for probe-rs dap-server to launch',
                    );
                    break;
                }
            }

            if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
                await new Promise<void>((resolve) => setTimeout(resolve, 500)); // Wait for a fraction of a second more, to allow TCP/IP port to initialize in probe-rs dap-server
            }
        }

        // make VS Code connect to debug server.
        if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
            return new vscode.DebugAdapterServer(+debugServer[1], debugServer[0]);
        }
        // If we reach here, VSCode will report the failure to start the debug adapter.
    }

    dispose() {
        logToConsole(
            `${ConsoleLogSources.console.toLowerCase()}: Closing probe-rs debug extension`,
        );
    }
}

function startDebugServer(
    command: string,
    args: readonly string[],
    options: childProcess.SpawnOptionsWithoutStdio,
): Promise<childProcess.ChildProcessWithoutNullStreams> {
    var launchedDebugAdapter = childProcess.spawn(command, args, options);

    return new Promise<childProcess.ChildProcessWithoutNullStreams>((resolve, reject) => {
        function errorListener(error) {
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

// Get the name of the debugger executable
//
// This takes the value from configuration, if set, or
// falls back to the default name.
function debuggerExecutablePath(): string {
    let configuration = vscode.workspace.getConfiguration('probe-rs-debugger');

    let configuredPath: string = configuration.get('debuggerExecutable') || defaultExecutable();

    return configuredPath;
}

function defaultExecutable(): string {
    switch (os.platform()) {
        case 'win32':
            return 'probe-rs.exe';
        default:
            return 'probe-rs';
    }
}

// @ts-ignore
class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    createDebugAdapterTracker(
        session: vscode.DebugSession,
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        logToConsole(`${ConsoleLogSources.debug}: Creating new debug adapter tracker`);
        const tracker = new ProbeRsDebugAdapterTracker();

        return tracker;
    }
}

class ProbeRsDebugAdapterTracker implements DebugAdapterTracker {
    onWillReceiveMessage(message: any) {
        if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
            logToConsole(`${ConsoleLogSources.debug}: Received message from debug adapter:
			${JSON.stringify(message, null, 2)}`);
        }
    }

    onDidSendMessage(message: any) {
        if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
            logToConsole(`${ConsoleLogSources.debug}: Sending message to debug adapter:
			${JSON.stringify(message, null, 2)}`);
        }
    }

    onError(error: Error) {
        if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
            logToConsole(`${ConsoleLogSources.error}: Error in communication with debug adapter:
			${JSON.stringify(error, null, 2)}`);
        }
    }

    onExit(code: number, signal: string) {
        handleExit(code, signal);
    }
}
