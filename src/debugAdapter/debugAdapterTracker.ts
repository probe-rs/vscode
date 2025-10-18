import * as vscode from 'vscode';
import {Logger} from '../logging/logger';
import {LogLevel} from '../logging/logger';

export class DebugAdapterTracker implements vscode.DebugAdapterTracker {
    onWillStopSession(): void {
        Logger.log(`${LogLevel.console}: Closing probe-rs debug session`);
    }

    onError(error: Error) {
        Logger.error(
            `Error in communication with debug adapter:\n\t\t\t${JSON.stringify(error, null, 2)}`,
        );
    }

    onExit(code: number, signal: string) {
        this.handleExit(code, signal);
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
}

export class DebugAdapterTrackerFactory implements vscode.DebugAdapterTrackerFactory {
    createDebugAdapterTracker(
        _session: vscode.DebugSession,
    ): vscode.ProviderResult<vscode.DebugAdapterTracker> {
        return new DebugAdapterTracker();
    }
}
