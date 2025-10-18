import * as vscode from 'vscode';

export interface IDebugAdapterProvider {
    createDebugAdapterDescriptor(
        session: vscode.DebugSession,
        executable: vscode.DebugAdapterExecutable | undefined,
    ): Promise<vscode.DebugAdapterDescriptor | null | undefined>;
}

export interface IDebugAdapterTracker {
    onWillStopSession(): void;
    onError(error: Error): void;
    onExit(code: number, signal: string): void;
}

export interface IConfigurationProvider {
    resolveDebugConfiguration(
        folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        token?: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.DebugConfiguration>;
}

export interface ITreeViewProvider<T> extends vscode.TreeDataProvider<T> {
    refresh(): void;
}

export interface ILiveWatchVariable {
    expression: string;
    value: string;
    type: string;
    updateValue(
        newValue: string,
        newType?: string,
        variableRef?: number,
        namedVars?: number,
        indexedVars?: number,
    ): void;
    setDisplayFormat(format: 'auto' | 'decimal' | 'hex' | 'binary' | 'float'): void;
    getDisplayFormat(): 'auto' | 'decimal' | 'hex' | 'binary' | 'float';
}

export interface ILiveWatchProvider extends ITreeViewProvider<vscode.TreeItem> {
    addVariable(expression: string): any;
    removeVariable(variable: any): void;
    updateVariableValues(): void;
}
