// Frontend JavaScript for Stocky application

// Load stock data when page loads
document.addEventListener('DOMContentLoaded', loadStockData);

// Variable to track when data was last updated
let lastUpdateTime = null;

// Add event listener to refresh button
document.getElementById('refreshBtn').addEventListener('click', function() {
    // Update the button state
    const refreshBtn = document.getElementById('refreshBtn');
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Restarting Server...';
    document.getElementById('stocksList').innerHTML = '<div class="loading">Restarting server and updating stock data...</div>';
    
    // Call the server restart endpoint
    fetch('/api/restart')
        .then(response => response.json())
        .then(result => {
            console.log('Server restart initiated:', result);
            
            // Wait a moment for the server to restart
            setTimeout(() => {
                // After server restarts, try to load the data again
                console.log('Server should have restarted, attempting to reload data...');
                document.getElementById('stocksList').innerHTML = '<div class="loading">Server restarted. Loading fresh data...</div>';
                
                // Retry loading data with exponential backoff
                retryLoadData(1);
            }, 3000); // Wait 3 seconds for server to restart
        })
        .catch(error => {
            console.error('Error restarting server:', error);
            document.getElementById('stocksList').innerHTML = 
                '<p class="error">Error restarting server. Please try again later.</p>';
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh Data';
        });
});

// Function to retry loading data with exponential backoff
function retryLoadData(attempt) {
    const maxAttempts = 5;
    const baseDelay = 1000; // 1 second
    
    console.log(`Attempt ${attempt} to load data after server restart`);
    
    // Try to load the data
    loadStockData()
        .then(success => {
            if (!success && attempt < maxAttempts) {
                // If failed and we haven't exceeded max attempts, try again
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`Data load failed, retrying in ${delay}ms...`);
                setTimeout(() => retryLoadData(attempt + 1), delay);
            } else if (!success) {
                // If we've exceeded max attempts
                console.error('Failed to load data after server restart after maximum attempts');
                document.getElementById('stocksList').innerHTML = 
                    '<p class="error">Failed to load data after server restart. Please refresh the page manually.</p>';
                document.getElementById('refreshBtn').disabled = false;
                document.getElementById('refreshBtn').textContent = 'Refresh Data';
            }
        });
}

// Function to format date for display
function formatDate(date) {
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function loadStockData(isManualRefresh = false) {
    // Show loading message if manually refreshing
    if (isManualRefresh) {
        document.getElementById('stocksList').innerHTML = '<div class="loading">Loading stock data...</div>';
        document.getElementById('refreshBtn').disabled = true;
        document.getElementById('refreshBtn').textContent = 'Updating...';
    }
    
    // Try multiple paths to find the JSON file
    const possiblePaths = [
        '../Json/top_stocks.json',
        './Json/top_stocks.json',
        '/Json/top_stocks.json',
        'top_stocks.json',
        '../top_stocks.json'
    ];

    // Return a promise so we can know if the data load was successful
    return new Promise((resolve) => {
        tryFetchPath(possiblePaths, 0, resolve);
    });
}

function tryFetchPath(paths, index, resolvePromise) {
    if (index >= paths.length) {
        // If we've tried all paths and none worked
        document.getElementById('stocksList').innerHTML = '<p class="error">Error loading stock data. Please try again later.</p>';
        document.getElementById('refreshBtn').disabled = false;
        document.getElementById('refreshBtn').textContent = 'Refresh Data';
        resolvePromise && resolvePromise(false); // Resolve the promise as false (failure)
        return;
    }
    
    fetch(paths[index])
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Display the data
            displayStockData(data);
            
            // Update the last refresh time
            lastUpdateTime = new Date();
            document.getElementById('lastUpdate').textContent = formatDate(lastUpdateTime);
            
            // Enable the refresh button
            document.getElementById('refreshBtn').disabled = false;
            document.getElementById('refreshBtn').textContent = 'Refresh Data';
            
            // Set up auto-refresh check
            if (!window.autoRefreshSetUp) {
                setupAutoRefresh();
                window.autoRefreshSetUp = true;
            }
            
            resolvePromise && resolvePromise(true); // Resolve the promise as true (success)
        })
        .catch(error => {
            console.warn(`Failed to fetch from ${paths[index]}:`, error);
            // Try the next path
            tryFetchPath(paths, index + 1, resolvePromise);
        });
}

function displayStockData(data) {
    // Clear loading message
    const stocksList = document.getElementById('stocksList');
    stocksList.innerHTML = '';
    
    // Add the header row
    const headerRow = document.createElement('div');
    headerRow.className = 'stock-row header';
    headerRow.innerHTML = `
        <div class="stock-cell rank">Rank</div>
        <div class="stock-cell symbol">Symbol</div>
        <div class="stock-cell name">Company</div>
        <div class="stock-cell price">Price</div>
        <div class="stock-cell market-cap">Market Cap</div>
    `;
    stocksList.appendChild(headerRow);
    
    // Add each stock row
    data.forEach(stock => {
        const stockRow = document.createElement('div');
        stockRow.className = 'stock-row';
        stockRow.innerHTML = `
            <div class="stock-cell rank">${stock.rank}</div>
            <div class="stock-cell symbol">${stock.symbol}</div>
            <div class="stock-cell name">${stock.name}</div>
            <div class="stock-cell price">$${stock.stock_price}</div>
            <div class="stock-cell market-cap">${stock.marketCap}</div>
        `;
        stocksList.appendChild(stockRow);
    });
}

// Check if data needs refreshing (older than 10 minutes)
function checkDataFreshness() {
    if (!lastUpdateTime) return true;
    
    const tenMinutesAgo = new Date(new Date().getTime() - 10 * 60 * 1000);
    return lastUpdateTime < tenMinutesAgo;
}

// Set up auto-refresh timer
function setupAutoRefresh() {
    // Check every minute if we need to refresh
    setInterval(() => {
        if (checkDataFreshness()) {
            console.log('Data is older than 10 minutes, auto-refreshing...');
            loadStockData();
        }
    }, 60 * 1000); // Check every minute
}