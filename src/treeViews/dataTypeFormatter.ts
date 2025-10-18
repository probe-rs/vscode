export class DataTypeFormatter {
    static formatValue(
        value: string,
        type?: string,
        format?: 'auto' | 'decimal' | 'hex' | 'binary' | 'float',
    ): string {
        // Default to auto format if not specified
        if (!format) {
            format = 'auto';
        }

        // If type is specified and we're using auto format, determine the best format
        if (format === 'auto' && type) {
            if (type.toLowerCase().includes('float') || type.toLowerCase().includes('double')) {
                format = 'float';
            } else if (
                type.toLowerCase().includes('int') ||
                type.toLowerCase().includes('char') ||
                type.toLowerCase().includes('bool')
            ) {
                // For integers, we'll use hex if the value looks like a hex number or flag
                if (value.startsWith('0x') || value.includes('0x')) {
                    format = 'hex';
                } else {
                    format = 'decimal';
                }
            }
        }

        switch (format) {
            case 'hex':
                return this.formatAsHex(value);
            case 'binary':
                return this.formatAsBinary(value);
            case 'float':
                return this.formatAsFloat(value);
            case 'decimal':
            case 'auto':
            default:
                return value; // Return as is for decimal or auto that defaults to original
        }
    }

    private static formatAsHex(value: string): string {
        try {
            // Try to parse as a number
            const num = this.parseNumber(value);
            if (num !== null) {
                return '0x' + Math.round(num).toString(16).toUpperCase();
            }
        } catch (e) {
            // If parsing fails, return original value
        }
        return value;
    }

    private static formatAsBinary(value: string): string {
        try {
            // Try to parse as a number
            const num = this.parseNumber(value);
            if (num !== null) {
                return '0b' + Math.round(num).toString(2);
            }
        } catch (e) {
            // If parsing fails, return original value
        }
        return value;
    }

    private static formatAsFloat(value: string): string {
        try {
            const num = parseFloat(value);
            if (!isNaN(num)) {
                // Format to a reasonable number of decimal places
                return num % 1 === 0 ? num.toFixed(1) : num.toString();
            }
        } catch (e) {
            // If parsing fails, return original value
        }
        return value;
    }

    private static parseNumber(value: string): number | null {
        // Remove any common prefixes like 0x, 0b, etc.
        let cleanValue = value.trim();

        // Handle hex
        if (cleanValue.toLowerCase().startsWith('0x')) {
            const hexValue = cleanValue.substring(2);
            const num = parseInt(hexValue, 16);
            return isNaN(num) ? null : num;
        }

        // Handle binary
        if (cleanValue.toLowerCase().startsWith('0b')) {
            const binValue = cleanValue.substring(2);
            const num = parseInt(binValue, 2);
            return isNaN(num) ? null : num;
        }

        // Handle decimal
        const num = parseFloat(cleanValue);
        return isNaN(num) ? null : num;
    }
}
