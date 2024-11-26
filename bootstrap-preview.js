#!/usr/bin/env node

import parseArgs from 'minimist-lite'
import path from 'node:path'
import fs from 'node:fs/promises'
import express from 'express'
import { createServer } from 'vite'
import { networkInterfaces } from 'node:os'
import open from 'open'

// Constants
const port = 5173
const base = '/'
const autoOpen = false

// Get CLI args
const argv = parseArgs(process.argv.slice(2))
const cssFile = argv._[0]
const templateFile = path.join(path.dirname(process.argv[1]), "preview", "index.html")

// Create http server
const app = express()

// Add Vite or respective production middlewares
const vite = await createServer({
  server: {
    middlewareMode: true,
    https: false
  },
  appType: 'custom',
  base,
})
app.use(vite.middlewares)

// Serve HTML
app.use('*all', async (req, res) => {
  try {
    const url = req.originalUrl.replace(base, '')
    let template = await fs.readFile(templateFile, 'utf-8')
    template = await vite.transformIndexHtml(url, template)  // This is necessary. Do not delete.
    
    const placeholder = `<!--css-placeholder-->`
    const link = `<link rel="stylesheet" type="text/css" href="${cssFile}">`
    const html = template.replace(placeholder, link)
    
    res.status(200).set({ 'Content-Type': 'text/html' }).send(html)
  } catch (e) {
    vite?.ssrFixStacktrace(e)
    console.log(e.stack)
    res.status(500).end(e.stack)
  }
})

function resolveServerUrls() {
  return Object.values(networkInterfaces()).flatMap((nInterface) => nInterface ?? []).filter(
    (detail) => detail && detail.address && (detail.family === "IPv4" || detail.family === 4)
  ).map(({address: host}) => ({
    address: (`http://${host}:${port}/`).replace("127.0.0.1", "localhost"),
    interface: host.includes("127.0.0.1") ? "Local" : "Network"
  })).sort((a, b) => (a.interface == "Local" ? -1 : b.interface == "Local" ? 1 : 0));
}

function printServerUrls(urls, info) {
  const format = {
    bold: (s) => "\x1b[1m" + s + "\x1b[22m",
    green: (s) => "\x1b[32m" + s + "\x1b[39m",
    cyan: (s) => "\x1b[36m" + s + "\x1b[39m"
  }
  const colorUrl = (url) => format.cyan(url.replace(/:(\d+)\//, (_, port) => `:${format.bold(port)}/`));
  urls.forEach(url => {
    info(`  ${format.green("\u279C")}  ` + (`${format.bold(url.interface)}:`).padEnd(18) + colorUrl(url.address));
  });
}

// Start http server
app.listen(port, '0.0.0.0', () => {
  console.log("Server started at following URLs:\n");
  const urls = resolveServerUrls();
  printServerUrls(urls, console.log);
  if (autoOpen) {
    open(urls[0].address);
  }
})
