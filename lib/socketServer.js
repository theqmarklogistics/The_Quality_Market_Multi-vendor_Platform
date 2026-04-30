export const getSocketServer = () => {
  if (!global.io) {
    throw new Error('Socket.IO server not initialized. Start the app with `node server.js`');
  }
  return global.io;
};
