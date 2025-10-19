import * as vscode from 'vscode';
import {ILiveWatchProvider, ILiveWatchVariable, IVariableGroup} from '../types';
import {VariableGroup, LiveWatchVariable} from '../models';
import {PerformanceOptimizer} from '../services';

export class LiveWatchProvider
    implements ILiveWatchProvider, vscode.TreeDragAndDropController<vscode.TreeItem>
{
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> =
        new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    // Drag and drop properties
    readonly dragMimeTypes: string[] = ['application/vnd.code.tree.liveWatchVariable'];
    readonly dropMimeTypes: string[] = ['application/vnd.code.tree.liveWatchVariable'];

    public rootElements: any[] = [];
    public groups: IVariableGroup[] = [];

    constructor() {
        // Initialize with some example structures
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: any): Promise<vscode.TreeItem[]> {
        if (element && element.constructor && element.constructor.name === 'VariableGroup') {
            // Return children of the group
            return element.getChildren();
        } else if (
            element &&
            element.constructor &&
            element.constructor.name === 'LiveWatchVariable'
        ) {
            // Return children of a complex variable (like struct fields)
            return await element.getChildren(this);
        } else {
            // Root level - return all top-level elements (variables and groups)
            return this.rootElements;
        }
        return []; // Explicit return to fix "Not all code paths return a value" error
    }

    addVariableToGroup(expression: string, groupName: string) {
        const group = this.getOrCreateGroup(groupName);
        const newVariable = new LiveWatchVariable(
            expression,
            expression,
            vscode.TreeItemCollapsibleState.None,
        );
        group.addChild(newVariable);
        this.refresh();
        return newVariable;
    }

    addVariable(expression: string) {
        const newVariable = new LiveWatchVariable(
            expression,
            expression,
            vscode.TreeItemCollapsibleState.None,
        );
        this.rootElements.push(newVariable);
        this.refresh();
        return newVariable;
    }

    removeVariable(variable: ILiveWatchVariable) {
        const index = this.rootElements.indexOf(variable);
        if (index > -1) {
            this.rootElements.splice(index, 1);
            this.refresh();
            return;
        }

        // Also check in groups
        for (const group of this.groups) {
            if (group && typeof group.removeChild === 'function') {
                group.removeChild(variable);
            }
        }
        this.refresh();
    }

    getOrCreateGroup(name: string): IVariableGroup {
        let group = this.groups.find((g: any) => g.label === name);
        if (!group) {
            group = new VariableGroup(name, vscode.TreeItemCollapsibleState.Expanded);
            this.groups.push(group);
            this.rootElements.push(group);
        }
        return group;
    }

    removeGroup(group: IVariableGroup) {
        const index = this.groups.indexOf(group);
        if (index > -1) {
            this.groups.splice(index, 1);
            const rootIndex = this.rootElements.indexOf(group);
            if (rootIndex > -1) {
                this.rootElements.splice(rootIndex, 1);
            }
            this.refresh();
        }
    }

    refresh(): void {
        // Use performance optimizer to batch UI updates
        PerformanceOptimizer.addPendingUpdate(() => {
            this._onDidChangeTreeData.fire();
        });
    }

    // Drag and drop implementation
    handleDrag(
        source: readonly vscode.TreeItem[],
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): void | Thenable<void> {
        // Add the dragged items to the data transfer
        if (source && source.length > 0) {
            const draggedItems = source.filter(
                (item) =>
                    item &&
                    item.constructor &&
                    (item.constructor.name === 'LiveWatchVariable' ||
                        item.constructor.name === 'VariableGroup'),
            );

            if (draggedItems.length > 0) {
                // Serialize the dragged items for transfer
                const serializedItems = draggedItems
                    .map((item: any) => {
                        if (item.constructor && item.constructor.name === 'LiveWatchVariable') {
                            return {
                                type: 'variable',
                                expression: item.expression,
                                label: item.label,
                            };
                        } else if (item.constructor && item.constructor.name === 'VariableGroup') {
                            return {
                                type: 'group',
                                label: item.label,
                            };
                        }
                        return null; // Ensure all code paths return a value
                    })
                    .filter(
                        (item): item is {type: string; expression?: string; label: string} =>
                            item !== undefined && item !== null,
                    ); // Remove undefined and null values

                dataTransfer.set(
                    'application/vnd.code.tree.liveWatchVariable',
                    new vscode.DataTransferItem(JSON.stringify(serializedItems)),
                );
            }
        }
    }

    handleDrop(
        target: vscode.TreeItem | undefined,
        dataTransfer: vscode.DataTransfer,
        _token: vscode.CancellationToken,
    ): void | Thenable<void> {
        // Get the data being dropped
        const dataItem = dataTransfer.get('application/vnd.code.tree.liveWatchVariable');

        if (dataItem) {
            try {
                const droppedData = JSON.parse(dataItem.value as string);

                for (const item of droppedData) {
                    if (item.type === 'variable') {
                        // If target is a group, add the variable to the group
                        if (
                            target &&
                            target.constructor &&
                            target.constructor.name === 'VariableGroup'
                        ) {
                            (target as any).addChild(
                                new LiveWatchVariable(
                                    item.label,
                                    item.expression,
                                    vscode.TreeItemCollapsibleState.None,
                                ),
                            );
                        } else {
                            // Otherwise add to root if not already there
                            const existingVarIndex = this.rootElements.findIndex(
                                (e: any) =>
                                    e &&
                                    e.constructor &&
                                    e.constructor.name === 'LiveWatchVariable' &&
                                    e.expression === item.expression,
                            );
                            if (existingVarIndex === -1) {
                                this.rootElements.push(
                                    new LiveWatchVariable(
                                        item.label,
                                        item.expression,
                                        vscode.TreeItemCollapsibleState.None,
                                    ),
                                );
                            }
                        }
                    }
                    // Add handling for group drops if needed
                }

                this.refresh();
            } catch (error) {
                console.error('Error handling drop:', error);
            }
        }
    }

    updateVariableValues() {
        // This will be called periodically to update the variable values from the debug session
        if (vscode.debug.activeDebugSession) {
            // Enable batching to reduce UI updates
            PerformanceOptimizer.enableBatchUpdates();

            try {
                // Process all root-level variables
                for (const element of this.rootElements) {
                    if (
                        element &&
                        element.constructor &&
                        element.constructor.name === 'LiveWatchVariable'
                    ) {
                        this.updateSingleVariable(element);
                    } else if (
                        element &&
                        element.constructor &&
                        element.constructor.name === 'VariableGroup'
                    ) {
                        // Process variables in the group
                        for (const child of element.getChildren()) {
                            if (
                                child &&
                                child.constructor &&
                                child.constructor.name === 'LiveWatchVariable'
                            ) {
                                this.updateSingleVariable(child);
                            }
                        }
                    }
                }
            } finally {
                // Flush all pending updates and disable batching
                PerformanceOptimizer.flushPendingUpdates();
                PerformanceOptimizer.disableBatchUpdates();

                // Refresh the UI once after all updates are complete
                this.refresh();
            }
        }
    }

    private async updateSingleVariable(variable: ILiveWatchVariable) {
        try {
            // Check if there's a conditional watch that must be satisfied
            if (variable.conditionalWatch) {
                const shouldUpdate = await variable.conditionalWatch.evaluateCondition(
                    vscode.debug.activeDebugSession,
                );
                if (!shouldUpdate) {
                    return; // Skip updating if condition isn't met
                }
            }

            // Handle the Thenable returned by customRequest
            const requestPromise = vscode.debug.activeDebugSession!.customRequest('evaluate', {
                expression: variable.expression,
                context: 'watch',
            });

            // Get the previous value to check for changes
            const previousValue = variable.value;

            // Convert to proper Promise for .catch() and .then() usage
            Promise.resolve(requestPromise)
                .then((response) => {
                    if (response && response.result !== undefined) {
                        variable.updateValue(
                            response.result,
                            response.type,
                            response.variablesReference,
                            response.namedVariables,
                            response.indexedVariables,
                        );

                        // Add to history if value changed
                        if (previousValue !== response.result) {
                            variable.addToHistory(response.result);
                        }
                    } else {
                        // If the response is empty, keep the previous value but show it's stale
                        variable.updateValue('<no value>');
                    }
                })
                .catch((error) => {
                    // It's possible the expression evaluation fails (e.g., variable not in scope)
                    // In that case, we might want to show an error value without breaking the whole view
                    variable.updateValue(`<error: ${error.message || 'evaluation failed'}>`);
                    // Only log to console for actual errors, not for variables going out of scope
                    if (
                        error.message &&
                        !error.message?.includes('not in scope') &&
                        !error.message?.includes('undefined')
                    ) {
                        console.error(`Error evaluating expression ${variable.expression}:`, error);
                    }
                });
        } catch (error) {
            console.error(
                `Unexpected error in updateSingleVariable for ${variable.expression}:`,
                error,
            );
            // Update the variable with an error value to indicate the issue
            try {
                variable.updateValue(
                    `<error: ${error instanceof Error ? error.message : 'unknown error'}>`,
                );
            } catch (updateError) {
                console.error(
                    `Failed to update error value for ${variable.expression}:`,
                    updateError,
                );
            }
        }
    }
}
