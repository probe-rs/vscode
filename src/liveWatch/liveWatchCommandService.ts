import * as vscode from 'vscode';
import {
    LiveWatchProvider,
    HistoryViewer,
    DataVisualizer,
    LiveWatchValueEditor,
    ConditionalWatchManager,
    FormatManager,
    PersistenceManager,
} from '../treeViews';

export class LiveWatchCommandService {
    constructor(private provider: LiveWatchProvider) {}

    async addVariable() {
        const expression = await vscode.window.showInputBox({
            prompt: 'Enter variable or expression to watch',
            placeHolder: 'e.g., myVariable, myStruct.field, functionCall()',
        });

        if (expression) {
            this.provider.addVariable(expression);
        }
    }

    removeVariable(variable: any) {
        if (variable) {
            this.provider.removeVariable(variable);
        }
    }

    updateNow() {
        this.provider.updateVariableValues();
    }

    editVariableValue(variable: any) {
        if (variable) {
            LiveWatchValueEditor.editVariableValue(variable);
        }
    }

    async addToGroup(variable: any) {
        if (variable) {
            const groupName = await vscode.window.showInputBox({
                prompt: 'Enter group name to add this variable to',
                placeHolder: 'e.g., Motor Control, Sensors, etc.',
            });

            if (groupName) {
                (this.provider as any).addVariableToGroup(variable.expression, groupName); // Access private method
            }
        }
    }

    async createGroup() {
        const groupName = await vscode.window.showInputBox({
            prompt: 'Enter group name',
            placeHolder: 'e.g., Motor Control, Sensors, etc.',
        });

        if (groupName) {
            const newVariable = await vscode.window.showInputBox({
                prompt: 'Enter a variable or expression to watch (optional)',
                placeHolder: 'e.g., myVariable, myStruct.field',
            });

            if (newVariable) {
                (this.provider as any).addVariableToGroup(newVariable, groupName); // Access private method
            } else {
                // Just create an empty group
                (this.provider as any).getOrCreateGroup(groupName); // Access private method
            }
        }
    }

    showHistory(variable: any) {
        if (variable) {
            HistoryViewer.showHistory(variable);
        }
    }

    addConditionalWatch(variable: any) {
        if (variable) {
            ConditionalWatchManager.addConditionalWatch(variable);
        }
    }

    removeConditionalWatch(variable: any) {
        if (variable) {
            ConditionalWatchManager.removeConditionalWatch(variable);
        }
    }

    editConditionalWatch(variable: any) {
        if (variable) {
            ConditionalWatchManager.editConditionalWatch(variable);
        }
    }

    changeDisplayFormat(variable: any) {
        if (variable) {
            FormatManager.changeDisplayFormat(variable);
        }
    }

    quickEdit(variable: any) {
        if (variable) {
            LiveWatchValueEditor.editVariableValue(variable);
        }
    }

    async saveVariables(context: vscode.ExtensionContext) {
        await PersistenceManager.saveVariables(this.provider, context);
    }

    async loadVariables(context: vscode.ExtensionContext) {
        await PersistenceManager.loadVariables(this.provider, context);
    }

    async clearSavedVariables(context: vscode.ExtensionContext) {
        await PersistenceManager.clearSavedVariables(context);
    }

    showChart(variable: any) {
        if (variable) {
            DataVisualizer.showChart(variable);
        } else {
            vscode.window.showErrorMessage('Please select a variable to visualize');
        }
    }
}
