import * as vscode from 'vscode';
import {LiveWatchProvider} from './liveWatchProvider';
import {LiveWatchCommandService} from '../liveWatch/liveWatchCommandService';

export class LiveWatchManager {
    private provider: LiveWatchProvider;
    private updateInterval: NodeJS.Timeout | undefined;
    private updateIntervalMs: number = 1000; // Update every 1 second by default
    private treeView: vscode.TreeView<vscode.TreeItem> | undefined;
    private context: vscode.ExtensionContext;
    private commandService: LiveWatchCommandService;

    constructor(context: vscode.ExtensionContext, provider: LiveWatchProvider) {
        this.context = context;
        this.provider = provider;
        this.commandService = new LiveWatchCommandService(provider);

        // Get the update interval from configuration
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        this.updateIntervalMs = config.get('liveWatchUpdateInterval', 1000);

        // Register the tree view
        this.treeView = vscode.window.createTreeView('probe-rs.liveWatch', {
            treeDataProvider: provider,
            dragAndDropController: provider,
        });

        context.subscriptions.push(this.treeView);

        // Register commands
        this.registerCommands(context);

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
                await this.commandService.addVariable();
            }),
        );

        // Command to remove a variable from watch
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.removeVariable', (variable) => {
                this.commandService.removeVariable(variable);
            }),
        );

        // Command to update variables immediately
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.updateNow', () => {
                this.commandService.updateNow();
            }),
        );

        // Command to edit a variable's value
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.editVariableValue', (variable) => {
                this.commandService.editVariableValue(variable);
            }),
        );

        // Command to add a variable to a group
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.addToGroup', async (variable) => {
                await this.commandService.addToGroup(variable);
            }),
        );

        // Command to create a new group
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.createGroup', async () => {
                await this.commandService.createGroup();
            }),
        );

        // Command to show history of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.showHistory', (variable) => {
                this.commandService.showHistory(variable);
            }),
        );

        // Command to add conditional watch to a variable
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'probe-rs.liveWatch.addConditionalWatch',
                (variable) => {
                    this.commandService.addConditionalWatch(variable);
                },
            ),
        );

        // Command to remove conditional watch from a variable
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'probe-rs.liveWatch.removeConditionalWatch',
                (variable) => {
                    this.commandService.removeConditionalWatch(variable);
                },
            ),
        );

        // Command to edit conditional watch of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'probe-rs.liveWatch.editConditionalWatch',
                (variable) => {
                    this.commandService.editConditionalWatch(variable);
                },
            ),
        );

        // Command to change display format of a variable
        context.subscriptions.push(
            vscode.commands.registerCommand(
                'probe-rs.liveWatch.changeDisplayFormat',
                (variable) => {
                    this.commandService.changeDisplayFormat(variable);
                },
            ),
        );

        // Quick edit command (for keyboard shortcuts like F2)
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.quickEdit', (variable) => {
                this.commandService.quickEdit(variable);
            }),
        );

        // Command to save variables between sessions
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.saveVariables', async () => {
                await this.commandService.saveVariables(this.context);
            }),
        );

        // Command to load variables from previous sessions
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.loadVariables', async () => {
                await this.commandService.loadVariables(this.context);
            }),
        );

        // Command to clear saved variables
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.clearSavedVariables', async () => {
                await this.commandService.clearSavedVariables(this.context);
            }),
        );

        // Command to show variable chart
        context.subscriptions.push(
            vscode.commands.registerCommand('probe-rs.liveWatch.showChart', (variable) => {
                this.commandService.showChart(variable);
            }),
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
                // Using the command service's method
                // In a real implementation, you'd call the persistence manager directly
                // or use a dedicated persistence service
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
    }

    private stopPolling() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = undefined;
        }
    }

    public async dispose() {
        this.stopPolling();
        if (this.treeView) {
            this.treeView.dispose();
        }
        // Save variables when the manager is disposed
        await this.commandService.saveVariables(this.context);
    }
}
