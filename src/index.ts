#!/usr/bin/env node
import { program } from 'commander';
import { startSseAndStreamableHttpMcpServer } from 'mcp-http-server';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import http from 'http';
import { fetchGoldData, generateGoldPage } from './gold.js';

const VERSION = '1.0.0';

// Proxy Server for Gold Data
function startGoldProxy() {
    const proxyPort = 8083;
    const server = http.createServer(async (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');

        if (req.url === '/api/gold') {
            try {
                const data = await fetchGoldData();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
            } catch (e) {
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Fetch failed' }));
            }
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(proxyPort, () => {
        console.error(`Gold Proxy running on port ${proxyPort}`);
    });
}

function createServer() {
    const server = new McpServer({
        name: 'gold-price-assistant',
        version: VERSION
    });

    server.tool('get-gold-prices', '获取实时黄金白银价格（国际/国内/汇率）', {}, async () => {
        const data = await fetchGoldData();
        if (!data) {
            return { isError: true, content: [{ type: 'text', text: '获取金价数据失败，请重试' }] };
        }
        return {
            content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
        };
    });

    server.tool('get-gold-page', '获取实时金银价格监控页面 (HTML)', {}, async () => {
        const data = await fetchGoldData();
        if (!data) {
            return { isError: true, content: [{ type: 'text', text: '获取金价数据失败，请重试' }] };
        }
        const html = generateGoldPage(data);
        return {
            content: [{ type: 'text', text: html }]
        };
    });

    return server;
}

program
    .name('mcp-gold-price-assistant')
    .description('MCP server for real-time gold and silver prices monitoring')
    .version(VERSION)
    .option(
        '--host <host>',
        'host to bind server to. Default is localhost. Use 0.0.0.0 to bind to all interfaces.'
    )
    .option('--port <port>', 'port to listen on for SSE and HTTP transport.')
    .action(async (options) => {
        try {
            // Start Gold Proxy
            startGoldProxy();

            if (options.port || options.host) {
                await startSseAndStreamableHttpMcpServer({
                    host: options.host,
                    port: options.port,
                    // @ts-ignore
                    createMcpServer: async ({ headers }) => {
                        console.log('Creating new McpServer instance for incoming connection...');
                        return createServer();
                    },
                });
            } else {
                const transport = new StdioServerTransport();
                const server = createServer();
                await server.connect(transport);
                console.error('Gold Price Assistant MCP Server running on stdio');
            }
        } catch (error) {
            console.error('Fatal error in main():', error);
            process.exit(1);
        }
    });

program.parse(process.argv);
