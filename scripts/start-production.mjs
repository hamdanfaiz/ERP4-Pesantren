// `npm start` is the production entry point on managed Node.js hosting.
// Set this before loading the bundled server so it serves built assets instead
// of creating the Vite development middleware and its HMR WebSocket.
process.env.NODE_ENV = "production";

await import("../dist/server.cjs");
