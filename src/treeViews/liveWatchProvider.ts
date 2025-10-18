import * as vscode from 'vscode';
import {VariableGroup, VariableHistory} from './liveWatchModels';
import {ConditionalWatch} from './conditionalWatch';
import {DataTypeFormatter} from './dataTypeFormatter';
import {PerformanceOptimizer} from './performanceOptimizer';

export class LiveWatchProvider
    implements
        vscode.TreeDataProvider<vscode.TreeItem>,
        vscode.TreeDragAndDropController<vscode.TreeItem>
{
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | void> =
        new vscode.EventEmitter<vscode.TreeItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | void> =
        this._onDidChangeTreeData.event;

    // Drag and drop properties
    readonly dragMimeTypes: string[] = ['application/vnd.code.tree.liveWatchVariable'];
    readonly dropMimeTypes: string[] = ['application/vnd.code.tree.liveWatchVariable'];

    private rootElements: (LiveWatchVariable | VariableGroup)[] = [];
    private groups: VariableGroup[] = [];

    constructor() {
        // Initialize with some example structures
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: any): Promise<vscode.TreeItem[]> {
        if (element instanceof VariableGroup) {
            // Return children of the group
            return element.getChildren();
        } else if (element instanceof LiveWatchVariable) {
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

    removeVariable(variable: LiveWatchVariable) {
        const index = this.rootElements.indexOf(variable);
        if (index > -1) {
            this.rootElements.splice(index, 1);
            this.refresh();
            return;
        }

        // Also check in groups
        for (const group of this.groups) {
            group.removeChild(variable);
        }
        this.refresh();
    }

    getOrCreateGroup(name: string): VariableGroup {
        let group = this.groups.find((g) => g.label === name);
        if (!group) {
            group = new VariableGroup(name, vscode.TreeItemCollapsibleState.Expanded);
            this.groups.push(group);
            this.rootElements.push(group);
        }
        return group;
    }

    removeGroup(group: VariableGroup) {
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
                (item) => item instanceof LiveWatchVariable || item instanceof VariableGroup,
            );

            if (draggedItems.length > 0) {
                // Serialize the dragged items for transfer
                const serializedItems = draggedItems
                    .map((item) => {
                        if (item instanceof LiveWatchVariable) {
                            return {
                                type: 'variable',
                                expression: item.expression,
                                label: item.label,
                            };
                        } else if (item instanceof VariableGroup) {
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
                        if (target instanceof VariableGroup) {
                            target.addChild(
                                new LiveWatchVariable(
                                    item.label,
                                    item.expression,
                                    vscode.TreeItemCollapsibleState.None,
                                ),
                            );
                        } else {
                            // Otherwise add to root if not already there
                            const existingVarIndex = this.rootElements.findIndex(
                                (e) =>
                                    e instanceof LiveWatchVariable &&
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
                    if (element instanceof LiveWatchVariable) {
                        this.updateSingleVariable(element);
                    } else if (element instanceof VariableGroup) {
                        // Process variables in the group
                        for (const child of element.getChildren()) {
                            if (child instanceof LiveWatchVariable) {
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

    private async updateSingleVariable(variable: LiveWatchVariable) {
        // Check if there's a conditional watch that must be satisfied
        if (variable.conditionalWatch) {
            const shouldUpdate = await variable.conditionalWatch.evaluateCondition();
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
    }
}

export class LiveWatchVariable extends vscode.TreeItem {
    expression: string;
    value: string = '...'; // Initial value while loading
    formattedValue: string = '...'; // Formatted value for display
    type: string = ''; // Type information
    history: VariableHistory = new VariableHistory(); // Value history
    conditionalWatch: ConditionalWatch | null = null; // Conditional watch functionality
    displayFormat: 'auto' | 'decimal' | 'hex' | 'binary' | 'float' = 'auto'; // Display format
    children: LiveWatchVariable[] | undefined;
    variableReference: number = 0; // For complex types that have children
    namedVariables: number = 0; // Number of named children if this is a complex type
    indexedVariables: number = 0; // Number of indexed children if this is a complex type

    constructor(
        public readonly label: string,
        public readonly expr: string,
        initialCollapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent?: LiveWatchVariable,
    ) {
        super(label, initialCollapsibleState);
        this.expression = expr;
        this.tooltip = `Watching: ${expr}`;
        this.description = this.value;

        // Set context value for command contributions
        if (initialCollapsibleState === vscode.TreeItemCollapsibleState.None) {
            this.contextValue = 'liveWatchVariable';
        } else {
            this.contextValue = 'liveWatchVariableParent';
        }

        // Set icon based on type if needed
        this.iconPath = new vscode.ThemeIcon('symbol-variable');
    }

    updateValue(
        newValue: string,
        newType?: string,
        variableRef?: number,
        namedVars?: number,
        indexedVars?: number,
    ) {
        this.value = newValue;

        // Format the value based on the display format setting
        this.formattedValue = DataTypeFormatter.formatValue(newValue, newType, this.displayFormat);

        this.description = `${this.formattedValue}${newType ? `: ${newType}` : ''}`;
        if (newType) {
            this.type = newType;
        }
        if (variableRef !== undefined) {
            this.variableReference = variableRef;
        }
        if (namedVars !== undefined) {
            this.namedVariables = namedVars;
        }
        if (indexedVars !== undefined) {
            this.indexedVariables = indexedVars;
        }

        // Update context value based on whether we have children
        if ((this.namedVariables > 0 || this.indexedVariables > 0) && this.variableReference > 0) {
            this.contextValue = 'liveWatchVariableParent';
        } else {
            this.contextValue = 'liveWatchVariable';
        }
    }

    // Note: We can't override the collapsibleState property directly since it's readonly
    // Instead, we update the contextValue to indicate whether the item can have children
    // The TreeView will handle expansion based on getChildren implementation

    addToHistory(value: string) {
        this.history.addValue(value);
    }

    getHistory() {
        return this.history.getHistory();
    }

    getLatestValue() {
        return this.history.getLatestValue();
    }

    clearHistory() {
        this.history.clear();
    }

    setConditionalWatch(condition: string) {
        this.conditionalWatch = new ConditionalWatch(condition);
    }

    removeConditionalWatch() {
        this.conditionalWatch = null;
    }

    getConditionalWatch(): ConditionalWatch | null {
        return this.conditionalWatch;
    }

    setDisplayFormat(format: 'auto' | 'decimal' | 'hex' | 'binary' | 'float') {
        this.displayFormat = format;
        // Update the display with the new format
        this.formattedValue = DataTypeFormatter.formatValue(
            this.value,
            this.type,
            this.displayFormat,
        );
        this.description = `${this.formattedValue}${this.type ? `: ${this.type}` : ''}`;
    }

    getDisplayFormat() {
        return this.displayFormat;
    }

    async getChildren(_provider: any): Promise<LiveWatchVariable[]> {
        if (this.variableReference > 0) {
            // Get children from the debugger session
            if (vscode.debug.activeDebugSession) {
                try {
                    // Convert Thenable to Promise to handle errors properly
                    const response: any = await Promise.resolve(
                        vscode.debug.activeDebugSession.customRequest('variables', {
                            variablesReference: this.variableReference,
                        }),
                    );

                    if (response && response.variables) {
                        const children: LiveWatchVariable[] = [];
                        for (const variable of response.variables) {
                            const child = new LiveWatchVariable(
                                variable.name,
                                variable.evaluateName || variable.name,
                                variable.variablesReference > 0
                                    ? vscode.TreeItemCollapsibleState.Collapsed
                                    : vscode.TreeItemCollapsibleState.None,
                                this,
                            );
                            child.updateValue(
                                variable.value,
                                variable.type,
                                variable.variablesReference,
                                variable.namedVariables,
                                variable.indexedVariables,
                            );
                            children.push(child);
                        }
                        return children;
                    }
                } catch (error) {
                    console.error(`Error getting children for variable ${this.expression}:`, error);
                }
            }
        }
        return [];
    }

    async setVariableValue(newValue: string): Promise<boolean> {
        if (vscode.debug.activeDebugSession && this.expression) {
            try {
                // Use setVariable or setExpression if supported by the debugger
                // First try the setExpression request
                let response: any;
                try {
                    response = await Promise.resolve(
                        vscode.debug.activeDebugSession.customRequest('setExpression', {
                            expression: this.expression,
                            value: newValue,
                        }),
                    );
                } catch {
                    // If setExpression fails, try using evaluate with context 'repl' to potentially assign
                    response = await Promise.resolve(
                        vscode.debug.activeDebugSession.customRequest('evaluate', {
                            expression: `${this.expression} = ${newValue}`,
                            context: 'repl',
                        }),
                    );
                }

                if (response) {
                    // Update the local value
                    this.updateValue(newValue);
                    return true;
                }
            } catch (error) {
                console.error(`Error setting value for expression ${this.expression}:`, error);
            }
        }
        return false;
    }
}
