const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const http = require('http');

// Constants
const PORT = 3000;
const ROOT_DIR = path.resolve(__dirname, '..');
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
};

// Helper function to ensure directory exists
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
    return dirPath;
}

// Main function to fetch and process stock data
async function fetchStockData() {
    const requirementsPath = path.join(ROOT_DIR, 'Links', 'requirements.txt');
    const stockWebsite = fs.readFileSync(requirementsPath, 'utf8').trim();
    const url = stockWebsite;
    
    console.log(`Accessing website: ${url}`);
    
    const browser = await puppeteer.launch({ 
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
        console.log('Page loaded successfully, extracting stock data');
        
        // Wait for the table to load
        await page.waitForSelector('table', { timeout: 30000 });
        
        // Extract stock data
        let stocksData = await extractStockData(page);
        
        if (stocksData.length === 0) {
            // Try market-cap URL as fallback
            await page.goto('https://stockanalysis.com/stocks/market-cap/', { waitUntil: 'networkidle2', timeout: 30000 });
            stocksData = await extractStockData(page);
            
            if (stocksData.length === 0) {
                throw new Error('No stock data could be scraped from the website');
            }
        }
        
        return stocksData;
    } catch (error) {
        console.error('Error scraping website:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Extract stock data from the current page
async function extractStockData(page) {
    return await page.evaluate(() => {
        const stocks = [];
        const tables = document.querySelectorAll('table');
        let stockTable = null;
        
        // Find table with stock data
        for (const table of tables) {
            const headerText = table.textContent.toLowerCase();
            if (headerText.includes('symbol') || headerText.includes('ticker')) {
                stockTable = table;
                break;
            }
        }
        
        if (!stockTable) return [];
        
        // Get headers
        const headerRow = stockTable.querySelector('thead tr');
        if (!headerRow) return [];
        
        const headers = Array.from(headerRow.querySelectorAll('th')).map(th => th.textContent.trim().toLowerCase());
        
        const symbolIndex = headers.findIndex(h => h.includes('symbol') || h.includes('ticker'));
        const nameIndex = headers.findIndex(h => h.includes('name') || h.includes('company'));
        const priceIndex = headers.findIndex(h => h.includes('price') || h.includes('last'));
        const marketCapIndex = headers.findIndex(h => h.includes('market cap') || h.includes('marketcap') || h.includes('mkt cap'));
        
        // Get rows
        const rows = stockTable.querySelectorAll('tbody tr');
        
        for (let i = 0; i < Math.min(10, rows.length); i++) {
            const cells = rows[i].querySelectorAll('td');
            
            if (cells.length > Math.max(symbolIndex, nameIndex, priceIndex, marketCapIndex)) {
                let symbol = symbolIndex >= 0 ? cells[symbolIndex].textContent.trim() : `Unknown-${i+1}`;
                let name = nameIndex >= 0 ? cells[nameIndex].textContent.trim() : `Unknown Company ${i+1}`;
                
                if (symbolIndex >= 0 && cells[symbolIndex].querySelector('a')) {
                    symbol = cells[symbolIndex].querySelector('a').textContent.trim();
                }
                
                if (nameIndex >= 0 && cells[nameIndex].querySelector('a')) {
                    name = cells[nameIndex].querySelector('a').textContent.trim();
                }
                
                stocks.push({
                    symbol: symbol,
                    name: name,
                    stock_price: priceIndex >= 0 ? cells[priceIndex].textContent.trim() : "Unknown",
                    marketCap: marketCapIndex >= 0 ? cells[marketCapIndex].textContent.trim() : "Unknown",
                    rank: i + 1
                });
            }
        }
        
        return stocks;
    });
}

// Create and configure the HTTP server
function startServer() {
    const server = http.createServer((req, res) => {
        console.log(`Request received for: ${req.url}`);

        // Serve static files
        let filePath = req.url === '/' ? 
            path.join(ROOT_DIR, 'Landing', 'index.html') : 
            path.join(ROOT_DIR, decodeURIComponent(req.url).replace(/^\//, ''));
        
        // Remove query parameters if present
        filePath = filePath.split('?')[0];
        
        // Get the file extension
        const extname = path.extname(filePath);
        const contentType = MIME_TYPES[extname] || 'application/octet-stream';

        // Read and serve the file
        fs.readFile(filePath, (err, content) => {
            if (err) {
                if (err.code === 'ENOENT') {
                    // Try to serve JSON from the Json directory
                    if (filePath.includes('top_stocks.json')) {
                        const jsonPath = path.join(ROOT_DIR, 'Json', 'top_stocks.json');
                        if (fs.existsSync(jsonPath)) {
                            fs.readFile(jsonPath, (jsonErr, jsonContent) => {
                                if (jsonErr) {
                                    res.writeHead(500);
                                    res.end('Error reading JSON file');
                                } else {
                                    res.writeHead(200, { 'Content-Type': 'application/json' });
                                    res.end(jsonContent);
                                }
                            });
                            return;
                        }
                    }
                    
                    // Not found, return 404
                    res.writeHead(404);
                    res.end('404 Not Found');
                } else {
                    // Server error
                    console.error(`Server error: ${err.code}`);
                    res.writeHead(500);
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                // Success - set content type and serve the file
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            }
        });
    });

    // Handle server errors
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${PORT} is already in use. Trying port ${PORT+1}...`);
            server.listen(PORT+1);
        } else {
            console.error('Server error:', err);
        }
    });

    // Start listening
    server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Open this URL in your browser to view the Stocky dashboard`);
    });
}

// Main execution function
async function main() {
    try {
        // Fetch stock data
        const stocksData = await fetchStockData();
        
        // Save data to Json directory
        const jsonDir = ensureDirectoryExists(path.join(ROOT_DIR, 'Json'));
        fs.writeFileSync(
            path.join(jsonDir, 'top_stocks.json'),
            JSON.stringify(stocksData, null, 2)
        );
        
        console.log('Data saved successfully to Json/top_stocks.json');
        
        // Start the web server
        startServer();
    } catch (error) {
        console.error('Script execution failed:', error);
    }
}

// Execute main function when script is run directly
if (require.main === module) {
    main();
}

// Export functions for use in other modules
module.exports = {
    fetchStockData,
    startServer
};