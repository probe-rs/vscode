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
	const trackerFactory = new ProbeRsDebugAdapterTrackerFactory();
	
	const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();
	
	if (probeRsLogLevel === 'Debug') { // The only way this will be true, is if a developer changes the default value where this var is declared above
		context.subscriptions.push(
			vscode.debug.registerDebugAdapterTrackerFactory('probe-rs-debug', trackerFactory),
		);
	}

	context.subscriptions.push(
		vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
		vscode.debug.onDidReceiveDebugSessionCustomEvent(descriptorFactory.receivedCustomEvent.bind(descriptorFactory)),
		vscode.debug.onDidTerminateDebugSession(descriptorFactory.dispose.bind(descriptorFactory))
		);
}

export function deactivate(context: vscode.ExtensionContext) {
	return undefined;
}

// When starting the debugger during a 'launch' request, we have to wait for it to become "Ready" before we continue
var debuggerReady = false;
var debuggerReadySignature: string;

// If the "launch" fails, inform the user with error information
export function launchCallback(error: child_process.ExecFileException | null, stdout: string, stderr: string) {
	if (!debuggerReady) { //Only show this if we receive errors before the debugger started up
		vscode.window.showErrorMessage("ERROR: ".concat(`${error}`).concat('\t').concat(stderr).concat('\n').concat(stdout));
	}
}

// Cleanup inconsitent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join("\r")}\r`;

// Messages to be sent to the debug session's console. Anything sent before or after an active debug session is silently ignored by VSCode. Ditto for any messages that doesn't start with 'ERROR:', or 'INFO' , or 'WARN', ... unless the log level is DEBUG. Then everything is logged.
function logToConsole(consoleMesssage: string) {
	console.log(consoleMesssage); // During VSCode extensiond development, this will also log to the local debug console
	switch (probeRsLogLevel) {
		case 'Error': // ONLY log Error messages
			if (consoleMesssage.includes('ERROR'))  {
				vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
			}
			break;
		case 'Warn': // Log Warn AND Error
			if (consoleMesssage.includes('INFO') || consoleMesssage.includes('WARN')){
				vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
			}
			break;
		case 'Info': // Log Info, Warn AND Error
			if (consoleMesssage.includes('INFO') || consoleMesssage.includes('WARN') || consoleMesssage.includes('ERROR')) {
				vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
			}
			break;
		case 'Debug': // Log EVERYTHING
			vscode.debug.activeDebugConsole.appendLine(consoleMesssage);
			break;
	}
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	rttTerminals: [channelNumber: number, dataFormat: String, rttTerminal: vscode.Terminal, channelWriteEmitter:vscode.EventEmitter<string>][] = [];

	createRttTerminal(channelNumber: number, dataFormat: string, channelName: string) {
		// Open a new terminal window for RTT Logging, if RTT is enabled.
		if (vscode.debug.activeDebugSession) {
			let session = vscode.debug.activeDebugSession;
			if (session.configuration.hasOwnProperty('rtt_enabled') &&
				session.configuration.rtt_enabled) {
				let channelWriteEmitter = new vscode.EventEmitter<string>();
				let channelPty: vscode.Pseudoterminal = {
					onDidWrite: channelWriteEmitter.event,
					open: () => { },
					close: () => { },
					handleInput: data => channelWriteEmitter.fire(data)
				};
				let channelTerminalConfig: vscode.ExtensionTerminalOptions = {
					name: channelName,
					pty: channelPty
				};
				let channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
				this.rttTerminals.push([+channelNumber, dataFormat, channelTerminal, channelWriteEmitter]);
			}
		}
	}

	receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {

		switch (customEvent.event) {
			case 'probe-rs-rtt-channel-config':
				this.createRttTerminal(+customEvent.body?.channel_number, customEvent.body?.data_format, customEvent.body?.channel_name);
				break;
			case 'probe-rs-rtt-data':
				let incomingChannelNumber: number = +customEvent.body?.channel_number;
				for (var index in this.rttTerminals) {
					let [channelNumber, dataFormat, , channelWriteEmitter] = this.rttTerminals[index];
					// // eslint-disable-next-line eqeqeq
					if (channelNumber === incomingChannelNumber) {
						switch (dataFormat) {
							case 'String':
								channelWriteEmitter.fire(formatText(customEvent.body?.data));
								break;
							default:
								channelWriteEmitter.fire(customEvent.body?.data);
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

	async createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined):Promise<vscode.DebugAdapterDescriptor | null | undefined> {
		probeRsLogLevel = session.configuration.console_log_level;

		// Initiate either the 'attach' or 'launch' request.
		// We do NOT use DebugAdapterExecutable, because of issues with lost DAP messages. For 'launch' requests, start a server on the default (or specified) port.
		logToConsole("INFO: Session: " + JSON.stringify(session,null, 2));
		
		var debugServer = new String("127.0.0.1:50000").split(":", 2); // ... provide default server host and port for "launch" configurations, where this is NOT a mandatory config
		if (session.configuration.hasOwnProperty('server')) {
			debugServer = new String(session.configuration.server).split(":", 2);
		} else { // Find and use the first available port
			var portfinder = require('portfinder');
			try {
				var port = await portfinder.getPortPromise();
				debugServer = new String("127.0.0.1:" + port).split(":", 2);
			}
			catch (err) {
				logToConsole("ERROR: " + JSON.stringify(err.message, null, 2));
				vscode.window.showErrorMessage("Searching for available port failed with: " + JSON.stringify(err.message, null, 2));
				return undefined;
			}

		}
		if (session.configuration.request === "attach") {
			logToConsole("INFO: Debug using existing server" + JSON.stringify(debugServer[0]) + " on port " + JSON.stringify(debugServer[1]));
		} else { // session.configuration.request === "launch")
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
			if (session.configuration.hasOwnProperty('console_log_level')) {
				logEnv = session.configuration.console_log_level.toLowerCase();
			} ;

			var options = {
				cwd: session.configuration.cwd,
				// eslint-disable-next-line @typescript-eslint/naming-convention
				env: { ...process.env, 'RUST_LOG' : logEnv, },
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
			else{
				command = executable.command;
			}
			
			// Launch the debugger ... launch errors will be reported in `launchCallback`
			logToConsole("INFO: Launching new server" + JSON.stringify(command) + " " + JSON.stringify(args) + " " + JSON.stringify(options));
			var launchedDebugAdapter = child_process.execFile(
				command,
				args,
				options,
				launchCallback,
			);

			// Capture stdout and stderr to ensure RUST_LOG can be redirected
			debuggerReadySignature = "probe-rs-debugger Listening for requests on port ".concat(debugServer[1]);
			launchedDebugAdapter.stdout?.on('data', (data: string) => {
				if (data.includes(debuggerReadySignature)) {
					debuggerReady = true;
				} else {
					logToConsole(JSON.stringify(data, null, 2));
				}
			});		
			launchedDebugAdapter.stderr?.on('data', (data: string) => {
				logToConsole(JSON.stringify(data, null, 2));
			});

			// Wait to make sure probe-rs-debugger startup completed, and is ready to accept connections.
			var msRetrySleep = 250;
			var numRetries = 5000/msRetrySleep;
			while (!debuggerReady) {
				await new Promise<void>((resolve) => setTimeout(resolve, msRetrySleep));
				if (numRetries > 0) {
					numRetries --;
				} else {
					logToConsole("ERROR: Timeout waiting for probe-rs-debugger to launch");
					vscode.window.showErrorMessage("Timeout waiting for probe-rs-debugger to launch");
					return undefined;
				}
			}
			await new Promise<void>((resolve) => setTimeout(resolve, 250)); // Wait for a fraction of a second more, to allow TCP/IP port to initialize in probe-rs-debugger
		}
		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer(+debugServer[1], debugServer[0]);

	}

	dispose() {
		for (var index in this.rttTerminals) {
			let [, ,rttTerminal] = this.rttTerminals[index];
			rttTerminal.dispose();
		}		
		this.rttTerminals = []; // TODO: Not sure if it will be better UX to re-use past terminals, rather than closing and opening new instances.
		logToConsole("INFO: Closing probe-rs debug extension");
	}
}

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
		logToConsole("DEBUG: Sending message to debug adapter:\n" + JSON.stringify(message, null, 2));
	}

	onDidSendMessage(message: any) {
		logToConsole("DEBUG: Received message from debug adapter:\n" + JSON.stringify(message, null, 2));
	}

	onError(error: Error) {
		logToConsole("ERROR: Error in communication with debug adapter:\n" + JSON.stringify(error, null, 2));
	}

	onExit(code: number, signal: string) {
		if (code) {
			logToConsole("ERROR: Debug Adapter exited with exit code" + JSON.stringify(code, null, 2));
		} 
	}

}


