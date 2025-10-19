import * as vscode from 'vscode';

export interface IVariableHistory {
    addValue(value: string): void;
    getHistory(): {value: string; timestamp: Date}[];
    getLatestValue(): string | undefined;
    clear(): void;
}

export interface IConditionalWatch {
    condition: string;
    enabled: boolean;
    evaluateCondition(debugSession?: vscode.DebugSession): Promise<boolean>;
}

export interface IVariableGroup extends vscode.TreeItem {
    children: any[];
    addChild(child: any): void;
    removeChild(child: any): void;
    getChildren(): any[];
}

export interface ILiveWatchVariable extends vscode.TreeItem {
    expression: string;
    value: string;
    type: string;
    history: IVariableHistory;
    conditionalWatch: IConditionalWatch | null;
    displayFormat: 'auto' | 'decimal' | 'hex' | 'binary' | 'float';

    updateValue(
        newValue: string,
        newType?: string,
        variableRef?: number,
        namedVars?: number,
        indexedVars?: number,
    ): void;

    addToHistory(value: string): void;
    getHistory(): {value: string; timestamp: Date}[];
    setConditionalWatch(condition: string): void;
    removeConditionalWatch(): void;
    getConditionalWatch(): IConditionalWatch | null;
    setDisplayFormat(format: 'auto' | 'decimal' | 'hex' | 'binary' | 'float'): void;
    getDisplayFormat(): 'auto' | 'decimal' | 'hex' | 'binary' | 'float';
    setVariableValue(newValue: string): Promise<boolean>;
    getChildren(provider: any): Promise<any[]>;
}

export interface ILiveWatchProvider extends vscode.TreeDataProvider<vscode.TreeItem> {
    rootElements: any[];
    groups: IVariableGroup[];
    addVariable(expression: string): ILiveWatchVariable;
    removeVariable(variable: ILiveWatchVariable): void;
    getOrCreateGroup(name: string): IVariableGroup;
    updateVariableValues(): void;
    refresh(): void;
}

export type DisplayFormat = 'auto' | 'decimal' | 'hex' | 'binary' | 'float';
