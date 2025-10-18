import * as vscode from 'vscode';

export class ConfigurationProvider implements vscode.DebugConfigurationProvider {
    /**
     * Ensure the provided configuration has the essential defaults applied.
     */
    resolveDebugConfiguration(
        _folder: vscode.WorkspaceFolder | undefined,
        config: vscode.DebugConfiguration,
        _token?: vscode.CancellationToken,
    ): vscode.ProviderResult<vscode.DebugConfiguration> {
        // Assign the default `cwd` for the project.
        if (!config.cwd) {
            config.cwd = '${workspaceFolder}';
        }

        return config;
    }
}
