import * as vscode from 'vscode';
import {LiveWatchVariable} from './liveWatchProvider';

export class DataVisualizer {
    static showChart(variable: LiveWatchVariable) {
        if (!variable) {
            vscode.window.showErrorMessage('No variable selected for visualization');
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'variableChart',
            `Variable Chart: ${variable.label}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            },
        );

        const history = variable.getHistory();
        const labels = history.map((_, index) => index.toString());
        const values = history.map((entry) => parseFloat(entry.value) || 0);

        // Create HTML for chart visualization
        panel.webview.html = this.getWebviewContent(variable.label, labels, values);
    }

    private static getWebviewContent(title: string, labels: string[], values: number[]): string {
        // Create a simple chart using Chart.js via CDN
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Variable Chart</title>
                <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
                <style>
                    body { 
                        margin: 0; 
                        padding: 20px; 
                        font-family: var(--vscode-font-family);
                        background-color: var(--vscode-editor-background);
                        color: var(--vscode-editor-foreground);
                    }
                    .container {
                        max-width: 100%;
                        margin: 0 auto;
                    }
                    h1 {
                        color: var(--vscode-titleBar-activeForeground);
                    }
                    .chart-container {
                        position: relative;
                        height: 85vh;
                        width: 100%;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Chart: ${title}</h1>
                    <div class="chart-container">
                        <canvas id="chartCanvas"></canvas>
                    </div>
                </div>
                <script>
                    const ctx = document.getElementById('chartCanvas').getContext('2d');
                    
                    // Create the chart
                    const chart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: [${labels.map((l) => `"${l}"`).join(',')}],
                            datasets: [{
                                label: 'Value',
                                data: [${values.join(',')}],
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
                                    beginAtZero: false,
                                    grid: {
                                        color: 'rgba(255, 255, 255, 0.1)'
                                    },
                                    ticks: {
                                        color: 'rgba(255, 255, 255, 0.7)'
                                    }
                                },
                                x: {
                                    grid: {
                                        color: 'rgba(255, 255, 255, 0.1)'
                                    },
                                    ticks: {
                                        color: 'rgba(255, 255, 255, 0.7)'
                                    }
                                }
                            },
                            plugins: {
                                legend: {
                                    labels: {
                                        color: 'rgba(255, 255, 255, 0.7)'
                                    }
                                }
                            }
                        }
                    });
                    
                    // Listen for messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.command) {
                            case 'updateData':
                                // Update the chart with new data
                                chart.data.labels = message.labels;
                                chart.data.datasets[0].data = message.values;
                                chart.update();
                                break;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    static async updateChart(panel: vscode.WebviewPanel, variable: LiveWatchVariable) {
        const history = variable.getHistory();
        const labels = history.map((_, index) => index.toString());
        const values = history.map((entry) => parseFloat(entry.value) || 0);

        // Send update message to webview
        panel.webview.postMessage({
            command: 'updateData',
            labels: labels,
            values: values,
        });
    }
}
