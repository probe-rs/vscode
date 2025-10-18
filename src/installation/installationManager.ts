import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import {findExecutable} from '../utils';

export async function probeRsInstalled(): Promise<boolean> {
    return (await findExecutable('probe-rs')) !== null;
}

export async function installProbeRs() {
    const windows = process.platform === 'win32';
    let done = false;

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Window,
            cancellable: false,
            title: 'Installing probe-rs ...',
        },
        async (progress) => {
            progress.report({increment: 0});

            const launchedDebugAdapter = childProcess.exec(
                windows
                    ? `powershell.exe -encodedCommand ${Buffer.from(
                          'irm https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.ps1 | iex',
                          'utf16le',
                      ).toString('base64')}`
                    : "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/probe-rs/probe-rs/releases/latest/download/probe-rs-tools-installer.sh | sh",
                (error, stdout, stderr) => {
                    if (error) {
                        console.error(`exec error: ${error}`);
                        done = true;
                        return;
                    }
                    console.log(`stdout: ${stdout}`);
                    console.log(`stderr: ${stderr}`);
                },
            );

            const errorListener = (error: Error) => {
                vscode.window.showInformationMessage(
                    `Installation failed: ${error.message}. Check the logs for more info.`,
                    'Ok',
                );
                console.error(error);
                done = true;
            };

            const exitListener = (code: number | null, signal: NodeJS.Signals | null) => {
                let message;
                if (code === 0) {
                    message = 'Installation successful.';
                } else if (signal) {
                    message = 'Installation aborted.';
                } else {
                    message =
                        'Installation failed. Go to https://probe.rs to check out the setup and troubleshooting instructions.';
                }
                console.error(message);
                vscode.window.showInformationMessage(message, 'Ok');
                done = true;
            };

            launchedDebugAdapter.on('error', errorListener);
            launchedDebugAdapter.on('exit', exitListener);

            const delay = (_ms: number) => new Promise((resolve) => setTimeout(resolve, _ms));
            while (!done) {
                await delay(100);
            }

            launchedDebugAdapter.removeListener('error', errorListener);
            launchedDebugAdapter.removeListener('exit', exitListener);

            progress.report({increment: 100});
        },
    );
}

// Note: probeRsInstalled should be available from this module as well
// It's already exported in the original file, so this is the second declaration issue
// The function is already defined at the bottom of the file, so we don't need to define it again here
