import * as vscode from 'vscode';
import {LiveWatchVariable} from './liveWatchProvider';

// Command handler for editing variable values
export class LiveWatchValueEditor {
    static async editVariableValue(variable: LiveWatchVariable) {
        if (!vscode.debug.activeDebugSession) {
            vscode.window.showErrorMessage('No active debug session to modify variables');
            return;
        }

        const currentValue = variable.value;
        const newValue = await vscode.window.showInputBox({
            prompt: `Enter new value for ${variable.label}`,
            value: currentValue,
            validateInput: (value) => {
                // Basic validation - ensure the value is not empty
                if (value.trim() === '') {
                    return 'Value cannot be empty';
                }
                return null;
            },
        });

        if (newValue !== undefined) {
            // Attempt to set the new value
            const success = await variable.setVariableValue(newValue);
            if (success) {
                vscode.window.showInformationMessage(
                    `Successfully updated ${variable.label} to ${newValue}`,
                );
                // The variable value should already be updated via the setVariableValue method
            } else {
                vscode.window.showErrorMessage(
                    `Failed to update ${variable.label}. Check that the variable is modifiable and in scope.`,
                );
            }
        }
    }
}

// Placeholder for future drag and drop functionality if needed
export class LiveWatchDragAndDropController
    implements vscode.TreeDragAndDropController<vscode.TreeItem>
{
    dropMimeTypes: string[] = [];
    dragMimeTypes: string[] = [];

    async handleDrag(
        _source: readonly vscode.TreeItem[],
        _dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        // Not implemented for this feature
    }

    async handleDrop?(
        _target: vscode.TreeItem | undefined,
        _dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        // Not implemented for this feature
    }
}

// A simple rename provider for editing values
export class LiveWatchValueRenameProvider
    implements vscode.ReferenceProvider, vscode.DefinitionProvider
{
    async provideReferences(
        _document: vscode.TextDocument,
        _position: vscode.Position,
        _context: vscode.ReferenceContext,
        _token: vscode.CancellationToken,
    ): Promise<vscode.Location[]> {
        return [];
    }

    async provideDefinition(
        _document: vscode.TextDocument,
        _position: vscode.Position,
        _token: vscode.CancellationToken,
    ): Promise<vscode.Definition | vscode.DefinitionLink[]> {
        return [];
    }
}
