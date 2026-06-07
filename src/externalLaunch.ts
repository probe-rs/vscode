import * as querystring from 'querystring';
import {debug, Uri, UriHandler, window, workspace, DebugConfiguration} from 'vscode';
import YAML from 'yaml';

interface Dict<T> {
    [key: string]: T;
}

export class UriLaunchServer implements UriHandler {
    async handleUri(uri: Uri) {
        try {
            if (uri.path == '/launch') {
                let params = querystring.parse(uri.query, ',') as Dict<string>;
                if (params.folder && params.name) {
                    let wsFolder = workspace.getWorkspaceFolder(Uri.file(params.folder));
                    await debug.startDebugging(wsFolder, params.name);
                } else if (params.name) {
                    if (workspace.workspaceFolders) {
                        // Try all workspace folders
                        for (let wsFolder of workspace.workspaceFolders) {
                            if (await debug.startDebugging(wsFolder, params.name)) break;
                        }
                    }
                } else {
                    throw new Error(`Unsupported combination of launch Uri parameters.`);
                }
            } else if (uri.path == '/launch/config') {
                let debugConfig: DebugConfiguration = {
                    type: 'probe-rs-debug',
                    request: 'launch',
                    name: '',
                };
                Object.assign(debugConfig, YAML.parse(uri.query));
                debugConfig.name = debugConfig.name || debugConfig.program;
                await debug.startDebugging(undefined, debugConfig);
            } else {
                throw new Error(`Unsupported Uri path: ${uri.path}`);
            }
        } catch (err: any) {
            await window.showErrorMessage(err.toString());
        }
    }
}
