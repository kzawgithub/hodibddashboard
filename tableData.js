/**
 * Table Data Module
 * Handles transaction data grouping by date and table display
 * Memory-optimized for large datasets
 */

class TableData {
    constructor() {
        this.tableData = [];
        this.tableBody = document.getElementById('transactionTableBody');
        this.dateData = {}; // Store aggregated data by date
        this.isInitialized = false;

        // Pagination settings
        this.currentPage = 1;
        this.rowsPerPage = 20;
        this.totalPages = 1;

        // Initialize pagination controls
        this.initPagination();
    }

    // Initialize pagination controls and export button
    initPagination() {
        // Create pagination container if it doesn't exist
        let paginationContainer = document.querySelector('.pagination-container');
        if (!paginationContainer) {
            paginationContainer = document.createElement('div');
            paginationContainer.className = 'pagination-container';

            // Add pagination controls
            paginationContainer.innerHTML = `
                <div class="pagination-controls">
                    <button id="prevPage" class="pagination-btn">&laquo; Previous</button>
                    <span id="pageInfo">Page 1 of 1</span>
                    <button id="nextPage" class="pagination-btn">Next &raquo;</button>
                </div>
                <div class="rows-per-page">
                    <label for="rowsPerPage">Rows per page:</label>
                    <select id="rowsPerPage">
                        <option value="10">10</option>
                        <option value="20" selected>20</option>
                        <option value="50">50</option>
                        <option value="100">100</option>
                    </select>
                </div>
            `;

            // Add pagination container to the table container
            const tableContainer = document.querySelector('.table-container');
            if (tableContainer) {
                tableContainer.appendChild(paginationContainer);
            }

            // Add event listeners for pagination controls
            this.addPaginationEventListeners();
        }

        // Add Export to Excel button if it doesn't exist
        this.addExportToExcelButton();
    }

    // Add Export to Excel button to the table header
    addExportToExcelButton() {
        const tableContainer = document.querySelector('.table-container');
        if (!tableContainer) return;

        // Check if button already exists
        if (!document.getElementById('exportToExcelBtn')) {
            // Create a container for the table title and export button
            const headerContainer = document.createElement('div');
            headerContainer.className = 'table-header-container';

            // Get the existing h3 title
            const existingTitle = tableContainer.querySelector('h3');
            if (existingTitle) {
                // Remove the existing title from its current position
                existingTitle.parentNode.removeChild(existingTitle);
                // Add it to our new container
                headerContainer.appendChild(existingTitle);
            } else {
                // Create a new title if none exists
                const newTitle = document.createElement('h3');
                newTitle.textContent = 'Transaction Data by Date';
                headerContainer.appendChild(newTitle);
            }

            // Create the export button
            const exportBtn = document.createElement('button');
            exportBtn.id = 'exportToExcelBtn';
            exportBtn.className = 'btn export-btn';
            exportBtn.innerHTML = '<i class="export-icon"></i> Export to Excel';
            headerContainer.appendChild(exportBtn);

            // Insert the header container at the beginning of the table container
            tableContainer.insertBefore(headerContainer, tableContainer.firstChild);

            // Add click event listener to the export button
            exportBtn.addEventListener('click', () => this.exportToExcel());
        }
    }

    // Process data and group by date
    processData(data) {
        if (!data || data.length === 0) {
            this.resetTable();
            return;
        }

        // Reset date data before processing
        this.dateData = {};

        // For large datasets, process in chunks to avoid memory issues
        this.processDataInChunks(data, 0, 10000);
    }

    // Process data in chunks to avoid memory issues
    processDataInChunks(data, startIndex, chunkSize) {
        // Process a chunk of data
        const endIndex = Math.min(startIndex + chunkSize, data.length);
        const chunk = data.slice(startIndex, endIndex);

        // Group chunk data by date
        this.groupChunkByDate(chunk);

        // If there's more data to process, schedule the next chunk
        if (endIndex < data.length) {
            // Use setTimeout to prevent UI freezing and allow garbage collection
            setTimeout(() => {
                this.processDataInChunks(data, endIndex, chunkSize);
            }, 0);
        } else {
            // All chunks processed, update the table
            this.finalizeProcessing();
        }
    }

    // Group a chunk of data by date
    groupChunkByDate(chunk) {
        for (const row of chunk) {
            const date = this.extractDate(row.TRANSACTION_DATE);

            // Initialize date entry if it doesn't exist
            if (!this.dateData[date]) {
                this.dateData[date] = {
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

            // Get transaction amount as number
            const amount = parseFloat(row.TRANSACTION_AMOUNT) || 0;

            // Determine transaction type
            const isCredit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
            const isDebit = row.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

            // Update counts and amounts based on transaction type
            if (row.REPORTTYPE === 'HOC') {
                if (isCredit) {
                    this.dateData[date].hocCreditCount++;
                    this.dateData[date].hocCreditAmount += amount;
                } else if (isDebit) {
                    this.dateData[date].hocDebitCount++;
                    this.dateData[date].hocDebitAmount += amount;
                }
            } else if (row.REPORTTYPE === 'IBD') {
                if (isCredit) {
                    this.dateData[date].ibdCreditCount++;
                    this.dateData[date].ibdCreditAmount += amount;
                } else if (isDebit) {
                    this.dateData[date].ibdDebitCount++;
                    this.dateData[date].ibdDebitAmount += amount;
                }
            }
            // Note: WU transactions are not included in the table data
            // They are only counted in the unique serial numbers for IBD
        }
    }

    // Finalize processing and update the table
    finalizeProcessing() {
        // Convert grouped data to array format for table
        this.tableData = this.formatTableData(this.dateData);

        // Update the table with the processed data
        this.updateTable();

        // Mark as initialized
        this.isInitialized = true;
    }

    // Update with pre-aggregated date data (for memory optimization)
    updateWithDateData(newDateData) {
        // Check if newDateData is valid
        if (!newDateData || Object.keys(newDateData).length === 0) {
            console.warn('Received empty date data, skipping update');
            return;
        }

        // Helper function to safely add numeric values
        const safeAdd = (a, b) => {
            const numA = typeof a === 'number' && !isNaN(a) ? a : 0;
            const numB = typeof b === 'number' && !isNaN(b) ? b : 0;
            return numA + numB;
        };

        // If not initialized, just use the new data
        if (!this.isInitialized) {
            this.dateData = {...newDateData};
            this.finalizeProcessing();
            return;
        }

        // Log the number of dates being merged
        console.log(`Merging date data: ${Object.keys(newDateData).length} dates`);

        // Merge the new date data with existing data
        for (const [date, data] of Object.entries(newDateData)) {
            if (!this.dateData[date]) {
                // New date entry
                this.dateData[date] = {...data};
            } else {
                // Update existing date entry with safe addition
                this.dateData[date].hocCreditCount = safeAdd(this.dateData[date].hocCreditCount, data.hocCreditCount);
                this.dateData[date].hocCreditAmount = safeAdd(this.dateData[date].hocCreditAmount, data.hocCreditAmount);
                this.dateData[date].hocDebitCount = safeAdd(this.dateData[date].hocDebitCount, data.hocDebitCount);
                this.dateData[date].hocDebitAmount = safeAdd(this.dateData[date].hocDebitAmount, data.hocDebitAmount);
                this.dateData[date].ibdCreditCount = safeAdd(this.dateData[date].ibdCreditCount, data.ibdCreditCount);
                this.dateData[date].ibdCreditAmount = safeAdd(this.dateData[date].ibdCreditAmount, data.ibdCreditAmount);
                this.dateData[date].ibdDebitCount = safeAdd(this.dateData[date].ibdDebitCount, data.ibdDebitCount);
                this.dateData[date].ibdDebitAmount = safeAdd(this.dateData[date].ibdDebitAmount, data.ibdDebitAmount);
            }
        }

        // Update the table
        this.finalizeProcessing();
    }

    // Extract date from transaction date string
    extractDate(dateString) {
        if (!dateString) return 'Unknown';

        // Handle different date formats
        try {
            // Format: "26-JAN-25 04.19.16.567000 PM" or similar with time component
            if (dateString.includes(' ')) {
                // Extract just the date part before any space
                dateString = dateString.split(' ')[0];
            }

            // Format: "26-JAN-25" (DD-MMM-YY)
            if (/^\d{2}-[A-Z]{3}-\d{2}$/.test(dateString)) {
                return dateString;
            }

            // Format: "2023-01-01" (ISO format YYYY-MM-DD)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                // Convert to DD-MMM-YY format for consistency
                const date = new Date(dateString);
                if (!isNaN(date.getTime())) {
                    return date.toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: '2-digit'
                    }).replace(/ /g, '-').toUpperCase();
                }
                return dateString;
            }

            // If it's a date object or can be parsed as a date
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: '2-digit'
                }).replace(/ /g, '-').toUpperCase();
            }

            // Default fallback
            return dateString;
        } catch (error) {
            console.error('Error parsing date:', error);
            return 'Unknown';
        }
    }

    // Group data by date
    groupDataByDate(data) {
        const groupedData = {};

        data.forEach(transaction => {
            const date = this.extractDate(transaction.TRANSACTION_DATE);

            // Initialize date group if it doesn't exist
            if (!groupedData[date]) {
                groupedData[date] = {
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

            // Get transaction amount as number
            const amount = parseFloat(transaction.TRANSACTION_AMOUNT) || 0;

            // Determine transaction type
            const isCredit = transaction.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'C';
            const isDebit = transaction.ACCOUNT_HOLDER_ACCOUNT_ROLE === 'D';

            // Update counts and amounts based on transaction type
            if (transaction.REPORTTYPE === 'HOC') {
                if (isCredit) {
                    groupedData[date].hocCreditCount++;
                    groupedData[date].hocCreditAmount += amount;
                } else if (isDebit) {
                    groupedData[date].hocDebitCount++;
                    groupedData[date].hocDebitAmount += amount;
                }
            } else if (transaction.REPORTTYPE === 'IBD') {
                if (isCredit) {
                    groupedData[date].ibdCreditCount++;
                    groupedData[date].ibdCreditAmount += amount;
                } else if (isDebit) {
                    groupedData[date].ibdDebitCount++;
                    groupedData[date].ibdDebitAmount += amount;
                }
            }
            // Note: WU transactions are not included in the table data
            // They are only counted in the unique serial numbers for IBD
        });

        return groupedData;
    }

    // Format grouped data for table display
    formatTableData(groupedData) {
        return Object.entries(groupedData).map(([date, data]) => ({
            date,
            ...data
        })).sort((a, b) => {
            // Sort by date (try to parse as date if possible)
            try {
                // Convert date strings to comparable format
                const dateA = this.convertDateForSorting(a.date);
                const dateB = this.convertDateForSorting(b.date);
                return dateA - dateB;
            } catch (error) {
                // Fallback to string comparison
                return a.date.localeCompare(b.date);
            }
        });
    }

    // Convert date string to timestamp for sorting
    convertDateForSorting(dateStr) {
        // Handle "DD-MMM-YY" format (e.g., "26-JAN-25")
        if (/^\d{2}-[A-Z]{3}-\d{2}$/.test(dateStr)) {
            const [day, month, year] = dateStr.split('-');
            const monthMap = {
                'JAN': 0, 'FEB': 1, 'MAR': 2, 'APR': 3, 'MAY': 4, 'JUN': 5,
                'JUL': 6, 'AUG': 7, 'SEP': 8, 'OCT': 9, 'NOV': 10, 'DEC': 11
            };

            // Assume 20xx for years less than 50, 19xx otherwise
            const fullYear = parseInt(year) < 50 ? 2000 + parseInt(year) : 1900 + parseInt(year);

            return new Date(fullYear, monthMap[month], parseInt(day)).getTime();
        }

        // Try standard date parsing for other formats
        return new Date(dateStr).getTime();
    }

    // Add event listeners for pagination controls
    addPaginationEventListeners() {
        // Previous page button
        const prevPageBtn = document.getElementById('prevPage');
        if (prevPageBtn) {
            prevPageBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.updateTable();
                }
            });
        }

        // Next page button
        const nextPageBtn = document.getElementById('nextPage');
        if (nextPageBtn) {
            nextPageBtn.addEventListener('click', () => {
                if (this.currentPage < this.totalPages) {
                    this.currentPage++;
                    this.updateTable();
                }
            });
        }

        // Rows per page selector
        const rowsPerPageSelect = document.getElementById('rowsPerPage');
        if (rowsPerPageSelect) {
            rowsPerPageSelect.addEventListener('change', () => {
                this.rowsPerPage = parseInt(rowsPerPageSelect.value);
                this.currentPage = 1; // Reset to first page
                this.updateTable();
            });
        }
    }

    // Update the table with processed data
    updateTable() {
        if (!this.tableBody) {
            console.error('Table body element not found');
            return;
        }

        // Clear existing table content
        this.tableBody.innerHTML = '';

        // If no data, show empty message
        if (this.tableData.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-table-message';
            emptyRow.innerHTML = '<td colspan="9">No data available. Please upload CSV files to view transaction data.</td>';
            this.tableBody.appendChild(emptyRow);

            // Update pagination info
            this.updatePaginationInfo(0);
            return;
        }

        // Calculate pagination
        this.totalPages = Math.ceil(this.tableData.length / this.rowsPerPage);

        // Ensure current page is valid
        if (this.currentPage > this.totalPages) {
            this.currentPage = this.totalPages;
        }

        // Calculate start and end indices for current page
        const startIndex = (this.currentPage - 1) * this.rowsPerPage;
        const endIndex = Math.min(startIndex + this.rowsPerPage, this.tableData.length);

        // Get data for current page
        const currentPageData = this.tableData.slice(startIndex, endIndex);

        // Add rows for current page
        currentPageData.forEach(rowData => {
            const row = document.createElement('tr');

            // Format the data for display
            row.innerHTML = `
                <td>${rowData.date}</td>
                <td>${this.formatNumber(rowData.hocCreditCount)}</td>
                <td>${this.formatCurrency(rowData.hocCreditAmount)}</td>
                <td>${this.formatNumber(rowData.hocDebitCount)}</td>
                <td>${this.formatCurrency(rowData.hocDebitAmount)}</td>
                <td>${this.formatNumber(rowData.ibdCreditCount)}</td>
                <td>${this.formatCurrency(rowData.ibdCreditAmount)}</td>
                <td>${this.formatNumber(rowData.ibdDebitCount)}</td>
                <td>${this.formatCurrency(rowData.ibdDebitAmount)}</td>
            `;

            this.tableBody.appendChild(row);
        });

        // Update pagination info
        this.updatePaginationInfo(this.tableData.length);
    }

    // Update pagination information
    updatePaginationInfo(totalRows) {
        const pageInfo = document.getElementById('pageInfo');
        if (pageInfo) {
            if (totalRows === 0) {
                pageInfo.textContent = 'No data';
            } else {
                pageInfo.textContent = `Page ${this.currentPage} of ${this.totalPages} (${totalRows} total rows)`;
            }
        }

        // Update button states
        const prevPageBtn = document.getElementById('prevPage');
        const nextPageBtn = document.getElementById('nextPage');

        if (prevPageBtn) {
            prevPageBtn.disabled = this.currentPage <= 1;
        }

        if (nextPageBtn) {
            nextPageBtn.disabled = this.currentPage >= this.totalPages;
        }
    }

    // Reset the table to empty state
    resetTable() {
        this.tableData = [];
        this.dateData = {}; // Clear date data
        this.isInitialized = false;

        // Reset pagination
        this.currentPage = 1;
        this.totalPages = 1;

        if (this.tableBody) {
            this.tableBody.innerHTML = '';
            const emptyRow = document.createElement('tr');
            emptyRow.className = 'empty-table-message';
            emptyRow.innerHTML = '<td colspan="9">No data available. Please upload CSV files to view transaction data.</td>';
            this.tableBody.appendChild(emptyRow);
        }

        // Update pagination info
        this.updatePaginationInfo(0);

        // Force garbage collection if possible
        if (window.gc) {
            window.gc();
        } else {
            // Attempt to trigger garbage collection indirectly
            setTimeout(() => {
                const arr = new Array(100).fill('x').map(() => new Array(1000).join('x'));
                arr.length = 0;
            }, 100);
        }
    }

    // Format number with commas
    formatNumber(number) {
        // Ensure number is actually a number
        if (isNaN(number) || number === null || number === undefined) {
            return '0';
        }
        return Number(number).toLocaleString('en-US');
    }

    // Format currency with MMK symbol and 2 decimal places
    formatCurrency(amount) {
        // Ensure amount is actually a number
        if (isNaN(amount) || amount === null || amount === undefined) {
            return '0.00 MMK';
        }
        return Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' MMK';
    }

    // Export table data to Excel
    exportToExcel() {
        try {
            // Check if we have data to export
            if (!this.tableData || this.tableData.length === 0) {
                alert('No data available to export. Please upload CSV files first.');
                return;
            }

            // Create a workbook with a worksheet
            const wb = XLSX.utils.book_new();

            // Prepare the data for Excel format
            const excelData = this.prepareDataForExcel();

            // Create a worksheet from the data
            const ws = XLSX.utils.aoa_to_sheet(excelData);

            // Add the worksheet to the workbook
            XLSX.utils.book_append_sheet(wb, ws, 'Transaction Data');

            // Generate a filename with current date
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
            const filename = `Transaction_Data_${dateStr}.xlsx`;

            // Write the workbook and trigger download
            XLSX.writeFile(wb, filename);

            // Show success message
            this.showExportSuccessMessage(filename);
        } catch (error) {
            console.error('Error exporting to Excel:', error);
            alert('An error occurred while exporting to Excel. Please try again.');
        }
    }

    // Prepare data for Excel export
    prepareDataForExcel() {
        // Create header row
        const headers = [
            'Date',
            'HOC Credit Count', 'HOC Credit Amount',
            'HOC Debit Count', 'HOC Debit Amount',
            'IBD Credit Count', 'IBD Credit Amount',
            'IBD Debit Count', 'IBD Debit Amount'
        ];

        // Start with headers
        const excelData = [headers];

        // Add data rows
        this.tableData.forEach(row => {
            excelData.push([
                row.date,
                row.hocCreditCount,
                row.hocCreditAmount,
                row.hocDebitCount,
                row.hocDebitAmount,
                row.ibdCreditCount,
                row.ibdCreditAmount,
                row.ibdDebitCount,
                row.ibdDebitAmount
            ]);
        });

        return excelData;
    }

    // Show success message after export
    showExportSuccessMessage(filename) {
        // Create notification element if it doesn't exist
        let notification = document.getElementById('exportNotification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'exportNotification';
            notification.className = 'export-notification';
            document.body.appendChild(notification);
        }

        // Set notification message
        notification.innerHTML = `
            <div class="export-notification-content">
                <span class="export-success-icon">✓</span>
                <p>Successfully exported to <strong>${filename}</strong></p>
                <button class="export-notification-close">&times;</button>
            </div>
        `;

        // Show notification
        notification.classList.add('show');

        // Add close button functionality
        const closeBtn = notification.querySelector('.export-notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.classList.remove('show');
            });
        }

        // Auto-hide after 5 seconds
        setTimeout(() => {
            notification.classList.remove('show');
        }, 5000);
    }
}

// Create a global instance of the TableData
window.tableData = new TableData();
