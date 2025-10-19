import * as vscode from 'vscode';
import {LiveWatchProvider} from './providers';

export class LiveWatchManager {
    private provider: LiveWatchProvider;
    private updateInterval: NodeJS.Timeout | undefined;
    private updateIntervalMs: number = 1000; // Update every 1 second by default
    private treeView: vscode.TreeView<vscode.TreeItem> | undefined;
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext, provider: LiveWatchProvider) {
        this.context = context;
        this.provider = provider;

        // Get the update interval from configuration
        const config = vscode.workspace.getConfiguration('probe-rs-debugger');
        this.updateIntervalMs = config.get('liveWatchUpdateInterval', 1000);

        // Register the tree view
        this.treeView = vscode.window.createTreeView('probe-rs.liveWatch', {
            treeDataProvider: provider,
            dragAndDropController: provider,
        });

        context.subscriptions.push(this.treeView);

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
        // We would need to call the command service's save method here
    }

    // Getter for context to make it accessible if needed elsewhere
    public getContext(): vscode.ExtensionContext {
        return this.context;
    }
}
