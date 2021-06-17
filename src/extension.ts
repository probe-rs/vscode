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
		vscode.debug.onDidReceiveDebugSessionCustomEvent(descriptorFactory.receivedCustomEvent.bind(descriptorFactory))
		);
}

export function deactivate() {
	return;
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	rttTerminals: [number, vscode.Terminal][] = []; 

	receivedCustomEvent(customEvent: vscode.DebugSessionCustomEvent) {
		if (customEvent.event === "probe-rs-rtt") {
			let terminalFound = false;
			for (var index in this.rttTerminals) {
				let [channelNumber, rttTerminal] = this.rttTerminals[index];
				let eventNumber:number = +customEvent.body?.channel;
				// eslint-disable-next-line eqeqeq
				if (channelNumber == eventNumber) {
					terminalFound = true;
					rttTerminal.sendText(customEvent.body?.data, true); // TODO: I don't think we always need a newline here.
					break;
				}
			}
			if (!terminalFound) {
				console.log("probe-rs: Failed to resolve destination Terminal for custom event:\n", customEvent);
			}
		} else {
			console.log("probe-rs: Received unknown custom event:\n", customEvent);
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
					const channelWriteEmitter = new vscode.EventEmitter<string>();
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
					this.rttTerminals.push([+channelNumber, channelTerminal]);
					channelTerminal.show(true);
				}
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
			let [, rttTerminal] = this.rttTerminals[index];
			rttTerminal.dispose();
		}
	}
}
