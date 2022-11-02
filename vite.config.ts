import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({root:'web',plugins:[react()],build:{outDir:'dist',emptyOutDir:true},server:{host:'127.0.0.1',port:4910,proxy:{'/api':'http://127.0.0.1:4900','/config.json':'http://127.0.0.1:4900'}}});
