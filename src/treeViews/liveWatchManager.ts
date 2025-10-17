import * as vscode from 'vscode';
import { LiveWatchProvider } from './liveWatchProvider';
import { LiveWatchValueEditor } from './liveWatchValueEditor';
import { HistoryViewer } from './historyViewer';
import { ConditionalWatchManager } from './conditionalWatchManager';
import { FormatManager } from './formatManager';
import { PersistenceManager } from './persistenceManager';
import { DataVisualizer } from './dataVisualizer';

export class LiveWatchManager {
    private provider: LiveWatchProvider;
    private updateInterval: NodeJS.Timeout | undefined;
    private updateIntervalMs: number = 1000; // Update every 1 second by default
    private treeView: vscode.TreeView<vscode.TreeItem> | undefined;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, provider: LiveWatchProvider) {
        this.context = context;
        this.provider = provider;
        
        // Get the update interval from configuration
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        this.updateIntervalMs = config.get('liveWatchUpdateInterval', 1000);
        
        // Register the tree view
        this.treeView = vscode.window.createTreeView('probe-rs.liveWatch', {
            treeDataProvider: provider,
            dragAndDropController: provider
        });
        
        context.subscriptions.push(this.treeView);
        
        // Register commands
        this.registerCommands(context);
        
        // Configuration for the tree view
        // (Removed rename provider as it's not fully implemented in this context)
        
        // Set up the update interval when debugging starts
        this.setupDebugEventHandlers();
        
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration('probe-rs-debugger.liveWatchUpdateInterval')) {
                const newInterval = config.get('liveWatchUpdateInterval', 1000);
                if (newInterval !== this.updateIntervalMs) {
                    this.updateIntervalMs = newInterval;
                    // Restart polling with new interval if currently polling
                    if (this.updateInterval) {
                        this.stopPolling();
                        this.startPolling();
                    }
                }
            }
        });
    }

    private registerCommands(context: vscode.ExtensionContext) {
        // Command to add a new variable to watch
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.addVariable', async () => {
                const expression = await vscode.window.showInputBox({
                    prompt: 'Enter variable or expression to watch',
                    placeHolder: 'e.g., myVariable, myStruct.field, functionCall()'
                });
                
                if (expression) {
                    this.provider.addVariable(expression);
                }
            })
        );
        
        // Command to remove a variable from watch
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.removeVariable', (variable) => {
                if (variable) {
                    this.provider.removeVariable(variable);
                }
            })
        );
        
        // Command to update variables immediately
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.updateNow', () => {
                this.provider.updateVariableValues();
            })
        );
        
        // Command to edit a variable's value
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.editVariableValue', (variable) => {
                if (variable) {
                    LiveWatchValueEditor.editVariableValue(variable);
                }
            })
        );
        
        // Command to add a variable to a group
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.addToGroup', async (variable) => {
                if (variable) {
                    const groupName = await vscode.window.showInputBox({
                        prompt: 'Enter group name to add this variable to',
                        placeHolder: 'e.g., Motor Control, Sensors, etc.'
                    });
                    
                    if (groupName) {
                        (this.provider as any).addVariableToGroup(variable.expression, groupName); // Access private method
                    }
                }
            })
        );
        
        // Command to create a new group
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.createGroup', async () => {
                const groupName = await vscode.window.showInputBox({
                    prompt: 'Enter group name',
                    placeHolder: 'e.g., Motor Control, Sensors, etc.'
                });
                
                if (groupName) {
                    const newVariable = await vscode.window.showInputBox({
                        prompt: 'Enter a variable or expression to watch (optional)',
                        placeHolder: 'e.g., myVariable, myStruct.field'
                    });
                    
                    if (newVariable) {
                        (this.provider as any).addVariableToGroup(newVariable, groupName); // Access private method
                    } else {
                        // Just create an empty group
                        (this.provider as any).getOrCreateGroup(groupName); // Access private method
                    }
                }
            })
        );
        
        // Command to show history of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.showHistory', (variable) => {
                if (variable) {
                    HistoryViewer.showHistory(variable);
                }
            })
        );
        
        // Command to add conditional watch to a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.addConditionalWatch', (variable) => {
                if (variable) {
                    ConditionalWatchManager.addConditionalWatch(variable);
                }
            })
        );
        
        // Command to remove conditional watch from a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.removeConditionalWatch', (variable) => {
                if (variable) {
                    ConditionalWatchManager.removeConditionalWatch(variable);
                }
            })
        );
        
        // Command to edit conditional watch of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.editConditionalWatch', (variable) => {
                if (variable) {
                    ConditionalWatchManager.editConditionalWatch(variable);
                }
            })
        );
        
        // Command to change display format of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.changeDisplayFormat', (variable) => {
                if (variable) {
                    FormatManager.changeDisplayFormat(variable);
                }
            })
        );
        
        // Quick edit command (for keyboard shortcuts like F2)
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.quickEdit', (variable) => {
                if (variable) {
                    LiveWatchValueEditor.editVariableValue(variable);
                }
            })
        );
        
        // Command to save variables between sessions
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.saveVariables', async () => {
                await PersistenceManager.saveVariables(this.provider, context);
                vscode.window.showInformationMessage('Live Watch variables saved successfully!');
            })
        );
        
        // Command to load variables from previous sessions
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.loadVariables', async () => {
                await PersistenceManager.loadVariables(this.provider, context);
                vscode.window.showInformationMessage('Live Watch variables loaded successfully!');
            })
        );
        
        // Command to clear saved variables
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.clearSavedVariables', async () => {
                await PersistenceManager.clearSavedVariables(context);
                vscode.window.showInformationMessage('Saved Live Watch variables cleared!');
            })
        );
        
        // Command to show variable chart
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.showChart', (variable) => {
                if (variable) {
                    DataVisualizer.showChart(variable);
                } else {
                    vscode.window.showErrorMessage('Please select a variable to visualize');
                }
            })
        );
    }

    private setupDebugEventHandlers() {
        // Start polling when debug session starts
        vscode.debug.onDidStartDebugSession((session) => {
            if (session.type === 'probe-rs-debug') {
                this.startPolling();
            }
        });

        // Stop polling when debug session ends and save variables
        vscode.debug.onDidTerminateDebugSession((session) => {
            if (session.type === 'probe-rs-debug') {
                this.stopPolling();
                // Save the current state when debug session ends
                PersistenceManager.saveVariables(this.provider, this.context);
            }
        });
    }

    private startPolling() {
        // Clear any existing interval
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        // Start a new interval
        this.updateInterval = setInterval(() => {
            this.provider.updateVariableValues();
        }, this.updateIntervalMs);
        
        console.log('Started Live Watch polling');
    }

    private stopPolling() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
            console.log('Stopped Live Watch polling');
        }
    }

    public async dispose() {
        this.stopPolling();
        if (this.treeView) {
            this.treeView.dispose();
        }
        // Save variables when the manager is disposed
        await PersistenceManager.saveVariables(this.provider, this.context);
    }
}