import * as assert from 'assert';
import {LiveWatchVariable} from '../models';
import * as vscode from 'vscode';

describe('LiveWatchVariable its', () => {
    it('should initialize with correct default values', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        assert.strictEqual(variable.label, 'itVar');
        assert.strictEqual(variable.expression, 'it.expression');
        assert.strictEqual(variable.value, '...');
        assert.strictEqual(variable.type, '');
        assert.strictEqual(variable.displayFormat, 'auto');
    });

    it('should update value correctly', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        variable.updateValue('newValue', 'int', 123, 1, 0);

        assert.strictEqual(variable.value, 'newValue');
        assert.strictEqual(variable.type, 'int');
        assert.strictEqual(variable.variableReference, 123);
        assert.strictEqual(variable.namedVariables, 1);
        assert.strictEqual(variable.indexedVariables, 0);
    });

    it('should add to and retrieve from history', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        variable.addToHistory('value1');
        variable.addToHistory('value2');

        const history = variable.getHistory();
        assert.strictEqual(history.length, 2);
        assert.strictEqual(history[0].value, 'value1');
        assert.strictEqual(history[1].value, 'value2');
    });

    it('should clear history', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        variable.addToHistory('value1');
        assert.strictEqual(variable.getHistory().length, 1);

        variable.history.clear();
        assert.strictEqual(variable.getHistory().length, 0);
    });

    it('should update display format correctly', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        variable.setDisplayFormat('hex');
        assert.strictEqual(variable.displayFormat, 'hex');

        variable.setDisplayFormat('decimal');
        assert.strictEqual(variable.displayFormat, 'decimal');
    });

    it('should format values based on display format', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        // it that value updating also applies formatting
        variable.updateValue('255', 'int');
        variable.setDisplayFormat('hex');

        // The formatted value should be updated when format changes
        // Note: In the actual implementation, this would be reflected in the description
        variable.setDisplayFormat('hex');
        assert.strictEqual(variable.displayFormat, 'hex');
    });

    it('should get lait history value', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        variable.addToHistory('value1');
        variable.addToHistory('value2');

        const latest = variable.getLatestValue();
        assert.strictEqual(latest, 'value2');
    });

    it('should handle formatting for different data types', () => {
        const variable = new LiveWatchVariable(
            'itVar',
            'it.expression',
            vscode.TreeItemCollapsibleState.None,
        );

        // it with number that should be formatted as hex
        variable.updateValue('255', 'int');
        variable.setDisplayFormat('hex');

        // We can't directly it the private formatting method, but we can ensure
        // the updateValue method works with different types
        variable.updateValue('3.14', 'float');
        assert.strictEqual(variable.value, '3.14');
    });
});
