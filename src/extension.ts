/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import {LiveWatchProvider} from './treeViews/liveWatchProvider';
import {LiveWatchManager} from './treeViews/liveWatchManager';
import {PersistenceManager} from './treeViews/persistenceManager';
import {probeRsInstalled} from './installation/installationManager';

export async function activate(context: vscode.ExtensionContext) {
    // Import the new modules
    const debugAdapterProviderModule = await import('./debugAdapter/debugAdapterProvider');
    const debugAdapterTrackerModule = await import('./debugAdapter/debugAdapterTracker');
    const configurationProviderModule = await import('./debugAdapter/configurationProvider');
    const {installProbeRs} = await import('./installation/installationManager');

    const descriptorFactory = new debugAdapterProviderModule.DebugAdapterProvider();
    const configProvider = new configurationProviderModule.ConfigurationProvider();
    const trackerFactory = new debugAdapterTrackerModule.DebugAdapterTrackerFactory();

    // Initialize Live Watch functionality
    const liveWatchProvider = new LiveWatchProvider();
    const liveWatchManager = new LiveWatchManager(context, liveWatchProvider);

    context.subscriptions.push(
        vscode.debug.registerDebugAdapterDescriptorFactory('probe-rs-debug', descriptorFactory),
        vscode.debug.registerDebugConfigurationProvider('probe-rs-debug', configProvider),
        vscode.debug.registerDebugAdapterTrackerFactory('probe-rs-debug', trackerFactory),
        vscode.debug.onDidReceiveDebugSessionCustomEvent(
            descriptorFactory.receivedCustomEvent.bind(descriptorFactory),
        ),
        liveWatchManager,
    );

    // Load saved variables when extension starts
    await PersistenceManager.loadVariables(liveWatchProvider, context);

    (async () => {
        if (!(await probeRsInstalled())) {
            const resp = await vscode.window.showInformationMessage(
                "probe-rs doesn't seem to be installed. Do you want to install it automatically now?",
                'Install',
            );

            if (resp === 'Install') {
                await installProbeRs();
            }
        }
    })();
}

export function deactivate() {
    // Nothing to clean up for now
}
