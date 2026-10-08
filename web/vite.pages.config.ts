import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath,URL} from 'node:url';
export default defineConfig({base:'/hub-territorial-londrina/curitiba/',plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},build:{outDir:'../docs/curitiba',emptyOutDir:false},server:{host:'0.0.0.0',allowedHosts:['terminal.local']}});
