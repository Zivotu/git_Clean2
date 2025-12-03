import assert from 'node:assert/strict'

async function run() {
  const args = process.argv.slice(2)
  const buildId = args.find((a) => !a.startsWith('-'))
  const baseUrlArg = args.find((a) => a.startsWith('--base-url='))
  const baseUrl = baseUrlArg ? baseUrlArg.split('=')[1] : 'http://127.0.0.1:8788'

  if (!buildId) {
    console.error('Usage: node verify-publish.mjs <buildId> [--base-url=http://...]')
    process.exit(1)
  }

  console.log(`Verifying build: ${buildId} against ${baseUrl}\n`)

  const checks = []

  // 1. Check shim.js
  try {
    const shimUrl = `${baseUrl}/shim.js`
    const res = await fetch(shimUrl, { method: 'HEAD', redirect: 'follow' })
    assert.ok(res.ok, `/shim.js should return 2xx, got ${res.status}`)
    checks.push({ name: 'shim.js', status: 'PASS', detail: `HEAD ${res.status}` })
  } catch (e) {
    checks.push({ name: 'shim.js', status: 'FAIL', detail: e.message })
  }

  // 2. Check manifest
  let entry = 'app.js' // Default fallback
  let integrity = ''
  try {
    const manifestUrl = `${baseUrl}/builds/${buildId}/build/manifest_v1.json`
    const res = await fetch(manifestUrl)
    assert.ok(res.ok, `manifest_v1.json should return 2xx, got ${res.status}`)
    const manifest = await res.json()
    assert.ok(manifest.entry, 'Manifest must have an "entry" field')
    entry = manifest.entry.replace(/^\.\//, '')
    integrity = manifest.integrity || ''
    checks.push({
      name: 'manifest_v1.json',
      status: 'PASS',
      detail: `entry=${entry}, integrity=${integrity ? 'present' : 'absent'}`,
    })
  } catch (e) {
    checks.push({ name: 'manifest_v1.json', status: 'FAIL', detail: e.message })
  }

  // 3. Check entry point
  try {
    const entryUrl = `${baseUrl}/builds/${buildId}/build/${entry}`
    const res = await fetch(entryUrl, { method: 'HEAD' })
    assert.ok(res.ok, `Entry point ${entry} should return 2xx, got ${res.status}`)
    const contentLength = res.headers.get('content-length')
    assert.ok(Number(contentLength) > 0, 'Entry point should not be empty')
    checks.push({
      name: `entry (${entry})`,
      status: 'PASS',
      detail: `HEAD ${res.status}, size=${contentLength}B`,
    })
  } catch (e) {
    checks.push({ name: `entry (${entry})`, status: 'FAIL', detail: e.message })
  }

  console.table(checks)

  const failures = checks.filter((c) => c.status === 'FAIL').length
  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('\nAll checks passed.')
  }
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})