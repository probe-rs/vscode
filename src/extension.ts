/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';
import * as os from 'os';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();
	context.subscriptions.push(
		vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
		vscode.debug.onDidReceiveDebugSessionCustomEvent(descriptorFactory.receivedCustomEvent.bind(descriptorFactory)),
		vscode.debug.onDidTerminateDebugSession(descriptorFactory.dispose.bind(descriptorFactory))
		);
}

export function deactivate(context: vscode.ExtensionContext) {
	return undefined;
}

// cleanup inconsitent line breaks in String data
const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join("\r")}\r`;

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	rttTerminals: [channelNumber: number, dataFormat: String, rttTerminal: vscode.Terminal, channelWriteEmitter:vscode.EventEmitter<string>][] = [];

	receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {
		switch (customEvent.event) {
			case 'probe-rs-rtt':
				let terminalFound = false;
				for (var index in this.rttTerminals) {
					let [channelNumber, dataFormat, , channelWriteEmitter] = this.rttTerminals[index];
					let eventNumber: number = +customEvent.body?.channel;
					// eslint-disable-next-line eqeqeq
					if (channelNumber == eventNumber) {
						terminalFound = true;
						switch (dataFormat) {
							case 'String':
								channelWriteEmitter.fire(formatText(customEvent.body?.data));
								break;
							default:
								channelWriteEmitter.fire(customEvent.body?.data);						}
						break;
					}
				}
				if (!terminalFound) {
					console.log("probe-rs: Failed to resolve destination Terminal for custom event:\n", customEvent);
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
						console.log("prober-rs: Received custom event with unknown message severity: \n", customEvent.body?.severity);
				}
				break;
			default:
				console.log("probe-rs: Received unknown custom event:\n", customEvent);
				break;
		}
	}

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		// Open Terminal windows for RTT Logging, if RTT is enabled.
		// TODO: Consider additional windows for RTT's virtual terminals on a channel
		if (session.configuration.hasOwnProperty('rtt_enabled') && 
			session.configuration.rtt_enabled ) {
			if (session.configuration.hasOwnProperty('rtt_channels') &&
				session.configuration.rtt_channels.length > 0) {
				for (var channelNumber in session.configuration.rtt_channels ){
					let channelWriteEmitter = new vscode.EventEmitter<string>();
					let channelPty: vscode.Pseudoterminal = {
						onDidWrite: channelWriteEmitter.event,
						open: () => { },
						close: () => { },
						handleInput: data => channelWriteEmitter.fire(data)
					};
					let channelTerminalConfig: vscode.ExtensionTerminalOptions = {
						name: session.configuration.rtt_channels[channelNumber].name,
						pty: channelPty
					};
					let channelTerminal = vscode.window.createTerminal(channelTerminalConfig);
					this.rttTerminals.push([+channelNumber, session.configuration.rtt_channels[channelNumber].format, channelTerminal, channelWriteEmitter]);
				}
				this.rttTerminals[0][2]?.show();
			} else {
				vscode.window.showErrorMessage("The launch.json configuration enabled RTT, but did not configure any channels. Please see https://github.com/probe-rs/vscode/blob/master/README.md for information on how to configure RTT");
				return undefined;
			}
		}

		// Initiate either the 'attach' or 'launch' request.
		console.log("Session: ", session);
		console.log("Configuration: ", session.configuration);
		const debugServer = new String(session.configuration.server).split(":",2);
		if (session.configuration.request === "attach") {
			console.log("Debug using existing server %s on port %s", debugServer[0], debugServer[1]);
			// make VS Code connect to debug server
			return new vscode.DebugAdapterServer(+debugServer[1], debugServer[0]);
		} else {
			var args;
			if (session.configuration.hasOwnProperty('runtimeArgs')) {
				args = session.configuration.runtimeArgs;
			} else {
				args = [
					'debug',
					'--dap'
				];
			}
			const options = {
				cwd: session.configuration.cwd
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
			executable = new vscode.DebugAdapterExecutable(command, args, options);
			console.log("Debug using executable: ", executable);
			console.log("with options: ", executable?.options); 
			console.log("and arguments: ", executable?.args); 
			return executable;
		}
	}

	dispose() {
		for (var index in this.rttTerminals) {
			let [, ,rttTerminal] = this.rttTerminals[index];
			rttTerminal.dispose();
		}		
		this.rttTerminals = []; // TODO: Not sure if it will be better UX to re-use past terminals, rather than closing and opening new instances. 
		console.log("Closing probe-rs debug extension");
	}
}
