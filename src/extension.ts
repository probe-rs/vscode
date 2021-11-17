/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as child_process from 'child_process';
import * as os from 'os';
import * as vscode from 'vscode';
import { DebugAdapterTracker, DebugAdapterTrackerFactory, } from 'vscode';

// This is just the default. It will be updated after the configuration has been resolved. 
var probeRsLogLevel = 'Info';

export async function activate(context: vscode.ExtensionContext) {

	const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();

	context.subscriptions.push(
		vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
		vscode.debug.onDidReceiveDebugSessionCustomEvent(descriptorFactory.receivedCustomEvent.bind(descriptorFactory)),
		vscode.debug.onDidTerminateDebugSession(descriptorFactory.dispose.bind(descriptorFactory)),
	);

	// I cannot find a way to programmatically test for when VSCode is debugging the extension, versus when a user is using the extension to debug their own code, but the following code is usefull in the former situation, so I will leave it here to be commented out by extension developers when needed.
	// const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();
	// context.subscriptions.push(
	// 	vscode.debug.registerDebugAdapterTrackerFactory('probe-rs-debug', trackerFactory),
	// );

}

export function deactivate(context: vscode.ExtensionContext) {
	return undefined;
}

// Cleanup inconsitent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join("\r")}\r`;

// Common handler for error/exit codes
function handleExit(code: number | null, signal: string | null) {
	var actionHint: string = '\tPlease report this issue at https://github.com/probe-rs/probe-rs/issues/new';
	if (code) {
		vscode.window.showErrorMessage("ERROR: `probe-rs-debugger` exited with an unexpected code: ".concat(`${code}`).concat(actionHint));
	} else if (signal) {
		vscode.window.showErrorMessage("ERROR: `probe-rs-debugger` exited with signal: ".concat(`${signal}`).concat(actionHint));
	}
}

// Messages to be sent to the debug session's console. Anything sent before or after an active debug session is silently ignored by VSCode. Ditto for any messages that doesn't start with 'ERROR', or 'INFO' , or 'WARN', ... unless the log level is DEBUG. Then everything is logged.
function logToConsole(consoleMesssage: string) {
	console.log(consoleMesssage); // During VSCode extension development, this will also log to the local debug console
	if (consoleMesssage.includes('CONSOLE')) {
		vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
	} else {
		switch (probeRsLogLevel) {
			case 'Error': // ONLY log Error messages
				if (consoleMesssage.includes('ERROR')) {
					vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
				}
				break;
			case 'Warn': // Log Warn AND Error
				if (consoleMesssage.includes('INFO') || consoleMesssage.includes('WARN')) {
					vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
				}
				break;
			case 'Info': // Log Info, Warn AND Error
				if (consoleMesssage.includes('INFO') || consoleMesssage.includes('WARN') || consoleMesssage.includes('ERROR')) {
					vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
				}
				break;
			case 'Debug': //  Log Info, Warn, Error AND Debug
				if (consoleMesssage.includes('INFO') || consoleMesssage.includes('WARN') || consoleMesssage.includes('ERROR') || consoleMesssage.includes('DEBUG')) {
					vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
				}
				break;
			case 'Trace': // Log EVERYTHING
				vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
				break;
		}
	}
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	rttTerminals: [channelNumber: number, dataFormat: String, rttTerminal: vscode.Terminal, channelWriteEmitter: vscode.EventEmitter<string>][] = [];

	createRttTerminal(channelNumber: number, dataFormat: string, channelName: string) {
		// Make sure we have a terminal window per channel, for RTT Logging
		if (vscode.debug.activeDebugSession) {
			let session = vscode.debug.activeDebugSession;
			if (session.configuration.hasOwnProperty('rttEnabled') &&
				session.configuration.rttEnabled) {
				let channelWriteEmitter = new vscode.EventEmitter<string>();
				let channelPty: vscode.Pseudoterminal = {
					onDidWrite: channelWriteEmitter.event,
					open: () => { },
					close: () => { },
					handleInput: data => channelWriteEmitter.fire(data)
				};
				let channelTerminalConfig: vscode.ExtensionTerminalOptions | undefined;
				let channelTerminal: vscode.Terminal | undefined;
				for (let reuseTerminal of vscode.window.terminals) {
					if (reuseTerminal.name === channelName) {
						channelTerminal = reuseTerminal;
						channelTerminalConfig = channelTerminal.creationOptions as vscode.ExtensionTerminalOptions;
						vscode.debug.activeDebugConsole.appendLine("probe-rs-debugger: Will reuse  existing RTT Terminal window named: " + channelName);
						break;
					}
				}
				if (channelTerminal === undefined) {
					channelTerminalConfig = {
						name: channelName,
						pty: channelPty
					};
					for (let index in this.rttTerminals) {
						var [formerChannelNumber, , ,] = this.rttTerminals[index];
						if (formerChannelNumber === channelNumber) {
							this.rttTerminals.splice(+index, 1);
							break;
						}
					}
					channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
					vscode.debug.activeDebugConsole.appendLine("probe-rs-debugger: Opened a new RTT Terminal window named: " + channelName);
					this.rttTerminals.push([+channelNumber, dataFormat, channelTerminal, channelWriteEmitter]);
				}
				channelTerminal.show(false);
			}
		}
	}

	receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {

		switch (customEvent.event) {
			case 'probe-rs-rtt-channel-config':
				this.createRttTerminal(+customEvent.body?.channelNumber, customEvent.body?.dataFormat, customEvent.body?.channelName);
				break;
			case 'probe-rs-rtt-data':
				let incomingChannelNumber: number = +customEvent.body?.channelNumber;
				for (var [channelNumber, dataFormat, , channelWriteEmitter] of this.rttTerminals) {
					if (channelNumber === incomingChannelNumber) {
						switch (dataFormat) {
							case 'BinaryLE': //Don't mess with this data
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
						vscode.window.showInformationMessage(customEvent.body?.message);
						break;
					case 'warning':
						vscode.window.showWarningMessage(customEvent.body?.message);
						break;
					case 'error':
						vscode.window.showErrorMessage(customEvent.body?.message);
						break;
					default:
						logToConsole("ERROR: prober-rs: Received custom event with unknown message severity: \n" + JSON.stringify(customEvent.body?.severity, null, 2));
				}
				break;
			case `exited`:
				this.dispose();
				break;
			default:
				logToConsole("ERROR: probe-rs: Received unknown custom event:\n" + JSON.stringify(customEvent, null, 2));
				break;
		}
	}

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): Promise<vscode.DebugAdapterDescriptor | null | undefined> {
		probeRsLogLevel = session.configuration.consoleLogLevel;

		// Initiate either the 'attach' or 'launch' request.
		// We do NOT use DebugAdapterExecutable
		logToConsole("INFO: Session: " + JSON.stringify(session, null, 2));

		// When starting the debugger process, we have to wait for debuggerStatus to be set to `DebuggerStatus.running` before we continue
		enum DebuggerStatus {
			starting,
			running,
			failed,
		}
		var debuggerStatus: DebuggerStatus = DebuggerStatus.starting;

		var debugServer = new String("127.0.0.1:50000").split(":", 2); // ... provide default server host and port for "launch" configurations, where this is NOT a mandatory config
		if (session.configuration.hasOwnProperty('server')) {
			debugServer = new String(session.configuration.server).split(":", 2);
			logToConsole("INFO: Debug using existing server" + JSON.stringify(debugServer[0]) + " on port " + JSON.stringify(debugServer[1]));
			debuggerStatus = DebuggerStatus.running; // If this is not true as expected, then the user will be notified later.
		} else { // Find and use the first available port and spawn a new probe-rs-debugger process
			var portfinder = require('portfinder');
			try {
				var port: number = await portfinder.getPortPromise();
				debugServer = new String("127.0.0.1:" + port).split(":", 2);
			}
			catch (err: any) {
				logToConsole("ERROR: " + JSON.stringify(err.message, null, 2));
				vscode.window.showErrorMessage("Searching for available port failed with: " + JSON.stringify(err.message, null, 2));
				return undefined;
			}
			var args: string[];
			if (session.configuration.hasOwnProperty('runtimeArgs')) {
				args = session.configuration.runtimeArgs;
			} else {
				args = [
					'debug',
					'--dap'
				];
			}
			args.push("--port");
			args.push(debugServer[1]);

			var logEnv = 'error'; //This is the default
			if (session.configuration.hasOwnProperty('consoleLogLevel')) {
				logEnv = session.configuration.consoleLogLevel.toLowerCase();
			};

			var options = {
				cwd: session.configuration.cwd,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				env: { ...process.env, 'RUST_LOG': logEnv, },
				windowsHide: true,
			};

			var command = "";
			if (!executable) {
				if (session.configuration.hasOwnProperty('runtimeExecutable')) {
					command = session.configuration.runtimeExecutable;
				} else {
					switch (os.platform()) {
						case 'win32': command = "probe-rs-debugger.exe"; break;
						default: command = "probe-rs-debugger";
					}
				}
			}
			else {
				command = executable.command;
			}

			// The debug adapter process was launched by VSCode, and should terminate itself at the end of every debug session (when receiving `Disconnect` or `Terminate` Request from VSCode). The "false"(default) state of this option implies that the process was launched (and will be managed) by the user.
			args.push("--vscode");

			// Launch the debugger ... launch errors will be reported in `onClose event`
			logToConsole("INFO: Launching new server" + JSON.stringify(command) + " " + JSON.stringify(args) + " " + JSON.stringify(options));
			var launchedDebugAdapter = child_process.spawn(
				command,
				args,
				options,
			);

			// Capture stdout and stderr to ensure RUST_LOG can be redirected
			var debuggerReadySignature = "CONSOLE: Listening for requests on port " + debugServer[1];
			launchedDebugAdapter.stdout?.on('data', (data: string) => {
				if (data.includes(debuggerReadySignature)) {
					debuggerStatus = DebuggerStatus.running;
				}
				logToConsole(data);
			});
			launchedDebugAdapter.stderr?.on('data', (data: string) => {
				if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
					logToConsole("ERROR: " + data);
				} else {
					vscode.window.showErrorMessage("`probe-rs-debugger` error: " + data);
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
					vscode.window.showErrorMessage("`probe-rs-debugger` process encountered an error: " + JSON.stringify(err));
					launchedDebugAdapter.kill();
				}
			});
			// Wait to make sure probe-rs-debugger startup completed, and is ready to accept connections.
			var msRetrySleep = 250;
			var numRetries = 5000 / msRetrySleep;
			while (debuggerStatus === DebuggerStatus.starting) {
				await new Promise<void>((resolve) => setTimeout(resolve, msRetrySleep));
				if (numRetries > 0) {
					numRetries--;
				} else {
					debuggerStatus = DebuggerStatus.failed;
					logToConsole("ERROR: Timeout waiting for probe-rs-debugger to launch");
					vscode.window.showErrorMessage("Timeout waiting for probe-rs-debugger to launch");
					break;
				}
			}

			if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
				await new Promise<void>((resolve) => setTimeout(resolve, 500)); // Wait for a fraction of a second more, to allow TCP/IP port to initialize in probe-rs-debugger
			}
		}

		// make VS Code connect to debug server
		if (debuggerStatus === (DebuggerStatus.running as DebuggerStatus)) {
			return new vscode.DebugAdapterServer(+debugServer[1], debugServer[0]);
		} else {
			return undefined;
		}

	}

	dispose() {
		logToConsole("INFO: Closing probe-rs debug extension");
	}
}

// @ts-ignore
class ProbeRsDebugAdapterTrackerFactory implements DebugAdapterTrackerFactory {
	createDebugAdapterTracker(session: vscode.DebugSession): vscode.ProviderResult<vscode.DebugAdapterTracker> {
		logToConsole(
			"DEBUG: Creating new debug adapter tracker");
		const tracker = new ProbeRsDebugAdapterTracker();

		return tracker;
	}
}

class ProbeRsDebugAdapterTracker implements DebugAdapterTracker {

	onWillReceiveMessage(message: any) {
		if (probeRsLogLevel === 'Debug') {
			logToConsole("DEBUG: Sending message to debug adapter:\n" + JSON.stringify(message, null, 2));
		}
	}

	onDidSendMessage(message: any) {
		if (probeRsLogLevel === 'Debug') {
			logToConsole("DEBUG: Received message from debug adapter:\n" + JSON.stringify(message, null, 2));
		}
	}

	onError(error: Error) {
		if (probeRsLogLevel === 'Debug') {
			logToConsole("ERROR: Error in communication with debug adapter:\n" + JSON.stringify(error, null, 2));
		}
	}

	onExit(code: number, signal: string) {
		handleExit(code, signal);
	}

}


