import * as vscode from 'vscode';
import {IConditionalWatch} from '../types';

export class ConditionalWatch implements IConditionalWatch {
    private _condition: string;
    private _enabled: boolean = true;

    constructor(condition: string) {
        this._condition = condition;
    }

    get condition(): string {
        return this._condition;
    }

    set condition(value: string) {
        this._condition = value;
    }

    get enabled(): boolean {
        return this._enabled;
    }

    set enabled(value: boolean) {
        this._enabled = value;
    }

    async evaluateCondition(debugSession?: vscode.DebugSession): Promise<boolean> {
        if (!this._enabled) {
            return true; // If condition is disabled, always allow update
        }

        // If no debug session is provided, we can't evaluate the condition
        if (!debugSession) {
            return false; // Can't evaluate without a session, so skip update
        }

        try {
            // Validate that the condition is a simple expression
            // This is a basic check to avoid complex/malicious expressions
            if (!this.isValidCondition(this._condition)) {
                console.error('Invalid condition format: ' + this._condition);
                return false;
            }

            // In a real implementation, this would perform more complex evaluation
            // For now, we'll implement a simple approach:
            // - Parse the condition (e.g., "var > 5", "flag == true")
            // - Evaluate each variable in the condition using the debug session
            // - Calculate the result

            // First, we'll extract all variable names from the condition
            // This is a simple regex that finds potential variable names
            // (sequences of alphanumeric characters and underscores)
            const variableMatches = this._condition.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];

            // Evaluate each variable in the condition
            let evaluatedCondition = this._condition;
            for (const variableName of variableMatches) {
                try {
                    // Query the debug session for the value of this variable
                    const response = await Promise.resolve(
                        debugSession.customRequest('evaluate', {
                            expression: variableName,
                            context: 'watch',
                        }),
                    );

                    if (response && response.result !== undefined) {
                        // Replace the variable name with its value in the condition string
                        // Use word boundaries to avoid partial matches
                        const regex = new RegExp('\\b' + variableName + '\\b', 'g');
                        // Escape special regex characters in the result to prevent regex errors
                        const escapedResult = response.result.replace(
                            /[.*+?^${}()|[\\\]]/g,
                            '\\$&',
                        );
                        evaluatedCondition = evaluatedCondition.replace(regex, escapedResult);
                    }
                } catch (error) {
                    // If we can't evaluate a variable, we can't determine the condition
                    console.error(
                        'Error evaluating variable ' + variableName + ' in condition',
                        error,
                    );
                    return false;
                }
            }

            // Now evaluate the resulting expression
            // Use a safer evaluation approach that doesn't allow arbitrary code execution
            const result = this.safeEval(evaluatedCondition);
            return Boolean(result);
        } catch (error) {
            console.error('Error evaluating condition: ' + this._condition, error);
            return false; // If there's an error evaluating the condition, return false
        }
    }

    private isValidCondition(condition: string): boolean {
        // Basic validation to ensure the condition is a simple expression
        // This regex checks for a simple comparison expression with common operators
        // It allows alphanumeric characters, underscores, numbers, spaces, and common operators
        const pattern = /^[a-zA-Z0-9_<>!=\s\.\[\]]*[=<>!]+[a-zA-Z0-9_<>!=\s\.\[\]]*$/;
        return pattern.test(condition);
    }

    private safeEval(expression: string): any {
        // A safer evaluation function that only allows simple mathematical and comparison operations
        // This is still not completely safe, but more limited than eval or Function
        // In a production environment, you would want to use a proper expression parser

        // Check if the expression contains only allowed characters
        if (!/^[a-zA-Z0-9\s\.\[\]><=!&|%+\-*/():]+$/.test(expression)) {
            throw new Error('Invalid characters in expression');
        }

        // Check for dangerous patterns
        const dangerousPatterns = [
            /constructor/i,
            /prototype/i,
            /__proto__/i,
            /import/i,
            /require/i,
            /process/i,
            /global/i,
            /eval/i,
            /function/i,
            /new\s/i,
            /this\./i,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                throw new Error('Dangerous pattern detected in expression');
            }
        }

        try {
            // Use Function constructor as a safer alternative to eval
            // This still has risks but is more limited than direct eval
            return new Function('"use strict"; return (' + expression + ')')();
        } catch (error) {
            console.error('Error during safe evaluation of: ' + expression, error);
            throw error;
        }
    }
}

export class PerformanceOptimizer {
    private static batchUpdates: boolean = false;
    private static pendingUpdates: Array<() => void> = [];
    private static batchTimeout: NodeJS.Timeout | null = null;
    private static readonly batchInterval = 100; // ms

    // Enable batched updates
    static enableBatchUpdates() {
        this.batchUpdates = true;
    }

    // Disable batched updates
    static disableBatchUpdates() {
        this.batchUpdates = false;
        this.flushPendingUpdates();
    }

    // Add an update to the pending batch
    static addPendingUpdate(updateFn: () => void) {
        if (this.batchUpdates) {
            this.pendingUpdates.push(updateFn);

            // Schedule a flush if not already scheduled
            if (!this.batchTimeout) {
                this.batchTimeout = setTimeout(() => {
                    this.flushPendingUpdates();
                }, this.batchInterval);
            }
        } else {
            // Execute immediately if batching is disabled
            updateFn();
        }
    }

    // Execute all pending updates
    static flushPendingUpdates() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }

        // Execute all pending updates
        for (const update of this.pendingUpdates) {
            update();
        }

        // Clear the pending updates
        this.pendingUpdates = [];
    }

    // Get number of pending updates
    static getPendingUpdateCount(): number {
        return this.pendingUpdates.length;
    }

    // Clear all pending updates
    static clearPendingUpdates() {
        if (this.batchTimeout) {
            clearTimeout(this.batchTimeout);
            this.batchTimeout = null;
        }
        this.pendingUpdates = [];
    }
}
