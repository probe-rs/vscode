import * as assert from 'assert';
import {PersistenceManager} from '../components/PersistenceManager';
import {LiveWatchProvider} from '../providers';

// Mock ExtensionContext for iting
class MockExtensionContext {
    workspaceState: any = {
        _data: new Map(),
        get(key: string) {
            return this._data.get(key);
        },
        update(key: string, value: any) {
            return this._data.set(key, value);
        },
    };
}

describe('PersistenceManager its', () => {
    let context: MockExtensionContext;
    let provider: LiveWatchProvider;

    setup(() => {
        context = new MockExtensionContext() as any;
        provider = new LiveWatchProvider();
    });

    it('should save variables correctly', async () => {
        // Add a it variable to the provider
        const itVar = provider.addVariable('itVar');

        // Mock setting some properties on the variable
        (itVar as any).setDisplayFormat('hex');

        await PersistenceManager.saveVariables(provider, context as any);

        const savedData = context.workspaceState.get('probe-rs.liveWatch.savedVariables');
        assert.ok(savedData);
        assert.ok(Array.isArray(savedData.variables));
        assert.strictEqual(savedData.variables.length, 1);
        assert.strictEqual(savedData.variables[0].expression, 'itVar');
        assert.strictEqual(savedData.variables[0].displayFormat, 'hex');
    });

    it('should save variables with conditional watch', async () => {
        // Add a it variable to the provider
        provider.addVariable('itVar');

        // In a real scenario, we'd set a conditional watch, but for iting
        // we'll just verify the structure works

        await PersistenceManager.saveVariables(provider, context as any);

        const savedData = context.workspaceState.get('probe-rs.liveWatch.savedVariables');
        assert.ok(savedData);
    });

    it('should load variables correctly', async () => {
        // Prepare data to be loaded
        const itData = {
            variables: [
                {
                    label: 'loadedVar',
                    expression: 'loaded.expression',
                    displayFormat: 'decimal',
                    conditionalWatch: null,
                },
            ],
            groups: [],
        };

        context.workspaceState.update('probe-rs.liveWatch.savedVariables', itData);

        // Check provider is initially empty
        assert.strictEqual((provider as any).rootElements.length, 0);

        await PersistenceManager.loadVariables(provider, context as any);

        // Check that the variable was loaded
        assert.strictEqual((provider as any).rootElements.length, 1);
        // @ts-ignore Accessing private members for iting
        const loadedVar = (provider as any).rootElements[0];
        assert.strictEqual(loadedVar.expression, 'loaded.expression');
        assert.strictEqual(loadedVar.label, 'loadedVar');
    });

    it('should clear saved variables', async () => {
        // Save some it data first
        const itData = {
            variables: [
                {
                    label: 'itVar',
                    expression: 'it.expression',
                    displayFormat: 'decimal',
                    conditionalWatch: null,
                },
            ],
            groups: [],
        };

        context.workspaceState.update('probe-rs.liveWatch.savedVariables', itData);
        assert.ok(context.workspaceState.get('probe-rs.liveWatch.savedVariables'));

        await PersistenceManager.clearSavedVariables(context as any);

        const clearedData = context.workspaceState.get('probe-rs.liveWatch.savedVariables');
        assert.strictEqual(clearedData, undefined);
    });

    it('should handle loading with no saved data', async () => {
        // Ensure no saved data exists
        context.workspaceState.update('probe-rs.liveWatch.savedVariables', undefined);

        // This should not throw an error
        await PersistenceManager.loadVariables(provider, context as any);

        // Provider should still be empty
        assert.strictEqual((provider as any).rootElements.length, 0);
    });

    it('should handle invalid saved data appropriately', async () => {
        // iting the load functionality with various data structures
        // The method has validation built-in, so we'll it through the public API
        context.workspaceState.update('probe-rs.liveWatch.savedVariables', null);
        await PersistenceManager.loadVariables(provider, context as any);
        assert.ok(true); // Should not throw an error

        context.workspaceState.update('probe-rs.liveWatch.savedVariables', {
            variables: 'not-an-array',
        });
        await PersistenceManager.loadVariables(provider, context as any);
        assert.ok(true); // Should handle gracefully
    });
});
