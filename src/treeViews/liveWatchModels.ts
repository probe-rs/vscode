import * as vscode from 'vscode';
import { LiveWatchVariable } from './liveWatchProvider';

export class VariableGroup extends vscode.TreeItem {
    children: (LiveWatchVariable | VariableGroup)[] = [];

    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly parent?: VariableGroup
    ) {
        super(label, collapsibleState);
        this.tooltip = `Variable Group: ${label}`;
        this.description = `${this.children.length} items`;
        this.contextValue = 'variableGroup';
        this.iconPath = new vscode.ThemeIcon('folder');
    }

    addChild(child: LiveWatchVariable | VariableGroup) {
        this.children.push(child);
        this.description = `${this.children.length} items`;
    }

    removeChild(child: LiveWatchVariable | VariableGroup) {
        const index = this.children.indexOf(child);
        if (index > -1) {
            this.children.splice(index, 1);
            this.description = `${this.children.length} items`;
        }
    }
    
    getChildren(): (LiveWatchVariable | VariableGroup)[] {
        return this.children;
    }
}

export class VariableHistory {
    private _history: { value: string; timestamp: Date }[] = [];
    private _maxHistorySize: number = 50; // Keep last 50 values

    addValue(value: string) {
        this._history.push({ value, timestamp: new Date() });
        
        // Keep only the last N values
        if (this._history.length > this._maxHistorySize) {
            this._history = this._history.slice(-this._maxHistorySize);
        }
    }

    getHistory(): { value: string; timestamp: Date }[] {
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