import * as vscode from 'vscode';
import {ILiveWatchProvider} from '../types';
import {LiveWatchVariable} from '../models';

export class PersistenceManager {
    static async saveVariables(provider: ILiveWatchProvider, context: vscode.ExtensionContext) {
        // Gather all variables and groups from the provider
        const data = {
            variables: [] as any[],
            groups: [] as any[],
        };

        for (const element of (provider as any).rootElements) {
            if (
                element &&
                element.constructor &&
                element.constructor.name === 'LiveWatchVariable'
            ) {
                data.variables.push({
                    label: element.label,
                    expression: element.expression,
                    displayFormat: element.displayFormat,
                    conditionalWatch: element.conditionalWatch
                        ? {
                              condition: element.conditionalWatch.condition,
                              enabled: element.conditionalWatch.enabled,
                          }
                        : null,
                });
            } else if (
                element &&
                element.constructor &&
                element.constructor.name === 'VariableGroup'
            ) {
                data.groups.push({
                    name: element.label,
                    variables: this.getGroupVariables(element),
                });
            }
        }

        // Save to extension context
        await context.workspaceState.update('probe-rs.liveWatch.savedVariables', data);
        vscode.window.showInformationMessage('Live Watch variables saved successfully!');
    }

    private static getGroupVariables(group: any): any[] {
        const variables = [];
        for (const child of group.getChildren()) {
            if (child && child.constructor && child.constructor.name === 'LiveWatchVariable') {
                variables.push({
                    label: child.label,
                    expression: child.expression,
                    displayFormat: child.displayFormat,
                    conditionalWatch: (child as any).conditionalWatch
                        ? {
                              condition: (child as any).conditionalWatch.condition,
                              enabled: (child as any).conditionalWatch.enabled,
                          }
                        : null,
                });
            }
        }
        return variables;
    }

    static async loadVariables(provider: ILiveWatchProvider, context: vscode.ExtensionContext) {
        try {
            const data = context.workspaceState.get<any>('probe-rs.liveWatch.savedVariables');

            if (!data) {
                vscode.window.showInformationMessage('No saved Live Watch variables found.');
                return;
            }

            // Validate the data structure before using it
            if (!this.isValidSavedData(data)) {
                vscode.window.showErrorMessage(
                    'Saved data format is invalid. Cannot load variables.',
                );
                return;
            }

            // Clear existing variables
            (provider as any).rootElements = [];
            (provider as any).groups = [];

            // Add variables
            if (data.variables) {
                for (const varData of data.variables) {
                    try {
                        const newVariable = new LiveWatchVariable(
                            varData.label || 'unnamed',
                            varData.expression || '',
                            vscode.TreeItemCollapsibleState.None,
                        );

                        if (varData.displayFormat) {
                            newVariable.setDisplayFormat(varData.displayFormat);
                        }

                        if (varData.conditionalWatch) {
                            // Create and set conditional watch
                            const conditionalWatch = new ConditionalWatch(
                                varData.conditionalWatch.condition,
                            );
                            if (!varData.conditionalWatch.enabled) {
                                conditionalWatch.enabled = false;
                            }
                            (newVariable as any).conditionalWatch = conditionalWatch;
                        }

                        (provider as any).rootElements.push(newVariable);
                    } catch (error) {
                        console.error(`Failed to create variable from saved data:`, varData, error);
                    }
                }
            }

            // Add groups with their variables
            if (data.groups) {
                for (const groupData of data.groups) {
                    try {
                        const group = provider.getOrCreateGroup(groupData.name || 'unnamed group');

                        if (groupData.variables) {
                            for (const varData of groupData.variables) {
                                try {
                                    const newVariable = new LiveWatchVariable(
                                        varData.label || 'unnamed',
                                        varData.expression || '',
                                        vscode.TreeItemCollapsibleState.None,
                                        undefined,
                                    );

                                    if (varData.displayFormat) {
                                        newVariable.setDisplayFormat(varData.displayFormat);
                                    }

                                    if (varData.conditionalWatch) {
                                        // Create and set conditional watch
                                        const conditionalWatch = new ConditionalWatch(
                                            varData.conditionalWatch.condition,
                                        );
                                        if (!varData.conditionalWatch.enabled) {
                                            conditionalWatch.enabled = false;
                                        }
                                        (newVariable as any).conditionalWatch = conditionalWatch;
                                    }

                                    (group as any).addChild(newVariable);
                                } catch (error) {
                                    console.error(
                                        `Failed to create grouped variable from saved data:`,
                                        varData,
                                        error,
                                    );
                                }
                            }
                        }
                    } catch (error) {
                        console.error(`Failed to create group from saved data:`, groupData, error);
                    }
                }
            }

            // Refresh the UI
            provider.refresh();
            vscode.window.showInformationMessage('Live Watch variables loaded successfully!');
        } catch (error) {
            console.error('Error loading saved variables:', error);
            vscode.window.showErrorMessage('Failed to load saved Live Watch variables.');
        }
    }

    private static isValidSavedData(data: any): boolean {
        // Basic validation of saved data structure
        if (typeof data !== 'object') {
            return false;
        }

        // If variables exist, they should be an array
        if (data.variables && !Array.isArray(data.variables)) {
            return false;
        }

        // If groups exist, they should be an array
        if (data.groups && !Array.isArray(data.groups)) {
            return false;
        }

        return true;
    }

    static async clearSavedVariables(context: vscode.ExtensionContext) {
        await context.workspaceState.update('probe-rs.liveWatch.savedVariables', undefined);
        vscode.window.showInformationMessage('Saved Live Watch variables cleared!');
    }
}

// Import ConditionalWatch to resolve circular dependency
import {ConditionalWatch} from '../services';
