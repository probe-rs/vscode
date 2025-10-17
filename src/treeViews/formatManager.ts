import * as vscode from 'vscode';
import { LiveWatchVariable } from './liveWatchProvider';

export class FormatManager {
    static async changeDisplayFormat(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected to change format');
            return;
        }

        const formatOptions = [
            { label: 'Auto', description: 'Automatic format detection' },
            { label: 'Decimal', description: 'Decimal number format' },
            { label: 'Hexadecimal', description: 'Hexadecimal format (0x...)' },
            { label: 'Binary', description: 'Binary format (0b...)' },
            { label: 'Float', description: 'Float format' }
        ];

        const selectedFormat = await vscode.window.showQuickPick(formatOptions, {
            placeHolder: 'Select display format for ' + variable.label
        });

        if (selectedFormat) {
            let format: 'auto' | 'decimal' | 'hex' | 'binary' | 'float';
            switch (selectedFormat.label) {
                case 'Decimal':
                    format = 'decimal';
                    break;
                case 'Hexadecimal':
                    format = 'hex';
                    break;
                case 'Binary':
                    format = 'binary';
                    break;
                case 'Float':
                    format = 'float';
                    break;
                case 'Auto':
                default:
                    format = 'auto';
                    break;
            }
            
            variable.setDisplayFormat(format);
            vscode.window.showInformationMessage(`Display format for ${variable.label} changed to ${selectedFormat.label}`);
        }
    }
}