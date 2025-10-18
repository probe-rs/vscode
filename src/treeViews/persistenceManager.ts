import * as vscode from 'vscode';
import {LiveWatchProvider, LiveWatchVariable} from './liveWatchProvider';
import {VariableGroup} from './liveWatchModels';

export interface SavedVariable {
    expression: string;
    format?: 'auto' | 'decimal' | 'hex' | 'binary' | 'float';
    groupName?: string;
    condition?: string;
}

export class PersistenceManager {
    private static readonly globalStateKey = 'probe-rs.liveWatch.variables';

    static async saveVariables(provider: LiveWatchProvider, context: vscode.ExtensionContext) {
        try {
            // Get all variables from the provider
            const savedVars: SavedVariable[] = [];

            // Process all root level elements
            const rootElements = (provider as any).rootElements as (
                | LiveWatchVariable
                | VariableGroup
            )[];

            for (const element of rootElements) {
                if (element instanceof LiveWatchVariable) {
                    const savedVar: SavedVariable = {
                        expression: element.expression,
                        format: element.getDisplayFormat(),
                    };

                    if (element.getConditionalWatch()) {
                        savedVar.condition = element.getConditionalWatch()!.condition;
                    }

                    savedVars.push(savedVar);
                } else if (element instanceof VariableGroup) {
                    // For group children, save them with the group name
                    for (const child of element.getChildren()) {
                        if (child instanceof LiveWatchVariable) {
                            const savedVar: SavedVariable = {
                                expression: child.expression,
                                format: child.getDisplayFormat(),
                                groupName: element.label as string,
                            };

                            if (child.getConditionalWatch()) {
                                savedVar.condition = child.getConditionalWatch()!.condition;
                            }

                            savedVars.push(savedVar);
                        }
                    }
                }
            }

            // Save to global state
            await context.globalState.update(this.globalStateKey, savedVars);
            console.log(`Saved ${savedVars.length} variables to global state`);
        } catch (error) {
            console.error('Error saving variables:', error);
        }
    }

    static async loadVariables(provider: LiveWatchProvider, context: vscode.ExtensionContext) {
        try {
            const savedVars: SavedVariable[] | undefined = context.globalState.get(
                this.globalStateKey,
            );

            if (!savedVars || savedVars.length === 0) {
                return; // No saved variables to restore
            }

            console.log(`Loading ${savedVars.length} variables from global state`);

            // Process saved variables and add them to the provider
            for (const savedVar of savedVars) {
                if (savedVar.groupName) {
                    // Add to a group
                    const group = (provider as any).getOrCreateGroup(savedVar.groupName);
                    const newVariable = new LiveWatchVariable(
                        savedVar.expression,
                        savedVar.expression,
                        vscode.TreeItemCollapsibleState.None,
                    );

                    if (savedVar.format) {
                        newVariable.setDisplayFormat(savedVar.format);
                    }

                    if (savedVar.condition) {
                        newVariable.setConditionalWatch(savedVar.condition);
                    }

                    group.addChild(newVariable);
                } else {
                    // Add as a root variable
                    const newVariable = provider.addVariable(savedVar.expression);

                    if (savedVar.format) {
                        newVariable.setDisplayFormat(savedVar.format);
                    }

                    if (savedVar.condition) {
                        newVariable.setConditionalWatch(savedVar.condition);
                    }
                }
            }

            // Refresh the tree view
            provider.refresh();
        } catch (error) {
            console.error('Error loading variables:', error);
        }
    }

    static async clearSavedVariables(context: vscode.ExtensionContext) {
        await context.globalState.update(this.globalStateKey, []);
        console.log('Cleared saved variables');
    }
}
