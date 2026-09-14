const key = process.argv[2] ?? ''
const b = Buffer.from(key.trim(), 'base64url')
console.log('characters:', key.trim().length)
console.log('bytes     :', b.length, '(public should be 65, private 32)')
console.log('first byte:', '0x' + b[0]?.toString(16), '(public must be 0x4)')
console.log('verdict   :', b.length === 65 && b[0] === 4 ? 'VALID public key' : 'NOT a valid VAPID public key')
