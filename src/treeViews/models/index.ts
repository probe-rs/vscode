import * as vscode from 'vscode';
import {IVariableHistory, IVariableGroup, ILiveWatchVariable, DisplayFormat} from '../types';

export class VariableHistory implements IVariableHistory {
    private _history: {value: string; timestamp: Date}[] = [];
    private _maxHistorySize: number = 50; // Keep last 50 values

    addValue(value: string) {
        this._history.push({value, timestamp: new Date()});

        // Keep only the last N values
        if (this._history.length > this._maxHistorySize) {
            this._history = this._history.slice(-this._maxHistorySize);
        }
    }

    getHistory(): {value: string; timestamp: Date}[] {
        return [...this._history]; // Return a copy
    }

    getLatestValue(): string | undefined {
        if (this._history.length > 0) {
            return this._history[this._history.length - 1].value;
        }
        return undefined;
    }

    clear() {
        this._history = [];
    }
}

export class VariableGroup extends vscode.TreeItem implements IVariableGroup {
    children: any[] = [];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent?: VariableGroup,
    ) {
        super(label, collapsibleState);
        this.tooltip = `Variable Group: ${label}`;
        this.description = `${this.children.length} items`;
        this.contextValue = 'variableGroup';
        this.iconPath = new vscode.ThemeIcon('folder');
    }

    addChild(child: any) {
        this.children.push(child);
        this.description = `${this.children.length} items`;
    }

    removeChild(child: any) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            this.description = `${this.children.length} items`;
        }
    }

    getChildren(): any[] {
        return this.children;
    }
}

export class LiveWatchVariable extends vscode.TreeItem implements ILiveWatchVariable {
    expression: string;
    value: string = '...'; // Initial value while loading
    formattedValue: string = '...'; // Formatted value for display
    type: string = ''; // Type information
    history: VariableHistory = new VariableHistory(); // Value history
    conditionalWatch: any = null; // Conditional watch functionality
    displayFormat: DisplayFormat = 'auto'; // Display format
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
        this.formattedValue = this.formatValue(newValue, newType, this.displayFormat);

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

    private formatValue(value: string, type?: string, format?: DisplayFormat): string {
        if (!format) {
            format = 'auto';
        }

        // If type is specified and we're using auto format, determine the best format
        if (format === 'auto' && type) {
            if (type.toLowerCase().includes('float') || type.toLowerCase().includes('double')) {
                format = 'float';
            } else if (
                type.toLowerCase().includes('int') ||
                type.toLowerCase().includes('char') ||
                type.toLowerCase().includes('bool')
            ) {
                // For integers, we'll use hex if the value looks like a hex number or flag
                if (value.startsWith('0x') || value.includes('0x')) {
                    format = 'hex';
                } else {
                    format = 'decimal';
                }
            }
        }

        switch (format) {
            case 'hex': {
                const num = this.parseNumber(value);
                return num !== null ? '0x' + Math.round(num).toString(16).toUpperCase() : value;
            }
            case 'binary': {
                const num = this.parseNumber(value);
                return num !== null ? '0b' + Math.round(num).toString(2) : value;
            }
            case 'float': {
                const num = parseFloat(value);
                return !isNaN(num) ? (num % 1 === 0 ? num.toFixed(1) : num.toString()) : value;
            }
            case 'decimal':
            case 'auto':
            default:
                return value; // Return as is for decimal or auto that defaults to original
        }
    }

    private parseNumber(value: string): number | null {
        // Remove any common prefixes like 0x, 0b, etc.
        let cleanValue = value.trim();

        // Handle hex
        if (cleanValue.toLowerCase().startsWith('0x')) {
            const hexValue = cleanValue.substring(2);
            const num = parseInt(hexValue, 16);
            return isNaN(num) ? null : num;
        }

        // Handle binary
        if (cleanValue.toLowerCase().startsWith('0b')) {
            const binValue = cleanValue.substring(2);
            const num = parseInt(binValue, 2);
            return isNaN(num) ? null : num;
        }

        // Handle decimal
        const num = parseFloat(cleanValue);
        return isNaN(num) ? null : num;
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
        // We'll implement this in the conditional watch module
        // For now, we'll need to import that class when we create it
        import('../services')
            .then((services) => {
                this.conditionalWatch = new services.ConditionalWatch(condition);
            })
            .catch((error) => {
                console.error('Failed to import ConditionalWatch:', error);
            });
    }

    removeConditionalWatch() {
        this.conditionalWatch = null;
    }

    getConditionalWatch(): any {
        return this.conditionalWatch;
    }

    setDisplayFormat(format: DisplayFormat) {
        this.displayFormat = format;
        // Update the display with the new format
        this.formattedValue = this.formatValue(this.value, this.type, this.displayFormat);
        this.description = `${this.formattedValue}${this.type ? `: ${this.type}` : ''}`;
    }

    getDisplayFormat(): DisplayFormat {
        return this.displayFormat;
    }

    async getChildren(_provider: any): Promise<any[]> {
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
                        const children: any[] = [];
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

                // Try setExpression first (this is the preferred method)
                try {
                    response = await Promise.resolve(
                        vscode.debug.activeDebugSession.customRequest('setExpression', {
                            expression: this.expression,
                            value: newValue,
                        }),
                    );

                    if (response && response.success !== false) {
                        // Update the local value
                        this.updateValue(response.result || newValue);
                        return true;
                    }
                } catch (setExpressionError) {
                    console.debug(
                        `setExpression failed for ${this.expression}, trying alternative:`,
                        setExpressionError,
                    );

                    // If setExpression fails, try using evaluate with context 'repl' to potentially assign
                    try {
                        response = await Promise.resolve(
                            vscode.debug.activeDebugSession.customRequest('evaluate', {
                                expression: `${this.expression} = ${newValue}`,
                                context: 'repl',
                            }),
                        );

                        if (response && response.result !== undefined) {
                            // Update the local value
                            this.updateValue(response.result);
                            return true;
                        }
                    } catch (evaluateError) {
                        console.error(
                            `Both setExpression and evaluate failed for ${this.expression}:`,
                            {
                                setExpressionError,
                                evaluateError,
                            },
                        );
                    }
                }
            } catch (error) {
                console.error(
                    `Unexpected error setting value for expression ${this.expression}:`,
                    error,
                );
            }
        }
        return false;
    }
}
