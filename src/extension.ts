/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as childProcess from 'child_process';
import {existsSync} from 'fs';
import getPort from 'get-port';
import * as os from 'os';
import * as vscode from 'vscode';
import {
    CancellationToken,
    DebugAdapterTracker,
    DebugAdapterTrackerFactory,
    DebugConfiguration,
    DebugConfigurationProvider,
    ProviderResult,
    WorkspaceFolder,
} from 'vscode';
import {probeRsInstalled} from './utils';

export async function activate(context: vscode.ExtensionContext) {
    const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();
    const configProvider = new ProbeRSConfigurationProvider();
    const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();

    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
        vscode.debug.registerDebugConfigurationProvider('probe-rs-debug', configProvider),
        vscode.debug.registerDebugAdapterTrackerFactory('probe-rs-debug', trackerFactory),
        vscode.debug.onDidReceiveDebugSessionCustomEvent(
            descriptorFactory.receivedCustomEvent.bind(descriptorFactory),
        ),
    );

    (async () => {
        if (!(await probeRsInstalled())) {
            const resp = await vscode.window.showInformationMessage(
                "probe-rs doesn't seem to be installed. Do you want to install it automatically now?",
                'Install',
            );

            if (resp === 'Install') {
                await installProbeRs();
            }
        }
    })();
}

export function deactivate(context: vscode.ExtensionContext) {
    return undefined;
}

// Cleanup inconsistent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join('\r')}\r`;

// Constant for handling/filtering  console log messages.
const enum ConsoleLogSources {
    error = 'ERROR', // Identifies messages that contain error information.
    warn = `WARN`, // Identifies messages that contain warning information.
    info = 'INFO', // Identifies messages that contain summary level of debug information.
    debug = 'DEBUG', // Identifies messages that contain detailed level debug information.
    console = 'probe-rs-debug', // Identifies messages from the extension or debug adapter that must be sent to the Debug Console.
}

// This is just the default. It will be updated after the configuration has been resolved.
var consoleLogLevel = ConsoleLogSources.console;

// Common handler for error/exit codes
function handleExit(code: number | null, signal: string | null) {
    var actionHint: string =
        '\tPlease review all the error messages, including those in the "Debug Console" window.';
    if (code) {
        vscode.window.showErrorMessage(
            `${ConsoleLogSources.error}: ${ConsoleLogSources.console} exited with an unexpected code: ${code} ${actionHint}`,
        );
    } else if (signal) {
        vscode.window.showErrorMessage(
            `${ConsoleLogSources.error}: ${ConsoleLogSources.console} exited with signal: ${signal} ${actionHint}`,
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
// Any local (generated directly by this extension) messages MUST start with ConsoleLogLevels.error, or ConsoleLogSources.console, or `DEBUG`.
// Any messages that start with ConsoleLogLevels.error or ConsoleLogSources.console will always be logged.
// Any messages that come from the ConsoleLogSources.console STDERR will always be logged.
function logToConsole(consoleMessage: string, fromDebugger: boolean = false) {
    console.log(consoleMessage); // During VSCode extension development, this will also log to the local debug console
    if (fromDebugger) {
        // STDERR messages of the `error` variant. These deserve to be shown as an error message in the UI also.
        // This filter might capture more than expected, but since RUST_LOG messages can take many formats, it seems that this is the safest/most inclusive.
        if (consoleMessage.startsWith(ConsoleLogSources.error)) {
            vscode.debug.activeDebugConsole.appendLine(consoleMessage);
            vscode.window.showErrorMessage(consoleMessage);
        } else {
            // Any other messages that come directly from the debugger, are assumed to be relevant and should be logged to the console.
            vscode.debug.activeDebugConsole.appendLine(consoleMessage);
        }
    } else if (consoleMessage.startsWith(ConsoleLogSources.console)) {
        vscode.debug.activeDebugConsole.appendLine(consoleMessage);
    } else {
        switch (consoleLogLevel) {
            case ConsoleLogSources.debug: //  Log Info, Error AND Debug
                if (
                    consoleMessage.startsWith(ConsoleLogSources.console) ||
                    consoleMessage.startsWith(ConsoleLogSources.error) ||
                    consoleMessage.startsWith(ConsoleLogSources.debug)
                ) {
                    vscode.debug.activeDebugConsole.appendLine(consoleMessage);
                }
                break;
            default: // ONLY log console and error messages
                if (
                    consoleMessage.startsWith(ConsoleLogSources.console) ||
                    consoleMessage.startsWith(ConsoleLogSources.error)
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

    createRttTerminal(
        session: vscode.DebugSession | undefined,
        channelNumber: number,
        dataFormat: string,
        channelName: string,
    ) {
        // Make sure we have a terminal window per channel, for RTT Logging
        if (session) {
            let channelWriteEmitter = new vscode.EventEmitter<string>();
            let channelPty: vscode.Pseudoterminal = {
                onDidWrite: channelWriteEmitter.event,
                open: () => {
                    let windowIsOpen = true;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then((response) => {
                            logToConsole(
                                `${ConsoleLogSources.console}: RTT Window opened, and ready to receive RTT data on channel ${JSON.stringify(
                                    channelNumber,
                                    null,
                                    2,
                                )}`,
                            );
                        });
                },
                close: () => {
                    let session = vscode.debug.activeDebugSession;
                    if (!session) {
                        return;
                    }
                    let windowIsOpen = false;
                    session
                        .customRequest('rttWindowOpened', {channelNumber, windowIsOpen})
                        .then((response) => {
                            logToConsole(
                                `${ConsoleLogSources.console}: RTT Window closed, and can no longer receive RTT data on channel ${JSON.stringify(
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
                                `${ConsoleLogSources.console}: RTT Window reused, and ready to receive RTT data on channel ${JSON.stringify(
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
                for (let index = 0; index < this.rttTerminals.length; index++) {
                    var [formerChannelNumber, , ,] = this.rttTerminals[index];
                    if (formerChannelNumber === channelNumber) {
                        this.rttTerminals.splice(+index, 1);
                        break;
                    }
                }
                channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
                vscode.debug.activeDebugConsole.appendLine(
                    `${ConsoleLogSources.console}: Opened a new RTT Terminal window named: ${channelName}`,
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
                    customEvent.session,
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
                        }
                        break;
                    }
                }
                break;
            case 'probe-rs-show-message':
                switch (customEvent.body?.severity) {
                    case 'information':
                        logToConsole(
                            `${ConsoleLogSources.info}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
                            true,
                        );
                        vscode.window.showInformationMessage(customEvent.body?.message);
                        break;
                    case 'warning':
                        logToConsole(
                            `${ConsoleLogSources.warn}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
                            true,
                        );
                        vscode.window.showWarningMessage(customEvent.body?.message);
                        break;
                    case 'error':
                        logToConsole(
                            `${ConsoleLogSources.error}: ${ConsoleLogSources.console}: ${JSON.stringify(customEvent.body?.message, null, 2)}`,
                            true,
                        );
                        vscode.window.showErrorMessage(customEvent.body?.message);
                        break;
                    default:
                        logToConsole(`${ConsoleLogSources.error}: ${ConsoleLogSources.console}: Received custom event with unknown message severity:
						${JSON.stringify(customEvent.body?.severity, null, 2)}`);
                }
                break;
            case `exited`:
                this.dispose();
                break;
            default:
                logToConsole(`${
                    ConsoleLogSources.error
                }: ${ConsoleLogSources.console}: Received unknown custom event:
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

        // When starting the debugger process, we have to wait for debuggerStatus to be set to `DebuggerStatus.running` before we continue
        enum DebuggerStatus {
            starting,
            running,
            failed,
        }
        var debuggerStatus: DebuggerStatus = DebuggerStatus.starting;

        //Provide default server host and port for "launch" configurations, where this is NOT a mandatory config
        var debugServer = new String('127.0.0.1:50000').split(':', 2);

        // Validate that the `cwd` folder exists.
        if (!existsSync(session.configuration.cwd)) {
            logToConsole(
                `${
                    ConsoleLogSources.error
                }: ${ConsoleLogSources.console}: The 'cwd' folder does not exist: ${JSON.stringify(
                    session.configuration.cwd,
                    null,
                    2,
                )}`,
            );
            vscode.window.showErrorMessage(
                `The 'cwd' folder does not exist: ${JSON.stringify(session.configuration.cwd, null, 2)}`,
            );
            return undefined;
        }

        if (session.configuration.hasOwnProperty('server')) {
            debugServer = new String(session.configuration.server).split(':', 2);
            logToConsole(
                `${ConsoleLogSources.console}: Debug using existing server" ${JSON.stringify(
                    debugServer[0],
                )} on port ${JSON.stringify(debugServer[1])}`,
            );
            debuggerStatus = DebuggerStatus.running; // If this is not true as expected, then the user will be notified later.
        } else {
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
            if (session.configuration.hasOwnProperty('logFile')) {
                args.push('--log-file');
                args.push(session.configuration.logFile);
            } else if (session.configuration.hasOwnProperty('logToFolder')) {
                args.push('--log-to-folder');
            }

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

            // Launch the debugger ...
            logToConsole(
                `${ConsoleLogSources.console}: Launching new server ${JSON.stringify(command)}`,
            );
            logToConsole(
                `${ConsoleLogSources.debug.toLowerCase()}: Launch environment variables: ${JSON.stringify(args)} ${JSON.stringify(options)}`,
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
                    vscode.window.showErrorMessage(data.toString());
                    logToConsole(data.toString(), true);
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
        // Attempting to write to the console here will loose messages, as the debug session has already been terminated.
        // Instead we use the `onWillEndSession` event of the `DebugAdapterTracker` to handle this.
    }
}

function startDebugServer(
    command: string,
    args: readonly string[],
    options: childProcess.SpawnOptionsWithoutStdio,
): Promise<childProcess.ChildProcessWithoutNullStreams> {
    var launchedDebugAdapter = childProcess.spawn(command, args, options);

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

/// Installs probe-rs if it is not present.
function installProbeRs() {
    let windows = process.platform === 'win32';
    let done = false;

    vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: 'Installing probe-rs ...',
        },
        async (progress) => {
            progress.report({increment: 0});

            const launchedDebugAdapter = childProcess.exec(
                windows
                    ? `powershell.exe -encodedCommand ${Buffer.from(
                          'irm https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.ps1 | iex',
                          'utf16le',
                      ).toString('base64')}`
                    : "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.sh | sh",
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(`exec error: ${error}`);
                        done = true;
                        return;
                    }
                    console.log(`stdout: ${stdout}`);
                    console.log(`stderr: ${stderr}`);
                },
            );

            const errorListener = (error: Error) => {
                vscode.window.showInformationMessage(
                    'Installation failed: ${err.message}. Check the logs for more info.',
                    'Ok',
                );
                console.error(error);
                done = true;
            };

            const exitListener = (code: number | null, signal: NodeJS.Signals | null) => {
                let message;
                if (code === 0) {
                    message = 'Installation successful.';
                } else if (signal) {
                    message = 'Installation aborted.';
                } else {
                    message =
                        'Installation failed. Go to https://probe.rs to check out the setup and troubleshooting instructions.';
                }
                console.error(message);
                vscode.window.showInformationMessage(message, 'Ok');
                done = true;
            };

            launchedDebugAdapter.on('error', errorListener);
            launchedDebugAdapter.on('exit', exitListener);

            const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            while (!done) {
                await delay(100);
            }

            launchedDebugAdapter.removeListener('error', errorListener);
            launchedDebugAdapter.removeListener('exit', exitListener);

            progress.report({increment: 100});
        },
    );
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

class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
    createDebugAdapterTracker(
        session: vscode.DebugSession,
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        const tracker = new ProbeRsDebugAdapterTracker();
        return tracker;
    }
}

class ProbeRSConfigurationProvider implements DebugConfigurationProvider {
    /**
     * Ensure the provided configuration has the essential defaults applied.
     */
    resolveDebugConfiguration(
        folder: WorkspaceFolder | undefined,
        config: DebugConfiguration,
        token?: CancellationToken,
    ): ProviderResult<DebugConfiguration> {
        // TODO: Once we can detect the chip, we can probably provide a working config from defauts.
        // if launch.json is missing or empty
        // if (!config.type && !config.request && !config.name) {
        // const editor = vscode.window.activeTextEditor;
        // if (editor && editor.document.languageId === 'rust') {
        //     config.type = 'probe-rs-debug';
        //     config.name = 'Launch';
        //     config.request = 'launch';
        //     ...
        // }
        // }

        // Assign the default `cwd` for the project.
        // TODO: We can update probe-rs dap-server to provide defaults that we can fill in here,
        // and ensure the extension defaults are consistent with those of the server.
        if (!config.cwd) {
            config.cwd = '${workspaceFolder}';
        }

        return config;
    }
}

class ProbeRsDebugAdapterTracker implements DebugAdapterTracker {
    onWillStopSession(): void {
        logToConsole(`${ConsoleLogSources.console}: Closing probe-rs debug session`);
    }

    // Code to help debugging the connection between the extension and the probe-rs debug adapter.
    // onWillReceiveMessage(message: any) {
    //     if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
    //         logToConsole(`${ConsoleLogSources.debug}: Received message from debug adapter:
    // 		${JSON.stringify(message, null, 2)}`);
    //     }
    // }
    // onDidSendMessage(message: any) {
    //     if (consoleLogLevel === toCamelCase(ConsoleLogSources.debug)) {
    //         logToConsole(`${ConsoleLogSources.debug}: Sending message to debug adapter:
    // 		${JSON.stringify(message, null, 2)}`);
    //     }
    // }

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
