/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';
import * as os from 'os';
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	const descriptorFactory = new ProbeRSDebugAdapterServerDescriptorFactory();
	context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory));
}

export function deactivate() {
	return;
}

class ProbeRSDebugAdapterServerDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
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
		
	}
}

