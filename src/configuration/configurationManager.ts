import * as vscode from 'vscode';

export class ConfigurationKeys {
    static readonly debuggerExecutable = 'probe-rs-debugger.debuggerExecutable';
    static readonly liveWatchUpdateInterval = 'probe-rs-debugger.liveWatchUpdateInterval';
    static readonly liveWatchKeybindings = 'probe-rs-debugger.liveWatchKeybindings';
}

export interface LiveWatchKeybindings {
    quickEdit: string;
    showChart: string;
    showHistory: string;
}

export class ConfigurationManager {
    static getDebuggerExecutable(): string {
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        return config.get(ConfigurationKeys.debuggerExecutable) || this.getDefaultExecutable();
    }

    static getLiveWatchUpdateInterval(): number {
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        return config.get(ConfigurationKeys.liveWatchUpdateInterval, 1000);
    }

    static getLiveWatchKeybindings(): LiveWatchKeybindings {
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        const bindings: LiveWatchKeybindings = config.get(ConfigurationKeys.liveWatchKeybindings, {
            quickEdit: 'F2',
            showChart: 'Ctrl+Shift+H',
            showHistory: 'Ctrl+Shift+Y',
        });

        return {
            quickEdit: bindings.quickEdit,
            showChart: bindings.showChart,
            showHistory: bindings.showHistory,
        };
    }

    private static getDefaultExecutable(): string {
        switch (process.platform) {
            case 'win32':
                return 'probe-rs.exe';
            default:
                return 'probe-rs';
        }
    }
}
