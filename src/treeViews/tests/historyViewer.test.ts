import * as assert from 'assert';
import {HistoryViewer} from '../components';

describe('HistoryViewer its', () => {
    it('should generate proper HTML for history view', () => {
        const history = [
            {value: 'value1', timestamp: new Date('2023-01-01T10:00:00Z')},
            {value: 'value2', timestamp: new Date('2023-01-01T10:01:00Z')},
        ];

        // @ts-ignore Accessing private method for iting
        const html = HistoryViewer.generateHistoryHtml(history, 'itVar');

        assert.ok(html.includes('History for itVar'));
        assert.ok(html.includes('value1'));
        assert.ok(html.includes('value2'));
        assert.ok(html.includes('10:00:00')); // timestamp
        assert.ok(html.includes('10:01:00')); // timestamp
    });

    it('should escape HTML properly', () => {
        const history = [{value: '<script>alert("xss")</script>', timestamp: new Date()}];

        // @ts-ignore Accessing private method for iting
        const html = HistoryViewer.generateHistoryHtml(history, 'itVar');

        // Check that the script tag is escaped
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
    });

    it('should escape variable name properly', () => {
        const history = [{value: 'value1', timestamp: new Date()}];

        // @ts-ignore Accessing private method for iting
        const html = HistoryViewer.generateHistoryHtml(history, '<script>');

        // Check that the variable name is escaped
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
    });

    it('should handle empty history', () => {
        const history: {value: string; timestamp: Date}[] = [];

        // @ts-ignore Accessing private method for iting
        const html = HistoryViewer.generateHistoryHtml(history, 'itVar');

        assert.ok(html.includes('History for itVar'));
        // Should have table rows for the history, but none in this case
        assert.ok(html.includes('<tbody>'));
    });

    it('should escapeHtml method works correctly', () => {
        // @ts-ignore Accessing private method for iting
        const result = HistoryViewer.escapeHtml('& < > " \'');

        assert.strictEqual(result, '&amp; &lt; &gt; &quot; &#039;');
    });
});

// Note: iting webview functionality like showHistory would require
// mocking VSCode's window.createWebviewPanel which is complex.
// These its focus on the core logic.
