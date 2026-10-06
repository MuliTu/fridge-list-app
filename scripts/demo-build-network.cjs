// Node-level build guard, inherited by Node subprocesses through NODE_OPTIONS.
// This is a build safeguard, not an OS network sandbox or a production firewall.
const net = require('node:net')
const originalConnect = net.Socket.prototype.connect
const isLocalConnection = (args) => {
  const input = Array.isArray(args[0]) ? args[0] : args
  const first = input[0]
  if (first && typeof first === 'object') {
    if (first.path && !first.port) return true // local IPC pipe
    const host = first.host || first.hostname || 'localhost'
    return ['localhost', '127.0.0.1', '::1'].includes(host)
  }
  if (typeof first === 'string' && !/^\d+$/.test(first)) return true // local IPC pipe
  const host = typeof input[1] === 'string' ? input[1] : 'localhost'
  return ['localhost', '127.0.0.1', '::1'].includes(host)
}
net.Socket.prototype.connect = function (...args) {
  if (!isLocalConnection(args)) throw new Error('Isolated build blocked a non-loopback network connection')
  return originalConnect.apply(this, args)
}
module.exports = { isLocalConnection }
