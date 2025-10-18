import * as vscode from 'vscode';

export enum LogLevel {
    console = 'probe-rs-debug',
    error = 'ERROR',
    warn = 'WARN',
    info = 'INFO',
    debug = 'DEBUG',
}

export class Logger {
    private static consoleLogLevel: LogLevel = LogLevel.console;

    static setConsoleLogLevel(level: string) {
        // Map the string to the appropriate LogLevel enum value
        switch (level.toLowerCase()) {
            case 'console':
                this.consoleLogLevel = LogLevel.console;
                break;
            case 'error':
                this.consoleLogLevel = LogLevel.error;
                break;
            case 'warn':
                this.consoleLogLevel = LogLevel.warn;
                break;
            case 'info':
                this.consoleLogLevel = LogLevel.info;
                break;
            case 'debug':
                this.consoleLogLevel = LogLevel.debug;
                break;
            default:
                this.consoleLogLevel = LogLevel.console;
                break;
        }
    }

    static log(message: string, level: LogLevel = LogLevel.console, fromDebugger: boolean = false) {
        console.log(message); // During VSCode extension development, this will also log to the local debug console

        if (fromDebugger) {
            // STDERR messages of the `error` variant. These deserve to be shown as an error message in the UI also.
            // This filter might capture more than expected, but since RUST_LOG messages can take many formats, it seems that this is the safest/most inclusive.
            if (level === LogLevel.error) {
                vscode.debug.activeDebugConsole.appendLine(message);
                vscode.window.showErrorMessage(message);
            } else {
                // Any other messages that come directly from the debugger, are assumed to be relevant and should be logged to the console.
                vscode.debug.activeDebugConsole.appendLine(message);
            }
        } else if (level === LogLevel.console) {
            vscode.debug.activeDebugConsole.appendLine(message);
        } else {
            // Convert LogLevel to string for safer comparison
            const logLevelStr = level as string;
            const consoleLogLevelStr = this.consoleLogLevel as string;

            switch (consoleLogLevelStr) {
                case LogLevel.debug:
                    if (
                        logLevelStr === LogLevel.console ||
                        logLevelStr === LogLevel.error ||
                        logLevelStr === LogLevel.debug
                    ) {
                        vscode.debug.activeDebugConsole.appendLine(message);
                    }
                    break;
                default:
                    if (logLevelStr === LogLevel.console || logLevelStr === LogLevel.error) {
                        vscode.debug.activeDebugConsole.appendLine(message);
                    }
                    break;
            }
        }
    }

    static error(message: string, error?: Error | string) {
        let fullMessage = `${LogLevel.error}: ${LogLevel.console}: ${message}`;
        if (error) {
            if (typeof error === 'string') {
                fullMessage += ` Error: ${error}`;
            } else {
                fullMessage += ` Error: ${error.message || 'Unknown error'}`;
            }
        }
        this.log(fullMessage, LogLevel.error);
    }

    static warn(message: string) {
        this.log(`${LogLevel.warn}: ${LogLevel.console}: ${message}`, LogLevel.warn);
    }

    static info(message: string) {
        this.log(`${LogLevel.info}: ${LogLevel.console}: ${message}`, LogLevel.info);
    }

    static debug(message: string) {
        if (this.consoleLogLevel === LogLevel.debug) {
            this.log(`${LogLevel.debug}: ${LogLevel.console}: ${message}`, LogLevel.debug);
        }
    }

    static showMessage(severity: 'information' | 'warning' | 'error', message: string) {
        switch (severity) {
            case 'information':
                this.info(message);
                vscode.window.showInformationMessage(message);
                break;
            case 'warning':
                this.warn(message);
                vscode.window.showWarningMessage(message);
                break;
            case 'error':
                this.error(message);
                vscode.window.showErrorMessage(message);
                break;
        }
    }
}
