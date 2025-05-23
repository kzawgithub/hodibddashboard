/**
 * CSV Processing Web Worker
 * Handles CSV parsing and data processing in a separate thread
 */

// Handle messages from the main thread
self.onmessage = function(e) {
    const { action, data } = e.data;

    try {
        if (action === 'processChunk') {
            const result = processChunk(data.chunk, data.header, data.isFirstChunk);
            self.postMessage({
                action: 'chunkProcessed',
                result: result
            });
        } else if (action === 'parseCSVLine') {
            const result = parseCSVLine(data.line);
            self.postMessage({
                action: 'lineProcessed',
                result: result
            });
        }
    } catch (error) {
        self.postMessage({
            action: 'error',
            error: error.message
        });
    }
};

// Process a chunk of CSV data
function processChunk(chunk, header, isFirstChunk) {
    // Split the chunk into lines
    const lines = chunk.split('\n');

    // Process each line
    const processedLines = [];
    let startIndex = isFirstChunk ? 1 : 0; // Skip header if this is the first chunk

    for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line === '') continue;

        const rowData = parseCSVLine(line);

        // Only process rows that have enough data
        if (rowData.length >= header.length) {
            // Create a minimal object with only the fields we need
            const rowObject = {};
            header.forEach((key, index) => {
                // Only store fields we actually use to reduce memory
                if (['REPORTTYPE', 'TRANSACTION_AMOUNT', 'TRANSACTION_CURRENCY',
                     'ACCOUNT_HOLDER_ACCOUNT_ROLE', 'TRANSACTION_DATE', 'SERIAL_NO'].includes(key)) {
                    rowObject[key] = rowData[index] || '';
                }
            });

            // Only add rows that have a REPORTTYPE value
            if (rowObject.REPORTTYPE) {
                processedLines.push(rowObject);
            }
        }
    }

    return {
        processedLines: processedLines,
        metrics: calculateMetrics(processedLines),
        dateData: aggregateByDate(processedLines)
    };
}

// Parse a CSV line into an array of values
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }

    // Add the last field
    result.push(current.trim());

    return result;
}

// Calculate metrics from processed lines
function calculateMetrics(lines) {
    const metrics = {
        totalTransactions: 0,
        totalAmount: 0,
        hocCount: 0,
        hocAmount: 0,
        hocCreditCount: 0,
        hocCreditAmount: 0,
        hocDebitCount: 0,
        hocDebitAmount: 0,
        ibdCount: 0,
        ibdAmount: 0,
        ibdCreditCount: 0,
        ibdCreditAmount: 0,
        ibdDebitCount: 0,
        ibdDebitAmount: 0,
        hocUniqueSerialCount: 0,
        ibdUniqueSerialCount: 0,
        totalUniqueSerialCount: 0,
        currencyCounts: {
            USD: 0,
            MMK: 0
        },
        currencyAmounts: {
            USD: 0,
            MMK: 0
        }
    };

    // Sets to track unique serial numbers
    const hocSerialNumbers = new Set();
    const ibdSerialNumbers = new Set();
    const allSerialNumbers = new Set();

    // Helper function to safely add numeric values
    const safeAdd = (a, b) => {
        const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
        const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
        return numA + numB;
    };

    // Process each line
    for (const row of lines) {
        // Ensure amount is a number with proper validation
        const amount = typeof row.TRANSACTION_AMOUNT === 'string' ?
            parseFloat(row.TRANSACTION_AMOUNT) || 0 :
            (typeof row.TRANSACTION_AMOUNT === 'number' ? row.TRANSACTION_AMOUNT : 0);

        // Update total counts
        metrics.totalTransactions++;
        metrics.totalAmount = safeAdd(metrics.totalAmount, amount);

        // Determine if this is a credit or debit transaction
        const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
        const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

        // Get the serial number (with error handling)
        const serialNo = row.SERIAL_NO || '';

        // Update report type counts
        if (row.REPORTTYPE === 'HOC') {
            metrics.hocCount++;
            metrics.hocAmount = safeAdd(metrics.hocAmount, amount);

            // Track unique serial numbers for HOC
            if (serialNo) {
                hocSerialNumbers.add(serialNo);
                allSerialNumbers.add(serialNo);
            }

            // Update HOC credit/debit counts
            if (isCredit) {
                metrics.hocCreditCount++;
                metrics.hocCreditAmount = safeAdd(metrics.hocCreditAmount, amount);
            } else if (isDebit) {
                metrics.hocDebitCount++;
                metrics.hocDebitAmount = safeAdd(metrics.hocDebitAmount, amount);
            }
        } else if (row.REPORTTYPE === 'IBD') {
            metrics.ibdCount++;
            metrics.ibdAmount = safeAdd(metrics.ibdAmount, amount);

            // Track unique serial numbers for IBD
            if (serialNo) {
                ibdSerialNumbers.add(serialNo);
                allSerialNumbers.add(serialNo);
            }

            // Update IBD credit/debit counts
            if (isCredit) {
                metrics.ibdCreditCount++;
                metrics.ibdCreditAmount = safeAdd(metrics.ibdCreditAmount, amount);
            } else if (isDebit) {
                metrics.ibdDebitCount++;
                metrics.ibdDebitAmount = safeAdd(metrics.ibdDebitAmount, amount);
            }
        } else if (row.REPORTTYPE === 'WU') {
            // For WU transactions, only track unique serial numbers for IBD count
            // but don't include in other IBD metrics
            if (serialNo) {
                ibdSerialNumbers.add(serialNo);
                allSerialNumbers.add(serialNo);
            }
        }

        // Update currency counts
        if (row.TRANSACTION_CURRENCY === 'USD') {
            metrics.currencyCounts.USD++;
            metrics.currencyAmounts.USD = safeAdd(metrics.currencyAmounts.USD, amount);
        } else if (row.TRANSACTION_CURRENCY === 'MMK') {
            metrics.currencyCounts.MMK++;
            metrics.currencyAmounts.MMK = safeAdd(metrics.currencyAmounts.MMK, amount);
        }
    }

    // Update unique serial counts
    metrics.hocUniqueSerialCount = hocSerialNumbers.size;
    metrics.ibdUniqueSerialCount = ibdSerialNumbers.size;
    metrics.totalUniqueSerialCount = allSerialNumbers.size;

    return metrics;
}

// Aggregate data by date
function aggregateByDate(lines) {
    const dateData = {};

    for (const row of lines) {
        // Extract date from transaction date using a standardized approach
        let date = 'Unknown';
        if (row.TRANSACTION_DATE) {
            try {
                // Extract just the date part if there's a space (time component)
                let dateStr = row.TRANSACTION_DATE;
                if (dateStr.includes(' ')) {
                    dateStr = dateStr.split(' ')[0];
                }

                // Format: "26-JAN-25" (DD-MMM-YY)
                if (/^\d{2}-[A-Z]{3}-\d{2}$/.test(dateStr)) {
                    date = dateStr;
                }
                // Format: "2023-01-01" (ISO format YYYY-MM-DD)
                else if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    // Convert to DD-MMM-YY format for consistency
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        date = dateObj.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                        }).replace(/ /g, '-').toUpperCase();
                    } else {
                        date = dateStr;
                    }
                }
                // Try to parse as date if it's in another format
                else {
                    const dateObj = new Date(dateStr);
                    if (!isNaN(dateObj.getTime())) {
                        date = dateObj.toLocaleDateString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit'
                        }).replace(/ /g, '-').toUpperCase();
                    } else {
                        date = dateStr;
                    }
                }
            } catch (error) {
                console.error('Error parsing date:', error);
                date = 'Unknown';
            }
        }

        // Initialize date entry if it doesn't exist
        if (!dateData[date]) {
            dateData[date] = {
                hocCreditCount: 0,
                hocCreditAmount: 0,
                hocDebitCount: 0,
                hocDebitAmount: 0,
                ibdCreditCount: 0,
                ibdCreditAmount: 0,
                ibdDebitCount: 0,
                ibdDebitAmount: 0
            };
        }

        // Get transaction amount as number with validation
        const amount = typeof row.TRANSACTION_AMOUNT === 'string' ?
            parseFloat(row.TRANSACTION_AMOUNT) || 0 :
            (typeof row.TRANSACTION_AMOUNT === 'number' ? row.TRANSACTION_AMOUNT : 0);

        // Determine transaction type
        const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
        const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

        // Update counts and amounts based on transaction type
        if (row.REPORTTYPE === 'HOC') {
            if (isCredit) {
                dateData[date].hocCreditCount++;
                dateData[date].hocCreditAmount += amount;
            } else if (isDebit) {
                dateData[date].hocDebitCount++;
                dateData[date].hocDebitAmount += amount;
            }
        } else if (row.REPORTTYPE === 'IBD') {
            if (isCredit) {
                dateData[date].ibdCreditCount++;
                dateData[date].ibdCreditAmount += amount;
            } else if (isDebit) {
                dateData[date].ibdDebitCount++;
                dateData[date].ibdDebitAmount += amount;
            }
        }
    }

    return dateData;
}
