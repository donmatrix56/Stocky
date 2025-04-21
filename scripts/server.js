const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// Define the port to run the server on
const PORT = 3000;

// Define the root directory of the project
const ROOT_DIR = path.resolve(__dirname, '..');

// Define MIME types for serving different file types
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
};

// Create the HTTP server
const server = http.createServer((req, res) => {
    console.log(`Request received for: ${req.url}`);

    // Special endpoint to restart server and run FetchUpdate.js
    if (req.url === '/api/restart') {
        console.log('Restart request received. Restarting server...');
        
        // Send response before restarting
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            success: true, 
            message: 'Server restart initiated. The server will restart and update stock data.' 
        }));
        
        // Wait a moment to ensure the response is sent
        setTimeout(() => {
            console.log('Restarting server process...');
            // Start a new server process
            const newServer = spawn(process.argv[0], [process.argv[1]], {
                detached: true,
                stdio: 'inherit'
            });
            
            // Detach the new process so it runs independently
            newServer.unref();
            
            // Exit the current process after a brief delay
            setTimeout(() => {
                console.log('Old server process exiting...');
                process.exit(0);
            }, 500);
        }, 1000);
        
        return;
    }

    // Special endpoint to run FetchUpdate.js without restarting server
    if (req.url === '/api/update') {
        console.log('Running FetchUpdate.js to update stock data...');
        
        // Execute the FetchUpdate.js script
        exec('node scripts/FetchUpdate.js', { cwd: ROOT_DIR }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing FetchUpdate.js: ${error}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
                return;
            }
            
            console.log(`FetchUpdate.js output: ${stdout}`);
            if (stderr) {
                console.error(`FetchUpdate.js errors: ${stderr}`);
            }
            
            // Send success response
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'Stock data updated successfully' }));
        });
        
        return;
    }

    // Serve the index.html file for the root URL
    let filePath = req.url === '/' ? 
        path.join(ROOT_DIR, 'Landing', 'index.html') : 
        path.join(ROOT_DIR, decodeURIComponent(req.url).replace(/^\//, ''));
    
    // Remove query parameters if present
    filePath = filePath.split('?')[0];
    
    console.log(`Attempting to serve file: ${filePath}`);

    // Get the file extension
    const extname = path.extname(filePath);
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    // Read the file and serve it
    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                // File not found - try to fix common path issues
                console.log(`File not found: ${filePath}, attempting alternative paths...`);
                
                // If looking for top_stocks.json, try to serve it from the Json directory
                if (filePath.includes('top_stocks.json')) {
                    const jsonPath = path.join(ROOT_DIR, 'Json', 'top_stocks.json');
                    if (fs.existsSync(jsonPath)) {
                        console.log(`Serving JSON file from: ${jsonPath}`);
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

// Start the server and also run FetchUpdate.js to ensure we have fresh data
console.log('Running FetchUpdate.js to ensure we have fresh stock data...');
exec('node scripts/FetchUpdate.js', { cwd: ROOT_DIR }, (error, stdout, stderr) => {
    if (error) {
        console.error(`Error executing FetchUpdate.js: ${error}`);
    } else {
        console.log(`FetchUpdate.js output: ${stdout}`);
        if (stderr) {
            console.error(`FetchUpdate.js errors: ${stderr}`);
        }
    }
    
    // Start the server after attempting to update the data
    server.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        console.log(`Open this URL in your browser to view the Stocky dashboard`);
        console.log(`Server start time: ${new Date().toLocaleString()}`);
        console.log(`Press Ctrl+C to stop the server`);
    });
});