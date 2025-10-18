import * as vscode from 'vscode';
import {LiveWatchVariable} from './liveWatchProvider';

export class ConditionalWatchManager {
    static async addConditionalWatch(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected for conditional watch');
            return;
        }

        const condition = await vscode.window.showInputBox({
            prompt: `Enter condition for variable "${variable.label}" (e.g., "counter > 10", "status == true")`,
            placeHolder: 'e.g., counter > 10, status == true, etc.',
        });

        if (condition) {
            variable.setConditionalWatch(condition);
            vscode.window.showInformationMessage(
                `Conditional watch added: ${variable.label} will update only when ${condition}`,
            );
        }
    }

    static removeConditionalWatch(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected to remove conditional watch');
            return;
        }

        if (variable.getConditionalWatch()) {
            variable.removeConditionalWatch();
            vscode.window.showInformationMessage(
                `Conditional watch removed from ${variable.label}`,
            );
        } else {
            vscode.window.showInformationMessage(
                `${variable.label} does not have a conditional watch`,
            );
        }
    }

    static async editConditionalWatch(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected to edit conditional watch');
            return;
        }

        const currentConditionalWatch = variable.getConditionalWatch();
        if (!currentConditionalWatch) {
            vscode.window.showInformationMessage(
                `${variable.label} does not have a conditional watch to edit`,
            );
            return;
        }

        const newCondition = await vscode.window.showInputBox({
            prompt: `Edit condition for variable "${variable.label}"`,
            value: currentConditionalWatch.condition,
            placeHolder: 'e.g., counter > 10, status == true, etc.',
        });

        if (newCondition) {
            variable.setConditionalWatch(newCondition);
            vscode.window.showInformationMessage(
                `Conditional watch updated: ${variable.label} will update only when ${newCondition}`,
            );
        }
    }
}
