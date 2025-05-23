/**
 * Visualizer Module
 * Handles data visualization using Chart.js
 */

class Visualizer {
    constructor() {
        this.charts = {};
        this.initCharts();
    }

    // Initialize charts
    initCharts() {
        // Transaction Type Chart (HOC vs IBD)
        const transactionTypeCtx = document.getElementById('transactionTypeChart').getContext('2d');
        this.charts.transactionType = new Chart(transactionTypeCtx, {
            type: 'bar',
            data: {
                labels: ['HOC', 'IBD'],
                datasets: [
                    {
                        label: 'Transaction Count',
                        data: [0, 0],
                        backgroundColor: ['rgba(52, 152, 219, 0.7)', 'rgba(46, 204, 113, 0.7)'],
                        borderColor: ['rgba(52, 152, 219, 1)', 'rgba(46, 204, 113, 1)'],
                        borderWidth: 1
                    },
                    {
                        label: 'Transaction Amount',
                        data: [0, 0],
                        backgroundColor: ['rgba(52, 152, 219, 0.3)', 'rgba(46, 204, 113, 0.3)'],
                        borderColor: ['rgba(52, 152, 219, 1)', 'rgba(46, 204, 113, 1)'],
                        borderWidth: 1,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Transaction Types (HOC vs IBD)'
                    },
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Count'
                        }
                    },
                    y1: {
                        beginAtZero: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Amount'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });

        // Currency Chart (USD vs MMK)
        const currencyCtx = document.getElementById('currencyChart').getContext('2d');
        this.charts.currency = new Chart(currencyCtx, {
            type: 'pie',
            data: {
                labels: ['USD', 'MMK'],
                datasets: [{
                    data: [0, 0],
                    backgroundColor: ['rgba(241, 196, 15, 0.7)', 'rgba(231, 76, 60, 0.7)'],
                    borderColor: ['rgba(241, 196, 15, 1)', 'rgba(231, 76, 60, 1)'],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Transactions by Currency'
                    },
                    legend: {
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Update charts with new data
    updateCharts(metrics) {
        // Update Transaction Type Chart
        this.charts.transactionType.data.datasets[0].data = [
            metrics.hocCount,
            metrics.ibdCount
        ];
        this.charts.transactionType.data.datasets[1].data = [
            metrics.hocAmount,
            metrics.ibdAmount
        ];
        this.charts.transactionType.update();

        // Update Currency Chart
        this.charts.currency.data.datasets[0].data = [
            metrics.currencyCounts.USD,
            metrics.currencyCounts.MMK
        ];
        this.charts.currency.update();

        // Update or create credit/debit breakdown charts
        this.updateCreditDebitCharts(metrics);
    }

    // Create or update credit/debit breakdown charts
    updateCreditDebitCharts(metrics) {
        // If charts don't exist yet, create them
        if (!this.charts.creditDebit) {
            // Create a container for the new chart
            const chartContainer = document.createElement('div');
            chartContainer.className = 'chart-container';

            // Create canvas element
            const canvas = document.createElement('canvas');
            canvas.id = 'creditDebitChart';
            chartContainer.appendChild(canvas);

            // Add to the visualization container
            document.querySelector('.visualization-container').appendChild(chartContainer);

            // Define consistent colors for credit and debit transactions
            const creditColor = 'rgba(46, 204, 113, 0.7)'; // Green for credit
            const creditBorderColor = 'rgba(46, 204, 113, 1)';
            const debitColor = 'rgba(231, 76, 60, 0.7)';  // Red for debit
            const debitBorderColor = 'rgba(231, 76, 60, 1)';

            // Initialize the chart
            const ctx = canvas.getContext('2d');
            this.charts.creditDebit = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['HOC Credit', 'HOC Debit', 'IBD Credit', 'IBD Debit'],
                    datasets: [
                        {
                            label: 'Transaction Count',
                            data: [0, 0, 0, 0],
                            backgroundColor: [
                                creditColor,
                                debitColor,
                                creditColor,
                                debitColor
                            ],
                            borderColor: [
                                creditBorderColor,
                                debitBorderColor,
                                creditBorderColor,
                                debitBorderColor
                            ],
                            borderWidth: 1
                        },
                        {
                            label: 'Transaction Amount',
                            data: [0, 0, 0, 0],
                            backgroundColor: [
                                'rgba(46, 204, 113, 0.3)', // Lighter green for credit
                                'rgba(231, 76, 60, 0.3)',  // Lighter red for debit
                                'rgba(46, 204, 113, 0.3)', // Lighter green for credit
                                'rgba(231, 76, 60, 0.3)'   // Lighter red for debit
                            ],
                            borderColor: [
                                creditBorderColor,
                                debitBorderColor,
                                creditBorderColor,
                                debitBorderColor
                            ],
                            borderWidth: 1,
                            yAxisID: 'y1'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Credit vs Debit Transactions'
                        },
                        legend: {
                            position: 'top',
                            labels: {
                                usePointStyle: true,
                                generateLabels: function() {
                                    // Add custom legend items for credit and debit
                                    const customLabels = [
                                        {
                                            text: 'Credit Transactions',
                                            fillStyle: creditColor,
                                            strokeStyle: creditBorderColor,
                                            lineWidth: 1,
                                            hidden: false
                                        },
                                        {
                                            text: 'Debit Transactions',
                                            fillStyle: debitColor,
                                            strokeStyle: debitBorderColor,
                                            lineWidth: 1,
                                            hidden: false
                                        }
                                    ];

                                    return customLabels;
                                }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    const value = context.raw || 0;
                                    return `${label}: ${value.toLocaleString()}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Count'
                            }
                        },
                        y1: {
                            beginAtZero: true,
                            position: 'right',
                            title: {
                                display: true,
                                text: 'Amount'
                            },
                            grid: {
                                drawOnChartArea: false
                            }
                        }
                    }
                }
            });
        }

        // Update the credit/debit chart with new data
        this.charts.creditDebit.data.datasets[0].data = [
            metrics.hocCreditCount,
            metrics.hocDebitCount,
            metrics.ibdCreditCount,
            metrics.ibdDebitCount
        ];

        this.charts.creditDebit.data.datasets[1].data = [
            metrics.hocCreditAmount,
            metrics.hocDebitAmount,
            metrics.ibdCreditAmount,
            metrics.ibdDebitAmount
        ];

        this.charts.creditDebit.update();
    }

    // Create a new chart
    createChart(elementId, type, data, options) {
        const ctx = document.getElementById(elementId).getContext('2d');
        return new Chart(ctx, {
            type: type,
            data: data,
            options: options
        });
    }

    // Reset all charts to zero values
    resetCharts() {
        // Reset Transaction Type Chart
        if (this.charts.transactionType) {
            this.charts.transactionType.data.datasets[0].data = [0, 0];
            this.charts.transactionType.data.datasets[1].data = [0, 0];
            this.charts.transactionType.update();
        }

        // Reset Currency Chart
        if (this.charts.currency) {
            this.charts.currency.data.datasets[0].data = [0, 0];
            this.charts.currency.update();
        }

        // Reset Credit/Debit Chart
        if (this.charts.creditDebit) {
            this.charts.creditDebit.data.datasets[0].data = [0, 0, 0, 0];
            this.charts.creditDebit.data.datasets[1].data = [0, 0, 0, 0];
            this.charts.creditDebit.update();
        }
    }
}

// Create a global instance of the Visualizer
window.visualizer = new Visualizer();
