import * as vscode from 'vscode';
import {LiveWatchVariable} from './liveWatchProvider';

export class HistoryViewer {
    static async showHistory(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected to show history');
            return;
        }

        const history = variable.getHistory();

        if (history.length === 0) {
            vscode.window.showInformationMessage('No history available for this variable.');
            return;
        }

        // Format history for display
        let historyText = `Value history for: ${variable.label}\n\n`;
        historyText += 'Timestamp | Value\n';
        historyText += '----------|------\n';

        for (const entry of history) {
            historyText += `${entry.timestamp.toLocaleTimeString()} | ${entry.value}\n`;
        }

        // Create and show an output channel with the history
        const outputChannel = vscode.window.createOutputChannel(
            `Variable History: ${variable.label}`,
        );
        outputChannel.appendLine(historyText);
        outputChannel.show();
    }
}
