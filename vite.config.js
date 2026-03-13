// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// // // https://vite.dev/config/
// // export default defineConfig({
// //   plugins: [react()],
// // })
// export default {
//   server: {
//     proxy: {
//       "/api": "http://localhost:8000",
//     },
//   },
// };


// import { defineConfig } from 'vite'
// import react from '@vitejs/plugin-react'

// export default defineConfig({
//   plugins: [react()], // automatic runtime by default
// })
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^@\/components/, replacement: path.resolve(__dirname, './src/Components') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
