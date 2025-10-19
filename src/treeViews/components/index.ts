import * as vscode from 'vscode';
import {ILiveWatchVariable} from '../types';

export class HistoryViewer {
    static showHistory(variable: ILiveWatchVariable) {
        try {
            if (!variable.getHistory || variable.getHistory().length === 0) {
                vscode.window.showInformationMessage('No history available for this variable.');
                return;
            }

            // Create a new webview panel to display the history
            const panel = vscode.window.createWebviewPanel(
                'variableHistory',
                `History: ${variable.label}`,
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                },
            );

            // Generate HTML content for the history view
            const history = variable.getHistory();
            const label =
                typeof variable.label === 'string'
                    ? variable.label
                    : (variable.label as any)?.label || 'Unknown';
            const content = this.generateHistoryHtml(history, label);

            panel.webview.html = content;

            // Add message listener if needed for interactivity
            panel.webview.onDidReceiveMessage((message) => {
                switch (message.command) {
                    case 'alert':
                        vscode.window.showErrorMessage(message.text);
                        return;
                }
            }, undefined);
        } catch (error) {
            console.error('Error in HistoryViewer.showHistory:', error);
            vscode.window.showErrorMessage(
                `Failed to show history: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    private static generateHistoryHtml(
        history: {value: string; timestamp: Date}[],
        variableName: string,
    ): string {
        try {
            // Create a table with timestamps and values
            let tableRows = '';
            for (const entry of history) {
                // Ensure we don't have HTML injection by escaping values
                const safeValue = this.escapeHtml(entry.value);
                const safeTimestamp = this.escapeHtml(entry.timestamp.toLocaleTimeString());

                tableRows += `
                <tr>
                    <td>${safeTimestamp}</td>
                    <td>${safeValue}</td>
                </tr>
                `;
            }

            return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>History for ${this.escapeHtml(variableName)}</title>
                <style>
                    body {
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        background-color: #f3f3f3;
                        padding: 20px;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 10px;
                    }
                    th, td {
                        border: 1px solid #ddd;
                        padding: 8px;
                        text-align: left;
                    }
                    th {
                        background-color: #4CAF50;
                        color: white;
                    }
                    tr:nth-child(even) {
                        background-color: #f2f2f2;
                    }
                </style>
            </head>
            <body>
                <h2>History for ${this.escapeHtml(variableName)}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </body>
            </html>`;
        } catch (error) {
            console.error('Error generating history HTML:', error);
            return `<html><body><p>Error generating history view</p></body></html>`;
        }
    }

    private static escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}

export class DataVisualizer {
    static showChart(variable: ILiveWatchVariable) {
        if (!variable.getHistory || variable.getHistory().length < 2) {
            vscode.window.showInformationMessage(
                'Insufficient data to display chart. Need at least 2 values.',
            );
            return;
        }

        // Create a new webview panel to display the chart
        const panel = vscode.window.createWebviewPanel(
            'variableChart',
            `Chart: ${variable.label}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );

        // Generate HTML content with chart
        const history = variable.getHistory();
        const label =
            typeof variable.label === 'string'
                ? variable.label
                : (variable.label as any)?.label || 'Unknown';
        const content = this.generateChartHtml(history, label);

        panel.webview.html = content;

        // Add message listener for interactivity if needed
        panel.webview.onDidReceiveMessage((message) => {
            switch (message.command) {
                case 'alert':
                    vscode.window.showErrorMessage(message.text);
                    return;
            }
        }, undefined);
    }

    private static generateChartHtml(
        history: {value: string; timestamp: Date}[],
        variableName: string,
    ): string {
        // Extract numeric values for plotting (convert non-numeric to 0)
        const dataPoints = history.map((entry, index) => {
            const numValue = parseFloat(entry.value);
            return [index, isNaN(numValue) ? 0 : numValue];
        });

        // Create timestamps array for x-axis labels
        const timeLabels = history.map((entry) => entry.timestamp.toLocaleTimeString());

        // Convert data to JSON strings
        const dataPointsJson = JSON.stringify(dataPoints);
        const timeLabelsJson = JSON.stringify(timeLabels);

        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Chart for ${variableName}</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                body {
                    padding: 20px;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                }
                .chart-container {
                    position: relative;
                    height: 80vh;
                    width: 100%;
                }
            </style>
        </head>
        <body>
            <h2>Chart for ${variableName}</h2>
            <div class="chart-container">
                <canvas id="chartCanvas"></canvas>
            </div>

            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    const ctx = document.getElementById('chartCanvas').getContext('2d');
                    
                    // Create the chart
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: ${timeLabelsJson},
                            datasets: [{
                                label: '${variableName} Value',
                                data: ${dataPointsJson}.map(point => point[1]),
                                borderColor: 'rgb(75, 192, 192)',
                                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                                tension: 0.1,
                                fill: false
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                                y: {
                                    beginAtZero: false
                                }
                            },
                            plugins: {
                                title: {
                                    display: true,
                                    text: 'Value over Time'
                                },
                                legend: {
                                    display: true,
                                    position: 'top',
                                }
                            }
                        }
                    });
                });
            </script>
        </body>
        </html>`;
    }
}

export class FormatManager {
    static changeDisplayFormat(variable: ILiveWatchVariable) {
        // Show a quick pick to select the display format
        const formatOptions = [
            {label: 'Auto', description: 'Automatically determine format', value: 'auto'},
            {label: 'Decimal', description: 'Decimal number format', value: 'decimal'},
            {label: 'Hexadecimal', description: 'Hexadecimal format', value: 'hex'},
            {label: 'Binary', description: 'Binary format', value: 'binary'},
            {label: 'Float', description: 'Float number format', value: 'float'},
        ];

        vscode.window
            .showQuickPick(formatOptions, {
                placeHolder: 'Select display format',
            })
            .then((selected) => {
                if (selected) {
                    variable.setDisplayFormat(
                        selected.value as 'auto' | 'decimal' | 'hex' | 'binary' | 'float',
                    );

                    // Update the UI to reflect the change
                    // The variable's description is updated in setDisplayFormat
                    vscode.window.showInformationMessage(
                        `Display format for ${variable.label} changed to ${selected.label}`,
                    );
                }
            });
    }
}

export class LiveWatchValueEditor {
    static async editVariableValue(variable: ILiveWatchVariable) {
        // Show an input box to allow the user to edit the variable value
        const currentValue = variable.value || '';
        const newValue = await vscode.window.showInputBox({
            prompt: `Enter new value for ${variable.label}`,
            value: currentValue,
            validateInput: (/*value*/) => {
                // Add validation logic if needed
                return null;
            },
        });

        if (newValue !== undefined) {
            // Attempt to set the new value
            const success = await variable.setVariableValue(newValue);

            if (success) {
                // Update the UI to reflect the change
                variable.updateValue(newValue);

                // Refresh the tree view
                // Note: We would need to get reference to the provider to call refresh
                // This is typically done by passing the provider as a parameter or
                // accessing it through the command service
            } else {
                vscode.window.showErrorMessage(`Failed to set value for ${variable.label}`);
            }
        }
    }
}

export class ConditionalWatchManager {
    static addConditionalWatch(variable: ILiveWatchVariable) {
        vscode.window
            .showInputBox({
                prompt: `Enter condition for ${variable.label} (e.g., "counter > 5")`,
                placeHolder: 'e.g., counter > 5, flag == true',
            })
            .then((condition) => {
                if (condition) {
                    // Set the conditional watch on the variable
                    // Note: We need to add this to the variable, but since we don't have
                    // the actual ConditionalWatch class import here, we'll need to handle that differently
                    (variable as any).conditionalWatch = new ConditionalWatch(condition);
                    vscode.window.showInformationMessage(
                        `Conditional watch set for ${variable.label}: ${condition}`,
                    );
                }
            });
    }

    static removeConditionalWatch(variable: ILiveWatchVariable) {
        (variable as any).removeConditionalWatch();
        vscode.window.showInformationMessage(`Conditional watch removed for ${variable.label}`);
    }

    static editConditionalWatch(variable: ILiveWatchVariable) {
        const currentCondition = (variable as any).getConditionalWatch()?.condition;

        vscode.window
            .showInputBox({
                prompt: `Edit condition for ${variable.label}`,
                value: currentCondition || '',
                placeHolder: 'e.g., counter > 5, flag == true',
            })
            .then((newCondition) => {
                if (newCondition) {
                    // Set the new conditional watch
                    (variable as any).conditionalWatch = new ConditionalWatch(newCondition);
                    vscode.window.showInformationMessage(
                        `Conditional watch updated for ${variable.label}: ${newCondition}`,
                    );
                }
            });
    }
}

export {PersistenceManager} from './PersistenceManager';

// Need to import ConditionalWatch from its specific path to avoid circular dependencies
import {ConditionalWatch} from '../services';
